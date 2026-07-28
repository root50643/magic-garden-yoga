import { describe, expect, it } from "vitest";
import {
  POSE_LANDMARK_NAMES,
  type DetectedPose,
  type Landmark,
  type LandmarkName,
  type PoseDefinition,
} from "../types";
import { evaluatePose } from "./poseEvaluator";

const indexOf = (name: LandmarkName) => POSE_LANDMARK_NAMES.indexOf(name);

function landmark(
  x = 0.5,
  y = 0.5,
  z = 0,
  visibility = 1,
): Landmark {
  return { x, y, z, visibility, presence: visibility };
}

function makePose(): DetectedPose {
  const landmarks = POSE_LANDMARK_NAMES.map(() => landmark());
  const worldLandmarks = POSE_LANDMARK_NAMES.map(() => landmark());

  // A 90-degree left elbow in 3D.
  worldLandmarks[indexOf("leftShoulder")] = landmark(0, 1, 0);
  worldLandmarks[indexOf("leftElbow")] = landmark(0, 0, 0);
  worldLandmarks[indexOf("leftWrist")] = landmark(1, 0, 0);

  // A straight right arm, used to prove mirrored evaluation.
  worldLandmarks[indexOf("rightShoulder")] = landmark(0, 1, 0);
  worldLandmarks[indexOf("rightElbow")] = landmark(0, 0, 0);
  worldLandmarks[indexOf("rightWrist")] = landmark(0, -1, 0);

  // Ratios: wrist distance / shoulder distance = 2.
  worldLandmarks[indexOf("leftWrist")] = landmark(-1, 0, 0);
  worldLandmarks[indexOf("rightWrist")] = landmark(1, 0, 0);
  worldLandmarks[indexOf("leftShoulder")] = landmark(-0.5, 0, 0);
  worldLandmarks[indexOf("rightShoulder")] = landmark(0.5, 0, 0);

  landmarks[indexOf("leftWrist")] = landmark(0.2, 0.2);
  landmarks[indexOf("leftShoulder")] = landmark(0.3, 0.4);
  landmarks[indexOf("rightWrist")] = landmark(0.8, 0.6);
  landmarks[indexOf("rightShoulder")] = landmark(0.7, 0.4);

  return { landmarks, worldLandmarks };
}

function definition(
  overrides: Partial<PoseDefinition> = {},
): PoseDefinition {
  return {
    id: "test",
    name: "測試姿勢",
    englishName: "Test",
    imagePath: "/test.svg",
    instruction: "跟著做",
    orientation: "front",
    allowMirrored: false,
    minimumVisibility: 0.6,
    constraints: [],
    ...overrides,
  };
}

