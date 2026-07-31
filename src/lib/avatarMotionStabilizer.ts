import { MathUtils, Quaternion } from "three";
import type { Landmark } from "../types";

export interface QuaternionStabilizerOptions {
  deadZoneDegrees: number;
  slowHalfLifeMs: number;
  fastHalfLifeMs: number;
  fastMotionDegrees: number;
}

export interface HandLandmarkStabilizerOptions {
  deadZonePalmWidths: number;
  slowHalfLifeMs: number;
  fastHalfLifeMs: number;
  fastMotionPalmWidths: number;
}

export interface HandLandmarkFilterState {
  timestampMs: number | null;
  landmarks: Landmark[] | null;
}

export interface StabilizedHandLandmarks {
  landmarks: Landmark[];
  nextState: HandLandmarkFilterState;
  accepted: boolean;
}

const DEFAULT_OPTIONS: QuaternionStabilizerOptions = {
  deadZoneDegrees: 0.4,
  slowHalfLifeMs: 140,
  fastHalfLifeMs: 36,
  fastMotionDegrees: 24,
};

const DEFAULT_HAND_OPTIONS: HandLandmarkStabilizerOptions = {
  deadZonePalmWidths: 0.006,
  slowHalfLifeMs: 110,
  fastHalfLifeMs: 20,
  fastMotionPalmWidths: 0.12,
};

function finiteLandmark(value: Landmark | null | undefined): value is Landmark {
  return Boolean(
    value &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      Number.isFinite(value.z),
  );
}

function cloneLandmarks(landmarks: readonly Landmark[]): Landmark[] {
  return landmarks.map((landmark) => ({ ...landmark }));
}

function landmarkDistance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function robustPalmScale(landmarks: readonly Landmark[]): number {
  const index = landmarks[5];
  const middle = landmarks[9];
  const ring = landmarks[13];
  const little = landmarks[17];
  const estimates = [
    landmarkDistance(index, little),
    landmarkDistance(index, ring) * 1.5,
    landmarkDistance(middle, little) * 1.5,
  ].sort((a, b) => a - b);
  return estimates[1];
}

function normalizedPalmShape(
  landmarks: readonly Landmark[],
): Landmark[] | null {
  if (
    landmarks.length < 21 ||
    !finiteLandmark(landmarks[0]) ||
    !finiteLandmark(landmarks[5]) ||
    !finiteLandmark(landmarks[9]) ||
    !finiteLandmark(landmarks[13]) ||
    !finiteLandmark(landmarks[17])
  ) {
    return null;
  }
  const wrist = landmarks[0];
  const palmWidth = robustPalmScale(landmarks);
  if (!Number.isFinite(palmWidth) || palmWidth <= 1e-6) return null;

  const normalized: Landmark[] = [];
  for (const landmark of landmarks.slice(0, 21)) {
    if (!finiteLandmark(landmark)) return null;
    normalized.push({
      ...landmark,
      x: (landmark.x - wrist.x) / palmWidth,
      y: (landmark.y - wrist.y) / palmWidth,
      z: (landmark.z - wrist.z) / palmWidth,
    });
  }
  return normalized;
}

function adaptiveAlpha(
  motion: number,
  elapsedMs: number,
  deadZone: number,
  fastAt: number,
  slowHalfLifeMs: number,
  fastHalfLifeMs: number,
): number {
  if (!Number.isFinite(motion) || motion <= deadZone) return 0;
  const safeElapsedMs = Number.isFinite(elapsedMs)
    ? MathUtils.clamp(elapsedMs, 1, 250)
    : 100;
  // fastAt is expressed as displacement per 100 ms. Classifying by speed,
  // rather than raw per-sample displacement, keeps 6/10/15 FPS inference
  // streams equally responsive for the same physical gesture.
  const motionPer100Ms =
    (Math.max(0, motion - deadZone) * 100) / safeElapsedMs;
  const motionRatio = MathUtils.clamp(
    motionPer100Ms / Math.max(0.000001, fastAt - deadZone),
    0,
    1,
  );
  const easedRatio = motionRatio * motionRatio * (3 - 2 * motionRatio);
  const halfLife = MathUtils.lerp(
    Math.max(0, slowHalfLifeMs),
    Math.max(0, fastHalfLifeMs),
    easedRatio,
  );
  if (halfLife <= Number.EPSILON) return 1;
  return 1 - 2 ** (-safeElapsedMs / halfLife);
}

