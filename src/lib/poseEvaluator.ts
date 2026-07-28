import {
  POSE_LANDMARK_NAMES,
  type DetectedPose,
  type Landmark,
  type LandmarkName,
  type PoseConstraint,
  type PoseDefinition,
  type PoseScore,
} from "../types";

const LANDMARK_INDEX = new Map<LandmarkName, number>(
  POSE_LANDMARK_NAMES.map((name, index) => [name, index]),
);

const ESSENTIAL_BODY_LANDMARKS: LandmarkName[] = [
  "nose",
  "leftShoulder",
  "rightShoulder",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
];

const MIN_TORSO_SCALE = 1e-6;

const DEFAULT_HINT = "再試一次，你已經很接近了！";
const PASSING_HINT = "太棒了！保持這個姿勢！";
const LOW_VISIBILITY_HINT = "有些動作被遮住了，請讓手腳都露出來喔！";
const OUT_OF_FRAME_HINT = "再退後一點，讓頭、手和腳都進入畫面喔！";
const NO_POSE_HINT = "站到鏡頭前，讓我看見你的全身喔！";

interface ConstraintEvaluation {
  score: number;
  hint: string;
}

interface OrientationEvaluation {
  score: number;
  constraintScores: number[];
  hint: string;
  mirrored: boolean;
}

/**
 * Scores one normalized MediaPipe pose against a configurable pose definition.
 *
 * Angles and distance ratios use world-space landmarks. Relative x/y constraints
 * use normalized image coordinates, while relative z constraints use world
 * coordinates. The function has no mutable state and is safe to call for every
 * camera frame.
 */
export function evaluatePose(
  pose: DetectedPose | null | undefined,
  definition: PoseDefinition,
  passingThreshold: number,
): PoseScore {
  if (!pose || !hasCompleteLandmarkSet(pose.landmarks)) {
    return emptyScore(definition.constraints.length, NO_POSE_HINT);
  }

  const requiredLandmarks = collectRequiredLandmarks(definition.constraints);
  const checkedLandmarks = uniqueLandmarks([
    ...ESSENTIAL_BODY_LANDMARKS,
    ...requiredLandmarks,
  ]);

  const visibilityOk = checkedLandmarks.every((name) => {
    const landmark = getLandmark(pose.landmarks, name, false);
    return (
      landmark !== undefined &&
      Number.isFinite(landmark.visibility) &&
      landmark.visibility >= definition.minimumVisibility &&
      (landmark.presence === undefined ||
        (Number.isFinite(landmark.presence) &&
          landmark.presence >= definition.minimumVisibility))
    );
  });

  const bodyInFrame = checkedLandmarks.every((name) => {
    const landmark = getLandmark(pose.landmarks, name, false);
    return (
      landmark !== undefined &&
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y) &&
      landmark.x >= 0 &&
      landmark.x <= 1 &&
      landmark.y >= 0 &&
      landmark.y <= 1
    );
  });

  const direct = evaluateOrientation(pose, definition.constraints, false);
  const mirrored = definition.allowMirrored
    ? evaluateOrientation(pose, definition.constraints, true)
    : undefined;
  const best =
    mirrored && mirrored.score > direct.score ? mirrored : direct;
  const threshold = clamp(
    Number.isFinite(passingThreshold) ? passingThreshold : 100,
    0,
    100,
  );
  const passing = visibilityOk && bodyInFrame && best.score >= threshold;

  let hint = best.hint;
  if (!bodyInFrame) {
    hint = OUT_OF_FRAME_HINT;
  } else if (!visibilityOk) {
    hint = LOW_VISIBILITY_HINT;
  } else if (passing) {
    hint = PASSING_HINT;
  }

  return {
    score: best.score,
    passing,
    visibilityOk,
    bodyInFrame,
    mirrored: best.mirrored,
    hint,
    constraintScores: best.constraintScores,
  };
}

