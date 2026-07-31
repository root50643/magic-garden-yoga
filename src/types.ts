export const POSE_LANDMARK_NAMES = [
  "nose",
  "leftEyeInner",
  "leftEye",
  "leftEyeOuter",
  "rightEyeInner",
  "rightEye",
  "rightEyeOuter",
  "leftEar",
  "rightEar",
  "mouthLeft",
  "mouthRight",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftWrist",
  "rightWrist",
  "leftPinky",
  "rightPinky",
  "leftIndex",
  "rightIndex",
  "leftThumb",
  "rightThumb",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
  "leftHeel",
  "rightHeel",
  "leftFootIndex",
  "rightFootIndex",
] as const;

export type LandmarkName = (typeof POSE_LANDMARK_NAMES)[number];

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
  presence?: number;
}

export interface DetectedPose {
  landmarks: Landmark[];
  worldLandmarks: Landmark[];
}

export interface PoseFrame {
  timestampMs: number;
  poses: DetectedPose[];
  inferenceMs: number;
}

export type HandSide = "left" | "right";

export interface DetectedHand {
  side: HandSide;
  landmarks: Landmark[];
  worldLandmarks: Landmark[];
  confidence: number;
  updatedAtMs: number;
}

export interface FaceMotion {
  blendshapes: Record<string, number>;
  /**
   * Normalized MediaPipe face landmarks in source-camera coordinates.
   *
   * Optional for backwards compatibility with saved/debug motion frames.
   * These points are display-only and are never consumed by yoga scoring.
   */
  landmarks?: Landmark[];
  updatedAtMs: number;
}

/**
 * Display-only motion from the optional hand and face trackers.
 *
 * This is deliberately separate from `PoseFrame`: yoga scoring and hold
 * timing accept body pose data only, so finger/face tracking can never change
 * a challenge score.
 */
export interface AvatarMotionFrame {
  timestampMs: number;
  hands: DetectedHand[];
  face: FaceMotion | null;
  inferenceMs: number;
}

export interface AngleConstraint {
  type: "angle";
  points: [LandmarkName, LandmarkName, LandmarkName];
  target: number;
  tolerance: number;
  weight: number;
  hint: string;
}

export interface RelativePositionConstraint {
  type: "relativePosition";
  a: LandmarkName;
  b: LandmarkName;
  axis: "x" | "y" | "z";
  relation: "less" | "greater" | "near";
  margin: number;
  tolerance: number;
  weight: number;
  hint: string;
}

export interface DistanceRatioConstraint {
  type: "distanceRatio";
  a: LandmarkName;
  b: LandmarkName;
  referenceA: LandmarkName;
  referenceB: LandmarkName;
  target: number;
  tolerance: number;
  weight: number;
  hint: string;
}

export type PoseConstraint =
  | AngleConstraint
  | RelativePositionConstraint
  | DistanceRatioConstraint;

export interface PoseDefinition {
  id: string;
  name: string;
  englishName: string;
  imagePath: string;
  instruction: string;
  orientation: "front" | "threeQuarter" | "side";
  allowMirrored: boolean;
  holdSeconds?: number;
  scoreThreshold?: number;
  minimumVisibility: number;
  constraints: PoseConstraint[];
}

export interface GameConfig {
  challengeId: string;
  title: string;
  subtitle: string;
  avatar: {
    modelPath: string;
    scale: number;
    cameraDistance: number;
    mirrored: boolean;
  };
  timing: {
    countdownSeconds: number;
    defaultHoldSeconds: number;
    trackingGraceMs: number;
    transitionMs: number;
  };
  poseDetection: {
    modelPath: string;
    wasmPath: string;
    maxInferenceFps: number;
    scoreThreshold: number;
    minDetectionConfidence: number;
    minTrackingConfidence: number;
    minPosePresenceConfidence: number;
  };
  avatarTracking: {
    enabled: boolean;
    maxInferenceFps: number;
    lowQualityMaxInferenceFps: number;
    initializationTimeoutMs: number;
    smoothing: number;
    lostHoldMs: number;
    relaxMs: number;
    hands: {
      enabled: boolean;
      modelPath: string;
      roiScale: number;
      handednessSwap: boolean;
      wristRotationEnabled: boolean;
      fingerSpreadInfluence: number;
      fingerSpreadMaxDegrees: number;
      minDetectionConfidence: number;
      minPresenceConfidence: number;
      minTrackingConfidence: number;
    };
    face: {
      enabled: boolean;
      modelPath: string;
      minDetectionConfidence: number;
      minPresenceConfidence: number;
      minTrackingConfidence: number;
    };
  };
  leaderboard: {
    limit: number;
    nameMaxLength: number;
  };
  effects: {
    defaultQuality: "low" | "high";
    audioEnabled: boolean;
  };
  poses: PoseDefinition[];
}

export interface PoseScore {
  score: number;
  passing: boolean;
  visibilityOk: boolean;
  bodyInFrame: boolean;
  mirrored: boolean;
  hint: string;
  constraintScores: number[];
}

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  elapsedMs: number;
  challengeId: string;
  completedAt: string;
}

export type TrackingStatus =
  | "loading"
  | "ready"
  | "noPerson"
  | "multiplePeople"
  | "outOfFrame"
  | "lowVisibility"
  | "error";
