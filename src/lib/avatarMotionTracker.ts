import type {
  AvatarMotionFrame,
  DetectedPose,
  GameConfig,
} from "../types";
import { resolvePublicAssetPath } from "./publicAsset";

type AvatarTrackingConfig = GameConfig["avatarTracking"];
type AvatarFeature = "hands" | "face";

interface ReadyMessage {
  type: "ready";
  capabilities: { hands: boolean; face: boolean };
}

interface CapabilitiesMessage {
  type: "capabilities";
  capabilities: { hands: boolean; face: boolean };
}

interface FrameMessage {
  type: "frame";
  frame: AvatarMotionFrame;
}

interface WarningMessage {
  type: "warning";
  feature: AvatarFeature;
  message: string;
}

interface ProgressMessage {
  type: "progress";
  feature: AvatarFeature;
  phase: "runtime" | "model" | "ready";
}

interface ErrorMessage {
  type: "error";
  message: string;
}

type WorkerMessage =
  | ReadyMessage
  | CapabilitiesMessage
  | FrameMessage
  | WarningMessage
  | ProgressMessage
  | ErrorMessage;

export interface AvatarMotionTrackerCallbacks {
  onFrame?: (frame: AvatarMotionFrame) => void;
  onWarning?: (feature: AvatarFeature | "tracker", message: string) => void;
  onProgress?: (
    feature: AvatarFeature,
    phase: "runtime" | "model" | "ready",
  ) => void;
  onReady?: (capabilities: { hands: boolean; face: boolean }) => void;
}

function resolveAssetUrl(path: string, directory: boolean): string {
  const normalizedPath =
    directory && !path.endsWith("/") ? `${path}/` : path;
  const url = new URL(
    resolvePublicAssetPath(normalizedPath),
    document.baseURI,
  ).href;
  return directory ? url.replace(/\/$/, "") : url;
}

/**
 * Runs display-only hand and face inference independently from PoseTracker.
 * It reads the same video element but never owns or stops the camera stream.
 */
export class AvatarMotionTracker {
  private callbacks: AvatarMotionTrackerCallbacks;
  private worker: Worker | null = null;
  private video: HTMLVideoElement | null = null;
  private pose: DetectedPose | null = null;
  private animationFrameId: number | null = null;
  private sessionId = 0;
  private running = false;
  private frameInFlight = false;
  private minFrameIntervalMs = 100;
  private lastFrameSentAt = Number.NEGATIVE_INFINITY;
  private lastMediaPipeTimestamp = Number.NEGATIVE_INFINITY;
  private cancelPendingStart: (() => void) | null = null;

