import type { HandSide, Landmark } from "../types";

export type FingerJointName =
  | "thumbMetacarpal"
  | "thumbProximal"
  | "thumbDistal"
  | "indexProximal"
  | "indexIntermediate"
  | "indexDistal"
  | "middleProximal"
  | "middleIntermediate"
  | "middleDistal"
  | "ringProximal"
  | "ringIntermediate"
  | "ringDistal"
  | "littleProximal"
  | "littleIntermediate"
  | "littleDistal";

export interface FingerJointDefinition {
  name: FingerJointName;
  points: readonly [number, number, number];
  maximumCurl: number;
  leftBone: string;
  rightBone: string;
  leftChildBone?: string;
  rightChildBone?: string;
}

export const FINGER_JOINT_DEFINITIONS: readonly FingerJointDefinition[] = [
  {
    name: "thumbMetacarpal",
    points: [0, 1, 2],
    maximumCurl: 0.9,
    leftBone: "leftThumbMetacarpal",
    rightBone: "rightThumbMetacarpal",
    leftChildBone: "leftThumbProximal",
    rightChildBone: "rightThumbProximal",
  },
  {
    name: "thumbProximal",
    points: [1, 2, 3],
    maximumCurl: 1.1,
    leftBone: "leftThumbProximal",
    rightBone: "rightThumbProximal",
    leftChildBone: "leftThumbDistal",
    rightChildBone: "rightThumbDistal",
  },
  {
    name: "thumbDistal",
    points: [2, 3, 4],
    maximumCurl: 1.0,
    leftBone: "leftThumbDistal",
    rightBone: "rightThumbDistal",
  },
  {
    name: "indexProximal",
    points: [0, 5, 6],
    maximumCurl: 1.45,
    leftBone: "leftIndexProximal",
    rightBone: "rightIndexProximal",
    leftChildBone: "leftIndexIntermediate",
    rightChildBone: "rightIndexIntermediate",
  },
  {
    name: "indexIntermediate",
    points: [5, 6, 7],
    maximumCurl: 1.7,
    leftBone: "leftIndexIntermediate",
    rightBone: "rightIndexIntermediate",
    leftChildBone: "leftIndexDistal",
    rightChildBone: "rightIndexDistal",
  },
  {
    name: "indexDistal",
    points: [6, 7, 8],
    maximumCurl: 1.35,
    leftBone: "leftIndexDistal",
    rightBone: "rightIndexDistal",
  },
  {
    name: "middleProximal",
    points: [0, 9, 10],
    maximumCurl: 1.45,
    leftBone: "leftMiddleProximal",
    rightBone: "rightMiddleProximal",
    leftChildBone: "leftMiddleIntermediate",
    rightChildBone: "rightMiddleIntermediate",
  },
  {
    name: "middleIntermediate",
    points: [9, 10, 11],
    maximumCurl: 1.7,
    leftBone: "leftMiddleIntermediate",
    rightBone: "rightMiddleIntermediate",
    leftChildBone: "leftMiddleDistal",
    rightChildBone: "rightMiddleDistal",
  },
  {
    name: "middleDistal",
    points: [10, 11, 12],
    maximumCurl: 1.35,
    leftBone: "leftMiddleDistal",
    rightBone: "rightMiddleDistal",
  },
  {
    name: "ringProximal",
    points: [0, 13, 14],
    maximumCurl: 1.45,
    leftBone: "leftRingProximal",
    rightBone: "rightRingProximal",
    leftChildBone: "leftRingIntermediate",
    rightChildBone: "rightRingIntermediate",
  },
  {
    name: "ringIntermediate",
    points: [13, 14, 15],
    maximumCurl: 1.7,
    leftBone: "leftRingIntermediate",
    rightBone: "rightRingIntermediate",
    leftChildBone: "leftRingDistal",
    rightChildBone: "rightRingDistal",
  },
  {
    name: "ringDistal",
    points: [14, 15, 16],
    maximumCurl: 1.35,
    leftBone: "leftRingDistal",
    rightBone: "rightRingDistal",
  },
  {
    name: "littleProximal",
    points: [0, 17, 18],
    maximumCurl: 1.45,
    leftBone: "leftLittleProximal",
    rightBone: "rightLittleProximal",
    leftChildBone: "leftLittleIntermediate",
    rightChildBone: "rightLittleIntermediate",
  },
  {
    name: "littleIntermediate",
    points: [17, 18, 19],
    maximumCurl: 1.7,
    leftBone: "leftLittleIntermediate",
    rightBone: "rightLittleIntermediate",
    leftChildBone: "leftLittleDistal",
    rightChildBone: "rightLittleDistal",
  },
  {
    name: "littleDistal",
    points: [18, 19, 20],
    maximumCurl: 1.35,
    leftBone: "leftLittleDistal",
    rightBone: "rightLittleDistal",
  },
] as const;

