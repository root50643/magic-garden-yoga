import type { DetectedPose, Landmark } from "../types";

export type VrmLimbBoneName =
  | "leftUpperArm"
  | "leftLowerArm"
  | "rightUpperArm"
  | "rightLowerArm"
  | "leftUpperLeg"
  | "leftLowerLeg"
  | "leftFoot"
  | "rightUpperLeg"
  | "rightLowerLeg"
  | "rightFoot";

export interface RetargetVector {
  x: number;
  y: number;
  z: number;
}

export interface VrmLimbSegment {
  boneName: VrmLimbBoneName;
  side: "left" | "right";
  limb: "arm" | "leg";
  startIndex: number;
  endIndex: number;
}

export interface VrmLimbTarget extends VrmLimbSegment {
  direction: RetargetVector;
  source: "world" | "normalized";
}

export interface VrmLimbTargetOptions {
  minVisibility?: number;
  /**
   * Presentation state only. MediaPipe landmark labels are anatomical, so a
   * mirrored camera preview must not swap indices or invert retarget output.
   */
  presentationMirrored?: boolean;
}

export const VRM_LIMB_SEGMENTS: readonly VrmLimbSegment[] = [
  {
    boneName: "leftUpperArm",
    side: "left",
    limb: "arm",
    startIndex: 11,
    endIndex: 13,
  },
  {
    boneName: "leftLowerArm",
    side: "left",
    limb: "arm",
    startIndex: 13,
    endIndex: 15,
  },
  {
    boneName: "rightUpperArm",
    side: "right",
    limb: "arm",
    startIndex: 12,
    endIndex: 14,
  },
  {
    boneName: "rightLowerArm",
    side: "right",
    limb: "arm",
    startIndex: 14,
    endIndex: 16,
  },
  {
    boneName: "leftUpperLeg",
    side: "left",
    limb: "leg",
    startIndex: 23,
    endIndex: 25,
  },
  {
    boneName: "leftLowerLeg",
    side: "left",
    limb: "leg",
    startIndex: 25,
    endIndex: 27,
  },
  {
    boneName: "rightUpperLeg",
    side: "right",
    limb: "leg",
    startIndex: 24,
    endIndex: 26,
  },
  {
    boneName: "rightLowerLeg",
    side: "right",
    limb: "leg",
    startIndex: 26,
    endIndex: 28,
  },
  {
    boneName: "leftFoot",
    side: "left",
    limb: "leg",
    startIndex: 27,
    endIndex: 31,
  },
  {
    boneName: "rightFoot",
    side: "right",
    limb: "leg",
    startIndex: 28,
    endIndex: 32,
  },
] as const;

/**
 * Converts a MediaPipe segment into a unit direction in VRM/Three world space.
 *
 * MediaPipe x already preserves the anatomical left/right direction needed by
 * a front-facing VRM. MediaPipe y points down and negative z points toward the
 * camera, so only y and z are inverted.
 */
export function mediaPipeSegmentToVrmDirection(
  start: Landmark | null | undefined,
  end: Landmark | null | undefined,
  minVisibility = 0.35,
): RetargetVector | null {
  if (
    !isUsableLandmark(start, minVisibility) ||
    !isUsableLandmark(end, minVisibility)
  ) {
    return null;
  }

  const x = end.x - start.x;
  const y = -(end.y - start.y);
  const z = -(end.z - start.z);
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    return null;
  }

  return {
    x: x / length,
    y: y / length,
    z: z / length,
  };
}

/**
 * Produces all currently trackable limb targets while keeping MediaPipe's
 * anatomical left/right indices mapped to the identically named VRM bones.
 */
export function buildVrmLimbTargets(
  pose: DetectedPose,
  options: VrmLimbTargetOptions = {},
): VrmLimbTarget[] {
  const minVisibility = options.minVisibility ?? 0.35;
  // Camera mirroring is a display concern. Reading the option makes the
  // intentional no-op explicit and protects this boundary from index swapping.
  void options.presentationMirrored;

  const hasWorldLandmarks = pose.worldLandmarks.length >= 33;
  const landmarks = hasWorldLandmarks
    ? pose.worldLandmarks
    : pose.landmarks;
  const source = hasWorldLandmarks ? "world" : "normalized";

  return VRM_LIMB_SEGMENTS.flatMap((segment) => {
    const direction = mediaPipeSegmentToVrmDirection(
      landmarks[segment.startIndex],
      landmarks[segment.endIndex],
      minVisibility,
    );
    return direction ? [{ ...segment, direction, source }] : [];
  });
}

function isUsableLandmark(
  landmark: Landmark | null | undefined,
  minVisibility: number,
): landmark is Landmark {
  if (!landmark) {
    return false;
  }

  const threshold =
    Number.isFinite(minVisibility) && minVisibility >= 0
      ? minVisibility
      : 0.35;
  return (
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    Number.isFinite(landmark.z) &&
    Number.isFinite(landmark.visibility) &&
    landmark.visibility >= threshold &&
    (landmark.presence === undefined ||
      (Number.isFinite(landmark.presence) &&
        landmark.presence >= threshold))
  );
}
