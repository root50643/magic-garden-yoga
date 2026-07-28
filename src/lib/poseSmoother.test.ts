import { describe, expect, it } from "vitest";
import {
  POSE_LANDMARK_NAMES,
  type DetectedPose,
  type Landmark,
} from "../types";
import { PoseSmoother, isValidPose } from "./poseSmoother";

function landmark(
  value: number,
  visibility = 1,
  presence: number | undefined = visibility,
): Landmark {
  return {
    x: value,
    y: value * 2,
    z: -value,
    visibility,
    ...(presence === undefined ? {} : { presence }),
  };
}

function pose(
  value: number,
  visibility = 1,
  presence: number | undefined = visibility,
): DetectedPose {
  return {
    landmarks: POSE_LANDMARK_NAMES.map(() =>
      landmark(value, visibility, presence),
    ),
    worldLandmarks: POSE_LANDMARK_NAMES.map(() =>
      landmark(value * 10, visibility, presence),
    ),
  };
}

describe("PoseSmoother", () => {
  it("seeds from the first valid frame without mutating its input", () => {
    const input = pose(0.2);
    const smoother = new PoseSmoother();
    const result = smoother.update(input);

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result?.landmarks[0]).not.toBe(input.landmarks[0]);

    result!.landmarks[0].x = 99;
    expect(input.landmarks[0].x).toBe(0.2);
  });

  it("smooths image and world coordinates with an EMA", () => {
    const smoother = new PoseSmoother({
      coordinateAlpha: 0.35,
      confidenceAlpha: 0.5,
    });
    smoother.update(pose(0, 0.8, 0.9));
    const result = smoother.update(pose(1, 0.4, 0.5));

    expect(result?.landmarks[0].x).toBeCloseTo(0.35);
    expect(result?.landmarks[0].y).toBeCloseTo(0.7);
    expect(result?.landmarks[0].z).toBeCloseTo(-0.35);
    expect(result?.worldLandmarks[0].x).toBeCloseTo(3.5);
    expect(result?.landmarks[0].visibility).toBeCloseTo(0.6);
    expect(result?.landmarks[0].presence).toBeCloseTo(0.7);
  });

  it("does not carry optional presence into a frame that omits it", () => {
    const smoother = new PoseSmoother();
    smoother.update(pose(0, 1, 0.8));
    const withoutPresence = pose(1);
    withoutPresence.landmarks.forEach((point) => delete point.presence);
    withoutPresence.worldLandmarks.forEach((point) => delete point.presence);
    const result = smoother.update(withoutPresence);

    expect(result?.landmarks[0].presence).toBeUndefined();
    expect(result?.worldLandmarks[0].presence).toBeUndefined();
  });

  it("starts fresh after reset", () => {
    const smoother = new PoseSmoother({ coordinateAlpha: 0.35 });
    smoother.update(pose(0));
    smoother.reset();

    expect(smoother.update(pose(1))?.landmarks[0].x).toBe(1);
  });

  it("rejects an invalid frame, resets, and does not blend across the gap", () => {
    const smoother = new PoseSmoother({ coordinateAlpha: 0.35 });
    smoother.update(pose(0));
    const invalid = pose(0.5);
    invalid.landmarks[0].x = Number.NaN;

    expect(isValidPose(invalid)).toBe(false);
    expect(smoother.update(invalid)).toBeNull();
    expect(smoother.update(pose(1))?.landmarks[0].x).toBe(1);
  });

  it("accepts a complete 2D pose without optional world landmarks", () => {
    const input = pose(0.25);
    input.worldLandmarks = [];

    expect(isValidPose(input)).toBe(true);
    expect(new PoseSmoother().update(input)).toEqual(input);
  });
});
