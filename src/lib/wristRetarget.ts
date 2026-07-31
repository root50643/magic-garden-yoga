import { MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type { PalmBasis } from "./avatarMotion";

export interface WristRestPose {
  restLocalQuaternion: Quaternion;
  restWorldQuaternion: Quaternion;
  restPalmWorldQuaternion: Quaternion;
}

export interface WristSolverState {
  initialized: boolean;
  lastSourceTimestampMs: number | null;
  lastSourceWorldQuaternion: Quaternion | null;
  lastTargetLocalQuaternion: Quaternion | null;
}

export interface WristSolverOptions {
  /**
   * Limits only how quickly the follower can catch up. It never limits the
   * final palm orientation, so a persistent 180-degree target is reachable.
   */
  maxAngularSpeedDegreesPerSecond?: number;
  /**
   * Time budget used for the first tracked sample. This avoids a snap when
   * tracking starts with the palm far away from the avatar's rest pose.
   */
  initialDeltaSeconds?: number;
}

export type WristSolveRejectionReason =
  | "invalid-source"
  | "stale-timestamp";

export interface WristSolveResult {
  targetQuaternion: Quaternion;
  nextState: WristSolverState;
  accepted: boolean;
  rejectionReason: WristSolveRejectionReason | null;
}

const DEFAULT_MAX_ANGULAR_SPEED_DEGREES_PER_SECOND = 540;
const DEFAULT_INITIAL_DELTA_SECONDS = 1 / 10;
const EPSILON = 1e-7;

function basisVector(
  vector: { x: number; y: number; z: number },
  fromMediaPipe: boolean,
): Vector3 {
  return new Vector3(
    vector.x,
    fromMediaPipe ? -vector.y : vector.y,
    fromMediaPipe ? -vector.z : vector.z,
  ).normalize();
}

function isFiniteQuaternion(value: Quaternion): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w) &&
    value.lengthSq() > EPSILON
  );
}

function alignQuaternionHemisphere(
  quaternion: Quaternion,
  reference: Quaternion | null,
): Quaternion {
  const aligned = quaternion.clone().normalize();
  if (reference && aligned.dot(reference) < 0) {
    aligned.set(-aligned.x, -aligned.y, -aligned.z, -aligned.w);
  }
  return aligned;
}

function cloneState(state: WristSolverState): WristSolverState {
  return {
    initialized: state.initialized,
    lastSourceTimestampMs: state.lastSourceTimestampMs,
    lastSourceWorldQuaternion:
      state.lastSourceWorldQuaternion?.clone() ?? null,
    lastTargetLocalQuaternion:
      state.lastTargetLocalQuaternion?.clone() ?? null,
  };
}

function rejectedResult(
  rest: WristRestPose,
  previousState: WristSolverState,
  reason: WristSolveRejectionReason,
): WristSolveResult {
  return {
    targetQuaternion:
      previousState.lastTargetLocalQuaternion?.clone() ??
      rest.restLocalQuaternion.clone(),
    nextState: cloneState(previousState),
    accepted: false,
    rejectionReason: reason,
  };
}

function resolveMaximumSpeed(value: number | undefined): number {
  if (value === Number.POSITIVE_INFINITY) return value;
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_ANGULAR_SPEED_DEGREES_PER_SECOND;
  }
  return Math.max(0, value as number);
}

function resolveInitialDelta(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_INITIAL_DELTA_SECONDS;
  return Math.max(0, value as number);
}

/**
 * Converts the palm's orthonormal frame into a world-space quaternion.
 * MediaPipe x already matches the avatar's anatomical left/right; y and z
 * need the same sign conversion used by body retargeting.
 */
export function palmBasisToQuaternion(
  basis: PalmBasis,
  fromMediaPipe = false,
): Quaternion {
  const longitudinal = basisVector(basis.longitudinal, fromMediaPipe);
  const lateral = basisVector(basis.lateral, fromMediaPipe);
  const normal = basisVector(basis.normal, fromMediaPipe);
  return new Quaternion()
    .setFromRotationMatrix(
      new Matrix4().makeBasis(longitudinal, lateral, normal),
    )
    .normalize();
}

export function createWristSolverState(): WristSolverState {
  return {
    initialized: false,
    lastSourceTimestampMs: null,
    lastSourceWorldQuaternion: null,
    lastTargetLocalQuaternion: null,
  };
}

