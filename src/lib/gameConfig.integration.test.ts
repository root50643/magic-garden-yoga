/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePoseScoreThreshold, validateGameConfig } from "./config";

describe("shipped game configuration", () => {
  it("validates the real JSON and references existing local assets", () => {
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
      ...config.poses.map((pose) => pose.imagePath),
    ];

    for (const assetPath of localPaths) {
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
