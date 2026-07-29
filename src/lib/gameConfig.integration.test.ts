/// <reference types="node" />

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePoseScoreThreshold, validateGameConfig } from "./config";

describe("shipped game configuration", () => {
  it("validates local assets and the pinned remote display models", () => {
    const workspace = resolve(import.meta.dirname, "../..");
    const configPath = resolve(workspace, "public/config/game.json");
    const config = validateGameConfig(
      JSON.parse(readFileSync(configPath, "utf8")) as unknown,
    );

    expect(config.poses).toHaveLength(5);
    expect(config.timing.trackingGraceMs).toBe(500);
    expect(config.poseDetection.scoreThreshold).toBe(75);
    expect(config.poses.every((pose) => pose.scoreThreshold !== undefined)).toBe(
      true,
    );
    expect(
      config.poses
        .map((pose) =>
          resolvePoseScoreThreshold(
            pose,
            config.poseDetection.scoreThreshold,
          ),
        )
        .every((threshold) => threshold >= 0 && threshold <= 100),
    ).toBe(true);

    const publicDirectory = resolve(workspace, "public");
    const localPaths = [
      config.avatar.modelPath,
      config.poseDetection.modelPath,
      config.avatarTracking.hands.modelPath,
      config.avatarTracking.face.modelPath,
      ...config.poses.map((pose) => pose.imagePath),
    ];

    for (const assetPath of localPaths) {
      if (/^https?:\/\//u.test(assetPath)) continue;
      const absolutePath = resolve(
        publicDirectory,
        assetPath.replace(/^[/\\]+/u, ""),
      );
      expect(
        () => readFileSync(absolutePath),
        `設定引用的檔案不存在：${assetPath}`,
      ).not.toThrow();
    }

    expect(config.avatar.modelPath).toMatch(/^\/models\/.+\.vrm$/u);
    expect(config.avatarTracking.hands.modelPath).toBe(
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    );
    expect(config.avatarTracking.face.modelPath).toBe(
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    );
    expect(config.poseDetection.wasmPath).toBe(
      "https://unpkg.com/@mediapipe/tasks-vision@0.10.35/wasm",
    );
  });

  it("ships the pinned official hand and face model bundles intact", () => {
    const workspace = resolve(import.meta.dirname, "../..");
    const models = [
      {
        name: "hand_landmarker.task",
        bytes: 7_819_105,
        sha256:
          "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
      },
      {
        name: "face_landmarker.task",
        bytes: 3_758_596,
        sha256:
          "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
      },
    ];

    for (const model of models) {
      const file = readFileSync(
        resolve(workspace, "public/models", model.name),
      );
      expect(file.byteLength).toBe(model.bytes);
      expect(createHash("sha256").update(file).digest("hex")).toBe(
        model.sha256,
      );
    }
  });

  it("allows expanding the pose array without changing application code", () => {
    const workspace = resolve(import.meta.dirname, "../..");
    const config = JSON.parse(
      readFileSync(resolve(workspace, "public/config/game.json"), "utf8"),
    ) as { poses: unknown[] };

    config.poses = Array.from({ length: 10 }, (_, index) => ({
      ...(config.poses[index % config.poses.length] as Record<string, unknown>),
      id: `future-pose-${index + 1}`,
    }));

    expect(validateGameConfig(config).poses).toHaveLength(10);
  });
});
