import { Matrix4, Quaternion, Vector3 } from "three";
import type { FingerJointName, PalmBasis } from "./avatarMotion";
import { mediaPipeSegmentToVrmDirection } from "./vrmRetarget";
import { palmBasisToQuaternion } from "./wristRetarget";
import type { Landmark } from "../types";

export type ThumbJointName = Extract<
  FingerJointName,
  "thumbMetacarpal" | "thumbProximal" | "thumbDistal"
>;

export const THUMB_SEGMENTS: Readonly<
  Record<ThumbJointName, readonly [number, number]>
> = {
  thumbMetacarpal: [1, 2],
  thumbProximal: [2, 3],
  thumbDistal: [3, 4],
};

/**
 * Returns the measured thumb segment in an anatomical palm-local frame.
 *
 * Unlike an unsigned three-point curl, the complete direction retains
 * abduction, flexion and opposition. Removing the tracked palm quaternion
 * also prevents wrist rotation from being applied to every thumb joint a
 * second time.
 */
export function thumbSegmentInPalmSpace(
  landmarks: readonly Landmark[],
  palmBasis: PalmBasis,
  jointName: ThumbJointName,
): Vector3 | null {
  const [startIndex, endIndex] = THUMB_SEGMENTS[jointName];
  const direction = mediaPipeSegmentToVrmDirection(
    landmarks[startIndex],
    landmarks[endIndex],
    0,
  );
  if (!direction) return null;

  const trackedPalmWorld = palmBasisToQuaternion(palmBasis, true);
  const palmLocal = new Vector3(
    direction.x,
    direction.y,
    direction.z,
  ).applyQuaternion(trackedPalmWorld.invert());
  return palmLocal.lengthSq() > 1e-8 ? palmLocal.normalize() : null;
}

/**
 * Solves the minimum local swing that aims a model bone's anatomical segment
 * at a desired world direction. Roll remains at the model's authored rest
 * value; it is not guessed from a palm-center attraction vector.
 */
export function solveBoneLocalDirection(
  restSegmentAxisLocal: Vector3,
  restLocalQuaternion: Quaternion,
  desiredWorldDirection: Vector3,
  parentWorldQuaternion: Quaternion,
): Quaternion | null {
  if (
    restSegmentAxisLocal.lengthSq() <= 1e-8 ||
    desiredWorldDirection.lengthSq() <= 1e-8 ||
    parentWorldQuaternion.lengthSq() <= 1e-8
  ) {
    return null;
  }

  const restDirectionInParent = restSegmentAxisLocal
    .clone()
    .normalize()
    .applyQuaternion(restLocalQuaternion);
  const desiredDirectionInParent = desiredWorldDirection
    .clone()
    .normalize()
    .applyQuaternion(parentWorldQuaternion.clone().invert());
  const swingInParent = new Quaternion().setFromUnitVectors(
    restDirectionInParent,
    desiredDirectionInParent,
  );
  return swingInParent.multiply(restLocalQuaternion.clone()).normalize();
}

function projectedReference(
  primary: Vector3,
  reference: Vector3,
): Vector3 | null {
  const projected = reference
    .clone()
    .addScaledVector(primary, -reference.dot(primary));
  return projected.lengthSq() > 1e-8 ? projected.normalize() : null;
}

function frameQuaternion(
  primary: Vector3,
  reference: Vector3,
): Quaternion | null {
  const xAxis = primary.clone().normalize();
  const ySeed = projectedReference(xAxis, reference);
  if (!ySeed) return null;
  const zAxis = new Vector3().crossVectors(xAxis, ySeed);
  if (zAxis.lengthSq() <= 1e-8) return null;
  zAxis.normalize();
  const yAxis = new Vector3().crossVectors(zAxis, xAxis).normalize();
  return new Quaternion()
    .setFromRotationMatrix(
      new Matrix4().makeBasis(xAxis, yAxis, zAxis),
    )
    .normalize();
}

/**
 * Direction-only IK becomes ambiguous when a segment approaches the exact
 * opposite of its rest direction. A palm normal (or, when necessary, the palm
 * longitudinal axis) supplies a stable second vector, so the same tracked
 * thumb cannot choose an arbitrary 180-degree twist and jump to the dorsum.
 */
export function solveBoneLocalFrame(
  restSegmentAxisLocal: Vector3,
  restLocalQuaternion: Quaternion,
  restPalmNormalAxisLocal: Vector3,
  restPalmLongitudinalAxisLocal: Vector3,
  desiredWorldDirection: Vector3,
  targetPalmNormalWorld: Vector3,
  targetPalmLongitudinalWorld: Vector3,
  parentWorldQuaternion: Quaternion,
): Quaternion | null {
  if (
    restSegmentAxisLocal.lengthSq() <= 1e-8 ||
    desiredWorldDirection.lengthSq() <= 1e-8 ||
    parentWorldQuaternion.lengthSq() <= 1e-8
  ) {
    return null;
  }

  const inverseParent = parentWorldQuaternion.clone().invert();
  const restPrimaryInParent = restSegmentAxisLocal
    .clone()
    .normalize()
    .applyQuaternion(restLocalQuaternion);
  const targetPrimaryInParent = desiredWorldDirection
    .clone()
    .normalize()
    .applyQuaternion(inverseParent);
  const candidates = [
    {
      restReference: restPalmNormalAxisLocal
        .clone()
        .applyQuaternion(restLocalQuaternion),
      targetReference: targetPalmNormalWorld
        .clone()
        .applyQuaternion(inverseParent),
    },
    {
      restReference: restPalmLongitudinalAxisLocal
        .clone()
        .applyQuaternion(restLocalQuaternion),
      targetReference: targetPalmLongitudinalWorld
        .clone()
        .applyQuaternion(inverseParent),
    },
  ]
    .map((candidate) => {
      const restProjected = projectedReference(
        restPrimaryInParent,
        candidate.restReference,
      );
      const targetProjected = projectedReference(
        targetPrimaryInParent,
        candidate.targetReference,
      );
      return {
        ...candidate,
        restProjected,
        targetProjected,
        quality: Math.min(
          restProjected
            ? Math.abs(candidate.restReference.dot(restProjected))
            : 0,
          targetProjected
            ? Math.abs(candidate.targetReference.dot(targetProjected))
            : 0,
        ),
      };
    })
    .sort((a, b) => b.quality - a.quality);
  const reference = candidates[0];
  if (!reference?.restProjected || !reference.targetProjected) {
    return solveBoneLocalDirection(
      restSegmentAxisLocal,
      restLocalQuaternion,
      desiredWorldDirection,
      parentWorldQuaternion,
    );
  }

  const restFrame = frameQuaternion(
    restPrimaryInParent,
    reference.restProjected,
  );
  const targetFrame = frameQuaternion(
    targetPrimaryInParent,
    reference.targetProjected,
  );
  if (!restFrame || !targetFrame) return null;
  const alignment = targetFrame.multiply(restFrame.invert());
  return alignment.multiply(restLocalQuaternion.clone()).normalize();
}
