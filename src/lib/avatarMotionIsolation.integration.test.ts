import { describe, expect, it } from "vitest";

import {
  POSE_LANDMARK_NAMES,
  type AvatarMotionFrame,
  type DetectedPose,
  type Landmark,
  type PoseDefinition,
} from "../types";
import { evaluatePose } from "./poseEvaluator";

function landmark(index: number): Landmark {
  return {
    x: 0.2 + (index % 5) * 0.12,
    y: 0.15 + Math.floor(index / 5) * 0.1,
    z: 0,
    visibility: 1,
    presence: 1,
  };
}

describe("avatar motion scoring isolation", () => {
  it("cannot change a yoga score when wrists, fingers and expressions change", () => {
    const pose: DetectedPose = {
      landmarks: POSE_LANDMARK_NAMES.map((_, index) => landmark(index)),
      worldLandmarks: POSE_LANDMARK_NAMES.map((_, index) =>
        landmark(index),
      ),
    };
    const definition: PoseDefinition = {
      id: "isolation",
      name: "隔離測試",
      englishName: "Isolation",
      imagePath: "/test.png",
      instruction: "測試",
      orientation: "front",
      allowMirrored: true,
      minimumVisibility: 0.5,
      constraints: [],
    };
    const avatarMotion: AvatarMotionFrame = {
      timestampMs: 100,
      inferenceMs: 20,
      hands: [],
      face: {
        updatedAtMs: 100,
        blendshapes: { jawOpen: 0, eyeBlinkLeft: 0 },
      },
    };

    const before = evaluatePose(pose, definition, 75);
    avatarMotion.face!.blendshapes.jawOpen = 1;
    avatarMotion.face!.blendshapes.eyeBlinkLeft = 1;
    avatarMotion.hands.push({
      side: "left",
      landmarks: Array.from({ length: 21 }, (_, index) => landmark(index)),
      worldLandmarks: Array.from(
        { length: 21 },
        (_, index) => landmark(index),
      ),
      confidence: 1,
      updatedAtMs: 200,
    });
    const after = evaluatePose(pose, definition, 75);

    expect(after).toEqual(before);
  });
});
