import type { Coordinates, GCodeSegment } from '../types/cnc';

/** Keep only executed strokes, clipping the current motion to the reported head position.
 * Several segments can share a source line (arcs); choose the closest part of that arc.
 */
export function executedLaserStrokes(
  strokes: GCodeSegment[], line: number, position: Coordinates, completed = false,
): GCodeSegment[] {
  if (completed) return strokes;
  let first = 0;
  while (first < strokes.length && strokes[first].lineIndex < line) first++;
  const done = strokes.slice(0, first);
  let closest = -1, fraction = 0, distance = Infinity;
  for (let i = first; i < strokes.length && strokes[i].lineIndex === line; i++) {
    const s = strokes[i], dx = s.end.x - s.start.x, dy = s.end.y - s.start.y, dz = s.end.z - s.start.z;
    const length2 = dx * dx + dy * dy + dz * dz;
    const t = length2 ? Math.max(0, Math.min(1,
      ((position.x - s.start.x) * dx + (position.y - s.start.y) * dy + (position.z - s.start.z) * dz) / length2)) : 0;
    const d = Math.hypot(position.x - s.start.x - t * dx, position.y - s.start.y - t * dy, position.z - s.start.z - t * dz);
    if (d < distance) { closest = i; fraction = t; distance = d; }
  }
  if (closest < 0) return done;
  done.push(...strokes.slice(first, closest));
  if (fraction > 0) {
    const s = strokes[closest];
    done.push({ ...s, end: {
      x: s.start.x + (s.end.x - s.start.x) * fraction,
      y: s.start.y + (s.end.y - s.start.y) * fraction,
      z: s.start.z + (s.end.z - s.start.z) * fraction,
    }, distance: s.distance * fraction, durationSec: s.durationSec * fraction });
  }
  return done;
}
