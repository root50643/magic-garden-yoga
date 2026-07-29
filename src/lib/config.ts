import {
  POSE_LANDMARK_NAMES,
  type GameConfig,
  type LandmarkName,
  type PoseConstraint,
  type PoseDefinition,
} from "../types";
import { resolvePublicAssetPath } from "./publicAsset";

export interface ConfigResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
}

export type ConfigFetcher = (
  url: string,
  init?: RequestInit,
) => Promise<ConfigResponse>;

export class ConfigValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`遊戲設定有誤：\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ConfigValidationError";
    this.issues = [...issues];
  }
}

const LANDMARK_NAMES = new Set<string>(POSE_LANDMARK_NAMES);
const ORIENTATIONS = new Set(["front", "threeQuarter", "side"]);
const AXES = new Set(["x", "y", "z"]);
const RELATIONS = new Set(["less", "greater", "near"]);
const DEFAULT_AVATAR_INITIALIZATION_TIMEOUT_MS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(
  value: unknown,
  path: string,
  issues: string[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    issues.push(`${path} 必須是物件。`);
    return undefined;
  }
  return value;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
): string | undefined {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${path}.${key} 必須是非空白文字。`);
    return undefined;
  }
  return value;
}

function requiredBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
): boolean | undefined {
  const value = record[key];
  if (typeof value !== "boolean") {
    issues.push(`${path}.${key} 必須是 true 或 false。`);
    return undefined;
  }
  return value;
}

interface NumberRules {
  integer?: boolean;
  min?: number;
  max?: number;
  minExclusive?: boolean;
}

function requiredNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
  rules: NumberRules = {},
): number | undefined {
  const value = record[key];
  const fieldPath = `${path}.${key}`;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(`${fieldPath} 必須是有限數字。`);
    return undefined;
  }
  if (rules.integer && !Number.isInteger(value)) {
    issues.push(`${fieldPath} 必須是整數。`);
  }
  if (
    rules.min !== undefined &&
    (rules.minExclusive ? value <= rules.min : value < rules.min)
  ) {
    issues.push(
      `${fieldPath} 必須${rules.minExclusive ? "大於" : "大於或等於"} ${rules.min}。`,
    );
  }
  if (rules.max !== undefined && value > rules.max) {
    issues.push(`${fieldPath} 必須小於或等於 ${rules.max}。`);
  }
  return value;
}

function optionalPositiveNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  return requiredNumber(record, key, path, issues, {
    min: 0,
    minExclusive: true,
  });
}

function optionalNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
  rules: NumberRules = {},
): number | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return requiredNumber(record, key, path, issues, rules);
}

function landmark(
  value: unknown,
  path: string,
  issues: string[],
): LandmarkName | undefined {
  if (typeof value !== "string" || !LANDMARK_NAMES.has(value)) {
    issues.push(
      `${path} 必須是有效的姿勢關鍵點名稱，例如 leftShoulder 或 rightKnee。`,
    );
    return undefined;
  }
  return value as LandmarkName;
}

