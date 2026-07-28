import type { GameConfig, PoseFrame, TrackingStatus } from "../types";
import { resolvePublicAssetPath } from "./publicAsset";

type PoseDetectionConfig = GameConfig["poseDetection"];

interface WorkerReadyMessage {
  type: "ready";
}

interface WorkerFrameMessage {
  type: "frame";
  frame: PoseFrame;
}

interface WorkerErrorMessage {
  type: "error";
  message: string;
  fatal: boolean;
}

type WorkerMessage =
  | WorkerReadyMessage
  | WorkerFrameMessage
  | WorkerErrorMessage;

export interface PoseTrackerCallbacks {
  onFrame?: (frame: PoseFrame) => void;
  onStatus?: (status: TrackingStatus) => void;
  onError?: (error: Error) => void;
}

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: { ideal: "user" },
  },
};

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === "string" ? error : fallback);
}

function cameraError(error: unknown): Error {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return new Error("無法使用攝影機，請允許瀏覽器的攝影機權限。");
      case "NotFoundError":
      case "DevicesNotFoundError":
        return new Error("找不到可使用的攝影機。");
      case "NotReadableError":
      case "TrackStartError":
        return new Error("攝影機正被其他程式使用，請關閉其他程式後重試。");
      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        return new Error("攝影機不支援需要的影像設定。");
      case "AbortError":
        return error;
    }
  }

  return toError(error, "啟動攝影機時發生錯誤。");
}