function finiteQuaternion(value: Quaternion): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w) &&
    value.lengthSq() > Number.EPSILON
  );
}

function alignHemisphere(
  quaternion: Quaternion,
  reference: Quaternion,
): Quaternion {
  const aligned = quaternion.clone().normalize();
  if (aligned.dot(reference) < 0) {
    aligned.set(-aligned.x, -aligned.y, -aligned.z, -aligned.w);
  }
  return aligned;
}

/**
 * Low-pass filters a bone target only when a new tracker frame arrives.
 *
 * Small landmark noise receives a long half-life and an angular dead zone,
 * while an intentional large gesture quickly approaches the raw target. This
 * avoids converting a stable 10 FPS landmark stream into 60 FPS micro-jitter.
 */
export function stabilizeQuaternionTarget(
  previous: Quaternion,
  next: Quaternion,
  elapsedMs: number,
  options: Partial<QuaternionStabilizerOptions> = {},
): Quaternion {
  if (!finiteQuaternion(previous) || !finiteQuaternion(next)) {
    return finiteQuaternion(previous)
      ? previous.clone().normalize()
      : new Quaternion();
  }

  const resolved: QuaternionStabilizerOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const normalizedPrevious = previous.clone().normalize();
  const alignedNext = alignHemisphere(next, normalizedPrevious);
  const angleDegrees = MathUtils.radToDeg(
    normalizedPrevious.angleTo(alignedNext),
  );
  const deadZone = Math.max(0, resolved.deadZoneDegrees);
  if (!Number.isFinite(angleDegrees) || angleDegrees <= deadZone) {
    return normalizedPrevious;
  }

  const fastAt = Math.max(deadZone + 0.001, resolved.fastMotionDegrees);
  const safeElapsed = Number.isFinite(elapsedMs)
    ? MathUtils.clamp(elapsedMs, 1, 250)
    : 100;
  const anglePer100Ms =
    (Math.max(0, angleDegrees - deadZone) * 100) / safeElapsed;
  const motionRatio = MathUtils.clamp(
    anglePer100Ms / (fastAt - deadZone),
    0,
    1,
  );
  const easedRatio = motionRatio * motionRatio * (3 - 2 * motionRatio);
  const slowHalfLife = Math.max(0, resolved.slowHalfLifeMs);
  const fastHalfLife = Math.max(0, resolved.fastHalfLifeMs);
  const halfLife = MathUtils.lerp(
    slowHalfLife,
    fastHalfLife,
    easedRatio,
  );
  const alpha =
    halfLife <= Number.EPSILON
      ? 1
      : 1 - 2 ** (-safeElapsed / halfLife);

  return normalizedPrevious.slerp(alignedNext, alpha).normalize();
}

export function clampQuaternionFromRest(
  rest: Quaternion,
  target: Quaternion,
  maximumDegrees: number,
): Quaternion {
  if (!finiteQuaternion(rest) || !finiteQuaternion(target)) {
    return finiteQuaternion(rest) ? rest.clone().normalize() : new Quaternion();
  }
  const normalizedRest = rest.clone().normalize();
  const alignedTarget = alignHemisphere(target, normalizedRest);
  const maximum = MathUtils.degToRad(Math.max(0, maximumDegrees));
  const angle = normalizedRest.angleTo(alignedTarget);
  if (angle <= maximum || angle <= Number.EPSILON) return alignedTarget;
  return normalizedRest
    .slerp(alignedTarget, maximum / angle)
    .normalize();
}

