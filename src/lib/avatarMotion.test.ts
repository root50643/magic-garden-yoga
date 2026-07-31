import { describe, expect, it } from "vitest";

import type { Landmark } from "../types";
import {
  FINGER_JOINT_DEFINITIONS,
  calculateHandArticulation,
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

function openHand(): Landmark[] {
  const landmarks = Array.from({ length: 21 }, () => point(0, 0));
  landmarks[0] = point(0, 0);
  landmarks[1] = point(-0.42, 0.18, 0.01);
  landmarks[2] = point(-0.72, 0.38, 0.02);
  landmarks[3] = point(-1.02, 0.6, 0.03);
  landmarks[4] = point(-1.3, 0.82, 0.04);

  landmarks[5] = point(-0.58, 0.95);
  landmarks[6] = point(-0.6, 1.5);
  landmarks[7] = point(-0.62, 2.02);
  landmarks[8] = point(-0.64, 2.48);
  landmarks[9] = point(-0.18, 1.08);
  landmarks[10] = point(-0.18, 1.72);
  landmarks[11] = point(-0.18, 2.3);
  landmarks[12] = point(-0.18, 2.82);
  landmarks[13] = point(0.22, 1.04);
  landmarks[14] = point(0.25, 1.62);
  landmarks[15] = point(0.27, 2.12);
  landmarks[16] = point(0.29, 2.56);
  landmarks[17] = point(0.58, 0.9);
  landmarks[18] = point(0.67, 1.4);
  landmarks[19] = point(0.72, 1.82);
  landmarks[20] = point(0.76, 2.18);
  return landmarks;
}

function fistHand(): Landmark[] {
  const landmarks = openHand();
  bendFinger(landmarks, 5, 6, 7, 8);
  bendFinger(landmarks, 9, 10, 11, 12);
  bendFinger(landmarks, 13, 14, 15, 16);
  bendFinger(landmarks, 17, 18, 19, 20);
  landmarks[1] = point(-0.42, 0.2);
  landmarks[2] = point(-0.52, 0.55);
  landmarks[3] = point(-0.3, 0.85);
  landmarks[4] = point(0.02, 1.01, -0.03);
  return landmarks;
}

function bendFinger(
  landmarks: Landmark[],
  mcpIndex: number,
  pipIndex: number,
  dipIndex: number,
  tipIndex: number,
): void {
  const mcp = landmarks[mcpIndex];
  landmarks[pipIndex] = point(mcp.x + 0.34, mcp.y + 0.04, 0.04);
  landmarks[dipIndex] = point(mcp.x + 0.3, mcp.y - 0.3, 0.08);
  landmarks[tipIndex] = point(mcp.x + 0.02, mcp.y - 0.42, 0.05);
}

function victoryHand(): Landmark[] {
  const landmarks = openHand();
  // Index and middle stay extended and visibly abduct, while ring and little
  // fold into the palm.
  landmarks[6] = point(-0.93, 1.46, 0.01);
  landmarks[7] = point(-1.24, 1.9, 0.015);
  landmarks[8] = point(-1.5, 2.28, 0.02);
  landmarks[10] = point(0.08, 1.67, -0.01);
  landmarks[11] = point(0.27, 2.2, -0.015);
  landmarks[12] = point(0.45, 2.68, -0.02);
  bendFinger(landmarks, 13, 14, 15, 16);
  bendFinger(landmarks, 17, 18, 19, 20);
  landmarks[1] = point(-0.4, 0.2);
  landmarks[2] = point(-0.42, 0.52);
  landmarks[3] = point(-0.2, 0.79);
  landmarks[4] = point(-0.02, 0.96, -0.02);
  return landmarks;
}

function noisyOpenHand(): Landmark[] {
  return openHand().map((entry, index) =>
    point(
      entry.x + ((index % 3) - 1) * 0.006,
      entry.y + (((index + 1) % 3) - 1) * 0.005,
      entry.z + (((index + 2) % 3) - 1) * 0.007,
    ),
  );
}

function transformHand(
  landmarks: readonly Landmark[],
  mirror: boolean,
): Landmark[] {
  return landmarks.map((entry) => {
    const mirroredX = (mirror ? -1 : 1) * entry.x;
    const angle = 0.73;
    const rotatedX =
      mirroredX * Math.cos(angle) - entry.y * Math.sin(angle);
    const rotatedY =
      mirroredX * Math.sin(angle) + entry.y * Math.cos(angle);
    const pitch = 0.41;
    const pitchedY =
      rotatedY * Math.cos(pitch) - entry.z * Math.sin(pitch);
    const pitchedZ =
      rotatedY * Math.sin(pitch) + entry.z * Math.cos(pitch);
    return point(
      rotatedX * 2.8 + 4,
      pitchedY * 2.8 - 7,
      pitchedZ * 2.8 + 2,
    );
  });
}

function pinchHand(): Landmark[] {
  const landmarks = openHand();
  landmarks[1] = point(-0.4, 0.2);
  landmarks[2] = point(-0.62, 0.68);
  landmarks[3] = point(-0.64, 1.5);
  landmarks[4] = { ...landmarks[8] };
  return landmarks;
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

describe("hand articulation", () => {
  it("maps a slightly noisy straight hand to neutral finger curls", () => {
    const curls = calculateFingerCurls(noisyOpenHand());

    for (const value of Object.values(curls)) {
      expect(value).toBeLessThan(0.035);
    }
  });

  it("makes an open and closed V gesture visibly different", () => {
    const closed = openHand();
    closed[6] = point(-0.57, 1.55);
    closed[10] = point(-0.17, 1.72);
    const victory = victoryHand();

    const closedTargets = calculateHandArticulation(closed);
    const victoryTargets = calculateHandArticulation(victory);
    const closedSeparation = Math.abs(
      closedTargets.spreads.index - closedTargets.spreads.middle,
    );
    const victorySeparation = Math.abs(
      victoryTargets.spreads.index - victoryTargets.spreads.middle,
    );

    expect(victorySeparation).toBeGreaterThan(closedSeparation + 0.25);
    expect(victoryTargets.spreads.index).toBeLessThan(
      victoryTargets.spreads.middle,
    );
    expect(victoryTargets.curls.indexProximal).toBeLessThan(0.05);
    expect(victoryTargets.curls.middleProximal).toBeLessThan(0.05);
    expect(victoryTargets.curls.ringIntermediate).toBeGreaterThan(0.8);
    expect(victoryTargets.curls.littleIntermediate).toBeGreaterThan(0.8);
  });

  it("separates open, victory, pinch, and fist thumb signals", () => {
    const open = calculateHandArticulation(openHand());
    const victory = calculateHandArticulation(victoryHand());
    const pinch = calculateHandArticulation(pinchHand());
    const fist = calculateHandArticulation(fistHand());

    expect(open.thumb.closure).toBeLessThan(0.03);
    expect(open.thumb.opposition).toBeLessThan(0.03);
    expect(victory.thumb.closure).toBeLessThan(0.15);
    expect(victory.thumb.opposition).toBeLessThan(0.3);
    expect(pinch.thumb.closure).toBeLessThan(0.08);
    expect(pinch.thumb.opposition).toBeGreaterThan(0.5);
    expect(pinch.thumb.opposition).toBeLessThanOrEqual(0.58);
    expect(fist.thumb.closure).toBeGreaterThan(0.7);
    expect(fist.thumb.closure).toBeLessThanOrEqual(0.78);
    expect(fist.thumb.opposition).toBeGreaterThan(0.6);
    expect(fist.thumb.opposition).toBeLessThanOrEqual(0.72);
    expect(fist.thumb.target.x).toBeGreaterThan(open.thumb.target.x);
  });

  it("does not mistake a thumb-index pinch for a complete fist", () => {
    const targets = calculateHandArticulation(pinchHand());

    expect(targets.thumb.opposition).toBeCloseTo(0.58, 5);
    expect(targets.thumb.closure).toBeLessThan(0.08);
  });

  it("is invariant to translation, rotation, scale, and left/right mirror", () => {
    for (const source of [openHand(), victoryHand(), fistHand()]) {
      const original = calculateHandArticulation(source);
      const transformed = calculateHandArticulation(
        transformHand(source, false),
        "right",
      );
      const mirrored = calculateHandArticulation(
        transformHand(source, true),
        "left",
      );

      for (const targets of [transformed, mirrored]) {
        for (const name of [
          "index",
          "middle",
          "ring",
          "little",
        ] as const) {
          expect(targets.spreads[name]).toBeCloseTo(
            original.spreads[name],
            10,
          );
        }
        for (const definition of FINGER_JOINT_DEFINITIONS) {
          expect(targets.curls[definition.name]).toBeCloseTo(
            original.curls[definition.name],
            10,
          );
        }
        expect(targets.thumb.closure).toBeCloseTo(
          original.thumb.closure,
          10,
        );
        expect(targets.thumb.opposition).toBeCloseTo(
          original.thumb.opposition,
          10,
        );
        expect(targets.thumb.target.x).toBeCloseTo(
          original.thumb.target.x,
          10,
        );
        expect(targets.thumb.target.y).toBeCloseTo(
          original.thumb.target.y,
          10,
        );
        expect(targets.thumb.target.z).toBeCloseTo(
          original.thumb.target.z,
          10,
        );
      }
    }
  });

  it("bounds finite landmark outliers to anatomical signal ranges", () => {
    const outlier = fistHand();
    outlier[4] = point(1e9, -1e9, 1e9);
    outlier[6] = point(-1e8, 1e8, -1e8);

    const targets = calculateHandArticulation(outlier);

    for (const definition of FINGER_JOINT_DEFINITIONS) {
      expect(targets.curls[definition.name]).toBeGreaterThanOrEqual(0);
      expect(targets.curls[definition.name]).toBeLessThanOrEqual(
        definition.maximumCurl,
      );
    }
    for (const spread of Object.values(targets.spreads)) {
      expect(Number.isFinite(spread)).toBe(true);
      expect(Math.abs(spread)).toBeLessThanOrEqual(0.9);
    }
    expect(targets.thumb.target.x).toBeGreaterThanOrEqual(-1.6);
    expect(targets.thumb.target.x).toBeLessThanOrEqual(0.65);
    expect(targets.thumb.target.y).toBeGreaterThanOrEqual(-0.55);
    expect(targets.thumb.target.y).toBeLessThanOrEqual(1.55);
    expect(targets.thumb.target.z).toBeGreaterThanOrEqual(-0.8);
    expect(targets.thumb.target.z).toBeLessThanOrEqual(0.8);
    expect(targets.thumb.closure).toBeLessThanOrEqual(0.78);
    expect(targets.thumb.opposition).toBeLessThanOrEqual(0.72);
  });

  it("returns finite neutral targets for degenerate or incomplete input", () => {
    const degenerate = Array.from({ length: 21 }, () => point(1, 1, 1));
    degenerate[10].x = Number.NaN;

    for (const targets of [
      calculateHandArticulation(degenerate),
      calculateHandArticulation(degenerate.slice(0, 12)),
    ]) {
      expect(Object.values(targets.curls).every(Number.isFinite)).toBe(true);
      expect(Object.values(targets.spreads)).toEqual([0, 0, 0, 0]);
      expect(Object.values(targets.thumb.target)).toEqual([0, 0, 0]);
      expect(targets.thumb.closure).toBe(0);
      expect(targets.thumb.opposition).toBe(0);
    }
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