function validateConstraint(
  value: unknown,
  path: string,
  issues: string[],
): PoseConstraint | undefined {
  const constraint = recordAt(value, path, issues);
  if (!constraint) {
    return undefined;
  }

  const type = constraint.type;
  if (
    type !== "angle" &&
    type !== "relativePosition" &&
    type !== "distanceRatio"
  ) {
    issues.push(
      `${path}.type 必須是 angle、relativePosition 或 distanceRatio。`,
    );
    return undefined;
  }

  requiredNumber(constraint, "weight", path, issues, {
    min: 0,
    minExclusive: true,
  });
  requiredString(constraint, "hint", path, issues);

  if (type === "angle") {
    const points = constraint.points;
    if (!Array.isArray(points) || points.length !== 3) {
      issues.push(`${path}.points 必須剛好包含 3 個姿勢關鍵點。`);
    } else {
      points.forEach((point, index) =>
        landmark(point, `${path}.points[${index}]`, issues),
      );
    }
    requiredNumber(constraint, "target", path, issues, {
      min: 0,
      max: 180,
    });
    requiredNumber(constraint, "tolerance", path, issues, {
      min: 0,
      max: 180,
      minExclusive: true,
    });
  }

  if (type === "relativePosition") {
    landmark(constraint.a, `${path}.a`, issues);
    landmark(constraint.b, `${path}.b`, issues);
    if (typeof constraint.axis !== "string" || !AXES.has(constraint.axis)) {
      issues.push(`${path}.axis 必須是 x、y 或 z。`);
    }
    if (
      typeof constraint.relation !== "string" ||
      !RELATIONS.has(constraint.relation)
    ) {
      issues.push(`${path}.relation 必須是 less、greater 或 near。`);
    }
    requiredNumber(constraint, "margin", path, issues, { min: 0 });
    requiredNumber(constraint, "tolerance", path, issues, {
      min: 0,
      minExclusive: true,
    });
  }

  if (type === "distanceRatio") {
    landmark(constraint.a, `${path}.a`, issues);
    landmark(constraint.b, `${path}.b`, issues);
    landmark(constraint.referenceA, `${path}.referenceA`, issues);
    landmark(constraint.referenceB, `${path}.referenceB`, issues);
    requiredNumber(constraint, "target", path, issues, {
      min: 0,
      minExclusive: true,
    });
    requiredNumber(constraint, "tolerance", path, issues, {
      min: 0,
      minExclusive: true,
    });
  }

  return constraint as unknown as PoseConstraint;
}

function validatePose(
  value: unknown,
  index: number,
  issues: string[],
): PoseDefinition | undefined {
  const path = `poses[${index}]`;
  const pose = recordAt(value, path, issues);
  if (!pose) {
    return undefined;
  }

  requiredString(pose, "id", path, issues);
  requiredString(pose, "name", path, issues);
  requiredString(pose, "englishName", path, issues);
  requiredString(pose, "imagePath", path, issues);
  requiredString(pose, "instruction", path, issues);

  if (
    typeof pose.orientation !== "string" ||
    !ORIENTATIONS.has(pose.orientation)
  ) {
    issues.push(
      `${path}.orientation 必須是 front、threeQuarter 或 side。`,
    );
  }

  requiredBoolean(pose, "allowMirrored", path, issues);
  optionalPositiveNumber(pose, "holdSeconds", path, issues);
  optionalNumber(pose, "scoreThreshold", path, issues, {
    min: 0,
    max: 100,
  });
  requiredNumber(pose, "minimumVisibility", path, issues, {
    min: 0,
    max: 1,
  });

  if (!Array.isArray(pose.constraints) || pose.constraints.length === 0) {
    issues.push(`${path}.constraints 必須至少包含一項姿勢判定規則。`);
  } else {
    pose.constraints.forEach((constraint, constraintIndex) =>
      validateConstraint(
        constraint,
        `${path}.constraints[${constraintIndex}]`,
        issues,
      ),
    );
  }

  return pose as unknown as PoseDefinition;
}

/**
 * Validates untrusted JSON and returns it with the shared GameConfig type.
 * All discovered problems are returned together so a teacher can fix the
 * configuration without repeatedly reloading the game.
 */