export type FingerCurlTargets = Record<FingerJointName, number>;

export interface MotionVector {
  x: number;
  y: number;
  z: number;
}

export interface PalmBasis {
  /** Wrist toward the center of the four finger MCP joints. */
  longitudinal: MotionVector;
  /** Index MCP toward little-finger MCP. */
  lateral: MotionVector;
  /** Right-handed palm normal: longitudinal × lateral. */
  normal: MotionVector;
}

export type NonThumbFingerName = "index" | "middle" | "ring" | "little";

/**
 * Signed abduction angles in radians, measured in the palm plane. Negative
 * points toward the index-finger edge and positive toward the little-finger
 * edge, regardless of which hand is tracked.
 */
export type FingerSpreadTargets = Record<NonThumbFingerName, number>;

export interface ThumbArticulationTarget {
  /**
   * Thumb-tip position relative to the palm center, expressed in palm-width
   * units. x is index-to-little, y is wrist-to-fingers, and z is palm-normal.
   */
  target: MotionVector;
  /** Thumb folded into a fist. Pinching alone deliberately stays low. */
  closure: number;
  /** Thumb moving across the palm or opposing the index fingertip. */
  opposition: number;
}

export interface HandArticulationTargets {
  curls: FingerCurlTargets;
  spreads: FingerSpreadTargets;
  thumb: ThumbArticulationTarget;
}

export type VrmFaceExpressionName =
  | "aa"
  | "ih"
  | "ou"
  | "ee"
  | "oh"
  | "blinkLeft"
  | "blinkRight"
  | "happy"
  | "surprised";

export type FaceExpressionTargets = Record<VrmFaceExpressionName, number>;

const ZERO_CURLS = Object.fromEntries(
  FINGER_JOINT_DEFINITIONS.map(({ name }) => [name, 0]),
) as FingerCurlTargets;

const ZERO_SPREADS: FingerSpreadTargets = {
  index: 0,
  middle: 0,
  ring: 0,
  little: 0,
};

const FINGER_SPREAD_CHAINS = [
  ["index", 5, 6, "indexProximal"],
  ["middle", 9, 10, "middleProximal"],
  ["ring", 13, 14, "ringProximal"],
  ["little", 17, 18, "littleProximal"],
] as const satisfies readonly [
  NonThumbFingerName,
  number,
  number,
  FingerJointName,
][];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function finitePoint(point: Landmark | null | undefined): point is Landmark {
  return Boolean(
    point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z),
  );
}