  constructor(callbacks: AvatarMotionTrackerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  setMaxInferenceFps(framesPerSecond: number): void {
    this.minFrameIntervalMs =
      1000 /
      (Number.isFinite(framesPerSecond) && framesPerSecond > 0
        ? framesPerSecond
        : 10);
  }

  setPose(pose: DetectedPose | null): void {
    this.pose = pose;
    if (!pose) {
      this.callbacks.onFrame?.({
        timestampMs: performance.now(),
        hands: [],
        face: null,
        inferenceMs: 0,
      });
    }
  }

  async start(
    video: HTMLVideoElement,
    config: AvatarTrackingConfig,
    wasmPath: string,
  ): Promise<void> {
    this.stop();
    this.video = video;
    this.setMaxInferenceFps(config.maxInferenceFps);
    this.lastFrameSentAt = Number.NEGATIVE_INFINITY;
    this.lastMediaPipeTimestamp = Number.NEGATIVE_INFINITY;

    if (!config.enabled || (!config.hands.enabled && !config.face.enabled)) {
      this.callbacks.onReady?.({ hands: false, face: false });
      return;
    }
    if (typeof createImageBitmap !== "function") {
      this.callbacks.onWarning?.(
        "tracker",
        "瀏覽器不支援人物手指與表情同步；瑜珈闖關仍可繼續。",
      );
      return;
    }

    const sessionId = this.sessionId;
    const worker = new Worker(
      new URL("../workers/avatar.worker.ts", import.meta.url),
      {
        type: "module",
        name: "magic-garden-avatar-motion",
      },
    );
    this.worker = worker;

    let workerReady = false;
    let cancelThisStart: (() => void) | null = null;
    const workerReadyPromise = new Promise<{
      hands: boolean;
      face: boolean;
    } | null>((resolve, reject) => {
      cancelThisStart = () => resolve(null);
      this.cancelPendingStart = cancelThisStart;
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (sessionId !== this.sessionId) return;
        const message = event.data;
        if (message.type === "ready") {
          workerReady = true;
          resolve(message.capabilities);
          return;
        }
        if (message.type === "capabilities") {
          this.callbacks.onReady?.(message.capabilities);
          if (
            !message.capabilities.hands &&
            !message.capabilities.face
          ) {
            this.running = false;
            if (this.animationFrameId !== null) {
              cancelAnimationFrame(this.animationFrameId);
              this.animationFrameId = null;
            }
          }
          return;
        }
        if (message.type === "frame") {
          this.frameInFlight = false;
          this.callbacks.onFrame?.(message.frame);
          return;
        }
        if (message.type === "warning") {
          this.callbacks.onWarning?.(message.feature, message.message);
          return;
        }
        if (message.type === "progress") {
          this.callbacks.onProgress?.(message.feature, message.phase);
          return;
        }

        this.frameInFlight = false;
        this.callbacks.onWarning?.("tracker", message.message);
      };

      worker.onerror = (event) => {
        event.preventDefault();
        const error = new Error(
          event.message ||
            "人物手指與表情同步發生錯誤；瑜珈闖關仍可繼續。",
        );
        if (!workerReady) {
          reject(error);
          return;
        }
        this.frameInFlight = false;
        this.callbacks.onWarning?.("tracker", error.message);
        this.stop();
      };

      worker.onmessageerror = () => {
        const error = new Error(
          "人物動態追蹤 Worker 回傳了無法讀取的資料。",
        );
        if (!workerReady) {
          reject(error);
          return;
        }
        this.frameInFlight = false;
        this.callbacks.onWarning?.("tracker", error.message);
        this.stop();
      };
    });

    worker.postMessage({
      type: "initialize",
      config: {
        ...config,
        wasmPath: resolveAssetUrl(wasmPath, true),
        hands: {
          ...config.hands,
          modelPath: resolveAssetUrl(config.hands.modelPath, false),
        },
        face: {
          ...config.face,
          modelPath: resolveAssetUrl(config.face.modelPath, false),
        },
      },
    });
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(
            new Error(
              "手指與表情模型載入逾時；身體姿勢判定仍可正常使用。",
            ),
          ),
        45_000,
      );
    });
    let capabilities: { hands: boolean; face: boolean } | null;
    try {
      capabilities = await Promise.race([
        workerReadyPromise,
        timeoutPromise,
      ]);
    } catch (error) {
      if (sessionId === this.sessionId) this.stop();
      throw error;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (this.cancelPendingStart === cancelThisStart) {
        this.cancelPendingStart = null;
      }
    }

    if (
      !capabilities ||
      sessionId !== this.sessionId ||
      worker !== this.worker
    ) {
      return;
    }

    this.callbacks.onReady?.(capabilities);
    this.running = capabilities.hands || capabilities.face;
    if (this.running) this.scheduleNextFrame(sessionId);
  }

  stop(): void {
    const cancelPendingStart = this.cancelPendingStart;
    this.cancelPendingStart = null;
    cancelPendingStart?.();
    this.sessionId += 1;
    this.running = false;
    this.frameInFlight = false;
    this.pose = null;
    this.video = null;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.worker) {
      this.worker.postMessage({ type: "dispose" });
      this.worker.terminate();
      this.worker = null;
    }
  }

  private scheduleNextFrame(sessionId: number): void {
    if (!this.running || sessionId !== this.sessionId) return;
    this.animationFrameId = requestAnimationFrame((now) => {
      this.animationFrameId = null;
      void this.captureFrame(now, sessionId);
      this.scheduleNextFrame(sessionId);
    });
  }

  private async captureFrame(
    now: number,
    sessionId: number,
  ): Promise<void> {
    const video = this.video;
    const worker = this.worker;
    const pose = this.pose;
    if (
      !this.running ||
      this.frameInFlight ||
      sessionId !== this.sessionId ||
      !video ||
      !worker ||
      !pose ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      now - this.lastFrameSentAt < this.minFrameIntervalMs
    ) {
      return;
    }

    this.frameInFlight = true;
    this.lastFrameSentAt = now;
    try {
      const bitmap = await createImageBitmap(video);
      if (
        !this.running ||
        sessionId !== this.sessionId ||
        worker !== this.worker
      ) {
        bitmap.close();
        this.frameInFlight = false;
        return;
      }

      const timestampMs = Math.max(
        performance.now(),
        this.lastMediaPipeTimestamp + 0.001,
      );
      this.lastMediaPipeTimestamp = timestampMs;
      worker.postMessage(
        { type: "detect", bitmap, pose, timestampMs },
        [bitmap],
      );
    } catch (error) {
      this.frameInFlight = false;
      this.callbacks.onWarning?.(
        "tracker",
        error instanceof Error
          ? error.message
          : "無法取得手指與表情辨識用的攝影機畫面。",
      );
    }
  }
}