export function sourceFrameDeltaMs(
  currentTimestampMs: number,
  previousTimestampMs: number | null,
  fallbackMs = 100,
): number {
  if (
    previousTimestampMs === null ||
    !Number.isFinite(currentTimestampMs) ||
    !Number.isFinite(previousTimestampMs) ||
    currentTimestampMs <= previousTimestampMs
  ) {
    return MathUtils.clamp(fallbackMs, 1, 250);
  }
  return MathUtils.clamp(currentTimestampMs - previousTimestampMs, 1, 250);
}

export function createHandLandmarkFilterState(): HandLandmarkFilterState {
  return { timestampMs: null, landmarks: null };
}

/**
 * Filters the 21 world landmarks after removing wrist translation and palm
 * scale. The normalized shape preserves palm orientation and joint angles,
 * while preventing harmless origin/scale noise from moving every VRM digit.
 */
export function stabilizeHandWorldLandmarks(
  landmarks: readonly Landmark[],
  timestampMs: number,
  previousState: HandLandmarkFilterState,
  options: Partial<HandLandmarkStabilizerOptions> = {},
): StabilizedHandLandmarks {
  const normalized = normalizedPalmShape(landmarks);
  if (!normalized || !Number.isFinite(timestampMs)) {
    return {
      landmarks: previousState.landmarks
        ? cloneLandmarks(previousState.landmarks)
        : [],
      nextState: {
        timestampMs: previousState.timestampMs,
        landmarks: previousState.landmarks
          ? cloneLandmarks(previousState.landmarks)
          : null,
      },
      accepted: false,
    };
  }
  if (
    previousState.timestampMs !== null &&
    timestampMs <= previousState.timestampMs &&
    previousState.landmarks
  ) {
    return {
      landmarks: cloneLandmarks(previousState.landmarks),
      nextState: {
        timestampMs: previousState.timestampMs,
        landmarks: cloneLandmarks(previousState.landmarks),
      },
      accepted: false,
    };
  }
  if (!previousState.landmarks || previousState.landmarks.length < 21) {
    return {
      landmarks: normalized,
      nextState: {
        timestampMs,
        landmarks: cloneLandmarks(normalized),
      },
      accepted: true,
    };
  }

  const resolved: HandLandmarkStabilizerOptions = {
    ...DEFAULT_HAND_OPTIONS,
    ...options,
  };
  const elapsedMs = sourceFrameDeltaMs(
    timestampMs,
    previousState.timestampMs,
  );
  const shapeMotion = Math.sqrt(
    normalized.reduce((sum, landmark, index) => {
      const previous = previousState.landmarks?.[index] ?? landmark;
      return (
        sum +
        (landmark.x - previous.x) ** 2 +
        (landmark.y - previous.y) ** 2 +
        (landmark.z - previous.z) ** 2
      );
    }, 0) / normalized.length,
  );
  // Every point uses the same alpha. Filtering fingertips faster than their
  // MCP joints during a rigid wrist turn temporarily bends a straight finger.
  // A shape-wide RMS still reacts quickly when one complete digit moves.
  const sharedAlpha = adaptiveAlpha(
    shapeMotion,
    elapsedMs,
    Math.max(0, resolved.deadZonePalmWidths),
    Math.max(
      resolved.deadZonePalmWidths + 0.000001,
      resolved.fastMotionPalmWidths,
    ),
    resolved.slowHalfLifeMs,
    resolved.fastHalfLifeMs,
  );
  const filtered = normalized.map((landmark, index) => {
    const previous = previousState.landmarks?.[index] ?? landmark;
    return {
      ...landmark,
      x: MathUtils.lerp(previous.x, landmark.x, sharedAlpha),
      y: MathUtils.lerp(previous.y, landmark.y, sharedAlpha),
      z: MathUtils.lerp(previous.z, landmark.z, sharedAlpha),
    };
  });

  return {
    landmarks: filtered,
    nextState: {
      timestampMs,
      landmarks: cloneLandmarks(filtered),
    },
    accepted: true,
  };
}
