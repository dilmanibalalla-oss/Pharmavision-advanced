export type Point2 = { x: number; y: number };

export const CORNER_LABELS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'] as const;

export const DEFAULT_CORNERS: [Point2, Point2, Point2, Point2] = [
  { x: 0.18, y: 0.22 },
  { x: 0.82, y: 0.22 },
  { x: 0.82, y: 0.78 },
  { x: 0.18, y: 0.78 },
];

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function span(a: Point2, b: Point2) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function boundarySize(corners: Point2[]) {
  return {
    width: Number(span(corners[0], corners[1]).toFixed(4)),
    height: Number(span(corners[0], corners[3]).toFixed(4)),
  };
}

export function cornersValid(corners: Point2[]) {
  if (corners.length !== 4) return 'Place all four shelf corners';
  const { width, height } = boundarySize(corners);
  if (width < 0.05 || height < 0.05) return 'Move the corners so the shelf outline is large enough to see';
  return '';
}
