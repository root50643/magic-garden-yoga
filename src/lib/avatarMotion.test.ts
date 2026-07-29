import { describe, expect, it } from "vitest";

import type { Landmark } from "../types";
import {
  FINGER_JOINT_DEFINITIONS,
  calculatePalmBasis,
  calculateFingerCurls,
  calculateJointCurl,
  curlAxisFromRestDirection,
  faceBlendshapesToVrmExpressions,
  handSideFromMosaicX,
  halfLifeAlpha,
} from "./avatarMotion";

function point(x: number, y: number, z = 0): Landmark {
  return { x, y, z, visibility: 1, presence: 1 };
}

describe("finger motion", () => {
  it("defines all 15 joints with the expected MediaPipe chains", () => {
    expect(FINGER_JOINT_DEFINITIONS).toHaveLength(15);
    expect(FINGER_JOINT_DEFINITIONS.map(({ name }) => name)).toEqual([
      "thumbMetacarpal",
      "thumbProximal",
      "thumbDistal",
      "indexProximal",
      "indexIntermediate",
      "indexDistal",
      "middleProximal",
      "middleIntermediate",
      "middleDistal",
      "ringProximal",
      "ringIntermediate",
      "ringDistal",
      "littleProximal",
      "littleIntermediate",
      "littleDistal",
    ]);
    expect(FINGER_JOINT_DEFINITIONS[3].points).toEqual([0, 5, 6]);
    expect(FINGER_JOINT_DEFINITIONS[14].points).toEqual([18, 19, 20]);
  });

  it("returns zero for a straight joint and PI/2 for a right angle", () => {
    expect(
      calculateJointCurl(point(-1, 0), point(0, 0), point(1, 0)),
    ).toBeCloseTo(0);
    expect(
      calculateJointCurl(point(-1, 0), point(0, 0), point(0, 1)),
    ).toBeCloseTo(Math.PI / 2);
  });

  it("computes curls without depending on left/right mirroring", () => {
    const open = Array.from({ length: 21 }, (_, index) =>
      point(index, 0),
    );
    const mirrored = open.map(({ x, y, z }) => point(-x, y, z));

    expect(calculateFingerCurls(mirrored)).toEqual(
      calculateFingerCurls(open),
    );
  });

  it("keeps anatomical crop sides independent from display mirroring", () => {
    expect(handSideFromMosaicX(0.25)).toBe("left");
    expect(handSideFromMosaicX(0.75)).toBe("right");
    expect(handSideFromMosaicX(0.25, true)).toBe("right");
    expect(handSideFromMosaicX(0.75, true)).toBe("left");
  });

  it("derives opposite curl axes from mirrored finger rest directions", () => {
    expect(curlAxisFromRestDirection({ x: 1, y: 0, z: 0 })).toEqual({
      x: 0,
      y: 0,
      z: -1,
    });
    expect(curlAxisFromRestDirection({ x: -1, y: 0, z: 0 })).toEqual({
      x: 0,
      y: 0,
      z: 1,
    });
  });
});

