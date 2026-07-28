import { describe, expect, it } from "vitest";
import type { DetectedPose, Landmark } from "../types";
import {
  buildVrmLimbTargets,
  mediaPipeSegmentToVrmDirection,
  type VrmLimbBoneName,
  type VrmLimbTarget,
} from "./vrmRetarget";

function landmark(
  x = 0.5,
  y = 0.5,
  z = 0,
  visibility = 1,
): Landmark {
  return { x, y, z, visibility, presence: visibility };
}

function outwardPose(useWorldLandmarks = true): DetectedPose {
  const landmarks = Array.from({ length: 33 }, () => landmark());

  // MediaPipe anatomical left appears on image right for a front-facing user.
  landmarks[11] = landmark(0.6, 0.3);
  landmarks[13] = landmark(0.78, 0.3);
  landmarks[15] = landmark(0.94, 0.3);
  landmarks[12] = landmark(0.4, 0.3);
  landmarks[14] = landmark(0.22, 0.3);
  landmarks[16] = landmark(0.06, 0.3);

  landmarks[23] = landmark(0.56, 0.55);
  landmarks[25] = landmark(0.62, 0.75);
  landmarks[27] = landmark(0.68, 0.95);
  landmarks[31] = landmark(0.72, 0.97, -0.12);
  landmarks[24] = landmark(0.44, 0.55);
  landmarks[26] = landmark(0.38, 0.75);
  landmarks[28] = landmark(0.32, 0.95);
  landmarks[32] = landmark(0.28, 0.97, -0.12);

  return {
    landmarks: landmarks.map((point) => ({ ...point })),
    worldLandmarks: useWorldLandmarks
      ? landmarks.map((point) => ({ ...point }))
      : [],
  };
}

function byBone(
  targets: VrmLimbTarget[],
  boneName: VrmLimbBoneName,
) {
  const target = targets.find((candidate) => candidate.boneName === boneName);
  expect(target, `missing target for ${boneName}`).toBeDefined();
  return target as VrmLimbTarget;
}

describe("VRM limb retarget coordinate conversion", () => {
  it("preserves x while flipping MediaPipe y/z into VRM space", () => {
    const direction = mediaPipeSegmentToVrmDirection(
      landmark(0, 0, 0),
      landmark(1, 2, 3),
    );
    const length = Math.sqrt(14);

    expect(direction?.x).toBeCloseTo(1 / length);
    expect(direction?.y).toBeCloseTo(-2 / length);
    expect(direction?.z).toBeCloseTo(-3 / length);
  });

  it("sends left and right arms toward their own outside instead of crossing", () => {
    const targets = buildVrmLimbTargets(outwardPose());

    expect(byBone(targets, "leftUpperArm").direction.x).toBeGreaterThan(0);
    expect(byBone(targets, "leftLowerArm").direction.x).toBeGreaterThan(0);
    expect(byBone(targets, "rightUpperArm").direction.x).toBeLessThan(0);
    expect(byBone(targets, "rightLowerArm").direction.x).toBeLessThan(0);

    expect(byBone(targets, "leftUpperArm")).toMatchObject({
      startIndex: 11,
      endIndex: 13,
      side: "left",
    });
    expect(byBone(targets, "rightUpperArm")).toMatchObject({
      startIndex: 12,
      endIndex: 14,
      side: "right",
    });
  });

  it("maps left and right leg chains to the corresponding VRM bones", () => {
    const targets = buildVrmLimbTargets(outwardPose());
    const leftUpper = byBone(targets, "leftUpperLeg");
    const leftLower = byBone(targets, "leftLowerLeg");
    const leftFoot = byBone(targets, "leftFoot");
    const rightUpper = byBone(targets, "rightUpperLeg");
    const rightLower = byBone(targets, "rightLowerLeg");
    const rightFoot = byBone(targets, "rightFoot");

    expect(leftUpper).toMatchObject({ startIndex: 23, endIndex: 25 });
    expect(leftLower).toMatchObject({ startIndex: 25, endIndex: 27 });
    expect(leftFoot).toMatchObject({ startIndex: 27, endIndex: 31 });
    expect(rightUpper).toMatchObject({ startIndex: 24, endIndex: 26 });
    expect(rightLower).toMatchObject({ startIndex: 26, endIndex: 28 });
    expect(rightFoot).toMatchObject({ startIndex: 28, endIndex: 32 });

    expect(leftUpper.direction.x).toBeGreaterThan(0);
    expect(leftLower.direction.x).toBeGreaterThan(0);
    expect(leftFoot.direction.x).toBeGreaterThan(0);
    expect(rightUpper.direction.x).toBeLessThan(0);
    expect(rightLower.direction.x).toBeLessThan(0);
    expect(rightFoot.direction.x).toBeLessThan(0);
    for (const target of [leftUpper, leftLower, rightUpper, rightLower]) {
      expect(target.direction.y).toBeLessThan(0);
    }
    expect(leftFoot.direction.z).toBeGreaterThan(0);
    expect(rightFoot.direction.z).toBeGreaterThan(0);
  });

  it("keeps anatomical mapping unchanged for a mirrored camera presentation", () => {
    const pose = outwardPose();
    const normal = buildVrmLimbTargets(pose, {
      presentationMirrored: false,
    });
    const mirroredDisplay = buildVrmLimbTargets(pose, {
      presentationMirrored: true,
    });

    expect(mirroredDisplay).toEqual(normal);
    expect(byBone(mirroredDisplay, "leftUpperArm").startIndex).toBe(11);
    expect(byBone(mirroredDisplay, "rightUpperArm").startIndex).toBe(12);
    expect(byBone(mirroredDisplay, "leftUpperLeg").startIndex).toBe(23);
    expect(byBone(mirroredDisplay, "rightUpperLeg").startIndex).toBe(24);
  });

  it("falls back to normalized landmarks and skips unreliable segments", () => {
    const pose = outwardPose(false);
    pose.landmarks[15].visibility = 0.1;
    pose.landmarks[15].presence = 0.1;
    const targets = buildVrmLimbTargets(pose, { minVisibility: 0.35 });

    expect(targets.every(({ source }) => source === "normalized")).toBe(true);
    expect(
      targets.some(({ boneName }) => boneName === "leftLowerArm"),
    ).toBe(false);
    expect(
      targets.some(({ boneName }) => boneName === "leftUpperArm"),
    ).toBe(true);
  });
});
