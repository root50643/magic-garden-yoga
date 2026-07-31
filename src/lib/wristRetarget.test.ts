import { MathUtils, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { PalmBasis } from "./avatarMotion";
import {
  createWristSolverState,
  palmBasisToQuaternion,
  resetWristSolverState,
  solveContinuousWristLocalQuaternion,
  solveWristLocalQuaternion,
  type WristRestPose,
  type WristSolverOptions,
} from "./wristRetarget";

const identityRest = (): WristRestPose => ({
  restLocalQuaternion: new Quaternion(),
  restWorldQuaternion: new Quaternion(),
  restPalmWorldQuaternion: new Quaternion(),
});

const unrestricted: WristSolverOptions = {
  maxAngularSpeedDegreesPerSecond: Number.POSITIVE_INFINITY,
  initialDeltaSeconds: 1,
};

function rotation(axis: Vector3, degrees: number): Quaternion {
  return new Quaternion().setFromAxisAngle(
    axis.clone().normalize(),
    MathUtils.degToRad(degrees),
  );
}

function degreesFromIdentity(quaternion: Quaternion): number {
  return MathUtils.radToDeg(new Quaternion().angleTo(quaternion));
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
    );

    expect(MathUtils.radToDeg(restLocal.angleTo(solved))).toBeCloseTo(0, 6);
  });

  it("maps the complete tracked world rotation without attenuating it", () => {
    const target = rotation(new Vector3(1, 0, 0), 180);
    const solved = solveWristLocalQuaternion(
      identityRest(),
      target,
      new Quaternion(),
    );

    expect(degreesFromIdentity(solved)).toBeCloseTo(180, 5);
  });

  it("accounts for a non-commuting forearm parent rotation", () => {
    const parent = rotation(new Vector3(0, 1, 0), 43);
    const targetPalm = rotation(new Vector3(1, 0.3, 0.2), 112);
    const result = solveContinuousWristLocalQuaternion(
      identityRest(),
      targetPalm,
      parent,
      100,
      createWristSolverState(),
      unrestricted,
    );
    const reconstructedWorld = parent
      .clone()
      .multiply(result.targetQuaternion);

    expect(result.accepted).toBe(true);
    expect(
      MathUtils.radToDeg(reconstructedWorld.angleTo(targetPalm)),
    ).toBeCloseTo(0, 6);
  });

  it("calibrates arbitrary non-commuting rest palm, rest hand and current parent frames", () => {
    const restParent = rotation(new Vector3(0.2, 1, -0.3), 41);
    const restLocal = rotation(new Vector3(1, 0.1, 0.5), -27);
    const restWorld = restParent.clone().multiply(restLocal);
    const restPalm = rotation(new Vector3(-0.4, 0.7, 1), 63);
    const trackedDelta = rotation(new Vector3(0.8, -0.2, 0.5), 118);
    const targetPalm = trackedDelta.clone().multiply(restPalm);
    const currentParent = rotation(new Vector3(-0.3, 1, 0.4), 76);
    const expectedLocal = currentParent
      .clone()
      .invert()
      .multiply(trackedDelta.clone().multiply(restWorld));
    const solved = solveContinuousWristLocalQuaternion(
      {
        restLocalQuaternion: restLocal,
        restWorldQuaternion: restWorld,
        restPalmWorldQuaternion: restPalm,
      },
      targetPalm,
      currentParent,
      100,
      createWristSolverState(),
      unrestricted,
    );

    expect(solved.accepted).toBe(true);
    expect(
      MathUtils.radToDeg(
        expectedLocal.angleTo(solved.targetQuaternion),
      ),
    ).toBeCloseTo(0, 6);
  });

  it("reaches a persistent 180-degree palm flip without a pose cap", () => {
    let state = createWristSolverState();
    const outputs: number[] = [];
    const samples = [0, 60, 120, 180, 180, 180];

    samples.forEach((degrees, index) => {
      const result = solveContinuousWristLocalQuaternion(
        identityRest(),
        rotation(new Vector3(1, 0, 0), degrees),
        new Quaternion(),
        index * 100,
        state,
        {
          maxAngularSpeedDegreesPerSecond: 360,
          initialDeltaSeconds: 0.1,
        },
      );
      expect(result.accepted).toBe(true);
      outputs.push(degreesFromIdentity(result.targetQuaternion));
      state = result.nextState;
    });

    expect(outputs).toEqual([
      expect.closeTo(0, 5),
      expect.closeTo(36, 5),
      expect.closeTo(72, 5),
      expect.closeTo(108, 5),
      expect.closeTo(144, 5),
      expect.closeTo(180, 5),
    ]);
  });

  it("keeps progressing through consecutive large rotations instead of starving", () => {
    let state = createWristSolverState();
    const outputs: Quaternion[] = [];

    [0, 130, 155, 180, 180, 180, 180, 180].forEach(
      (degrees, index) => {
        const result = solveContinuousWristLocalQuaternion(
          identityRest(),
          rotation(new Vector3(1, 0, 0), degrees),
          new Quaternion(),
          index * 100,
          state,
          {
            maxAngularSpeedDegreesPerSecond: 360,
            initialDeltaSeconds: 0.1,
          },
        );
        expect(result.accepted).toBe(true);
        outputs.push(result.targetQuaternion);
        state = result.nextState;
      },
    );

    outputs.slice(1).forEach((output, index) => {
      const progress = outputs[index].angleTo(output);
      if (index < 5) {
        expect(MathUtils.radToDeg(progress)).toBeGreaterThan(0);
      }
      expect(MathUtils.radToDeg(progress)).toBeLessThanOrEqual(36.001);
    });
    expect(degreesFromIdentity(outputs.at(-1)!)).toBeCloseTo(180, 5);
  });

  it("rate-limits a one-frame flip and immediately follows recovery", () => {
    const first = solveContinuousWristLocalQuaternion(
      identityRest(),
      new Quaternion(),
      new Quaternion(),
      0,
      createWristSolverState(),
      {
        maxAngularSpeedDegreesPerSecond: 360,
        initialDeltaSeconds: 0.1,
      },
    );
    const outlier = solveContinuousWristLocalQuaternion(
      identityRest(),
      rotation(new Vector3(1, 0, 0), 180),
      new Quaternion(),
      100,
      first.nextState,
      { maxAngularSpeedDegreesPerSecond: 360 },
    );
    const recovered = solveContinuousWristLocalQuaternion(
      identityRest(),
      new Quaternion(),
      new Quaternion(),
      200,
      outlier.nextState,
      { maxAngularSpeedDegreesPerSecond: 360 },
    );

    expect(outlier.accepted).toBe(true);
    expect(degreesFromIdentity(outlier.targetQuaternion)).toBeCloseTo(36, 5);
    expect(recovered.accepted).toBe(true);
    expect(degreesFromIdentity(recovered.targetQuaternion)).toBeCloseTo(0, 5);
  });

  it("stays continuous across the positive/negative 180-degree seam", () => {
    let state = createWristSolverState();
    const outputs: Quaternion[] = [];

    [170, 179, -179, -170].forEach((degrees, index) => {
      const result = solveContinuousWristLocalQuaternion(
        identityRest(),
        rotation(new Vector3(1, 0, 0), degrees),
        new Quaternion(),
        index * 100,
        state,
        unrestricted,
      );
      outputs.push(result.targetQuaternion);
      state = result.nextState;
    });

    expect(
      outputs.slice(1).map((output, index) =>
        MathUtils.radToDeg(outputs[index].angleTo(output)),
      ),
    ).toEqual([
      expect.closeTo(9, 5),
      expect.closeTo(2, 5),
      expect.closeTo(9, 5),
    ]);
  });

  it("treats q and -q as the same source orientation", () => {
    const source = rotation(new Vector3(1, 1, 0), 75);
    const negated = new Quaternion(
      -source.x,
      -source.y,
      -source.z,
      -source.w,
    );
    const first = solveContinuousWristLocalQuaternion(
      identityRest(),
      source,
      new Quaternion(),
      100,
      createWristSolverState(),
      unrestricted,
    );
    const second = solveContinuousWristLocalQuaternion(
      identityRest(),
      negated,
      new Quaternion(),
      200,
      first.nextState,
      unrestricted,
    );

    expect(second.accepted).toBe(true);
    expect(
      MathUtils.radToDeg(
        first.targetQuaternion.angleTo(second.targetQuaternion),
      ),
    ).toBeCloseTo(0, 6);
  });

  it("rejects an older timestamp without mutating the saved target", () => {
    const first = solveContinuousWristLocalQuaternion(
      identityRest(),
      rotation(new Vector3(0, 1, 0), 40),
      new Quaternion(),
      200,
      createWristSolverState(),
      unrestricted,
    );
    const stale = solveContinuousWristLocalQuaternion(
      identityRest(),
      rotation(new Vector3(0, 1, 0), 80),
      new Quaternion(),
      100,
      first.nextState,
      unrestricted,
    );

    expect(stale.accepted).toBe(false);
    expect(stale.rejectionReason).toBe("stale-timestamp");
    expect(
      stale.targetQuaternion.angleTo(first.targetQuaternion),
    ).toBeCloseTo(0, 8);
    expect(stale.nextState.lastSourceTimestampMs).toBe(200);
  });

  it("creates and resets independent empty solver states", () => {
    const created = createWristSolverState();
    const reset = resetWristSolverState();

    expect(created).toEqual(reset);
    expect(created).not.toBe(reset);
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