describe("evaluatePose", () => {
  it("combines angle, relative-position, and distance-ratio scores by weight", () => {
    const pose = makePose();
    // Restore a 90-degree angle after the distance-ratio fixture setup.
    pose.worldLandmarks[indexOf("leftShoulder")] = landmark(0, 1, 0);
    pose.worldLandmarks[indexOf("leftElbow")] = landmark(0, 0, 0);
    pose.worldLandmarks[indexOf("leftWrist")] = landmark(1, 0, 0);
    // Wrist distance is 2 and shoulder reference distance is 1.
    pose.worldLandmarks[indexOf("rightShoulder")] = landmark(0, 0, 0);
    pose.worldLandmarks[indexOf("rightWrist")] = landmark(-1, 0, 0);

    const result = evaluatePose(
      pose,
      definition({
        constraints: [
          {
            type: "angle",
            points: ["leftShoulder", "leftElbow", "leftWrist"],
            target: 90,
            tolerance: 30,
            weight: 2,
            hint: "手肘彎成小角角",
          },
          {
            type: "relativePosition",
            a: "leftWrist",
            b: "leftShoulder",
            axis: "y",
            relation: "less",
            margin: 0.1,
            tolerance: 0.2,
            weight: 1,
            hint: "小手再舉高一點",
          },
          {
            type: "distanceRatio",
            a: "leftWrist",
            b: "rightWrist",
            referenceA: "leftShoulder",
            referenceB: "rightShoulder",
            target: 2,
            tolerance: 0.5,
            weight: 1,
            hint: "雙手再張開一點",
          },
        ],
      }),
      75,
    );

    expect(result.constraintScores).toEqual([100, 100, 100]);
    expect(result.score).toBe(100);
    expect(result.passing).toBe(true);
    expect(result.hint).toContain("太棒了");
  });

  it("keeps 75 points at the tolerance boundary and reaches zero at twice the tolerance", () => {
    const cases = [
      { ratio: 1, expected: 100 },
      { ratio: 1.5, expected: 75 },
      { ratio: 2, expected: 0 },
      { ratio: 2.5, expected: 0 },
    ];

    for (const { ratio, expected } of cases) {
      const pose = makePose();
      pose.worldLandmarks[indexOf("leftShoulder")] = landmark(-0.5, 0, 0);
      pose.worldLandmarks[indexOf("rightShoulder")] = landmark(0.5, 0, 0);
      pose.worldLandmarks[indexOf("leftWrist")] = landmark(0, 0, 0);
      pose.worldLandmarks[indexOf("rightWrist")] = landmark(ratio, 0, 0);

      const result = evaluatePose(
        pose,
        definition({
          constraints: [
            {
              type: "distanceRatio",
              a: "leftWrist",
              b: "rightWrist",
              referenceA: "leftShoulder",
              referenceB: "rightShoulder",
              target: 1,
              tolerance: 0.5,
              weight: 1,
              hint: "調整手臂距離。",
            },
          ],
        }),
        75,
      );

      expect(result.score).toBeCloseTo(expected);
    }
  });

  it("normalizes x/y relative positions by torso scale", () => {
    const pose = makePose();
    pose.landmarks[indexOf("leftShoulder")] = landmark(0.4, 0.35);
    pose.landmarks[indexOf("rightShoulder")] = landmark(0.6, 0.35);
    pose.landmarks[indexOf("leftHip")] = landmark(0.45, 0.75);
    pose.landmarks[indexOf("rightHip")] = landmark(0.55, 0.75);
    pose.landmarks[indexOf("leftWrist")] = landmark(0.2, 0.15);

    const scaledPose: DetectedPose = {
      landmarks: pose.landmarks.map((point) => ({
        ...point,
        x: 0.5 + (point.x - 0.5) * 0.5,
        y: 0.5 + (point.y - 0.5) * 0.5,
      })),
      worldLandmarks: pose.worldLandmarks.map((point) => ({ ...point })),
    };
    const poseDefinition = definition({
      constraints: [
        {
          type: "relativePosition",
          a: "leftWrist",
          b: "leftShoulder",
          axis: "x",
          relation: "less",
          margin: 0.6,
          tolerance: 0.4,
          weight: 1,
          hint: "手腕向外。",
        },
        {
          type: "relativePosition",
          a: "leftWrist",
          b: "leftShoulder",
          axis: "y",
          relation: "less",
          margin: 0.6,
          tolerance: 0.4,
          weight: 1,
          hint: "手腕向上。",
        },
      ],
    });

    const original = evaluatePose(pose, poseDefinition, 75);
    const scaled = evaluatePose(scaledPose, poseDefinition, 75);

    expect(original.constraintScores).toEqual([93.75, 93.75]);
    expect(scaled.constraintScores[0]).toBeCloseTo(
      original.constraintScores[0],
    );
    expect(scaled.constraintScores[1]).toBeCloseTo(
      original.constraintScores[1],
    );
    expect(scaled.score).toBeCloseTo(original.score);
  });

  it("falls back to 2D normalized landmarks when world landmarks are unavailable or invalid", () => {
    const basePose = makePose();
    basePose.landmarks[indexOf("leftHip")] = landmark(0.5, 0.4, 10);
    basePose.landmarks[indexOf("leftKnee")] = landmark(0.5, 0.5, -10);
    basePose.landmarks[indexOf("leftAnkle")] = landmark(0.6, 0.5, 10);
    basePose.landmarks[indexOf("leftShoulder")] = landmark(0.35, 0.4, 0);
    basePose.landmarks[indexOf("rightShoulder")] = landmark(0.65, 0.4, 0);
    basePose.landmarks[indexOf("leftWrist")] = landmark(0.2, 0.2, -100);
    basePose.landmarks[indexOf("rightWrist")] = landmark(0.8, 0.2, 100);
    basePose.landmarks[indexOf("nose")] = landmark(0.5, 0.15, -0.3);

    const poseDefinition = definition({
      constraints: [
        {
          type: "angle",
          points: ["leftHip", "leftKnee", "leftAnkle"],
          target: 90,
          tolerance: 20,
          weight: 1,
          hint: "調整膝蓋。",
        },
        {
          type: "distanceRatio",
          a: "leftWrist",
          b: "rightWrist",
          referenceA: "leftShoulder",
          referenceB: "rightShoulder",
          target: 2,
          tolerance: 0.5,
          weight: 1,
          hint: "調整手臂距離。",
        },
        {
          type: "relativePosition",
          a: "nose",
          b: "leftShoulder",
          axis: "z",
          relation: "less",
          margin: 0.2,
          tolerance: 0.2,
          weight: 1,
          hint: "調整前後位置。",
        },
      ],
    });

    const missingWorld: DetectedPose = {
      landmarks: basePose.landmarks.map((point) => ({ ...point })),
      worldLandmarks: [],
    };
    const incompleteWorld: DetectedPose = {
      landmarks: basePose.landmarks.map((point) => ({ ...point })),
      worldLandmarks: basePose.worldLandmarks
        .slice(0, 10)
        .map((point) => ({ ...point })),
    };
    const invalidWorld: DetectedPose = {
      landmarks: basePose.landmarks.map((point) => ({ ...point })),
      worldLandmarks: basePose.worldLandmarks.map((point) => ({ ...point })),
    };
    invalidWorld.worldLandmarks[indexOf("leftKnee")].x = Number.NaN;
    invalidWorld.worldLandmarks[indexOf("leftWrist")].x = Number.NaN;
    invalidWorld.worldLandmarks[indexOf("nose")].z = Number.NaN;

    for (const pose of [missingWorld, incompleteWorld, invalidWorld]) {
      const result = evaluatePose(pose, poseDefinition, 75);
      expect(result.constraintScores).toEqual([100, 100, 100]);
      expect(result.score).toBe(100);
      expect(result.passing).toBe(true);
    }
  });

  it("uses the lowest-scoring constraint's child-friendly hint", () => {
    const pose = makePose();
    const result = evaluatePose(
      pose,
      definition({
        constraints: [
          {
            type: "relativePosition",
            a: "leftWrist",
            b: "leftShoulder",
            axis: "y",
            relation: "less",
            margin: 0.1,
            tolerance: 0.2,
            weight: 1,
            hint: "小手再舉高一點",
          },
          {
            type: "relativePosition",
            a: "rightWrist",
            b: "rightShoulder",
            axis: "y",
            relation: "less",
            margin: 0.1,
            tolerance: 0.2,
            weight: 1,
            hint: "右手也要飛高高喔！",
          },
        ],
      }),
      75,
    );

    expect(result.constraintScores[0]).toBe(100);
    expect(result.constraintScores[1]).toBe(0);
    expect(result.hint).toBe("右手也要飛高高喔！");
    expect(result.passing).toBe(false);
  });

  it("checks visibility and full-body framing before passing", () => {
    const hiddenPose = makePose();
    hiddenPose.landmarks[indexOf("leftAnkle")].visibility = 0.2;
    hiddenPose.landmarks[indexOf("leftAnkle")].presence = 0.2;
    const hidden = evaluatePose(hiddenPose, definition(), 0);

    expect(hidden.visibilityOk).toBe(false);
    expect(hidden.passing).toBe(false);
    expect(hidden.hint).toContain("遮住");

    const croppedPose = makePose();
    croppedPose.landmarks[indexOf("rightAnkle")].y = 1.1;
    const cropped = evaluatePose(croppedPose, definition(), 0);

    expect(cropped.bodyInFrame).toBe(false);
    expect(cropped.passing).toBe(false);
    expect(cropped.hint).toContain("退後");
  });

  it("swaps left/right landmark indices and chooses the better mirrored score", () => {
    const pose = makePose();
    const result = evaluatePose(
      pose,
      definition({
        allowMirrored: true,
        constraints: [
          {
            type: "relativePosition",
            a: "leftWrist",
            b: "leftShoulder",
            axis: "y",
            relation: "greater",
            margin: 0.1,
            tolerance: 0.2,
            weight: 1,
            hint: "手放低一點點",
          },
        ],
      }),
      75,
    );

    expect(result.mirrored).toBe(true);
    expect(result.score).toBeCloseTo(100);
    expect(result.passing).toBe(true);
  });

  it("returns a safe zero score when there is no usable pose", () => {
    const result = evaluatePose(
      undefined,
      definition({
        constraints: [
          {
            type: "angle",
            points: ["leftShoulder", "leftElbow", "leftWrist"],
            target: 180,
            tolerance: 20,
            weight: 1,
            hint: "伸直手臂",
          },
        ],
      }),
      75,
    );

    expect(result.score).toBe(0);
    expect(result.constraintScores).toEqual([0]);
    expect(result.passing).toBe(false);
    expect(result.hint).toContain("鏡頭前");
  });
});