export function validateGameConfig(value: unknown): GameConfig {
  const issues: string[] = [];
  const normalizedValue =
    isRecord(value) &&
    isRecord(value.avatarTracking) &&
    value.avatarTracking.initializationTimeoutMs === undefined
      ? {
          ...value,
          avatarTracking: {
            ...value.avatarTracking,
            initializationTimeoutMs:
              DEFAULT_AVATAR_INITIALIZATION_TIMEOUT_MS,
          },
        }
      : value;
  const config = recordAt(normalizedValue, "設定檔", issues);
  if (!config) {
    throw new ConfigValidationError(issues);
  }

  requiredString(config, "challengeId", "設定檔", issues);
  requiredString(config, "title", "設定檔", issues);
  requiredString(config, "subtitle", "設定檔", issues);

  const avatar = recordAt(config.avatar, "avatar", issues);
  if (avatar) {
    requiredString(avatar, "modelPath", "avatar", issues);
    requiredNumber(avatar, "scale", "avatar", issues, {
      min: 0,
      minExclusive: true,
    });
    requiredNumber(avatar, "cameraDistance", "avatar", issues, {
      min: 0,
      minExclusive: true,
    });
    requiredBoolean(avatar, "mirrored", "avatar", issues);
  }

  const timing = recordAt(config.timing, "timing", issues);
  if (timing) {
    requiredNumber(timing, "countdownSeconds", "timing", issues, {
      integer: true,
      min: 0,
    });
    requiredNumber(timing, "defaultHoldSeconds", "timing", issues, {
      min: 0,
      minExclusive: true,
    });
    requiredNumber(timing, "trackingGraceMs", "timing", issues, { min: 0 });
    requiredNumber(timing, "transitionMs", "timing", issues, { min: 0 });
  }

  const detection = recordAt(config.poseDetection, "poseDetection", issues);
  if (detection) {
    requiredString(detection, "modelPath", "poseDetection", issues);
    requiredString(detection, "wasmPath", "poseDetection", issues);
    requiredNumber(
      detection,
      "maxInferenceFps",
      "poseDetection",
      issues,
      {
        min: 0,
        minExclusive: true,
      },
    );
    requiredNumber(detection, "scoreThreshold", "poseDetection", issues, {
      min: 0,
      max: 100,
    });
    requiredNumber(
      detection,
      "minDetectionConfidence",
      "poseDetection",
      issues,
      { min: 0, max: 1 },
    );
    requiredNumber(
      detection,
      "minTrackingConfidence",
      "poseDetection",
      issues,
      { min: 0, max: 1 },
    );
    requiredNumber(
      detection,
      "minPosePresenceConfidence",
      "poseDetection",
      issues,
      { min: 0, max: 1 },
    );
  }

  const avatarTracking = recordAt(
    config.avatarTracking,
    "avatarTracking",
    issues,
  );
  if (avatarTracking) {
    requiredBoolean(avatarTracking, "enabled", "avatarTracking", issues);
    const maxInferenceFps = requiredNumber(
      avatarTracking,
      "maxInferenceFps",
      "avatarTracking",
      issues,
      { min: 0, minExclusive: true },
    );
    const lowQualityMaxInferenceFps = requiredNumber(
      avatarTracking,
      "lowQualityMaxInferenceFps",
      "avatarTracking",
      issues,
      { min: 0, minExclusive: true },
    );
    if (
      maxInferenceFps !== undefined &&
      lowQualityMaxInferenceFps !== undefined &&
      lowQualityMaxInferenceFps > maxInferenceFps
    ) {
      issues.push(
        "avatarTracking.lowQualityMaxInferenceFps 不可高於 avatarTracking.maxInferenceFps。",
      );
    }
    requiredNumber(
      avatarTracking,
      "initializationTimeoutMs",
      "avatarTracking",
      issues,
      { min: 1_000 },
    );
    requiredNumber(avatarTracking, "smoothing", "avatarTracking", issues, {
      min: 0,
      max: 1,
      minExclusive: true,
    });
    requiredNumber(avatarTracking, "lostHoldMs", "avatarTracking", issues, {
      min: 0,
    });
    requiredNumber(avatarTracking, "relaxMs", "avatarTracking", issues, {
      min: 0,
      minExclusive: true,
    });

    const hands = recordAt(
      avatarTracking.hands,
      "avatarTracking.hands",
      issues,
    );
    if (hands) {
      requiredBoolean(hands, "enabled", "avatarTracking.hands", issues);
      requiredString(hands, "modelPath", "avatarTracking.hands", issues);
      requiredNumber(hands, "roiScale", "avatarTracking.hands", issues, {
        min: 0,
        minExclusive: true,
      });
      requiredBoolean(
        hands,
        "handednessSwap",
        "avatarTracking.hands",
        issues,
      );
      requiredNumber(
        hands,
        "minDetectionConfidence",
        "avatarTracking.hands",
        issues,
        { min: 0, max: 1 },
      );
      requiredNumber(
        hands,
        "minPresenceConfidence",
        "avatarTracking.hands",
        issues,
        { min: 0, max: 1 },
      );
      requiredNumber(
        hands,
        "minTrackingConfidence",
        "avatarTracking.hands",
        issues,
        { min: 0, max: 1 },
      );
    }

    const face = recordAt(
      avatarTracking.face,
      "avatarTracking.face",
      issues,
    );
    if (face) {
      requiredBoolean(face, "enabled", "avatarTracking.face", issues);
      requiredString(face, "modelPath", "avatarTracking.face", issues);
      requiredNumber(
        face,
        "minDetectionConfidence",
        "avatarTracking.face",
        issues,
        { min: 0, max: 1 },
      );
      requiredNumber(
        face,
        "minPresenceConfidence",
        "avatarTracking.face",
        issues,
        { min: 0, max: 1 },
      );
      requiredNumber(
        face,
        "minTrackingConfidence",
        "avatarTracking.face",
        issues,
        { min: 0, max: 1 },
      );
    }
  }

  const leaderboard = recordAt(config.leaderboard, "leaderboard", issues);
  if (leaderboard) {
    requiredNumber(leaderboard, "limit", "leaderboard", issues, {
      integer: true,
      min: 1,
    });
    requiredNumber(
      leaderboard,
      "nameMaxLength",
      "leaderboard",
      issues,
      {
        integer: true,
        min: 1,
      },
    );
  }

  const effects = recordAt(config.effects, "effects", issues);
  if (effects) {
    if (
      effects.defaultQuality !== "low" &&
      effects.defaultQuality !== "high"
    ) {
      issues.push(`effects.defaultQuality 必須是 low 或 high。`);
    }
    requiredBoolean(effects, "audioEnabled", "effects", issues);
  }

  if (!Array.isArray(config.poses) || config.poses.length === 0) {
    issues.push(`poses 必須至少包含一個瑜珈姿勢。`);
  } else {
    const poseIds = new Map<string, number>();
    config.poses.forEach((pose, index) => {
      validatePose(pose, index, issues);
      if (isRecord(pose) && typeof pose.id === "string" && pose.id.trim()) {
        const normalizedId = pose.id.trim().toLocaleLowerCase();
        const previousIndex = poseIds.get(normalizedId);
        if (previousIndex !== undefined) {
          issues.push(
            `poses[${index}].id 與 poses[${previousIndex}].id 重複；每個姿勢需要唯一 id。`,
          );
        } else {
          poseIds.set(normalizedId, index);
        }
      }
    });
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }
  return config as unknown as GameConfig;
}

/**
 * Returns the score needed to pass a pose. A pose-specific value takes
 * precedence, while older/custom configurations can omit it and keep using
 * the global detection threshold.
 */
export function resolvePoseScoreThreshold(
  pose: PoseDefinition,
  globalThreshold: number,
): number {
  return pose.scoreThreshold ?? globalThreshold;
}

export async function loadGameConfig(
  url = resolvePublicAssetPath("/config/game.json"),
  fetcher?: ConfigFetcher,
): Promise<GameConfig> {
  const request: ConfigFetcher =
    fetcher ??
    (async (requestUrl) => {
      if (typeof globalThis.fetch !== "function") {
        throw new Error("目前環境不支援 fetch。");
      }
      return globalThis.fetch(requestUrl, { cache: "no-store" });
    });

  let response: ConfigResponse;
  try {
    response = await request(url, { cache: "no-store" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`無法載入遊戲設定 ${url}：${reason}`, { cause: error });
  }

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(
      `無法載入遊戲設定 ${url}（HTTP ${response.status}${statusText}）。`,
    );
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    throw new Error(`遊戲設定 ${url} 不是有效的 JSON。`, { cause: error });
  }

  return validateGameConfig(value);
}
