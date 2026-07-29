import { describe, expect, it, vi } from "vitest";

import type { GameConfig } from "../types";
import {
  ConfigValidationError,
  loadGameConfig,
  resolvePoseScoreThreshold,
  validateGameConfig,
} from "./config";

function validConfig(): GameConfig {
  return {
    challengeId: "garden-5",
    title: "魔法花園瑜珈",
    subtitle: "跟著精靈一起伸展",
    avatar: {
      modelPath: "/models/magic-garden-guide.vrm",
      scale: 1,
      cameraDistance: 3,
      mirrored: true,
    },
    timing: {
      countdownSeconds: 3,
      defaultHoldSeconds: 3,
      trackingGraceMs: 500,
      transitionMs: 1200,
    },
    poseDetection: {
      modelPath: "/models/pose_landmarker_full.task",
      wasmPath: "/mediapipe/wasm",
      maxInferenceFps: 24,
      scoreThreshold: 75,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
    },
    avatarTracking: {
      enabled: true,
      maxInferenceFps: 10,
      lowQualityMaxInferenceFps: 6,
      initializationTimeoutMs: 120_000,
      smoothing: 0.38,
      lostHoldMs: 250,
      relaxMs: 300,
      hands: {
        enabled: true,
        modelPath: "/models/hand_landmarker.task",
        roiScale: 1.6,
        handednessSwap: false,
        minDetectionConfidence: 0.5,
        minPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      },
      face: {
        enabled: true,
        modelPath: "/models/face_landmarker.task",
        minDetectionConfidence: 0.5,
        minPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      },
    },
    leaderboard: {
      limit: 10,
      nameMaxLength: 12,
    },
    effects: {
      defaultQuality: "high",
      audioEnabled: true,
    },
    poses: [
      {
        id: "mountain",
        name: "山式",
        englishName: "Mountain",
        imagePath: "/images/poses/mountain.svg",
        instruction: "雙腳站穩，手臂自然垂下。",
        orientation: "front",
        allowMirrored: true,
        minimumVisibility: 0.6,
        constraints: [
          {
            type: "angle",
            points: ["leftShoulder", "leftElbow", "leftWrist"],
            target: 175,
            tolerance: 15,
            weight: 1,
            hint: "把手臂伸直。",
          },
          {
            type: "relativePosition",
            a: "leftWrist",
            b: "leftHip",
            axis: "y",
            relation: "greater",
            margin: 0,
            tolerance: 0.15,
            weight: 0.5,
            hint: "手放低一點。",
          },
          {
            type: "distanceRatio",
            a: "leftAnkle",
            b: "rightAnkle",
            referenceA: "leftShoulder",
            referenceB: "rightShoulder",
            target: 0.5,
            tolerance: 0.2,
            weight: 0.5,
            hint: "雙腳靠近一些。",
          },
        ],
      },
    ],
  };
}

