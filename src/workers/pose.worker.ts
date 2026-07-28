/// <reference lib="webworker" />

import {
  FilesetResolver,
  PoseLandmarker,
  type Landmark as MediaPipeLandmark,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import type { GameConfig, Landmark, PoseFrame } from "../types";

type PoseDetectionConfig = GameConfig["poseDetection"];

interface InitializeMessage {
  type: "initialize";
  config: PoseDetectionConfig;
}

interface DetectMessage {
  type: "detect";
  bitmap: ImageBitmap;
  timestampMs: number;
}

interface DisposeMessage {
  type: "dispose";
}

type IncomingMessage = InitializeMessage | DetectMessage | DisposeMessage;

type OutgoingMessage =
  | { type: "ready" }
  | { type: "frame"; frame: PoseFrame }
  | { type: "error"; message: string; fatal: boolean };

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let poseLandmarker: PoseLandmarker | null = null;
let initializationId = 0;

function postMessage(message: OutgoingMessage): void {
  workerScope.postMessage(message);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "姿勢辨識發生未知錯誤。";
}

function copyLandmark(
  source: NormalizedLandmark | MediaPipeLandmark,
): Landmark {
  const landmark: Landmark = {
    x: source.x,
    y: source.y,
    z: source.z,
    visibility: source.visibility,
  };

  // Some MediaPipe model versions expose `presence` at runtime even though the
  // current package's public TypeScript declarations omit it.
  const presence = (source as { presence?: unknown }).presence;
  if (typeof presence === "number") {
    landmark.presence = presence;
  }

  return landmark;
}

async function initialize(config: PoseDetectionConfig): Promise<void> {
  const currentInitialization = ++initializationId;

  try {
    poseLandmarker?.close();
    poseLandmarker = null;

    // This worker is bundled as an ES module, so MediaPipe must use its
    // module-aware loader to expose ModuleFactory on the worker global.
    const vision = await FilesetResolver.forVisionTasks(
      config.wasmPath,
      true,
    );
    if (currentInitialization !== initializationId) {
      return;
    }

    const nextLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: config.modelPath,
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: config.minDetectionConfidence,
      minPosePresenceConfidence: config.minPosePresenceConfidence,
      minTrackingConfidence: config.minTrackingConfidence,
      outputSegmentationMasks: false,
    });

    if (currentInitialization !== initializationId) {
      nextLandmarker.close();
      return;
    }

    poseLandmarker = nextLandmarker;
    postMessage({ type: "ready" });
  } catch (error) {
    if (currentInitialization === initializationId) {
      postMessage({
        type: "error",
        message: errorMessage(error),
        fatal: true,
      });
    }
  }
}

function detect(bitmap: ImageBitmap, timestampMs: number): void {
  const landmarker = poseLandmarker;
  if (!landmarker) {
    bitmap.close();
    postMessage({
      type: "error",
      message: "姿勢辨識器尚未完成載入。",
      fatal: true,
    });
    return;
  }

  const startedAt = performance.now();

  try {
    const result = landmarker.detectForVideo(bitmap, timestampMs);
    const frame: PoseFrame = {
      timestampMs,
      inferenceMs: performance.now() - startedAt,
      poses: result.landmarks.map((landmarks, index) => ({
        landmarks: landmarks.map(copyLandmark),
        worldLandmarks: (result.worldLandmarks[index] ?? []).map(copyLandmark),
      })),
    };

    postMessage({ type: "frame", frame });
  } catch (error) {
    postMessage({
      type: "error",
      message: errorMessage(error),
      fatal: false,
    });
  } finally {
    bitmap.close();
  }
}

function dispose(): void {
  initializationId += 1;
  poseLandmarker?.close();
  poseLandmarker = null;
  workerScope.close();
}

workerScope.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "initialize":
      void initialize(message.config);
      break;
    case "detect":
      detect(message.bitmap, message.timestampMs);
      break;
    case "dispose":
      dispose();
      break;
  }
};
