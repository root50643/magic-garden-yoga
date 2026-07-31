import { useEffect, useRef, type RefObject } from "react";
import type {
  AvatarMotionFrame,
  DetectedPose,
  Landmark,
} from "../types";

interface SkeletonOverlayProps {
  pose: DetectedPose | null;
  avatarMotion?: AvatarMotionFrame | null;
  passing: boolean;
  active: boolean;
  detailed?: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
}

type Connection = readonly [number, number];

const BODY_CONNECTIONS: readonly Connection[] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
];

/** MediaPipe Hand Landmarker's standard 21-point topology. */
export const HAND_CONNECTIONS: readonly Connection[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

/**
 * Face Landmarker contours. Each path follows MediaPipe's 478-point face
 * topology and is intentionally much lighter than the body skeleton.
 */
export const FACE_CONTOURS: readonly (readonly number[])[] = [
  // Face oval.
  [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397,
    365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58,
    132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
  ],
  // Eyes.
  [
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159,
    160, 161, 246, 33,
  ],
  [
    362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387,
    386, 385, 384, 398, 362,
  ],
  // Eyebrows (upper and lower edges).
  [70, 63, 105, 66, 107],
  [46, 53, 52, 65, 55],
  [336, 296, 334, 293, 300],
  [285, 295, 282, 283, 276],
  // Outer and inner lips.
  [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270,
    269, 267, 0, 37, 39, 40, 185, 61,
  ],
  [
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310,
    311, 312, 13, 82, 81, 80, 191, 78,
  ],
];

export interface FaceOverlayGeometry {
  contours: number[][];
  meshPointIndices: number[];
}

/**
 * Returns only geometry supported by the current face model. Low-detail mode
 * keeps the expressive contours but omits the dense mesh dots.
 */
export function getFaceOverlayGeometry(
  landmarkCount: number,
  detailed: boolean,
): FaceOverlayGeometry {
  const safeCount = Number.isFinite(landmarkCount)
    ? Math.max(0, Math.floor(landmarkCount))
    : 0;
  return {
    contours: FACE_CONTOURS.map((path) =>
      path.filter((index) => index < safeCount),
    ).filter((path) => path.length >= 2),
    meshPointIndices: detailed
      ? Array.from({ length: safeCount }, (_, index) => index)
      : [],
  };
}

export interface CoverPoint {
  x: number;
  y: number;
}

/**
 * Maps MediaPipe's source-image coordinates to a centered `object-fit: cover`
 * viewport. The camera video is mirrored with CSS, while the overlay is not,
 * so mirroring is included in the coordinate mapping.
 */
export function mapNormalizedPointToCover(
  point: CoverPoint,
  containerWidth: number,
  containerHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  mirrored = true,
): CoverPoint {
  if (
    !Number.isFinite(containerWidth) ||
    !Number.isFinite(containerHeight) ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    return { x: 0, y: 0 };
  }

  const validSource =
    Number.isFinite(sourceWidth) &&
    Number.isFinite(sourceHeight) &&
    sourceWidth > 0 &&
    sourceHeight > 0;
  const resolvedSourceWidth = validSource ? sourceWidth : containerWidth;
  const resolvedSourceHeight = validSource ? sourceHeight : containerHeight;
  const coverScale = Math.max(
    containerWidth / resolvedSourceWidth,
    containerHeight / resolvedSourceHeight,
  );
  const renderedWidth = resolvedSourceWidth * coverScale;
  const renderedHeight = resolvedSourceHeight * coverScale;
  const offsetX = (containerWidth - renderedWidth) / 2;
  const offsetY = (containerHeight - renderedHeight) / 2;

  return {
    x: offsetX + (mirrored ? 1 - point.x : point.x) * renderedWidth,
    y: offsetY + point.y * renderedHeight,
  };
}

export function SkeletonOverlay({
  pose,
  avatarMotion = null,
  passing,
  active,
  detailed = true,
  videoRef,
}: SkeletonOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      if (!active) return;

      const video = videoRef.current;
      const sourceWidth = video?.videoWidth ?? 0;
      const sourceHeight = video?.videoHeight ?? 0;
      const mapPoint = (point: CoverPoint) =>
        mapNormalizedPointToCover(
          point,
          rect.width,
          rect.height,
          sourceWidth,
          sourceHeight,
        );

      const isUsable = (
        point: Landmark | null | undefined,
        minVisibility = 0,
      ): point is Landmark =>
        Boolean(
          point &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.visibility >= minVisibility,
        );

      const strokeConnections = (
        points: Landmark[],
        connections: readonly Connection[],
      ) => {
        for (const [from, to] of connections) {
          const a = points[from];
          const b = points[to];
          if (!isUsable(a) || !isUsable(b)) continue;
          const mappedA = mapPoint(a);
          const mappedB = mapPoint(b);
          context.beginPath();
          context.moveTo(mappedA.x, mappedA.y);
          context.lineTo(mappedB.x, mappedB.y);
          context.stroke();
        }
      };

      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";

      const facePoints = avatarMotion?.face?.landmarks;
      if (facePoints && facePoints.length > 0) {
        const geometry = getFaceOverlayGeometry(
          facePoints.length,
          detailed,
        );

        // Tiny, translucent dots provide the familiar Face Mesh feedback
        // without covering the camera image.
        if (geometry.meshPointIndices.length > 0) {
          context.shadowBlur = 0;
          context.fillStyle = "rgba(151, 245, 235, 0.34)";
          const meshRadius = Math.max(0.65, rect.width / 720);
          for (const index of geometry.meshPointIndices) {
            const point = facePoints[index];
            if (!isUsable(point)) continue;
            const mapped = mapPoint(point);
            context.beginPath();
            context.arc(
              mapped.x,
              mapped.y,
              meshRadius,
              0,
              Math.PI * 2,
            );
            context.fill();
          }
        }

        context.strokeStyle = "rgba(139, 247, 232, 0.88)";
        context.lineWidth = Math.max(1.1, rect.width / 430);
        context.shadowColor = "#8bf7e8";
        context.shadowBlur = detailed ? 3 : 1;
        for (const contour of geometry.contours) {
          let drawing = false;
          context.beginPath();
          for (const index of contour) {
            const point = facePoints[index];
            if (!isUsable(point)) {
              drawing = false;
              continue;
            }
            const mapped = mapPoint(point);
            if (drawing) context.lineTo(mapped.x, mapped.y);
            else {
              context.moveTo(mapped.x, mapped.y);
              drawing = true;
            }
          }
          context.stroke();
        }
      }

      if (pose) {
        const points = pose.landmarks;
        const color = passing ? "#8ff4c9" : "#f7cf7c";
        context.shadowColor = color;
        context.shadowBlur = passing ? 12 : 7;
        context.strokeStyle = color;
        context.lineWidth = Math.max(3, rect.width / 170);

        const visibleBodyConnections = BODY_CONNECTIONS.filter(
          ([from, to]) =>
            isUsable(points[from], 0.35) &&
            isUsable(points[to], 0.35),
        );
        strokeConnections(points, visibleBodyConnections);

        context.shadowBlur = 4;
        context.fillStyle = "#fff9e8";
        for (const index of [
          11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28,
        ]) {
          const point = points[index];
          if (!isUsable(point, 0.35)) continue;
          const mapped = mapPoint(point);
          context.beginPath();
          context.arc(
            mapped.x,
            mapped.y,
            Math.max(3.5, rect.width / 125),
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }

      context.strokeStyle = "rgba(255, 184, 226, 0.94)";
      context.lineWidth = Math.max(1.8, rect.width / 280);
      context.shadowColor = "#ff9bd7";
      context.shadowBlur = detailed ? 5 : 2;
      for (const hand of avatarMotion?.hands ?? []) {
        strokeConnections(hand.landmarks, HAND_CONNECTIONS);

        if (!detailed) continue;
        context.fillStyle = "rgba(255, 239, 249, 0.94)";
        context.shadowBlur = 2;
        const radius = Math.max(1.6, rect.width / 310);
        for (const point of hand.landmarks) {
          if (!isUsable(point)) continue;
          const mapped = mapPoint(point);
          context.beginPath();
          context.arc(mapped.x, mapped.y, radius, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.restore();
    };

    draw();
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    const video = videoRef.current;
    video?.addEventListener("loadedmetadata", draw);
    video?.addEventListener("resize", draw);
    return () => {
      resizeObserver.disconnect();
      video?.removeEventListener("loadedmetadata", draw);
      video?.removeEventListener("resize", draw);
    };
  }, [active, avatarMotion, detailed, passing, pose, videoRef]);

  return <canvas ref={canvasRef} className="skeleton-overlay" aria-hidden="true" />;
}