describe("validateGameConfig", () => {
  it("accepts a complete configuration and preserves its typed data", () => {
    const config = validConfig();

    expect(validateGameConfig(config)).toBe(config);
  });

  it("accepts an optional per-pose score threshold from 0 through 100", () => {
    const lowerBoundary = validConfig();
    lowerBoundary.poses[0].scoreThreshold = 0;
    expect(validateGameConfig(lowerBoundary).poses[0].scoreThreshold).toBe(0);

    const upperBoundary = validConfig();
    upperBoundary.poses[0].scoreThreshold = 100;
    expect(validateGameConfig(upperBoundary).poses[0].scoreThreshold).toBe(100);
  });

  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid per-pose score threshold: %s",
    (scoreThreshold) => {
      const config = validConfig();
      config.poses[0].scoreThreshold = scoreThreshold;

      expect(() => validateGameConfig(config)).toThrow(
        /poses\[0\]\.scoreThreshold/,
      );
    },
  );

  it("uses the pose threshold when set and the global threshold when omitted", () => {
    const config = validConfig();
    const pose = config.poses[0];

    expect(
      resolvePoseScoreThreshold(
        { ...pose, scoreThreshold: 68 },
        config.poseDetection.scoreThreshold,
      ),
    ).toBe(68);
    expect(
      resolvePoseScoreThreshold(
        { ...pose, scoreThreshold: undefined },
        config.poseDetection.scoreThreshold,
      ),
    ).toBe(75);
  });

  it("validates display-only hand and face tracking parameters", () => {
    const config = validConfig();
    config.avatarTracking.maxInferenceFps = 0;
    config.avatarTracking.lowQualityMaxInferenceFps = 12;
    config.avatarTracking.initializationTimeoutMs = 999;
    config.avatarTracking.smoothing = 1.1;
    config.avatarTracking.hands.roiScale = 0;
    config.avatarTracking.face.minPresenceConfidence = -0.1;

    expect(() => validateGameConfig(config)).toThrow(ConfigValidationError);
    try {
      validateGameConfig(config);
    } catch (error) {
      expect((error as ConfigValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining("avatarTracking.maxInferenceFps"),
          expect.stringContaining(
            "avatarTracking.lowQualityMaxInferenceFps",
          ),
          expect.stringContaining(
            "avatarTracking.initializationTimeoutMs",
          ),
          expect.stringContaining("avatarTracking.smoothing"),
          expect.stringContaining("avatarTracking.hands.roiScale"),
          expect.stringContaining(
            "avatarTracking.face.minPresenceConfidence",
          ),
        ]),
      );
    }
  });

  it("reports all nested problems with actionable Traditional Chinese paths", () => {
    const config = validConfig() as unknown as Record<string, unknown>;
    config.challengeId = " ";
    config.avatar = {
      ...(validConfig().avatar as object),
      mirrored: "yes",
    };
    config.timing = {
      countdownSeconds: -1,
      defaultHoldSeconds: 0,
      trackingGraceMs: -50,
      transitionMs: 100,
    };
    config.poses = [
      {
        ...(validConfig().poses[0] as object),
        id: "same",
        minimumVisibility: 2,
        constraints: [
          {
            type: "angle",
            points: ["notALandmark", "leftElbow"],
            target: 220,
            tolerance: 0,
            weight: 0,
            hint: "",
          },
        ],
      },
      {
        ...(validConfig().poses[0] as object),
        id: "SAME",
      },
    ];

    expect(() => validateGameConfig(config)).toThrow(ConfigValidationError);

    try {
      validateGameConfig(config);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const validationError = error as ConfigValidationError;
      expect(validationError.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining("設定檔.challengeId"),
          expect.stringContaining("avatar.mirrored"),
          expect.stringContaining("timing.countdownSeconds"),
          expect.stringContaining("poses[0].minimumVisibility"),
          expect.stringContaining("poses[0].constraints[0].points"),
          expect.stringContaining("poses[1].id"),
        ]),
      );
      expect(validationError.message).toContain("遊戲設定有誤");
    }
  });

  it("rejects each unsupported constraint discriminator", () => {
    const config = validConfig() as unknown as {
      poses: Array<{ constraints: unknown[] }>;
    };
    config.poses[0].constraints = [{ type: "magic" }];

    expect(() => validateGameConfig(config)).toThrow(
      /angle、relativePosition 或 distanceRatio/,
    );
  });
});

describe("loadGameConfig", () => {
  it("fetches the default URL and validates the JSON", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => validConfig(),
    }));

    await expect(loadGameConfig(undefined, fetcher)).resolves.toMatchObject({
      challengeId: "garden-5",
    });
    expect(fetcher).toHaveBeenCalledWith("/config/game.json", {
      cache: "no-store",
    });
  });

  it("defaults the avatar initialization timeout for cached older configs", () => {
    const config = validConfig() as unknown as {
      avatarTracking: Record<string, unknown>;
    };
    delete config.avatarTracking.initializationTimeoutMs;

    expect(
      validateGameConfig(config).avatarTracking.initializationTimeoutMs,
    ).toBe(120_000);
  });

  it("explains HTTP and malformed JSON failures", async () => {
    const notFound = async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
    });
    const badJson = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new SyntaxError("bad JSON");
      },
    });

    await expect(loadGameConfig("/missing.json", notFound)).rejects.toThrow(
      /HTTP 404 Not Found/,
    );
    await expect(loadGameConfig("/broken.json", badJson)).rejects.toThrow(
      /不是有效的 JSON/,
    );
  });

  it("adds the requested URL to network failure messages", async () => {
    const fetcher = async () => {
      throw new Error("離線");
    };

    await expect(loadGameConfig("/config/custom.json", fetcher)).rejects.toThrow(
      "無法載入遊戲設定 /config/custom.json：離線",
    );
  });
});