function subtract(a: MotionVector, b: MotionVector): MotionVector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: MotionVector, b: MotionVector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function distance(a: MotionVector, b: MotionVector): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function cross(a: MotionVector, b: MotionVector): MotionVector {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(vector: MotionVector): MotionVector | null {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= 1e-6) return null;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

/**
 * Builds a stable right-handed frame from the palm rather than a single
 * finger. Index-to-little establishes anatomical lateral direction for both
 * hands, so display mirroring never needs to swap sides or negate the result.
 */
export function calculatePalmBasisFromPoints(
  wrist: MotionVector,
  indexMcp: MotionVector,
  middleMcp: MotionVector,
  ringMcp: MotionVector,
  littleMcp: MotionVector,
): PalmBasis | null {
  const palmCenter = {
    x: (indexMcp.x + middleMcp.x + ringMcp.x + littleMcp.x) / 4,
    y: (indexMcp.y + middleMcp.y + ringMcp.y + littleMcp.y) / 4,
    z: (indexMcp.z + middleMcp.z + ringMcp.z + littleMcp.z) / 4,
  };
  const longitudinal = normalize(subtract(palmCenter, wrist));
  if (!longitudinal) return null;

  const rawLateral = subtract(littleMcp, indexMcp);
  const rawLateralLength = Math.hypot(
    rawLateral.x,
    rawLateral.y,
    rawLateral.z,
  );
  if (!Number.isFinite(rawLateralLength) || rawLateralLength <= 1e-5) {
    return null;
  }
  const lateralProjection = dot(rawLateral, longitudinal);
  const lateralResidual = {
    x: rawLateral.x - longitudinal.x * lateralProjection,
    y: rawLateral.y - longitudinal.y * lateralProjection,
    z: rawLateral.z - longitudinal.z * lateralProjection,
  };
  const orthogonalLength = Math.hypot(
    lateralResidual.x,
    lateralResidual.y,
    lateralResidual.z,
  );
  if (orthogonalLength / rawLateralLength < 0.15) return null;
  const lateral = normalize(lateralResidual);
  if (!lateral) return null;

  const normal = normalize(cross(longitudinal, lateral));
  if (!normal) return null;
  // Recompute lateral after the cross product to remove accumulated numeric
  // skew while preserving index-to-little direction.
  const orthogonalLateral = normalize(cross(normal, longitudinal));
  if (!orthogonalLateral) return null;

  return { longitudinal, lateral: orthogonalLateral, normal };
}

export function calculatePalmBasis(
  landmarks: readonly Landmark[],
): PalmBasis | null {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const ringMcp = landmarks[13];
  const littleMcp = landmarks[17];
  if (
    !finitePoint(wrist) ||
    !finitePoint(indexMcp) ||
    !finitePoint(middleMcp) ||
    !finitePoint(ringMcp) ||
    !finitePoint(littleMcp)
  ) {
    return null;
  }
  return calculatePalmBasisFromPoints(
    wrist,
    indexMcp,
    middleMcp,
    ringMcp,
    littleMcp,
  );
}

/**
 * Returns flexion at the middle point. A straight three-point chain is zero;
 * a right angle is PI / 2. The result is independent of camera mirroring.
 */
export function calculateJointCurl(
  a: Landmark | null | undefined,
  b: Landmark | null | undefined,
  c: Landmark | null | undefined,
  maximumCurl = Math.PI,
): number {
  if (!finitePoint(a) || !finitePoint(b) || !finitePoint(c)) return 0;

  const ab = [a.x - b.x, a.y - b.y, a.z - b.z] as const;
  const cb = [c.x - b.x, c.y - b.y, c.z - b.z] as const;
  const abLength = Math.hypot(...ab);
  const cbLength = Math.hypot(...cb);
  if (abLength <= Number.EPSILON || cbLength <= Number.EPSILON) return 0;

  const cosine = Math.min(
    1,
    Math.max(
      -1,
      (ab[0] * cb[0] + ab[1] * cb[1] + ab[2] * cb[2]) /
        (abLength * cbLength),
    ),
  );
  const flexion = Math.PI - Math.acos(cosine);
  return Math.min(Math.max(0, maximumCurl), Math.max(0, flexion));
}

function curlDeadZone(name: FingerJointName): number {
  if (name.startsWith("thumb")) return 0.18;
  if (name.endsWith("Proximal")) return 0.14;
  return 0.1;
}

/**
 * Removes the small residual bend caused by landmark noise while preserving
 * the complete [0, maximumCurl] range for an intentional bend.
 */
function applyCurlDeadZone(
  flexion: number,
  maximumCurl: number,
  deadZone: number,
): number {
  const maximum = Math.max(0, maximumCurl);
  if (
    !Number.isFinite(flexion) ||
    !Number.isFinite(deadZone) ||
    flexion <= deadZone ||
    maximum <= deadZone
  ) {
    return 0;
  }
  return maximum * clamp01((flexion - deadZone) / (maximum - deadZone));
}

/**
 * MCP abduction must not be mistaken for finger curl. Measure the proximal
 * segment in the palm's longitudinal/normal plane and deliberately discard
 * its lateral component; finger spread is emitted as a separate signal.
 */
function calculatePalmReferencedProximalCurl(
  mcp: Landmark | null | undefined,
  pip: Landmark | null | undefined,
  basis: PalmBasis,
  maximumCurl: number,
): number {
  if (!finitePoint(mcp) || !finitePoint(pip)) return 0;
  const segment = subtract(pip, mcp);
  const segmentLength = Math.hypot(segment.x, segment.y, segment.z);
  if (!Number.isFinite(segmentLength) || segmentLength <= 1e-6) return 0;

  const longitudinal = dot(segment, basis.longitudinal);
  const normal = dot(segment, basis.normal);
  const sagittalLength = Math.hypot(longitudinal, normal);
  // A nearly lateral segment does not contain enough information to infer a
  // stable curl angle, so leave it neutral instead of amplifying noise.
  if (sagittalLength / segmentLength < 0.08) return 0;

  const cosine = Math.min(
    1,
    Math.max(-1, longitudinal / sagittalLength),
  );
  return Math.min(Math.max(0, maximumCurl), Math.acos(cosine));
}

export function calculateFingerCurls(
  landmarks: readonly Landmark[],
): FingerCurlTargets {
  if (landmarks.length < 21) return { ...ZERO_CURLS };
  const palmBasis = calculatePalmBasis(landmarks);

  return Object.fromEntries(
    FINGER_JOINT_DEFINITIONS.map(({ name, points, maximumCurl }) => {
      const flexion =
        palmBasis && !name.startsWith("thumb") && name.endsWith("Proximal")
          ? calculatePalmReferencedProximalCurl(
              landmarks[points[1]],
              landmarks[points[2]],
              palmBasis,
              maximumCurl,
            )
          : calculateJointCurl(
              landmarks[points[0]],
              landmarks[points[1]],
              landmarks[points[2]],
              maximumCurl,
            );
      return [
        name,
        applyCurlDeadZone(
          flexion,
          maximumCurl,
          curlDeadZone(name),
        ),
      ];
    }),
  ) as FingerCurlTargets;
}

function neutralHandArticulation(): HandArticulationTargets {
  return {
    curls: { ...ZERO_CURLS },
    spreads: { ...ZERO_SPREADS },
    thumb: {
      target: { x: 0, y: 0, z: 0 },
      closure: 0,
      opposition: 0,
    },
  };
}

function inverseRemap(value: number, fullAt: number, zeroAt: number): number {
  if (!Number.isFinite(value) || zeroAt <= fullAt) return 0;
  return clamp01((zeroAt - value) / (zeroAt - fullAt));
}

function boundedPalmCoordinate(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Derives articulation signals that joint bend angles cannot represent:
 * finger abduction and the thumb's position across the palm.
 *
 * Use world landmarks when available. Because every direction and distance is
 * measured in a frame built from the same hand, results are invariant to
 * translation, proper 3D rotation, uniform scale, and anatomical left/right
 * reflection. A bad palm frame returns neutral finite targets.
 */
export function calculateHandArticulation(
  landmarks: readonly Landmark[],
  side: HandSide = "right",
): HandArticulationTargets {
  if (landmarks.length < 21) return neutralHandArticulation();
  const basis = calculatePalmBasis(landmarks);
  if (!basis) return neutralHandArticulation();

  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const ringMcp = landmarks[13];
  const littleMcp = landmarks[17];
  if (
    !finitePoint(wrist) ||
    !finitePoint(indexMcp) ||
    !finitePoint(middleMcp) ||
    !finitePoint(ringMcp) ||
    !finitePoint(littleMcp)
  ) {
    return neutralHandArticulation();
  }

  const palmWidth = distance(indexMcp, littleMcp);
  if (!Number.isFinite(palmWidth) || palmWidth <= 1e-5) {
    return neutralHandArticulation();
  }

  const curls = calculateFingerCurls(landmarks);
  const spreads = { ...ZERO_SPREADS };
  for (const [name, mcpIndex, pipIndex, proximalName] of FINGER_SPREAD_CHAINS) {
    const mcp = landmarks[mcpIndex];
    const pip = landmarks[pipIndex];
    if (!finitePoint(mcp) || !finitePoint(pip)) continue;
    const segment = subtract(pip, mcp);
    const segmentLength = Math.hypot(segment.x, segment.y, segment.z);
    const lateral = dot(segment, basis.lateral);
    const longitudinal = dot(segment, basis.longitudinal);
    const planarLength = Math.hypot(lateral, longitudinal);
    if (
      !Number.isFinite(segmentLength) ||
      segmentLength <= 1e-6 ||
      planarLength / segmentLength < 0.15
    ) {
      continue;
    }

    // Abduction becomes poorly constrained after a finger folds out of the
    // palm plane. Fade it with proximal flexion to avoid fist jitter.
    const extensionWeight = 1 - clamp01(curls[proximalName] / 1.2);
    spreads[name] =
      Math.min(0.9, Math.max(-0.9, Math.atan2(lateral, longitudinal))) *
      extensionWeight;
  }

  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  if (!finitePoint(thumbTip)) {
    return {
      curls,
      spreads,
      thumb: neutralHandArticulation().thumb,
    };
  }

  const palmCenter = {
    x: (indexMcp.x + middleMcp.x + ringMcp.x + littleMcp.x) / 4,
    y: (indexMcp.y + middleMcp.y + ringMcp.y + littleMcp.y) / 4,
    z: (indexMcp.z + middleMcp.z + ringMcp.z + littleMcp.z) / 4,
  };
  const thumbOffset = subtract(thumbTip, palmCenter);
  const target = {
    x: boundedPalmCoordinate(
      dot(thumbOffset, basis.lateral) / palmWidth,
      -1.6,
      0.65,
    ),
    y: boundedPalmCoordinate(
      dot(thumbOffset, basis.longitudinal) / palmWidth,
      -0.55,
      1.55,
    ),
    // cross(longitudinal, index-to-little) has opposite anatomical parity for
    // left and right hands. Correct it so z means the same thing on both.
    z: boundedPalmCoordinate(
      (dot(thumbOffset, basis.normal) / palmWidth) *
        (side === "left" ? -1 : 1),
      -0.8,
      0.8,
    ),
  };

  const palmDistance = distance(thumbTip, palmCenter) / palmWidth;
  const mcpDistance =
    Math.min(
      distance(thumbTip, middleMcp),
      distance(thumbTip, ringMcp),
    ) / palmWidth;
  const palmProximity = inverseRemap(
    Math.min(palmDistance, mcpDistance),
    0.28,
    1.05,
  );

  const fingerClosure = [
    average(
      curls.indexProximal / 1.45,
      curls.indexIntermediate / 1.7,
      curls.indexDistal / 1.35,
    ),
    average(
      curls.middleProximal / 1.45,
      curls.middleIntermediate / 1.7,
      curls.middleDistal / 1.35,
    ),
    average(
      curls.ringProximal / 1.45,
      curls.ringIntermediate / 1.7,
      curls.ringDistal / 1.35,
    ),
    average(
      curls.littleProximal / 1.45,
      curls.littleIntermediate / 1.7,
      curls.littleDistal / 1.35,
    ),
  ];
  const meanFingerClosure = average(...fingerClosure);
  const leastFingerClosure = Math.min(...fingerClosure);
  // A fist requires support from every finger. This prevents a victory sign,
  // where only ring/little are folded, from driving the thumb to its extreme
  // fist target.
  const fistSignal =
    remap(meanFingerClosure, 0.35, 0.78) *
    remap(leastFingerClosure, 0.16, 0.58);
  // Reserve full-looking closure for a real fist. A tucked thumb in a victory
  // sign may still produce a small fold, but cannot reach the arm-crossing
  // extremes that a binary proximity test produced.
  const closure = Math.min(
    0.78,
    palmProximity * (0.08 + 0.7 * fistSignal),
  );

  const pinchDistance = finitePoint(indexTip)
    ? distance(thumbTip, indexTip) / palmWidth
    : Number.POSITIVE_INFINITY;
  const pinchSignal = inverseRemap(pinchDistance, 0.08, 0.5);
  const acrossPalm = remap(target.x, -0.82, -0.08);
  const palmNear = inverseRemap(palmDistance, 0.32, 1.2);
  // Pinching, tucking and making a fist are distinct motions. Opposition is
  // intentionally bounded below a full quaternion slerp target: the raw VRM
  // thumb rest axes vary significantly between models and extreme targets can
  // otherwise intersect the wrist or forearm.
  const opposition = Math.min(
    0.72,
    Math.max(
      pinchSignal * 0.58,
      acrossPalm * palmNear * (0.18 + 0.54 * fistSignal),
    ),
  );

  return {
    curls,
    spreads,
    thumb: {
      target,
      closure: clamp01(closure),
      opposition: clamp01(opposition),
    },
  };
}

export function curlAxisFromRestDirection(
  restDirection: MotionVector,
  palmCurlDirection: MotionVector = { x: 0, y: -1, z: 0 },
): MotionVector | null {
  const x =
    restDirection.y * palmCurlDirection.z -
    restDirection.z * palmCurlDirection.y;
  const y =
    restDirection.z * palmCurlDirection.x -
    restDirection.x * palmCurlDirection.z;
  const z =
    restDirection.x * palmCurlDirection.y -
    restDirection.y * palmCurlDirection.x;
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= Number.EPSILON) return null;
  return { x: x / length, y: y / length, z: z / length };
}

/**
 * The avatar worker places the anatomical left-wrist crop in the left panel
 * and the right-wrist crop in the right panel. This avoids relying on
 * MediaPipe handedness labels, which can vary with mirrored input.
 */
export function handSideFromMosaicX(
  normalizedX: number,
  handednessSwap = false,
): HandSide {
  const panelSide: HandSide = normalizedX < 0.5 ? "left" : "right";
  if (!handednessSwap) return panelSide;
  return panelSide === "left" ? "right" : "left";
}

function score(
  blendshapes: Readonly<Record<string, number>>,
  name: string,
): number {
  return clamp01(blendshapes[name] ?? 0);
}

function average(...values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function remap(value: number, deadZone: number, fullAt: number): number {
  if (!Number.isFinite(value) || fullAt <= deadZone) return 0;
  return clamp01((value - deadZone) / (fullAt - deadZone));
}

/**
 * Converts MediaPipe's ARKit-like coefficients to the expression presets
 * available on ordinary VRM 0.x/1.0 avatars. Mouth weights are normalized so
 * multiple morphs cannot overdrive the mesh.
 */
export function faceBlendshapesToVrmExpressions(
  blendshapes: Readonly<Record<string, number>>,
): FaceExpressionTargets {
  const open = remap(score(blendshapes, "jawOpen"), 0.08, 0.75);
  const funnel = remap(score(blendshapes, "mouthFunnel"), 0.08, 0.65);
  const pucker = remap(score(blendshapes, "mouthPucker"), 0.08, 0.65);
  const stretch = average(
    score(blendshapes, "mouthStretchLeft"),
    score(blendshapes, "mouthStretchRight"),
  );
  const smile = remap(
    average(
      score(blendshapes, "mouthSmileLeft"),
      score(blendshapes, "mouthSmileRight"),
    ),
    0.12,
    0.7,
  );
  const wide = Math.max(remap(stretch, 0.05, 0.55), smile * 0.65);
  const close = Math.max(
    remap(score(blendshapes, "mouthClose"), 0.1, 0.7),
    remap(
      average(
        score(blendshapes, "mouthPressLeft"),
        score(blendshapes, "mouthPressRight"),
      ),
      0.1,
      0.7,
    ),
  );
  const round = Math.max(funnel, pucker);
  const closeMultiplier = 1 - close * 0.85;

  const mouth = {
    aa: open * (1 - 0.75 * round) * (1 - 0.25 * wide),
    ih: wide * (1 - 0.75 * open) * (1 - round),
    ee: wide * open * (1 - round),
    ou: pucker * (1 - 0.55 * open),
    oh: funnel * (0.25 + 0.75 * open),
  };

  for (const name of Object.keys(mouth) as Array<keyof typeof mouth>) {
    mouth[name] = clamp01(mouth[name] * closeMultiplier);
  }
  const mouthTotal = Object.values(mouth).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (mouthTotal > 1) {
    for (const name of Object.keys(mouth) as Array<keyof typeof mouth>) {
      mouth[name] /= mouthTotal;
    }
  }

  const eyeWide = average(
    score(blendshapes, "eyeWideLeft"),
    score(blendshapes, "eyeWideRight"),
  );
  const surpriseSignal = Math.max(
    score(blendshapes, "browInnerUp"),
    eyeWide,
  );

  return {
    ...mouth,
    blinkLeft: remap(score(blendshapes, "eyeBlinkLeft"), 0.12, 0.65),
    blinkRight: remap(score(blendshapes, "eyeBlinkRight"), 0.12, 0.65),
    happy: smile * 0.42 * (1 - open * 0.3),
    surprised: remap(surpriseSignal, 0.15, 0.75) * 0.32,
  };
}

/**
 * Frame-rate independent smoothing expressed as a signal half-life.
 */
export function halfLifeAlpha(
  deltaSeconds: number,
  halfLifeSeconds: number,
): number {
  if (deltaSeconds <= 0 || !Number.isFinite(deltaSeconds)) return 0;
  if (halfLifeSeconds <= 0 || !Number.isFinite(halfLifeSeconds)) return 1;
  return clamp01(1 - 2 ** (-deltaSeconds / halfLifeSeconds));
}