/**
 * Returns a new empty state. The previous object is deliberately not mutated,
 * so callers can safely reset a single hand without affecting saved frames.
 */
export function resetWristSolverState(): WristSolverState {
  return createWristSolverState();
}

/**
 * Maps a timestamped palm orientation onto a VRM hand bone without imposing
 * an anatomical angle cap.
 *
 * The complete palm quaternion is calibrated against the model's rest palm,
 * transformed through the current forearm parent, and followed along the
 * shortest SO(3) path. A speed budget smooths tracker spikes but never
 * changes the final target: every persistent valid orientation, including a
 * full palm flip, is eventually reached.
 */
export function solveContinuousWristLocalQuaternion(
  rest: WristRestPose,
  targetPalmWorldQuaternion: Quaternion,
  parentWorldQuaternion: Quaternion,
  sourceTimestampMs: number,
  previousState: WristSolverState,
  options: WristSolverOptions = {},
): WristSolveResult {
  if (
    !Number.isFinite(sourceTimestampMs) ||
    !isFiniteQuaternion(targetPalmWorldQuaternion) ||
    !isFiniteQuaternion(parentWorldQuaternion)
  ) {
    return rejectedResult(rest, previousState, "invalid-source");
  }

  const previousTimestamp = previousState.lastSourceTimestampMs;
  if (
    previousTimestamp !== null &&
    sourceTimestampMs < previousTimestamp
  ) {
    return rejectedResult(rest, previousState, "stale-timestamp");
  }

  const source = alignQuaternionHemisphere(
    targetPalmWorldQuaternion,
    previousState.lastSourceWorldQuaternion,
  );
  if (
    previousTimestamp !== null &&
    sourceTimestampMs === previousTimestamp &&
    previousState.lastSourceWorldQuaternion &&
    previousState.lastSourceWorldQuaternion.angleTo(source) > EPSILON
  ) {
    return rejectedResult(rest, previousState, "stale-timestamp");
  }

  const palmRestOffset = rest.restPalmWorldQuaternion
    .clone()
    .invert()
    .multiply(rest.restWorldQuaternion);
  const desiredWorld = source.clone().multiply(palmRestOffset);
  const desiredLocal = parentWorldQuaternion
    .clone()
    .invert()
    .multiply(desiredWorld)
    .normalize();

  const previousTarget =
    previousState.lastTargetLocalQuaternion?.clone() ??
    rest.restLocalQuaternion.clone();
  const alignedDesired = alignQuaternionHemisphere(
    desiredLocal,
    previousTarget,
  );
  const targetDeltaRadians = previousTarget.angleTo(alignedDesired);
  const elapsedSeconds =
    previousTimestamp === null
      ? resolveInitialDelta(options.initialDeltaSeconds)
      : Math.max(0, (sourceTimestampMs - previousTimestamp) / 1000);
  const maximumSpeed = resolveMaximumSpeed(
    options.maxAngularSpeedDegreesPerSecond,
  );
  const maximumStepRadians =
    maximumSpeed === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : MathUtils.degToRad(maximumSpeed) * elapsedSeconds;
  const target =
    targetDeltaRadians > maximumStepRadians &&
    targetDeltaRadians > EPSILON
      ? previousTarget
          .slerp(
            alignedDesired,
            maximumStepRadians / targetDeltaRadians,
          )
          .normalize()
      : alignedDesired;

  return {
    targetQuaternion: target,
    nextState: {
      initialized: true,
      lastSourceTimestampMs: sourceTimestampMs,
      lastSourceWorldQuaternion: source,
      lastTargetLocalQuaternion: target.clone(),
    },
    accepted: true,
    rejectionReason: null,
  };
}

/**
 * Stateless compatibility wrapper. The historical influence and angle-limit
 * arguments are intentionally ignored: wrist pose is no longer attenuated or
 * clamped.
 */
export function solveWristLocalQuaternion(
  rest: WristRestPose,
  targetPalmWorldQuaternion: Quaternion,
  parentWorldQuaternion: Quaternion,
  _legacyInfluence = 1,
  _legacyMaxAngleDegrees = 180,
): Quaternion {
  return solveContinuousWristLocalQuaternion(
    rest,
    targetPalmWorldQuaternion,
    parentWorldQuaternion,
    0,
    createWristSolverState(),
    {
      maxAngularSpeedDegreesPerSecond: Number.POSITIVE_INFINITY,
      initialDeltaSeconds: 1,
    },
  ).targetQuaternion;
}
