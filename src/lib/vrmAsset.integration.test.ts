/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface VrmMeta {
  name?: unknown;
  authors?: unknown;
  avatarPermission?: unknown;
  commercialUsage?: unknown;
  creditNotation?: unknown;
  allowRedistribution?: unknown;
  modification?: unknown;
}

function readVrmMeta(path: string): VrmMeta {
  const file = readFileSync(path);
  expect(file.readUInt32LE(0)).toBe(0x46546c67);
  expect(file.readUInt32LE(4)).toBe(2);
  expect(file.readUInt32LE(16)).toBe(0x4e4f534a);

  const jsonLength = file.readUInt32LE(12);
  const document = JSON.parse(
    file.subarray(20, 20 + jsonLength).toString("utf8").trimEnd(),
  ) as {
    extensions?: {
      VRMC_vrm?: {
        meta?: VrmMeta;
      };
    };
  };

  const meta = document.extensions?.VRMC_vrm?.meta;
  expect(meta).toBeDefined();
  return meta ?? {};
}

describe("shipped VRM guide model", () => {
  it("uses the public product name and publishable metadata", () => {
    const workspace = resolve(import.meta.dirname, "../..");
    const meta = readVrmMeta(
      resolve(workspace, "public/models/magic-garden-guide.vrm"),
    );

    expect(meta.name).toBe("Magic Garden Guide");
    expect(meta.authors).toEqual(["NHRI"]);
    expect(meta.avatarPermission).toBe("everyone");
    expect(meta.commercialUsage).toBe("corporation");
    expect(meta.creditNotation).toBe("unnecessary");
    expect(meta.allowRedistribution).toBe(true);
    expect(meta.modification).toBe("allowModificationRedistribution");
  });
});
