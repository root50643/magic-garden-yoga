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

export function calculateFingerCurls(
  landmarks: readonly Landmark[],
): FingerCurlTargets {
  if (landmarks.length < 21) return { ...ZERO_CURLS };

  return Object.fromEntries(
    FINGER_JOINT_DEFINITIONS.map(({ name, points, maximumCurl }) => [
      name,
      calculateJointCurl(
        landmarks[points[0]],
        landmarks[points[1]],
        landmarks[points[2]],
        maximumCurl,
      ),
    ]),
  ) as FingerCurlTargets;
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
