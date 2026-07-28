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
