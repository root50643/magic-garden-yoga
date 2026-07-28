import {
  POSE_LANDMARK_NAMES,
  type DetectedPose,
  type Landmark,
} from "../types";

const DEFAULT_COORDINATE_ALPHA = 0.35;
const DEFAULT_CONFIDENCE_ALPHA = 0.5;
const REQUIRED_LANDMARK_COUNT = POSE_LANDMARK_NAMES.length;

export interface PoseSmootherOptions {
  coordinateAlpha?: number;
  confidenceAlpha?: number;
}

/**
 * Applies an exponential moving average to a single tracked person.
 *
 * Callers should reset the smoother whenever tracking loses the person or
 * detects multiple people, so coordinates from different people/sessions are
 * never blended together.
 */
export class PoseSmoother {
  private readonly coordinateAlpha: number;
  private readonly confidenceAlpha: number;
  private previous: DetectedPose | null = null;

  constructor(options: PoseSmootherOptions = {}) {
    this.coordinateAlpha = validAlpha(
      options.coordinateAlpha,
      DEFAULT_COORDINATE_ALPHA,
    );
    this.confidenceAlpha = validAlpha(
      options.confidenceAlpha,
      DEFAULT_CONFIDENCE_ALPHA,
    );
  }

  update(pose: DetectedPose): DetectedPose | null {
    if (!isValidPose(pose)) {
      this.reset();
      return null;
    }

    if (
      !this.previous ||
      this.previous.landmarks.length !== pose.landmarks.length ||
      this.previous.worldLandmarks.length !== pose.worldLandmarks.length
    ) {
      const seed = clonePose(pose);
      this.previous = seed;
      return clonePose(seed);
    }

    const smoothed = {
      landmarks: smoothLandmarkSet(
        this.previous.landmarks,
        pose.landmarks,
        this.coordinateAlpha,
        this.confidenceAlpha,
      ),
      worldLandmarks: smoothLandmarkSet(
        this.previous.worldLandmarks,
        pose.worldLandmarks,
        this.coordinateAlpha,
        this.confidenceAlpha,
      ),
    };
    this.previous = smoothed;
    return clonePose(smoothed);
  }

  reset(): void {
    this.previous = null;
  }
}

export function isValidPose(pose: DetectedPose | null | undefined): pose is DetectedPose {
  if (
    !pose ||
    pose.landmarks.length < REQUIRED_LANDMARK_COUNT ||
    (pose.worldLandmarks.length > 0 &&
      pose.worldLandmarks.length < REQUIRED_LANDMARK_COUNT)
  ) {
    return false;
  }

  return (
    pose.landmarks.every(isFiniteLandmark) &&
    pose.worldLandmarks.every(isFiniteLandmark)
  );
}

function smoothLandmarkSet(
  previous: Landmark[],
  current: Landmark[],
  coordinateAlpha: number,
  confidenceAlpha: number,
): Landmark[] {
  return current.map((landmark, index) => {
    const prior = previous[index];
    if (!prior) {
      return cloneLandmark(landmark);
    }

    const smoothed: Landmark = {
      x: ema(prior.x, landmark.x, coordinateAlpha),
      y: ema(prior.y, landmark.y, coordinateAlpha),
      z: ema(prior.z, landmark.z, coordinateAlpha),
      visibility: ema(
        clampConfidence(prior.visibility),
        clampConfidence(landmark.visibility),
        confidenceAlpha,
      ),
    };

    // Presence is optional in MediaPipe's public output. Do not retain a stale
    // value when the current frame does not provide it.
    if (landmark.presence !== undefined) {
      smoothed.presence =
        prior.presence === undefined
          ? clampConfidence(landmark.presence)
          : ema(
              clampConfidence(prior.presence),
              clampConfidence(landmark.presence),
              confidenceAlpha,
            );
    }

    return smoothed;
  });
}

function clonePose(pose: DetectedPose): DetectedPose {
  return {
    landmarks: pose.landmarks.map(cloneLandmark),
    worldLandmarks: pose.worldLandmarks.map(cloneLandmark),
  };
}

function cloneLandmark(landmark: Landmark): Landmark {
  return landmark.presence === undefined
    ? {
        x: landmark.x,
        y: landmark.y,
        z: landmark.z,
        visibility: landmark.visibility,
      }
    : {
        x: landmark.x,
        y: landmark.y,
        z: landmark.z,
        visibility: landmark.visibility,
        presence: landmark.presence,
      };
}

function isFiniteLandmark(landmark: Landmark): boolean {
  return (
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    Number.isFinite(landmark.z) &&
    Number.isFinite(landmark.visibility) &&
    (landmark.presence === undefined || Number.isFinite(landmark.presence))
  );
}

function ema(previous: number, current: number, alpha: number): number {
  return previous + (current - previous) * alpha;
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function validAlpha(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 && value! <= 1
    ? value!
    : fallback;
}
