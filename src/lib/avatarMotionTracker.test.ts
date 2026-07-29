import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarMotionTracker } from "./avatarMotionTracker";
import type { GameConfig } from "../types";

const trackingConfig: GameConfig["avatarTracking"] = {
  enabled: true,
  maxInferenceFps: 10,
  lowQualityMaxInferenceFps: 6,
  initializationTimeoutMs: 120_000,
  smoothing: 0.38,
  lostHoldMs: 250,
  relaxMs: 300,
  hands: {
    enabled: true,
    modelPath: "/models/hand_landmarker.task",
    roiScale: 1.6,
    handednessSwap: false,
    wristRotationEnabled: true,
    wristRotationInfluence: 0.85,
    wristMaxAngleDegrees: 105,
    minDetectionConfidence: 0.5,
    minPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },
  face: {
    enabled: true,
    modelPath: "/models/face_landmarker.task",
    minDetectionConfidence: 0.5,
    minPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },
};

class NeverReadyWorker {
  static instances: NeverReadyWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    NeverReadyWorker.instances.push(this);
  }
}

afterEach(() => {
  NeverReadyWorker.instances = [];
  vi.unstubAllGlobals();
});

describe("AvatarMotionTracker lifecycle", () => {
  it("立即取消仍在等待模型初始化的 start", async () => {
    vi.stubGlobal("Worker", NeverReadyWorker);
    vi.stubGlobal("createImageBitmap", vi.fn());
    vi.stubGlobal("document", {
      baseURI: "http://localhost/",
    });

    const tracker = new AvatarMotionTracker();
    const startPromise = tracker.start(
      {} as HTMLVideoElement,
      trackingConfig,
      "/mediapipe/wasm",
    );

    tracker.stop();

    await expect(startPromise).resolves.toBeUndefined();
    expect(NeverReadyWorker.instances).toHaveLength(1);
    expect(
      NeverReadyWorker.instances[0]?.terminate,
    ).toHaveBeenCalledOnce();
  });
});
