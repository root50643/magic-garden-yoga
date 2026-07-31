import { MathUtils, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  clampQuaternionFromRest,
  createHandLandmarkFilterState,
  sourceFrameDeltaMs,
  stabilizeHandWorldLandmarks,
  stabilizeQuaternionTarget,
} from "./avatarMotionStabilizer";
import type { Landmark } from "../types";

function rotation(degrees: number): Quaternion {
  return new Quaternion().setFromAxisAngle(
    new Vector3(1, 0, 0),
    MathUtils.degToRad(degrees),
  );
}

function angleFromIdentity(value: Quaternion): number {
  return MathUtils.radToDeg(new Quaternion().angleTo(value));
}

function point(x: number, y: number, z = 0): Landmark {
  return { x, y, z, visibility: 1, presence: 1 };
}

function openHand(): Landmark[] {
  const landmarks = Array.from({ length: 21 }, () => point(0, 0));
  landmarks[0] = point(0, 0);
  const chains = [
    [5, 6, 7, 8, -0.45],
    [9, 10, 11, 12, -0.15],
    [13, 14, 15, 16, 0.15],
    [17, 18, 19, 20, 0.45],
  ] as const;
  for (const [mcp, pip, dip, tip, x] of chains) {
    landmarks[mcp] = point(x, 0.8);
    landmarks[pip] = point(x, 1.2);
    landmarks[dip] = point(x, 1.6);
    landmarks[tip] = point(x, 2);
  }
  landmarks[1] = point(-0.35, 0.25);
  landmarks[2] = point(-0.65, 0.4);
  landmarks[3] = point(-0.85, 0.55);
  landmarks[4] = point(-1, 0.7);
  return landmarks;
}

describe("avatar motion quaternion stabilizer", () => {
  it("holds sub-degree tracker noise inside the dead zone", () => {
    const filtered = stabilizeQuaternionTarget(
      new Quaternion(),
      rotation(0.35),
      100,
      { deadZoneDegrees: 0.5 },
    );

    expect(angleFromIdentity(filtered)).toBeCloseTo(0, 8);
  });

  it("smooths a small correction more than an intentional large gesture", () => {
    const small = stabilizeQuaternionTarget(
      new Quaternion(),
      rotation(4),
      100,
    );
    const large = stabilizeQuaternionTarget(
      new Quaternion(),
      rotation(40),
      100,
    );

    const smallRatio = angleFromIdentity(small) / 4;
    const largeRatio = angleFromIdentity(large) / 40;
    expect(smallRatio).toBeLessThan(largeRatio);
    expect(smallRatio).toBeGreaterThan(0);
    expect(largeRatio).toBeGreaterThan(0.8);
  });

  it("treats q and -q as the same target orientation", () => {
    const target = rotation(35);
    const negated = new Quaternion(
      -target.x,
      -target.y,
      -target.z,
      -target.w,
    );
    const fromPositive = stabilizeQuaternionTarget(
      new Quaternion(),
      target,
      100,
    );
    const fromNegative = stabilizeQuaternionTarget(
      new Quaternion(),
      negated,
      100,
    );

    expect(
      MathUtils.radToDeg(fromPositive.angleTo(fromNegative)),
    ).toBeCloseTo(0, 8);
  });

  it("clamps an anatomical target relative to the model rest quaternion", () => {
    const clamped = clampQuaternionFromRest(
      rotation(15),
      rotation(135),
      50,
    );

    expect(
      MathUtils.radToDeg(rotation(15).angleTo(clamped)),
    ).toBeCloseTo(50, 6);
  });

  it("uses bounded source-frame deltas and a fallback for repeats", () => {
    expect(sourceFrameDeltaMs(200, 100)).toBe(100);
    expect(sourceFrameDeltaMs(1_000, 100)).toBe(250);
    expect(sourceFrameDeltaMs(100, 100, 80)).toBe(80);
    expect(sourceFrameDeltaMs(Number.NaN, 100, 90)).toBe(90);
  });

  it("has a similar one-second response at different source frame rates", () => {
    const simulate = (stepMs: number) => {
      let filtered = new Quaternion();
      const frameCount = Math.round(1_000 / stepMs);
      for (let frame = 1; frame <= frameCount; frame += 1) {
        const elapsedMs = Math.min(1_000, frame * stepMs);
        filtered = stabilizeQuaternionTarget(
          filtered,
          rotation(elapsedMs * 0.06),
          stepMs,
          {
            deadZoneDegrees: 0,
            slowHalfLifeMs: 150,
            fastHalfLifeMs: 30,
            fastMotionDegrees: 12,
          },
        );
      }
      return angleFromIdentity(filtered);
    };

    const atSixFps = simulate(1_000 / 6);
    const atTenFps = simulate(100);
    const atFifteenFps = simulate(1_000 / 15);
    expect(Math.abs(atSixFps - atTenFps)).toBeLessThan(3);
    expect(Math.abs(atFifteenFps - atTenFps)).toBeLessThan(3);
  });
});