function evaluateOrientation(
  pose: DetectedPose,
  constraints: PoseConstraint[],
  mirrored: boolean,
): OrientationEvaluation {
  const evaluations = constraints.map((constraint) =>
    evaluateConstraint(pose, constraint, mirrored),
  );
  const totalWeight = constraints.reduce(
    (sum, constraint) => sum + validWeight(constraint.weight),
    0,
  );
  const weightedScore =
    totalWeight === 0
      ? 0
      : evaluations.reduce(
          (sum, evaluation, index) =>
            sum +
            evaluation.score * validWeight(constraints[index]?.weight ?? 0),
          0,
        ) / totalWeight;
  const lowest = evaluations.reduce<ConstraintEvaluation | undefined>(
    (current, evaluation) =>
      current === undefined || evaluation.score < current.score
        ? evaluation
        : current,
    undefined,
  );

  return {
    score: clamp(weightedScore, 0, 100),
    constraintScores: evaluations.map(({ score }) => score),
    hint: lowest?.hint || DEFAULT_HINT,
    mirrored,
  };
}

function evaluateConstraint(
  pose: DetectedPose,
  constraint: PoseConstraint,
  mirrored: boolean,
): ConstraintEvaluation {
  switch (constraint.type) {
    case "angle": {
      const [aName, vertexName, cName] = constraint.points;
      const points = getWorldLandmarksWithNormalizedFallback(
        pose,
        [aName, vertexName, cName],
        mirrored,
        true,
      );
      const angle = points
        ? angleDegrees(points[0], points[1], points[2])
        : undefined;
      return {
        score:
          angle === undefined
            ? 0
            : deviationScore(
                Math.abs(angle - constraint.target),
                constraint.tolerance,
              ),
        hint: constraint.hint,
      };
    }

    case "relativePosition": {
      const points =
        constraint.axis === "z"
          ? getWorldLandmarksWithNormalizedFallback(
              pose,
              [constraint.a, constraint.b],
              mirrored,
              false,
            )
          : getLandmarks(
              pose.landmarks,
              [constraint.a, constraint.b],
              mirrored,
            );
      if (!points) {
        return { score: 0, hint: constraint.hint };
      }

      let delta = points[0][constraint.axis] - points[1][constraint.axis];
      if (constraint.axis !== "z") {
        const scale = torsoScale2d(pose.landmarks, mirrored);
        if (scale === undefined) {
          return { score: 0, hint: constraint.hint };
        }
        delta /= scale;
      }

      let violation: number;
      if (constraint.relation === "less") {
        violation = Math.max(0, delta + Math.max(0, constraint.margin));
      } else if (constraint.relation === "greater") {
        violation = Math.max(0, Math.max(0, constraint.margin) - delta);
      } else {
        violation = Math.max(
          0,
          Math.abs(delta) - Math.max(0, constraint.margin),
        );
      }

      return {
        score: deviationScore(violation, constraint.tolerance),
        hint: constraint.hint,
      };
    }

    case "distanceRatio": {
      const points = getWorldLandmarksWithNormalizedFallback(
        pose,
        [
          constraint.a,
          constraint.b,
          constraint.referenceA,
          constraint.referenceB,
        ],
        mirrored,
        true,
      );
      if (!points) {
        return { score: 0, hint: constraint.hint };
      }

      const referenceDistance = distance3d(points[2], points[3]);
      if (referenceDistance <= Number.EPSILON) {
        return { score: 0, hint: constraint.hint };
      }
      const ratio = distance3d(points[0], points[1]) / referenceDistance;

      return {
        score: deviationScore(
          Math.abs(ratio - constraint.target),
          constraint.tolerance,
        ),
        hint: constraint.hint,
      };
    }
  }
}

function deviationScore(deviation: number, tolerance: number): number {
  if (!Number.isFinite(deviation)) {
    return 0;
  }
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    return deviation <= Number.EPSILON ? 100 : 0;
  }

  const normalizedDeviation = Math.max(0, deviation) / tolerance;
  if (normalizedDeviation <= 1) {
    return 100 - normalizedDeviation * 25;
  }
  if (normalizedDeviation >= 2) {
    return 0;
  }
  return (2 - normalizedDeviation) * 75;
}

