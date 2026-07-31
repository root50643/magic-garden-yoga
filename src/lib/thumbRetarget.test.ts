import { MathUtils, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  calculatePalmBasis,
  type PalmBasis,
} from "./avatarMotion";
import { palmBasisToQuaternion } from "./wristRetarget";
import {
  solveBoneLocalFrame,
  solveBoneLocalDirection,
  THUMB_SEGMENTS,
  thumbSegmentInPalmSpace,
} from "./thumbRetarget";
import type { Landmark } from "../types";

function point(x: number, y: number, z: number): Landmark {
  return { x, y, z, visibility: 1, presence: 1 };
}

function sampleHand(): Landmark[] {
  const landmarks = Array.from({ length: 21 }, () => point(0, 0, 0));
  landmarks[0] = point(0, 0, 0);
  landmarks[5] = point(1, -0.6, 0);
  landmarks[9] = point(1, -0.2, 0);
  landmarks[13] = point(1, 0.2, 0);
  landmarks[17] = point(1, 0.6, 0);
  landmarks[1] = point(0.2, -0.75, 0);
  landmarks[2] = point(0.45, -1.0, 0.15);
  landmarks[3] = point(0.68, -0.94, 0.33);
  landmarks[4] = point(0.82, -0.72, 0.48);
  return landmarks;
}

function expectDirectionClose(actual: Vector3, expected: Vector3): void {
  expect(
    MathUtils.radToDeg(
      actual.clone().normalize().angleTo(expected.clone().normalize()),
    ),
  ).toBeCloseTo(0, 5);
}

