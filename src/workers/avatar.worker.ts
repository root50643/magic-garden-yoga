/// <reference lib="webworker" />

import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type Landmark as MediaPipeLandmark,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import { handSideFromMosaicX } from "../lib/avatarMotion";
import type {
  AvatarMotionFrame,
  DetectedHand,
  DetectedPose,
  FaceMotion,
  GameConfig,
  HandSide,
  Landmark,
} from "../types";

type AvatarTrackingConfig = GameConfig["avatarTracking"] & {
  wasmPath: string;
};

interface InitializeMessage {
  type: "initialize";
  config: AvatarTrackingConfig;
}

interface DetectMessage {
  type: "detect";
  bitmap: ImageBitmap;
  pose: DetectedPose | null;
  timestampMs: number;
}

interface DisposeMessage {
  type: "dispose";
}

type IncomingMessage = InitializeMessage | DetectMessage | DisposeMessage;

type AvatarFeature = "hands" | "face";

type OutgoingMessage =
  | {
      type: "ready";
      capabilities: { hands: boolean; face: boolean };
    }
  | {
      type: "capabilities";
      capabilities: { hands: boolean; face: boolean };
    }
  | { type: "frame"; frame: AvatarMotionFrame }
  | {
      type: "warning";
      feature: AvatarFeature;
      message: string;
    }
  | {
      type: "progress";
      feature: AvatarFeature;
      phase: "runtime" | "model" | "ready";
    }
  | { type: "error"; message: string };

interface CropPanel {
  side: HandSide;
  x: number;
  y: number;
  width: number;
  height: number;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const HAND_PANEL_SIZE = 320;
const HAND_CANVAS_WIDTH = HAND_PANEL_SIZE * 2;
const HAND_CANVAS_HEIGHT = HAND_PANEL_SIZE;

let handLandmarker: HandLandmarker | null = null;
let faceLandmarker: FaceLandmarker | null = null;
let config: AvatarTrackingConfig | null = null;
let initializationId = 0;
let handCanvas: OffscreenCanvas | null = null;
let handContext: OffscreenCanvasRenderingContext2D | null = null;

function postMessage(message: OutgoingMessage): void {
  workerScope.postMessage(message);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "未知的追蹤錯誤。";
}

function loaderWithCacheKey(
  loaderPath: string,
  taskName: AvatarFeature,
): string {
  const separator = loaderPath.includes("?") ? "&" : "?";
  return `${loaderPath}${separator}task=${taskName}`;
}

/**
 * MediaPipe clears ModuleFactory after creating a task. In an ES module
 * worker, importing the same loader URL again would hit the module cache and
 * leave the next task without a factory. A task-specific query makes each
 * loader import distinct while both tasks still share the same local WASM.
 */
async function filesetForTask(
  wasmPath: string,
  taskName: AvatarFeature,
) {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath, true);
  return {
    ...fileset,
    wasmLoaderPath: loaderWithCacheKey(fileset.wasmLoaderPath, taskName),
  };
}

function closeTasks(): void {
  handLandmarker?.close();
  faceLandmarker?.close();
  handLandmarker = null;
  faceLandmarker = null;
  handCanvas = null;
  handContext = null;
}

function currentCapabilities(): { hands: boolean; face: boolean } {
  return {
    hands: handLandmarker !== null,
    face: faceLandmarker !== null,
  };
}