describe("palm orientation", () => {
  it("builds an orthonormal frame from wrist and four MCP joints", () => {
    const landmarks = Array.from({ length: 21 }, () => point(0, 0));
    landmarks[0] = point(0, 0);
    landmarks[5] = point(-0.6, 1);
    landmarks[9] = point(-0.2, 1.2);
    landmarks[13] = point(0.2, 1.15);
    landmarks[17] = point(0.6, 1);

    const basis = calculatePalmBasis(landmarks);

    expect(basis).not.toBeNull();
    expect(basis?.longitudinal.y).toBeGreaterThan(0.98);
    expect(basis?.lateral.x).toBeGreaterThan(0.98);
    expect(basis?.normal.z).toBeLessThan(-0.98);
    const dotProduct =
      (basis?.longitudinal.x ?? 0) * (basis?.lateral.x ?? 0) +
      (basis?.longitudinal.y ?? 0) * (basis?.lateral.y ?? 0) +
      (basis?.longitudinal.z ?? 0) * (basis?.lateral.z ?? 0);
    expect(dotProduct).toBeCloseTo(0, 8);
  });

  it("rejects collapsed or nearly collinear palm geometry", () => {
    const collapsed = Array.from({ length: 21 }, () => point(0, 0));
    expect(calculatePalmBasis(collapsed)).toBeNull();

    const collinear = Array.from({ length: 21 }, () => point(0, 0));
    collinear[0] = point(0, 0);
    collinear[5] = point(0, 0.8);
    collinear[9] = point(0, 1);
    collinear[13] = point(0, 1.2);
    collinear[17] = point(0, 1.4);
    expect(calculatePalmBasis(collinear)).toBeNull();
  });

  it("is unchanged by hand translation and uniform scale", () => {
    const landmarks = Array.from({ length: 21 }, () => point(0, 0));
    landmarks[0] = point(0.1, -0.2, 0.15);
    landmarks[5] = point(-0.55, 0.9, -0.05);
    landmarks[9] = point(-0.15, 1.15, 0.04);
    landmarks[13] = point(0.25, 1.1, 0.08);
    landmarks[17] = point(0.62, 0.88, -0.02);
    const transformed = landmarks.map((entry) =>
      point(
        entry.x * 3.4 + 8,
        entry.y * 3.4 - 5,
        entry.z * 3.4 + 2,
      ),
    );

    const original = calculatePalmBasis(landmarks);
    const scaled = calculatePalmBasis(transformed);
    expect(original).not.toBeNull();
    expect(scaled).not.toBeNull();
    for (const axis of ["longitudinal", "lateral", "normal"] as const) {
      expect(scaled?.[axis].x).toBeCloseTo(original?.[axis].x ?? 0, 10);
      expect(scaled?.[axis].y).toBeCloseTo(original?.[axis].y ?? 0, 10);
      expect(scaled?.[axis].z).toBeCloseTo(original?.[axis].z ?? 0, 10);
    }
  });

  it("rejects non-finite palm points", () => {
    const landmarks = Array.from({ length: 21 }, () => point(0, 0));
    landmarks[0] = point(0, 0);
    landmarks[5] = point(-0.5, 1);
    landmarks[9] = point(-0.15, 1.1);
    landmarks[13] = point(0.18, 1.08);
    landmarks[17] = point(0.5, 1);
    landmarks[9].z = Number.NaN;

    expect(calculatePalmBasis(landmarks)).toBeNull();
  });
});

describe("face expression mapping", () => {
  it("keeps mouth weights bounded and selects the expected primary vowel", () => {
    const a = faceBlendshapesToVrmExpressions({ jawOpen: 0.8 });
    const u = faceBlendshapesToVrmExpressions({ mouthPucker: 0.8 });
    const o = faceBlendshapesToVrmExpressions({
      jawOpen: 0.55,
      mouthFunnel: 0.8,
    });

    expect(a.aa).toBeGreaterThan(a.ou);
    expect(u.ou).toBeGreaterThan(u.aa);
    expect(o.oh).toBeGreaterThan(o.aa);
    for (const targets of [a, u, o]) {
      const total = ["aa", "ih", "ou", "ee", "oh"].reduce(
        (sum, name) =>
          sum + targets[name as "aa" | "ih" | "ou" | "ee" | "oh"],
        0,
      );
      expect(total).toBeLessThanOrEqual(1);
      Object.values(targets).forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    }
  });

  it("preserves anatomical left/right blink even for display mirroring", () => {
    const targets = faceBlendshapesToVrmExpressions({
      eyeBlinkLeft: 0.9,
      eyeBlinkRight: 0.05,
    });

    expect(targets.blinkLeft).toBeGreaterThan(0.9);
    expect(targets.blinkRight).toBe(0);
  });

  it("uses time-based smoothing independent of render frame rate", () => {
    const oneFrame = halfLifeAlpha(1 / 60, 0.06);
    const twoFrames =
      1 - (1 - halfLifeAlpha(1 / 120, 0.06)) ** 2;

    expect(twoFrames).toBeCloseTo(oneFrame, 10);
    expect(halfLifeAlpha(0.06, 0.06)).toBeCloseTo(0.5);
  });
});
