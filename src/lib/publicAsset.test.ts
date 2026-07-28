import { describe, expect, it } from "vitest";
import { resolvePublicAssetPath } from "./publicAsset";

describe("resolvePublicAssetPath", () => {
  it("keeps public assets at the origin root for local development", () => {
    expect(resolvePublicAssetPath("/config/game.json", "/")).toBe(
      "/config/game.json",
    );
    expect(resolvePublicAssetPath("assets/poses/tree.png", "/")).toBe(
      "/assets/poses/tree.png",
    );
  });

  it("prefixes every runtime asset with the Pages repository base", () => {
    const base = "/magic-garden-yoga/";

    expect(resolvePublicAssetPath("/models/guide.vrm", base)).toBe(
      "/magic-garden-yoga/models/guide.vrm",
    );
    expect(resolvePublicAssetPath("/mediapipe/wasm", base)).toBe(
      "/magic-garden-yoga/mediapipe/wasm",
    );
    expect(resolvePublicAssetPath("/assets/poses/star.png", base)).toBe(
      "/magic-garden-yoga/assets/poses/star.png",
    );
  });

  it("does not add the repository base more than once", () => {
    expect(
      resolvePublicAssetPath(
        "/magic-garden-yoga/models/guide.vrm",
        "/magic-garden-yoga/",
      ),
    ).toBe("/magic-garden-yoga/models/guide.vrm");
  });

  it("leaves fully qualified and browser-managed URLs unchanged", () => {
    expect(
      resolvePublicAssetPath(
        "https://cdn.example.com/model.vrm",
        "/magic-garden-yoga/",
      ),
    ).toBe("https://cdn.example.com/model.vrm");
    expect(
      resolvePublicAssetPath("blob:https://example.com/id", "/project/"),
    ).toBe("blob:https://example.com/id");
  });

  it("supports an absolute deployment base URL", () => {
    expect(
      resolvePublicAssetPath(
        "/models/guide.vrm",
        "https://example.com/yoga/",
      ),
    ).toBe("https://example.com/yoga/models/guide.vrm");
  });
});