function abortError(): DOMException {
  return new DOMException("Pose tracker start was cancelled.", "AbortError");
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

function waitForVideoMetadata(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      signal.removeEventListener("abort", handleAbort);
    };
    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("攝影機畫面無法載入。"));
    };
    const handleAbort = () => {
      cleanup();
      reject(abortError());
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

/**
 * Owns the webcam stream and the MediaPipe module worker for one video element.
 * MediaPipe-specific objects never leave the worker; consumers receive only
 * serializable `PoseFrame` values from `src/types.ts`.
 */
export class PoseTracker {
  private callbacks: PoseTrackerCallbacks;
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private animationFrameId: number | null = null;
  private startController: AbortController | null = null;
  private sessionId = 0;
  private running = false;
  private frameInFlight = false;
  private minFrameIntervalMs = 1000 / 15;
  private lastFrameSentAt = Number.NEGATIVE_INFINITY;
  private lastMediaPipeTimestamp = Number.NEGATIVE_INFINITY;
  private lastStatus: TrackingStatus | null = null;

  constructor(callbacks: PoseTrackerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  get isRunning(): boolean {
    return this.running;
  }

  setCallbacks(callbacks: PoseTrackerCallbacks): void {
    this.callbacks = callbacks;
  }

  async start(
    video: HTMLVideoElement,
    config: PoseDetectionConfig,
  ): Promise<void> {
    this.stop();

    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new Error(
        "此瀏覽器不支援攝影機存取，請改用最新版 Chrome 或 Edge。",
      );
      this.reportError(error);
      throw error;
    }

    if (typeof createImageBitmap !== "function") {
      const error = new Error(
        "此瀏覽器不支援攝影機影像處理，請改用最新版 Chrome 或 Edge。",
      );
      this.reportError(error);
      throw error;
    }

    const sessionId = this.sessionId;
    const controller = new AbortController();
    this.startController = controller;
    this.video = video;
    this.minFrameIntervalMs =
      1000 /
      (Number.isFinite(config.maxInferenceFps) &&
      config.maxInferenceFps > 0
        ? config.maxInferenceFps
        : 15);
    this.lastFrameSentAt = Number.NEGATIVE_INFINITY;
    this.lastMediaPipeTimestamp = Number.NEGATIVE_INFINITY;
    this.emitStatus("loading");

    let workerReady = false;
    const worker = new Worker(
      new URL("../workers/pose.worker.ts", import.meta.url),
      {
        type: "module",
        name: "magic-garden-pose-tracker",
      },
    );
    this.worker = worker;

    const workerReadyPromise = new Promise<void>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (sessionId !== this.sessionId) {
          return;
        }

        const message = event.data;
        if (message.type === "ready") {
          workerReady = true;
          resolve();
          return;
        }

        if (message.type === "frame") {
          this.frameInFlight = false;
          this.handleFrame(message.frame);
          return;
        }

        this.frameInFlight = false;
        const error = new Error(message.message);
        if (!workerReady || message.fatal) {
          reject(error);
          return;
        }

        this.reportError(error);
      };

      worker.onerror = (event) => {
        event.preventDefault();
        const error = new Error(
          event.message || "姿勢辨識背景程序發生錯誤。",
        );

        if (!workerReady) {
          reject(error);
          return;
        }

        this.reportError(error);
        this.stop();
      };

      worker.onmessageerror = () => {
        const error = new Error("無法讀取姿勢辨識背景程序的結果。");

        if (!workerReady) {
          reject(error);
          return;
        }

        this.reportError(error);
        this.stop();
      };
    });

    worker.postMessage({
      type: "initialize",
      config: {
        ...config,
        modelPath: resolveAssetUrl(config.modelPath, false),
        wasmPath: resolveAssetUrl(config.wasmPath, true),
      },
    });

    try {
      const [, stream] = await Promise.all([
        workerReadyPromise,
        this.openCamera(video, controller.signal, sessionId),
      ]);

      if (
        controller.signal.aborted ||
        sessionId !== this.sessionId ||
        worker !== this.worker
      ) {
        stream.getTracks().forEach((track) => track.stop());
        throw abortError();
      }

      this.stream = stream;
      this.startController = null;
      this.running = true;
      this.emitStatus("ready");
      this.scheduleNextFrame(sessionId);
    } catch (error) {
      if (sessionId === this.sessionId) {
        this.cleanupSession();
        const normalizedError =
          error instanceof DOMException && error.name !== "AbortError"
            ? cameraError(error)
            : toError(error, "姿勢追蹤器無法啟動。");

        if (
          !(normalizedError instanceof DOMException) ||
          normalizedError.name !== "AbortError"
        ) {
          this.reportError(normalizedError);
        }
      }

      throw error;
    }
  }

  stop(): void {
    this.sessionId += 1;
    this.cleanupSession();
  }

  private async openCamera(
    video: HTMLVideoElement,
    signal: AbortSignal,
    sessionId: number,
  ): Promise<MediaStream> {
    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    } catch (error) {
      throw cameraError(error);
    }

    if (signal.aborted || sessionId !== this.sessionId) {
      stream.getTracks().forEach((track) => track.stop());
      throw abortError();
    }

    this.stream = stream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    await waitForVideoMetadata(video, signal);
    if (signal.aborted || sessionId !== this.sessionId) {
      stream.getTracks().forEach((track) => track.stop());
      throw abortError();
    }

    await video.play();
    return stream;
  }

  private scheduleNextFrame(sessionId: number): void {
    if (!this.running || sessionId !== this.sessionId) {
      return;
    }

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

    if (
      !this.running ||
      this.frameInFlight ||
      sessionId !== this.sessionId ||
      !video ||
      !worker ||
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
        { type: "detect", bitmap, timestampMs },
        [bitmap],
      );
    } catch (error) {
      this.frameInFlight = false;
      this.reportError(
        toError(error, "無法取得攝影機畫面供姿勢辨識使用。"),
      );
    }
  }

  private handleFrame(frame: PoseFrame): void {
    if (frame.poses.length === 0) {
      this.emitStatus("noPerson");
    } else if (frame.poses.length > 1) {
      this.emitStatus("multiplePeople");
    } else {
      this.emitStatus("ready");
    }

    this.callbacks.onFrame?.(frame);
  }

  private emitStatus(status: TrackingStatus): void {
    if (status === this.lastStatus) {
      return;
    }

    this.lastStatus = status;
    this.callbacks.onStatus?.(status);
  }

  private reportError(error: Error): void {
    this.emitStatus("error");
    this.callbacks.onError?.(error);
  }

  private cleanupSession(): void {
    this.running = false;
    this.frameInFlight = false;
    this.lastStatus = null;

    this.startController?.abort();
    this.startController = null;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }

    if (this.worker) {
      this.worker.postMessage({ type: "dispose" });
      this.worker.terminate();
      this.worker = null;
    }
  }
}