describe("hand world-landmark stabilizer", () => {
  it("removes translation and uniform scale before filtering", () => {
    const source = openHand();
    const transformed = source.map((landmark) =>
      point(
        landmark.x * 3 + 7,
        landmark.y * 3 - 4,
        landmark.z * 3 + 2,
      ),
    );
    const first = stabilizeHandWorldLandmarks(
      source,
      100,
      createHandLandmarkFilterState(),
    );
    const second = stabilizeHandWorldLandmarks(
      transformed,
      200,
      first.nextState,
    );

    second.landmarks.forEach((landmark, index) => {
      expect(landmark.x).toBeCloseTo(first.landmarks[index].x, 8);
      expect(landmark.y).toBeCloseTo(first.landmarks[index].y, 8);
      expect(landmark.z).toBeCloseTo(first.landmarks[index].z, 8);
    });
  });

  it("suppresses small 3D point jitter but follows a deliberate gesture", () => {
    const first = stabilizeHandWorldLandmarks(
      openHand(),
      100,
      createHandLandmarkFilterState(),
    );
    const jittered = openHand();
    jittered[8] = point(-0.441, 2.007, 0.009);
    const second = stabilizeHandWorldLandmarks(
      jittered,
      200,
      first.nextState,
    );
    const deliberate = openHand();
    deliberate[8] = point(-0.15, 1.65, 0.25);
    const third = stabilizeHandWorldLandmarks(
      deliberate,
      300,
      second.nextState,
    );

    const rawJitter = Math.hypot(
      jittered[8].x - openHand()[8].x,
      jittered[8].y - openHand()[8].y,
      jittered[8].z - openHand()[8].z,
    );
    const filteredJitter = Math.hypot(
      second.landmarks[8].x - first.landmarks[8].x,
      second.landmarks[8].y - first.landmarks[8].y,
      second.landmarks[8].z - first.landmarks[8].z,
    );
    const deliberateProgress = Math.hypot(
      third.landmarks[8].x - second.landmarks[8].x,
      third.landmarks[8].y - second.landmarks[8].y,
      third.landmarks[8].z - second.landmarks[8].z,
    );

    expect(filteredJitter).toBeLessThan(rawJitter * 0.7);
    expect(deliberateProgress).toBeGreaterThan(0.2);
  });

  it("does not advance twice for the same tracker timestamp", () => {
    const first = stabilizeHandWorldLandmarks(
      openHand(),
      100,
      createHandLandmarkFilterState(),
    );
    const changed = openHand();
    changed[8] = point(0, 1.5, 0.4);
    const repeated = stabilizeHandWorldLandmarks(
      changed,
      100,
      first.nextState,
    );

    expect(repeated.accepted).toBe(false);
    expect(repeated.landmarks).toEqual(first.landmarks);
  });

  it("uses one shared alpha so a rigid turn keeps straight finger chains straight", () => {
    const source = openHand();
    const first = stabilizeHandWorldLandmarks(
      source,
      100,
      createHandLandmarkFilterState(),
    );
    const rotated = source.map(({ x, y, z, ...metadata }) => {
      const angle = MathUtils.degToRad(22);
      return {
        ...metadata,
        x: x * Math.cos(angle) - y * Math.sin(angle),
        y: x * Math.sin(angle) + y * Math.cos(angle),
        z,
      };
    });
    const second = stabilizeHandWorldLandmarks(
      rotated,
      200,
      first.nextState,
    );
    const segment = (a: number, b: number) =>
      new Vector3(
        second.landmarks[b].x - second.landmarks[a].x,
        second.landmarks[b].y - second.landmarks[a].y,
        second.landmarks[b].z - second.landmarks[a].z,
      ).normalize();

    expect(
      MathUtils.radToDeg(segment(5, 6).angleTo(segment(6, 7))),
    ).toBeLessThan(0.001);
    expect(
      MathUtils.radToDeg(segment(6, 7).angleTo(segment(7, 8))),
    ).toBeLessThan(0.001);
  });

  it("reduces RMS noise across 100 stationary 3D hand frames", () => {
    const source = openHand();
    const baseline = stabilizeHandWorldLandmarks(
      source,
      100,
      createHandLandmarkFilterState(),
    );
    let state = baseline.nextState;
    let rawSquaredError = 0;
    let filteredSquaredError = 0;
    let sampleCount = 0;

    for (let frame = 1; frame <= 100; frame += 1) {
      const jittered = source.map((landmark, index) =>
        point(
          landmark.x + Math.sin(frame * 1.7 + index * 0.9) * 0.008,
          landmark.y + Math.cos(frame * 1.3 + index * 1.1) * 0.008,
          landmark.z + Math.sin(frame * 1.1 + index * 1.7) * 0.008,
        ),
      );
      const timestampMs = 100 + frame * 100;
      const raw = stabilizeHandWorldLandmarks(
        jittered,
        timestampMs,
        createHandLandmarkFilterState(),
      );
      const filtered = stabilizeHandWorldLandmarks(
        jittered,
        timestampMs,
        state,
      );
      state = filtered.nextState;

      for (let index = 0; index < 21; index += 1) {
        const reference = baseline.landmarks[index];
        const rawPoint = raw.landmarks[index];
        const filteredPoint = filtered.landmarks[index];
        rawSquaredError +=
          (rawPoint.x - reference.x) ** 2 +
          (rawPoint.y - reference.y) ** 2 +
          (rawPoint.z - reference.z) ** 2;
        filteredSquaredError +=
          (filteredPoint.x - reference.x) ** 2 +
          (filteredPoint.y - reference.y) ** 2 +
          (filteredPoint.z - reference.z) ** 2;
        sampleCount += 3;
      }
    }

    const rawRms = Math.sqrt(rawSquaredError / sampleCount);
    const filteredRms = Math.sqrt(filteredSquaredError / sampleCount);
    expect(filteredRms).toBeLessThan(rawRms * 0.75);
  });
});
