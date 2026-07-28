/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  POSE_LANDMARK_NAMES,
  type DetectedPose,
  type Landmark,
  type LandmarkName,
} from "../types";
import { resolvePoseScoreThreshold, validateGameConfig } from "./config";
import { evaluatePose } from "./poseEvaluator";

const indexOf = (name: LandmarkName) => POSE_LANDMARK_NAMES.indexOf(name);

function landmark(x: number, y: number, z = 0): Landmark {
  return { x, y, z, visibility: 1, presence: 1 };
}

function imageLikeTreePose(scale = 1): DetectedPose {
  const centerX = 0.5;
  const originY = 0.08;
  const point = (x: number, y: number) =>
    landmark(centerX + (x - centerX) * scale, originY + (y - originY) * scale);
  const landmarks = POSE_LANDMARK_NAMES.map(() => point(0.5, 0.1));

  const set = (name: LandmarkName, x: number, y: number) => {
    landmarks[indexOf(name)] = point(x, y);
  };

  set("nose", 0.5, 0.14);
  set("leftShoulder", 0.6, 0.35);
  set("rightShoulder", 0.4, 0.35);
  set("leftElbow", 0.62, 0.22);
  set("rightElbow", 0.38, 0.22);
  set("leftWrist", 0.52, 0.08);
  set("rightWrist", 0.48, 0.08);
  set("leftHip", 0.56, 0.58);
  set("rightHip", 0.44, 0.58);
  set("leftKnee", 0.56, 0.76);
  set("leftAnkle", 0.56, 0.95);
  set("rightKnee", 0.28, 0.7);
  set("rightAnkle", 0.51, 0.82);

  return {
    landmarks,
    worldLandmarks: landmarks.map((entry) => ({ ...entry })),
  };
}

describe("shipped pose calibration", () => {
  it("accepts a tree pose that follows the guide image at different distances", () => {
    const workspace = resolve(import.meta.dirname, "../..");
    const config = validateGameConfig(
      JSON.parse(
        readFileSync(resolve(workspace, "public/config/game.json"), "utf8"),
      ) as unknown,
    );
    const tree = config.poses.find(({ id }) => id === "tree");
    expect(tree).toBeDefined();
    const scoreThreshold = resolvePoseScoreThreshold(
      tree!,
      config.poseDetection.scoreThreshold,
    );

    const near = evaluatePose(
      imageLikeTreePose(1),
      tree!,
      scoreThreshold,
    );
    const far = evaluatePose(
      imageLikeTreePose(0.65),
      tree!,
      scoreThreshold,
    );

    expect(near.passing).toBe(true);
    expect(far.passing).toBe(true);
    expect(far.score).toBeCloseTo(near.score, 8);
  });
});
