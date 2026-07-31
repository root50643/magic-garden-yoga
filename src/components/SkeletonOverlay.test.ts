import { describe, expect, it } from "vitest";
import {
  FACE_CONTOURS,
  HAND_CONNECTIONS,
  getFaceOverlayGeometry,
  mapNormalizedPointToCover,
} from "./SkeletonOverlay";

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

describe("avatar detail overlay geometry", () => {
  it("covers all 21 hand landmarks with the standard hand topology", () => {
    const usedIndices = new Set(HAND_CONNECTIONS.flat());

    expect(HAND_CONNECTIONS).toHaveLength(21);
    expect([...usedIndices].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 21 }, (_, index) => index),
    );
    expect(
      HAND_CONNECTIONS.every(
        ([from, to]) =>
          from >= 0 && from < 21 && to >= 0 && to < 21,
      ),
    ).toBe(true);
  });

  it("keeps face contours in low detail and adds dense points in high detail", () => {
    const lowDetail = getFaceOverlayGeometry(478, false);
    const highDetail = getFaceOverlayGeometry(478, true);

    expect(lowDetail.contours).toHaveLength(FACE_CONTOURS.length);
    expect(lowDetail.meshPointIndices).toEqual([]);
    expect(highDetail.contours).toEqual(lowDetail.contours);
    expect(highDetail.meshPointIndices).toHaveLength(478);
    expect(highDetail.meshPointIndices.at(-1)).toBe(477);
  });

  it("filters unsupported contour points for smaller face models", () => {
    const geometry = getFaceOverlayGeometry(100, false);

    expect(
      geometry.contours.every((path) =>
        path.every((index) => index >= 0 && index < 100),
      ),
    ).toBe(true);
  });

  it("mirrors hand and face source coordinates with the camera preview", () => {
    const left = mapNormalizedPointToCover(
      { x: 0.2, y: 0.4 },
      1000,
      500,
      1000,
      500,
    );
    const right = mapNormalizedPointToCover(
      { x: 0.8, y: 0.4 },
      1000,
      500,
      1000,
      500,
    );

    expect(left.x).toBeCloseTo(800);
    expect(right.x).toBeCloseTo(200);
    expect(left.y).toBe(200);
    expect(right.y).toBe(200);
  });
});
