import type { LaserPath, Point2 } from './laserCam';

export const laserShapeNames = { line: 'Ligne', rectangle: 'Rectangle', ellipse: 'Ellipse' } as const;
export type LaserShape = keyof typeof laserShapeNames;

export function laserShapePath(shape: LaserShape, start: Point2, end: Point2): LaserPath | null {
  const width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
  if (shape === 'line') {
    return Math.hypot(width, height) < 0.01 ? null : { points: [start, end], fillEnabled: false };
  }
  if (width < 0.01 || height < 0.01) return null;

  const left = Math.min(start.x, end.x), bottom = Math.min(start.y, end.y);
  const right = left + width, top = bottom + height;
  const samples = Math.min(720, Math.max(48, 4 * Math.ceil(Math.PI * Math.sqrt(Math.max(width, height) / 0.025) / 4)));
  const points = shape === 'rectangle'
    ? [{ x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }, { x: left, y: top }]
    : Array.from({ length: samples }, (_, index) => {
      const angle = 2 * Math.PI * index / samples;
      return { x: left + width * (1 + Math.cos(angle)) / 2, y: bottom + height * (1 + Math.sin(angle)) / 2 };
    });
  return { points: [...points, points[0]], fillClosed: true, fillEnabled: true };
}
