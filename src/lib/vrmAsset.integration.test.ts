/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FINGER_JOINT_DEFINITIONS } from "./avatarMotion";

interface VrmMeta {
  name?: unknown;
  authors?: unknown;
  avatarPermission?: unknown;
  commercialUsage?: unknown;
  creditNotation?: unknown;
  allowRedistribution?: unknown;
  modification?: unknown;
}

interface VrmExtension {
  meta?: VrmMeta;
  humanoid?: {
    humanBones?: Record<string, unknown>;
  };
  expressions?: {
    preset?: Record<string, unknown>;
  };
}

function readVrmExtension(path: string): VrmExtension {
  const file = readFileSync(path);
  expect(file.readUInt32LE(0)).toBe(0x46546c67);
  expect(file.readUInt32LE(4)).toBe(2);
  expect(file.readUInt32LE(16)).toBe(0x4e4f534a);

  const jsonLength = file.readUInt32LE(12);
  const document = JSON.parse(
    file.subarray(20, 20 + jsonLength).toString("utf8").trimEnd(),
  ) as {
    extensions?: {
      VRMC_vrm?: VrmExtension;
    };
  };

  const extension = document.extensions?.VRMC_vrm;
  expect(extension).toBeDefined();
  return extension ?? {};
}

describe("shipped VRM guide model", () => {
  it("uses the public product name and publishable metadata", () => {
    const workspace = resolve(import.meta.dirname, "../..");
    const meta = readVrmExtension(
      resolve(workspace, "public/models/magic-garden-guide.vrm"),
    ).meta;

    expect(meta?.name).toBe("Magic Garden Guide");
    expect(meta?.authors).toEqual(["NHRI"]);
    expect(meta?.avatarPermission).toBe("everyone");
    expect(meta?.commercialUsage).toBe("corporation");
    expect(meta?.creditNotation).toBe("unnecessary");
    expect(meta?.allowRedistribution).toBe(true);
    expect(meta?.modification).toBe("allowModificationRedistribution");
  });

  it("contains all finger bones and facial presets needed for live motion", () => {
    const workspace = resolve(import.meta.dirname, "../..");
    const extension = readVrmExtension(
      resolve(workspace, "public/models/magic-garden-guide.vrm"),
    );
    const humanBones = extension.humanoid?.humanBones ?? {};
    const presets = extension.expressions?.preset ?? {};

    for (const definition of FINGER_JOINT_DEFINITIONS) {
      expect(humanBones, `缺少 ${definition.leftBone}`).toHaveProperty(
        definition.leftBone,
      );
      expect(humanBones, `缺少 ${definition.rightBone}`).toHaveProperty(
        definition.rightBone,
      );
    }
    for (const preset of [
      "aa",
      "ih",
      "ou",
      "ee",
      "oh",
      "blink",
      "blinkLeft",
      "blinkRight",
    ]) {
      expect(presets, `缺少 ${preset} 表情`).toHaveProperty(preset);
    }
  });
});
