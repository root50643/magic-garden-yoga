import { MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type { PalmBasis } from "./avatarMotion";

export interface WristRestPose {
  restLocalQuaternion: Quaternion;
  restWorldQuaternion: Quaternion;
  restPalmWorldQuaternion: Quaternion;
}

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

/**
 * Maps the tracked palm frame onto a VRM hand bone relative to its currently
 * retargeted forearm, then limits the local wrist excursion around the
 * avatar's neutral pose.
 */
export function solveWristLocalQuaternion(
  rest: WristRestPose,
  targetPalmWorldQuaternion: Quaternion,
  parentWorldQuaternion: Quaternion,
  influence: number,
  maxAngleDegrees: number,
): Quaternion {
  const palmDelta = targetPalmWorldQuaternion
    .clone()
    .multiply(rest.restPalmWorldQuaternion.clone().invert());
  const desiredWorld = palmDelta.multiply(rest.restWorldQuaternion);
  const desiredLocal = parentWorldQuaternion
    .clone()
    .invert()
    .multiply(desiredWorld)
    .normalize();

  const neutral = rest.restLocalQuaternion.clone().normalize();
  const angle = neutral.angleTo(desiredLocal);
  const maxAngle = MathUtils.degToRad(
    Math.min(180, Math.max(0, maxAngleDegrees)),
  );
  const clamped =
    angle > maxAngle && angle > 1e-6
      ? neutral.clone().slerp(desiredLocal, maxAngle / angle)
      : desiredLocal;

  return neutral.slerp(
    clamped,
    Math.min(1, Math.max(0, influence)),
  );
}