async function downloadModel(
  feature: AvatarFeature,
  modelPath: string,
): Promise<Uint8Array | null> {
  postMessage({ type: "progress", feature, phase: "model" });
  try {
    const response = await fetch(modelPath);
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}${
          response.statusText ? ` ${response.statusText}` : ""
        }`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    postMessage({
      type: "warning",
      feature,
      message: `${
        feature === "hands" ? "手指" : "臉部"
      }模型下載失敗：${errorMessage(error)}`,
    });
    return null;
  }
}

function disableFeatureAfterRuntimeError(
  feature: AvatarFeature,
  error: unknown,
): void {
  if (feature === "hands") {
    handLandmarker?.close();
    handLandmarker = null;
  } else {
    faceLandmarker?.close();
    faceLandmarker = null;
  }
  postMessage({
    type: "warning",
    feature,
    message: `${
      feature === "hands" ? "手指" : "臉部"
    }追蹤執行失敗，已停用該項顯示同步：${errorMessage(error)}`,
  });
  postMessage({
    type: "capabilities",
    capabilities: currentCapabilities(),
  });
}

async function initialize(nextConfig: AvatarTrackingConfig): Promise<void> {
  const currentInitialization = ++initializationId;
  closeTasks();
  config = nextConfig;

  if (!nextConfig.enabled) {
    postMessage({
      type: "ready",
      capabilities: { hands: false, face: false },
    });
    return;
  }

  // Download both independent model bundles in parallel. Task construction
  // remains sequential because each MediaPipe instance needs an isolated
  // module-loader cache key, but Face no longer waits for the Hand model
  // network request to finish before its own download can begin.
  const [handModel, faceModel] = await Promise.all([
    nextConfig.hands.enabled
      ? downloadModel("hands", nextConfig.hands.modelPath)
      : Promise.resolve(null),
    nextConfig.face.enabled
      ? downloadModel("face", nextConfig.face.modelPath)
      : Promise.resolve(null),
  ]);
  if (currentInitialization !== initializationId) return;

  if (nextConfig.hands.enabled && handModel) {
    try {
      postMessage({ type: "progress", feature: "hands", phase: "runtime" });
      const fileset = await filesetForTask(nextConfig.wasmPath, "hands");
      const nextHandLandmarker = await HandLandmarker.createFromOptions(
        fileset,
        {
          baseOptions: {
            modelAssetBuffer: handModel,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence:
            nextConfig.hands.minDetectionConfidence,
          minHandPresenceConfidence:
            nextConfig.hands.minPresenceConfidence,
          minTrackingConfidence: nextConfig.hands.minTrackingConfidence,
        },
      );
      if (currentInitialization !== initializationId) {
        nextHandLandmarker.close();
        return;
      }
      handLandmarker = nextHandLandmarker;
      postMessage({ type: "progress", feature: "hands", phase: "ready" });
    } catch (error) {
      postMessage({
        type: "warning",
        feature: "hands",
        message: `手指追蹤載入失敗：${errorMessage(error)}`,
      });
    }
  }

  if (nextConfig.face.enabled && faceModel) {
    try {
      postMessage({ type: "progress", feature: "face", phase: "runtime" });
      const fileset = await filesetForTask(nextConfig.wasmPath, "face");
      const nextFaceLandmarker = await FaceLandmarker.createFromOptions(
        fileset,
        {
          baseOptions: {
            modelAssetBuffer: faceModel,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence:
            nextConfig.face.minDetectionConfidence,
          minFacePresenceConfidence:
            nextConfig.face.minPresenceConfidence,
          minTrackingConfidence: nextConfig.face.minTrackingConfidence,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        },
      );
      if (currentInitialization !== initializationId) {
        nextFaceLandmarker.close();
        return;
      }
      faceLandmarker = nextFaceLandmarker;
      postMessage({ type: "progress", feature: "face", phase: "ready" });
    } catch (error) {
      postMessage({
        type: "warning",
        feature: "face",
        message: `臉部追蹤載入失敗：${errorMessage(error)}`,
      });
    }
  }

  if (currentInitialization === initializationId) {
    postMessage({
      type: "ready",
      capabilities: currentCapabilities(),
    });
  }
}

function finiteLandmark(
  landmark: Landmark | null | undefined,
): landmark is Landmark {
  return Boolean(
    landmark &&
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y),
  );
}

function handCenter(
  pose: DetectedPose,
  side: HandSide,
): { x: number; y: number } | null {
  const indices = side === "left" ? [15, 17, 19, 21] : [16, 18, 20, 22];
  const points = indices
    .map((index) => pose.landmarks[index])
    .filter(finiteLandmark);
  if (points.length === 0) return null;

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function shoulderWidthPixels(
  pose: DetectedPose,
  bitmap: ImageBitmap,
): number {
  const left = pose.landmarks[11];
  const right = pose.landmarks[12];
  if (!finiteLandmark(left) || !finiteLandmark(right)) {
    return Math.min(bitmap.width, bitmap.height) * 0.22;
  }
  return Math.hypot(
    (right.x - left.x) * bitmap.width,
    (right.y - left.y) * bitmap.height,
  );
}

function cropPanel(
  bitmap: ImageBitmap,
  center: { x: number; y: number },
  size: number,
  side: HandSide,
): CropPanel {
  const centerX = center.x * bitmap.width;
  const centerY = center.y * bitmap.height;
  const left = Math.max(0, centerX - size / 2);
  const top = Math.max(0, centerY - size / 2);
  const right = Math.min(bitmap.width, centerX + size / 2);
  const bottom = Math.min(bitmap.height, centerY + size / 2);
  return {
    side,
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function buildHandMosaic(
  bitmap: ImageBitmap,
  pose: DetectedPose,
  roiScale: number,
): { source: OffscreenCanvas; panels: CropPanel[] } | null {
  if (!handCanvas) {
    handCanvas = new OffscreenCanvas(HAND_CANVAS_WIDTH, HAND_CANVAS_HEIGHT);
    handContext = handCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });
  }
  if (!handContext || !handCanvas) return null;

  const leftCenter = handCenter(pose, "left");
  const rightCenter = handCenter(pose, "right");
  if (!leftCenter || !rightCenter) return null;

  const shorterEdge = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(
    shorterEdge * 0.55,
    Math.max(
      shorterEdge * 0.18,
      shoulderWidthPixels(pose, bitmap) * roiScale,
    ),
  );
  const panels = [
    cropPanel(bitmap, leftCenter, size, "left"),
    cropPanel(bitmap, rightCenter, size, "right"),
  ];

  handContext.fillStyle = "#000";
  handContext.fillRect(0, 0, HAND_CANVAS_WIDTH, HAND_CANVAS_HEIGHT);
  panels.forEach((panel, index) => {
    handContext?.drawImage(
      bitmap,
      panel.x,
      panel.y,
      panel.width,
      panel.height,
      index * HAND_PANEL_SIZE,
      0,
      HAND_PANEL_SIZE,
      HAND_PANEL_SIZE,
    );
  });
  return { source: handCanvas, panels };
}

function copyHandLandmark(
  source: NormalizedLandmark | MediaPipeLandmark,
): Landmark {
  return {
    x: source.x,
    y: source.y,
    z: source.z,
    // The hand models do not produce per-landmark visibility. Mark a returned
    // hand point as usable; detection confidence is stored on the hand.
    visibility: 1,
    presence: 1,
  };
}

function restorePanelLandmark(
  source: NormalizedLandmark,
  panel: CropPanel,
  panelIndex: number,
  bitmap: ImageBitmap,
): Landmark {
  const panelX = source.x * 2 - panelIndex;
  return {
    x: (panel.x + panelX * panel.width) / bitmap.width,
    y: (panel.y + source.y * panel.height) / bitmap.height,
    z: source.z * 2,
    visibility: 1,
    presence: 1,
  };
}

function handsFromMosaic(
  result: HandLandmarkerResult,
  panels: CropPanel[],
  bitmap: ImageBitmap,
  timestampMs: number,
  handednessSwap: boolean,
): DetectedHand[] {
  const bestBySide = new Map<HandSide, DetectedHand>();

  result.landmarks.forEach((landmarks, index) => {
    const wrist = landmarks[0];
    if (!wrist) return;
    const panelIndex = wrist.x < 0.5 ? 0 : 1;
    const panel = panels[panelIndex];
    if (!panel) return;
    const side = handSideFromMosaicX(wrist.x, handednessSwap);
    const confidence = result.handedness[index]?.[0]?.score ?? 0;
    const hand: DetectedHand = {
      side,
      confidence,
      updatedAtMs: timestampMs,
      landmarks: landmarks.map((point) =>
        restorePanelLandmark(point, panel, panelIndex, bitmap),
      ),
      worldLandmarks: (result.worldLandmarks[index] ?? []).map(
        copyHandLandmark,
      ),
    };
    const previous = bestBySide.get(side);
    if (!previous || confidence > previous.confidence) {
      bestBySide.set(side, hand);
    }
  });

  return [...bestBySide.values()];
}

function detectHands(
  bitmap: ImageBitmap,
  pose: DetectedPose,
  timestampMs: number,
  activeConfig: AvatarTrackingConfig,
): DetectedHand[] {
  if (!handLandmarker) return [];
  const mosaic = buildHandMosaic(
    bitmap,
    pose,
    activeConfig.hands.roiScale,
  );
  if (!mosaic) return [];
  const result = handLandmarker.detectForVideo(mosaic.source, timestampMs);
  return handsFromMosaic(
    result,
    mosaic.panels,
    bitmap,
    timestampMs,
    activeConfig.hands.handednessSwap,
  );
}

function detectFace(
  bitmap: ImageBitmap,
  timestampMs: number,
): FaceMotion | null {
  if (!faceLandmarker) return null;
  const result = faceLandmarker.detectForVideo(bitmap, timestampMs);
  const categories = result.faceBlendshapes[0]?.categories;
  const faceLandmarks = result.faceLandmarks[0];
  if (!categories && !faceLandmarks) return null;

  return {
    updatedAtMs: timestampMs,
    landmarks: (faceLandmarks ?? []).map(copyHandLandmark),
    blendshapes: Object.fromEntries(
      (categories ?? [])
        .filter(
          ({ categoryName, score }) =>
            categoryName.length > 0 && Number.isFinite(score),
        )
        .map(({ categoryName, score }) => [categoryName, score]),
    ),
  };
}

function detect(
  bitmap: ImageBitmap,
  pose: DetectedPose | null,
  timestampMs: number,
): void {
  const activeConfig = config;
  if (!activeConfig) {
    bitmap.close();
    postMessage({ type: "error", message: "人物動態追蹤尚未初始化。" });
    return;
  }

  const startedAt = performance.now();
  try {
    let hands: DetectedHand[] = [];
    let face: FaceMotion | null = null;
    if (activeConfig.enabled && pose) {
      if (handLandmarker) {
        try {
          hands = detectHands(
            bitmap,
            pose,
            timestampMs,
            activeConfig,
          );
        } catch (error) {
          disableFeatureAfterRuntimeError("hands", error);
        }
      }
      if (faceLandmarker) {
        try {
          face = detectFace(bitmap, timestampMs);
        } catch (error) {
          disableFeatureAfterRuntimeError("face", error);
        }
      }
    }
    postMessage({
      type: "frame",
      frame: {
        timestampMs,
        hands,
        face,
        inferenceMs: performance.now() - startedAt,
      },
    });
  } catch (error) {
    postMessage({ type: "error", message: errorMessage(error) });
  } finally {
    bitmap.close();
  }
}

function dispose(): void {
  initializationId += 1;
  closeTasks();
  config = null;
  workerScope.close();
}

workerScope.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  switch (message.type) {
    case "initialize":
      void initialize(message.config);
      break;
    case "detect":
      detect(message.bitmap, message.pose, message.timestampMs);
      break;
    case "dispose":
      dispose();
      break;
  }
};
