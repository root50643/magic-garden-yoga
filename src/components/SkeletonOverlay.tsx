import { useEffect, useRef, type RefObject } from "react";
import type { DetectedPose } from "../types";

interface SkeletonOverlayProps {
  pose: DetectedPose | null;
  passing: boolean;
  active: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
}

const CONNECTIONS: Array<[number, number]> = [
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
  passing,
  active,
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
      if (!pose || !active) return;

      const points = pose.landmarks;
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
      const color = passing ? "#8ff4c9" : "#f7cf7c";
      context.lineCap = "round";
      context.lineJoin = "round";
      context.shadowColor = color;
      context.shadowBlur = passing ? 12 : 7;
      context.strokeStyle = color;
      context.lineWidth = Math.max(3, rect.width / 170);

      for (const [from, to] of CONNECTIONS) {
        const a = points[from];
        const b = points[to];
        if (!a || !b || a.visibility < 0.35 || b.visibility < 0.35) continue;
        const mappedA = mapPoint(a);
        const mappedB = mapPoint(b);
        context.beginPath();
        context.moveTo(mappedA.x, mappedA.y);
        context.lineTo(mappedB.x, mappedB.y);
        context.stroke();
      }

      context.shadowBlur = 4;
      context.fillStyle = "#fff9e8";
      for (const index of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
        const point = points[index];
        if (!point || point.visibility < 0.35) continue;
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
  }, [active, passing, pose, videoRef]);

  return <canvas ref={canvasRef} className="skeleton-overlay" aria-hidden="true" />;
}