function angleDegrees(a: Landmark, vertex: Landmark, c: Landmark) {
  const first = {
    x: a.x - vertex.x,
    y: a.y - vertex.y,
    z: a.z - vertex.z,
  };
  const second = {
    x: c.x - vertex.x,
    y: c.y - vertex.y,
    z: c.z - vertex.z,
  };
  const firstLength = Math.hypot(first.x, first.y, first.z);
  const secondLength = Math.hypot(second.x, second.y, second.z);
  if (
    firstLength <= Number.EPSILON ||
    secondLength <= Number.EPSILON
  ) {
    return undefined;
  }
  const cosine = clamp(
    (first.x * second.x + first.y * second.y + first.z * second.z) /
      (firstLength * secondLength),
    -1,
    1,
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

function distance3d(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function getLandmark(
  landmarks: Landmark[],
  name: LandmarkName,
  mirrored: boolean,
) {
  const resolvedName = mirrored ? mirroredLandmarkName(name) : name;
  const index = LANDMARK_INDEX.get(resolvedName);
  const landmark = index === undefined ? undefined : landmarks[index];
  return landmark && hasFiniteCoordinates(landmark) ? landmark : undefined;
}

function getLandmarks(
  landmarks: Landmark[],
  names: LandmarkName[],
  mirrored: boolean,
): Landmark[] | undefined {
  const resolved = names.map((name) =>
    getLandmark(landmarks, name, mirrored),
  );
  return resolved.every(
    (landmark): landmark is Landmark => landmark !== undefined,
  )
    ? resolved
    : undefined;
}

function getWorldLandmarksWithNormalizedFallback(
  pose: DetectedPose,
  names: LandmarkName[],
  mirrored: boolean,
  flattenNormalizedZ: boolean,
): Landmark[] | undefined {
  const world = getLandmarks(pose.worldLandmarks, names, mirrored);
  if (world) {
    return world;
  }

  const normalized = getLandmarks(pose.landmarks, names, mirrored);
  if (!normalized || !flattenNormalizedZ) {
    return normalized;
  }

  // MediaPipe's normalized z is not expressed in the same units as normalized
  // image x/y. A 2D fallback is more stable than mixing those scales.
  return normalized.map((landmark) => ({ ...landmark, z: 0 }));
}

function torsoScale2d(
  landmarks: Landmark[],
  mirrored: boolean,
): number | undefined {
  const torso = getLandmarks(
    landmarks,
    ["leftShoulder", "rightShoulder", "leftHip", "rightHip"],
    mirrored,
  );
  if (!torso) {
    return undefined;
  }

  const shoulderMidpoint = {
    x: (torso[0].x + torso[1].x) / 2,
    y: (torso[0].y + torso[1].y) / 2,
  };
  const hipMidpoint = {
    x: (torso[2].x + torso[3].x) / 2,
    y: (torso[2].y + torso[3].y) / 2,
  };
  const scale = Math.hypot(
    shoulderMidpoint.x - hipMidpoint.x,
    shoulderMidpoint.y - hipMidpoint.y,
  );

  return Number.isFinite(scale) && scale > MIN_TORSO_SCALE
    ? scale
    : undefined;
}

function mirroredLandmarkName(name: LandmarkName): LandmarkName {
  if (name.startsWith("left")) {
    return `right${name.slice(4)}` as LandmarkName;
  }
  if (name.startsWith("right")) {
    return `left${name.slice(5)}` as LandmarkName;
  }
  return name;
}

function collectRequiredLandmarks(
  constraints: PoseConstraint[],
): LandmarkName[] {
  return constraints.flatMap((constraint) => {
    switch (constraint.type) {
      case "angle":
        return [...constraint.points];
      case "relativePosition":
        return [constraint.a, constraint.b];
      case "distanceRatio":
        return [
          constraint.a,
          constraint.b,
          constraint.referenceA,
          constraint.referenceB,
        ];
    }
  });
}

function uniqueLandmarks(names: LandmarkName[]) {
  return [...new Set(names)];
}

function hasCompleteLandmarkSet(landmarks: Landmark[]) {
  return landmarks.length >= POSE_LANDMARK_NAMES.length;
}

function hasFiniteCoordinates(landmark: Landmark) {
  return (
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    Number.isFinite(landmark.z)
  );
}

function validWeight(weight: number) {
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function emptyScore(constraintCount: number, hint: string): PoseScore {
  return {
    score: 0,
    passing: false,
    visibilityOk: false,
    bodyInFrame: false,
    mirrored: false,
    hint,
    constraintScores: Array.from({ length: constraintCount }, () => 0),
  };
}
