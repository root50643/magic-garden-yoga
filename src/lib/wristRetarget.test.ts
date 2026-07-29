import { MathUtils, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { PalmBasis } from "./avatarMotion";
import {
  palmBasisToQuaternion,
  solveWristLocalQuaternion,
  type WristRestPose,
} from "./wristRetarget";

const identityRest = (): WristRestPose => ({
  restLocalQuaternion: new Quaternion(),
  restWorldQuaternion: new Quaternion(),
  restPalmWorldQuaternion: new Quaternion(),
});

function rotation(axis: Vector3, degrees: number): Quaternion {
  return new Quaternion().setFromAxisAngle(
    axis.clone().normalize(),
    MathUtils.degToRad(degrees),
  );
}

describe("VRM wrist retarget", () => {
  it("returns the model rest local rotation for its rest palm orientation", () => {
    const parentWorld = rotation(new Vector3(0, 1, 0), 37);
    const restLocal = rotation(new Vector3(1, 0, 0), -18);
    const restWorld = parentWorld.clone().multiply(restLocal);
    const restPalmWorld = rotation(new Vector3(0, 0, 1), 24);
    const solved = solveWristLocalQuaternion(
      {
        restLocalQuaternion: restLocal,
        restWorldQuaternion: restWorld,
        restPalmWorldQuaternion: restPalmWorld,
      },
      restPalmWorld,
      parentWorld,
      1,
      180,
    );

    expect(MathUtils.radToDeg(restLocal.angleTo(solved))).toBeCloseTo(0, 6);
  });

  it("maps a tracked world rotation into the hand local quaternion", () => {
    const target = rotation(new Vector3(1, 0, 0), 90);
    const solved = solveWristLocalQuaternion(
      identityRest(),
      target,
      new Quaternion(),
      1,
      180,
    );

    expect(MathUtils.radToDeg(new Quaternion().angleTo(solved))).toBeCloseTo(
      90,
      5,
    );
  });

  it("accounts for the forearm parent rotation before solving local space", () => {
    const solved = solveWristLocalQuaternion(
      identityRest(),
      rotation(new Vector3(1, 0, 0), 90),
      rotation(new Vector3(1, 0, 0), 30),
      1,
      180,
    );

    expect(MathUtils.radToDeg(new Quaternion().angleTo(solved))).toBeCloseTo(
      60,
      5,
    );
  });

  it("limits extreme wrist motion and applies configurable influence", () => {
    const target = rotation(new Vector3(0, 1, 0), 120);
    const limited = solveWristLocalQuaternion(
      identityRest(),
      target,
      new Quaternion(),
      1,
      40,
    );
    const softened = solveWristLocalQuaternion(
      identityRest(),
      target,
      new Quaternion(),
      0.5,
      180,
    );

    expect(MathUtils.radToDeg(new Quaternion().angleTo(limited))).toBeCloseTo(
      40,
      5,
    );
    expect(MathUtils.radToDeg(new Quaternion().angleTo(softened))).toBeCloseTo(
      60,
      5,
    );
  });

  it("keeps the shortest physical path across the quaternion seam", () => {
    const angles = [170, 179, -179, -170];
    const solved = angles.map((degrees) =>
      solveWristLocalQuaternion(
        identityRest(),
        rotation(new Vector3(0, 0, 1), degrees),
        new Quaternion(),
        1,
        180,
      ),
    );
    const steps = solved.slice(1).map((value, index) =>
      MathUtils.radToDeg(solved[index].angleTo(value)),
    );

    expect(steps[0]).toBeCloseTo(9, 5);
    expect(steps[1]).toBeCloseTo(2, 5);
    expect(steps[2]).toBeCloseTo(9, 5);
  });

  it("converts MediaPipe y/z signs without swapping anatomical sides", () => {
    const basis: PalmBasis = {
      longitudinal: { x: 1, y: 0, z: 0 },
      lateral: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
    };
    const converted = palmBasisToQuaternion(basis, true);

    expect(
      new Vector3(1, 0, 0).applyQuaternion(converted).toArray(),
    ).toEqual([1, 0, 0]);
    expect(
      new Vector3(0, 1, 0).applyQuaternion(converted).toArray(),
    ).toEqual([0, -1, 0]);
    expect(
      new Vector3(0, 0, 1).applyQuaternion(converted).toArray(),
    ).toEqual([0, 0, -1]);
  });
});