describe("thumb segment retarget", () => {
  it("maps the three VRM thumb joints from MediaPipe segments 1→2, 2→3 and 3→4", () => {
    expect(THUMB_SEGMENTS).toEqual({
      thumbMetacarpal: [1, 2],
      thumbProximal: [2, 3],
      thumbDistal: [3, 4],
    });
  });

  it("preserves the complete signed segment direction in palm space", () => {
    const hand = sampleHand();
    const basis = calculatePalmBasis(hand) as PalmBasis;
    const expected = new Vector3(0.25, -0.25, 0.15).normalize();
    const actual = thumbSegmentInPalmSpace(
      hand,
      basis,
      "thumbMetacarpal",
    );

    expect(actual).not.toBeNull();
    expectDirectionClose(actual!, expected);
  });

  it("keeps thumb articulation unchanged after a proper 3D hand rotation", () => {
    const hand = sampleHand();
    const originalBasis = calculatePalmBasis(hand) as PalmBasis;
    const original = thumbSegmentInPalmSpace(
      hand,
      originalBasis,
      "thumbProximal",
    );
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0.3, 0.8, -0.2).normalize(),
      MathUtils.degToRad(73),
    );
    // Convert the MediaPipe point to the VRM convention, rotate it, then
    // convert it back. Translation and scale must not affect the result.
    const transformed = hand.map((landmark) => {
      const vrmPoint = new Vector3(
        landmark.x,
        -landmark.y,
        -landmark.z,
      )
        .multiplyScalar(2.7)
        .applyQuaternion(rotation)
        .add(new Vector3(4, -2, 1));
      return point(vrmPoint.x, -vrmPoint.y, -vrmPoint.z);
    });
    const transformedBasis = calculatePalmBasis(transformed) as PalmBasis;
    const after = thumbSegmentInPalmSpace(
      transformed,
      transformedBasis,
      "thumbProximal",
    );

    expect(original).not.toBeNull();
    expect(after).not.toBeNull();
    expectDirectionClose(after!, original!);
  });

  it("reconstructs anatomically mirrored left and right thumb directions", () => {
    const right = sampleHand();
    const left = right.map((landmark) =>
      point(landmark.x, -landmark.y, landmark.z),
    );
    const rightBasis = calculatePalmBasis(right)!;
    const leftBasis = calculatePalmBasis(left)!;
    const rightLocal = thumbSegmentInPalmSpace(
      right,
      rightBasis,
      "thumbDistal",
    )!;
    const leftLocal = thumbSegmentInPalmSpace(
      left,
      leftBasis,
      "thumbDistal",
    )!;
    const rightWorld = rightLocal.applyQuaternion(
      palmBasisToQuaternion(rightBasis, true),
    );
    const leftWorld = leftLocal.applyQuaternion(
      palmBasisToQuaternion(leftBasis, true),
    );

    expect(leftWorld.x).toBeCloseTo(rightWorld.x, 6);
    expect(leftWorld.y).toBeCloseTo(-rightWorld.y, 6);
    expect(leftWorld.z).toBeCloseTo(rightWorld.z, 6);
  });

  it("aims a model bone at the measured direction while preserving rest roll", () => {
    const axisLocal = new Vector3(0, 1, 0);
    const restLocal = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      MathUtils.degToRad(31),
    );
    const parentWorld = new Quaternion().setFromAxisAngle(
      new Vector3(0.2, 1, 0.4).normalize(),
      MathUtils.degToRad(48),
    );
    const desiredWorld = new Vector3(-0.4, 0.3, 0.85).normalize();
    const solved = solveBoneLocalDirection(
      axisLocal,
      restLocal,
      desiredWorld,
      parentWorld,
    );

    expect(solved).not.toBeNull();
    const resultingDirection = axisLocal
      .clone()
      .applyQuaternion(solved!)
      .applyQuaternion(parentWorld);
    expectDirectionClose(resultingDirection, desiredWorld);
  });

  it("removes the solved parent rotation before aiming the next thumb segment", () => {
    const handWorld = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      MathUtils.degToRad(25),
    );
    const axis = new Vector3(0, 1, 0);
    const metacarpalDirection = new Vector3(-0.6, 0.7, 0.3).normalize();
    const proximalDirection = new Vector3(-0.25, 0.35, 0.9).normalize();
    const metacarpalLocal = solveBoneLocalDirection(
      axis,
      new Quaternion(),
      metacarpalDirection,
      handWorld,
    )!;
    const metacarpalWorld = handWorld.clone().multiply(metacarpalLocal);
    const proximalLocal = solveBoneLocalDirection(
      axis,
      new Quaternion(),
      proximalDirection,
      metacarpalWorld,
    )!;

    expectDirectionClose(
      axis.clone().applyQuaternion(metacarpalWorld),
      metacarpalDirection,
    );
    expectDirectionClose(
      axis
        .clone()
        .applyQuaternion(proximalLocal)
        .applyQuaternion(metacarpalWorld),
      proximalDirection,
    );
  });

  it("uses the palm frame to choose a stable axis at an exact 180-degree reversal", () => {
    const solved = solveBoneLocalFrame(
      new Vector3(1, 0, 0),
      new Quaternion(),
      new Vector3(0, 0, 1),
      new Vector3(0, 1, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 1, 0),
      new Quaternion(),
    );

    expect(solved).not.toBeNull();
    expectDirectionClose(
      new Vector3(1, 0, 0).applyQuaternion(solved!),
      new Vector3(-1, 0, 0),
    );
    expectDirectionClose(
      new Vector3(0, 0, 1).applyQuaternion(solved!),
      new Vector3(0, 0, 1),
    );
  });

  it("crosses the near-antipodal seam continuously instead of changing roll", () => {
    const solveAt = (degrees: number) => {
      const targetDirection = new Vector3(1, 0, 0).applyQuaternion(
        new Quaternion().setFromAxisAngle(
          new Vector3(0, 0, 1),
          MathUtils.degToRad(degrees),
        ),
      );
      return solveBoneLocalFrame(
        new Vector3(1, 0, 0),
        new Quaternion(),
        new Vector3(0, 0, 1),
        new Vector3(0, 1, 0),
        targetDirection,
        new Vector3(0, 0, 1),
        new Vector3(0, 1, 0),
        new Quaternion(),
      )!;
    };
    const before = solveAt(179);
    const after = solveAt(-179);

    expect(MathUtils.radToDeg(before.angleTo(after))).toBeCloseTo(2, 4);
  });
});
