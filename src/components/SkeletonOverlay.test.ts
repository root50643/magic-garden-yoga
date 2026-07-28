import { describe, expect, it } from "vitest";
import { mapNormalizedPointToCover } from "./SkeletonOverlay";

describe("mapNormalizedPointToCover", () => {
  it("maps a matching aspect ratio directly and mirrors x", () => {
    expect(
      mapNormalizedPointToCover(
        { x: 0.25, y: 0.75 },
        640,
        360,
        1280,
        720,
      ),
    ).toEqual({ x: 480, y: 270 });
  });

  it("accounts for horizontal cropping when a wide video covers a tall panel", () => {
    const center = mapNormalizedPointToCover(
      { x: 0.5, y: 0.5 },
      600,
      600,
      1280,
      720,
    );
    const sourceLeft = mapNormalizedPointToCover(
      { x: 0, y: 0.5 },
      600,
      600,
      1280,
      720,
    );

    expect(center).toEqual({ x: 300, y: 300 });
    // The unmirrored source's left edge becomes the mirrored right edge, which
    // lies beyond the panel because `cover` crops both horizontal sides.
    expect(sourceLeft.x).toBeCloseTo(833.333333);
  });

  it("accounts for vertical cropping and can map without mirroring", () => {
    const topLeft = mapNormalizedPointToCover(
      { x: 0, y: 0 },
      800,
      300,
      800,
      800,
      false,
    );

    expect(topLeft.x).toBe(0);
    expect(topLeft.y).toBe(-250);
  });

  it("falls back to direct container mapping before video metadata is ready", () => {
    expect(
      mapNormalizedPointToCover(
        { x: 0.2, y: 0.4 },
        500,
        250,
        0,
        0,
      ),
    ).toEqual({ x: 400, y: 100 });
  });
});
