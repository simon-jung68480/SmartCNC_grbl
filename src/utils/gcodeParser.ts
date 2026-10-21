import { Coordinates, GCodeSegment, HeightmapGrid, ParsedGCodeStats } from '../types/cnc';

const DEFAULT_RAPID_RATE = 2000; // mm/min
const DEFAULT_FEED_RATE = 600;   // mm/min

/**
 * Nettoie une ligne G-Code de ses commentaires (; ou (...)) et numéros de bloc (Nxx)
 */
export function stripComments(line: string): string {
  return line
    .replace(/\(.*?\)/g, '')
    .replace(/;.*$/g, '')
    .trim();
}

const WORD_REGEX = /([A-Za-z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g;

function parseWords(cleanLine: string): Map<string, number[]> {
  const words = new Map<string, number[]>();
  WORD_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_REGEX.exec(cleanLine)) !== null) {
    const letter = match[1].toUpperCase();
    const val = parseFloat(match[2]);
    if (!Number.isNaN(val)) {
      const list = words.get(letter) || [];
      list.push(val);
      words.set(letter, list);
    }
  }
  return words;
}

/**
 * Interpole un arc 2D/3D (G2 horaire / G3 anti-horaire) dans le plan XY avec interpolation hélicoïdale Z
 */
export function interpolateArc(
  start: Coordinates,
  end: Coordinates,
  iOffset: number,
  jOffset: number,
  rValue: number | undefined,
  clockwise: boolean
): Coordinates[] {
  let cx = start.x + iOffset;
  let cy = start.y + jOffset;

  if (rValue !== undefined && iOffset === 0 && jOffset === 0) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) {
      const r = Math.abs(rValue);
      const h = Math.sqrt(Math.max(0, r * r - (d * d) / 4));
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      const sign = clockwise !== (rValue < 0) ? -1 : 1;
      cx = mx + (sign * h * dy) / d;
      cy = my - (sign * h * dx) / d;
    }
  }

  const radius = Math.hypot(start.x - cx, start.y - cy);
  if (radius < 1e-5) {
    return [end];
  }

  const startAngle = Math.atan2(start.y - cy, start.x - cx);
  const endAngle = Math.atan2(end.y - cy, end.x - cx);

  const isFullCircle =
    Math.abs(start.x - end.x) < 1e-5 &&
    Math.abs(start.y - end.y) < 1e-5 &&
    (Math.abs(iOffset) > 1e-5 || Math.abs(jOffset) > 1e-5);

  let sweepAngle = endAngle - startAngle;
  if (clockwise) {
    if (isFullCircle) {
      sweepAngle = -Math.PI * 2;
    } else if (sweepAngle >= -1e-6) {
      sweepAngle -= Math.PI * 2;
    }
  } else {
    if (isFullCircle) {
      sweepAngle = Math.PI * 2;
    } else if (sweepAngle <= 1e-6) {
      sweepAngle += Math.PI * 2;
    }
  }

  const arcLength = Math.abs(sweepAngle) * radius;
  const steps = Math.max(4, Math.min(36, Math.ceil(arcLength / 1.5)));
  const points: Coordinates[] = [];
  const endRadius = Math.hypot(end.x - cx, end.y - cy);

  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const angle = startAngle + sweepAngle * t;
    const currentRadius = radius + (endRadius - radius) * t;

    const px = s === steps ? end.x : cx + Math.cos(angle) * currentRadius;
    const py = s === steps ? end.y : cy + Math.sin(angle) * currentRadius;
    const pz = start.z + (end.z - start.z) * t;
    points.push({ x: px, y: py, z: pz });
  }

  return points;
}

/**
 * Parseur G-Code haute performance (sans allocations Map/Array par ligne) pour gros fichiers
 */
export function parseGCode(
  code: string,
  fileName: string = 'programme.nc'
): { segments: GCodeSegment[]; stats: ParsedGCodeStats; lines: string[] } {
  const rawLines = code.split(/\r?\n/);
  const segments: GCodeSegment[] = [];

  let curX = 0;
  let curY = 0;
  let curZ = 0;
  let hasPositionedXY = false;

  let motionMode: 'G0' | 'G1' | 'G2' | 'G3' = 'G0';
  let isAbsolute = true; // G90 par défaut
  let unitScale = 1.0;   // G21 (mm) par défaut, 25.4 pour G20 (in)
  let currentFeed = DEFAULT_FEED_RATE;
  let currentSpindle = 0;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  let totalDistanceMm = 0;
  let cuttingDistanceMm = 0;
  let rapidDistanceMm = 0;
  let estimatedTimeSec = 0;
  let maxFeedRate = 0;
  let maxSpindleSpeed = 0;
  let motionLines = 0;
  const toolsSet = new Set<number>();

  const updateBounds = (x: number, y: number, z: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  };

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const rawLine = rawLines[lineIdx];
    if (!rawLine) continue;

    // Fast comment stripping without slow regex when possible
    let clean = rawLine;
    const semiIdx = clean.indexOf(';');
    if (semiIdx !== -1) clean = clean.slice(0, semiIdx);
    if (clean.indexOf('(') !== -1) clean = clean.replace(/\(.*?\)/g, '');
    clean = clean.trim();
    if (!clean) continue;

    let xVal: number | undefined;
    let yVal: number | undefined;
    let zVal: number | undefined;
    let iVal: number | undefined;
    let jVal: number | undefined;
    let rVal: number | undefined;
    let isNonMotionCoordCommand = false;
    let hasWords = false;

    WORD_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD_REGEX.exec(clean)) !== null) {
      hasWords = true;
      const letter = match[1].toUpperCase();
      const val = parseFloat(match[2]);
      if (Number.isNaN(val)) continue;

      switch (letter) {
        case 'G': {
          const gInt = Math.round(val * 10) / 10;
          if (gInt === 0) motionMode = 'G0';
          else if (gInt === 1) motionMode = 'G1';
          else if (gInt === 2) motionMode = 'G2';
          else if (gInt === 3) motionMode = 'G3';
          else if (gInt === 20) unitScale = 25.4;
          else if (gInt === 21) unitScale = 1.0;
          else if (gInt === 90) isAbsolute = true;
          else if (gInt === 91) isAbsolute = false;
          else if (gInt === 92 || gInt === 10 || gInt === 28 || gInt === 30) {
            isNonMotionCoordCommand = true;
          }
          break;
        }
        case 'X':
          xVal = val * unitScale;
          break;
        case 'Y':
          yVal = val * unitScale;
          break;
        case 'Z':
          zVal = val * unitScale;
          break;
        case 'I':
          iVal = val * unitScale;
          break;
        case 'J':
          jVal = val * unitScale;
          break;
        case 'R':
          rVal = val * unitScale;
          break;
        case 'F': {
          const f = val * unitScale;
          if (f > 0) {
            currentFeed = f;
            if (f > maxFeedRate) maxFeedRate = f;
          }
          break;
        }
        case 'S':
          if (val >= 0) {
            currentSpindle = val;
            if (val > maxSpindleSpeed) maxSpindleSpeed = val;
          }
          break;
        case 'T':
          toolsSet.add(Math.round(val));
          break;
      }
    }

    if (!hasWords || isNonMotionCoordCommand) continue;
    if (
      xVal === undefined &&
      yVal === undefined &&
      zVal === undefined &&
      iVal === undefined &&
      jVal === undefined &&
      rVal === undefined
    ) {
      continue;
    }

    const targetX = xVal !== undefined ? (isAbsolute ? xVal : curX + xVal) : curX;
    const targetY = yVal !== undefined ? (isAbsolute ? yVal : curY + yVal) : curY;
    const targetZ = zVal !== undefined ? (isAbsolute ? zVal : curZ + zVal) : curZ;

    motionLines++;
    if (xVal !== undefined || yVal !== undefined) {
      hasPositionedXY = true;
    }
    if (hasPositionedXY || motionMode !== 'G0') {
      updateBounds(targetX, targetY, targetZ);
    }

    const effectiveFeed = motionMode === 'G0' ? DEFAULT_RAPID_RATE : currentFeed;

    if (motionMode === 'G2' || motionMode === 'G3') {
      const startPt: Coordinates = { x: curX, y: curY, z: curZ };
      const endPt: Coordinates = { x: targetX, y: targetY, z: targetZ };
      const arcPoints = interpolateArc(
        startPt,
        endPt,
        iVal ?? 0,
        jVal ?? 0,
        rVal,
        motionMode === 'G2'
      );

      let prevPt = startPt;
      for (let i = 0; i < arcPoints.length; i++) {
        const pt = arcPoints[i];
        updateBounds(pt.x, pt.y, pt.z);
        const dist = Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y, pt.z - prevPt.z);
        const dur = effectiveFeed > 0 ? (dist / effectiveFeed) * 60 : 0;

        segments.push({
          lineIndex: lineIdx,
          lineText: '',
          type: motionMode,
          start: prevPt,
          end: pt,
          feedRate: effectiveFeed,
          spindleSpeed: currentSpindle,
          distance: dist,
          durationSec: dur,
        });

        totalDistanceMm += dist;
        cuttingDistanceMm += dist;
        estimatedTimeSec += dur;
        prevPt = pt;
      }
      curX = targetX;
      curY = targetY;
      curZ = targetZ;
    } else {
      const dist = Math.hypot(targetX - curX, targetY - curY, targetZ - curZ);
      if (dist > 1e-6) {
        const dur = effectiveFeed > 0 ? (dist / effectiveFeed) * 60 : 0;
        segments.push({
          lineIndex: lineIdx,
          lineText: '',
          type: motionMode,
          start: { x: curX, y: curY, z: curZ },
          end: { x: targetX, y: targetY, z: targetZ },
          feedRate: effectiveFeed,
          spindleSpeed: currentSpindle,
          distance: dist,
          durationSec: dur,
        });

        totalDistanceMm += dist;
        if (motionMode === 'G0') {
          rapidDistanceMm += dist;
        } else {
          cuttingDistanceMm += dist;
        }
        estimatedTimeSec += dur;
      }
      curX = targetX;
      curY = targetY;
      curZ = targetZ;
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; minZ = 0;
    maxX = 0; maxY = 0; maxZ = 0;
  }

  const stats: ParsedGCodeStats = {
    fileName,
    totalLines: rawLines.length,
    motionLines,
    bounds: {
      min: { x: Number(minX.toFixed(3)), y: Number(minY.toFixed(3)), z: Number(minZ.toFixed(3)) },
      max: { x: Number(maxX.toFixed(3)), y: Number(maxY.toFixed(3)), z: Number(maxZ.toFixed(3)) },
      size: {
        x: Number(Math.max(0, maxX - minX).toFixed(3)),
        y: Number(Math.max(0, maxY - minY).toFixed(3)),
        z: Number(Math.max(0, maxZ - minZ).toFixed(3)),
      },
    },
    totalDistanceMm: Number(totalDistanceMm.toFixed(2)),
    cuttingDistanceMm: Number(cuttingDistanceMm.toFixed(2)),
    rapidDistanceMm: Number(rapidDistanceMm.toFixed(2)),
    estimatedTimeSec: Math.round(estimatedTimeSec),
    maxFeedRate: Math.round(maxFeedRate),
    maxSpindleSpeed: Math.round(maxSpindleSpeed),
    toolsUsed: Array.from(toolsSet).sort((a, b) => a - b),
  };

  return {
    segments,
    stats,
    lines: rawLines,
  };
}

/**
 * Évalue le décalage Z par interpolation bilinéaire sur une grille HeightmapGrid en un point (x, y)
 */
export function sampleHeightmapZ(x: number, y: number, grid: HeightmapGrid): number {
  if (!grid.points || grid.points.length === 0 || grid.cols < 1 || grid.rows < 1) {
    return 0;
  }

  const spanX = Math.max(1e-6, grid.maxX - grid.minX);
  const spanY = Math.max(1e-6, grid.maxY - grid.minY);

  // Coordonnées normalisées clampées dans la grille [0, cols-1] et [0, rows-1]
  const u = Math.max(0, Math.min(1, (x - grid.minX) / spanX)) * Math.max(0, grid.cols - 1);
  const v = Math.max(0, Math.min(1, (y - grid.minY) / spanY)) * Math.max(0, grid.rows - 1);

  const c0 = Math.floor(u);
  const r0 = Math.floor(v);
  const c1 = Math.min(grid.cols - 1, c0 + 1);
  const r1 = Math.min(grid.rows - 1, r0 + 1);

  const tx = u - c0;
  const ty = v - r0;

  const getZ = (r: number, c: number): number => {
    const pt = grid.points.find((p) => p.row === r && p.col === c);
    return pt && pt.z !== null && Number.isFinite(pt.z) ? pt.z : 0;
  };

  const z00 = getZ(r0, c0);
  const z10 = getZ(r0, c1);
  const z01 = getZ(r1, c0);
  const z11 = getZ(r1, c1);

  const zBottom = z00 * (1 - tx) + z10 * tx;
  const zTop = z01 * (1 - tx) + z11 * tx;
  return zBottom * (1 - ty) + zTop * ty;
}

/**
 * Applique une grille Heightmap (Auto-Leveling) à un programme G-Code :
 * - Convertit les arcs et segments linéaires G1 en sous-segments de pas <= 5 mm
 * - Ajuste chaque coordonnée Z par interpolation bilinéaire sur la grille
 */
export function applyHeightmapToGCode(rawGCode: string, grid: HeightmapGrid): string {
  const MAX_SEGMENT_STEP_MM = 5.0;
  const lines = rawGCode.replace(/\r\n/g, '\n').split('\n');
  const outLines: string[] = [
    '; =========================================================',
    `; SMART CNC - AUTO-LEVELING HEIGHTMAP APPLIED (${grid.cols}x${grid.rows} pts)`,
    `; Zone: X[${grid.minX}..${grid.maxX}] Y[${grid.minY}..${grid.maxY}] | Step <= ${MAX_SEGMENT_STEP_MM}mm`,
    '; =========================================================',
  ];

  let curX = 0;
  let curY = 0;
  let curZ = 0;
  let motionMode: 'G0' | 'G1' | 'G2' | 'G3' = 'G0';
  let isAbsolute = true;
  let unitScale = 1.0;
  let currentFeed = DEFAULT_FEED_RATE;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const clean = stripComments(raw);
    if (!clean) {
      outLines.push(raw);
      continue;
    }

    const words = parseWords(clean);
    if (words.size === 0) {
      outLines.push(raw);
      continue;
    }

    const gVals = words.get('G');
    let isSpecialG = false;
    if (gVals) {
      for (const g of gVals) {
        const gInt = Math.round(g * 10) / 10;
        if (gInt === 0) motionMode = 'G0';
        else if (gInt === 1) motionMode = 'G1';
        else if (gInt === 2) motionMode = 'G2';
        else if (gInt === 3) motionMode = 'G3';
        else if (gInt === 20) unitScale = 25.4;
        else if (gInt === 21) unitScale = 1.0;
        else if (gInt === 90) isAbsolute = true;
        else if (gInt === 91) isAbsolute = false;
        else if (gInt === 28 || gInt === 30 || gInt === 53 || gInt === 92 || gInt === 10 || gInt === 38.2) {
          isSpecialG = true;
        }
      }
    }

    if (isSpecialG) {
      outLines.push(raw);
      continue;
    }

    const fVals = words.get('F');
    if (fVals && fVals.length > 0) {
      currentFeed = fVals[fVals.length - 1] * unitScale;
    }

    const hasX = words.has('X');
    const hasY = words.has('Y');
    const hasZ = words.has('Z');
    const hasI = words.has('I');
    const hasJ = words.has('J');
    const hasR = words.has('R');

    if (!hasX && !hasY && !hasZ && !hasI && !hasJ && !hasR) {
      outLines.push(raw);
      continue;
    }

    const xVal = hasX ? words.get('X')![words.get('X')!.length - 1] * unitScale : undefined;
    const yVal = hasY ? words.get('Y')![words.get('Y')!.length - 1] * unitScale : undefined;
    const zVal = hasZ ? words.get('Z')![words.get('Z')!.length - 1] * unitScale : undefined;

    const targetX = xVal !== undefined ? (isAbsolute ? xVal : curX + xVal) : curX;
    const targetY = yVal !== undefined ? (isAbsolute ? yVal : curY + yVal) : curY;
    const targetZ = zVal !== undefined ? (isAbsolute ? zVal : curZ + zVal) : curZ;

    // Déplacement rapide G0 : on ajuste simplement le Z final par sécurité
    if (motionMode === 'G0') {
      const zOffset = sampleHeightmapZ(targetX, targetY, grid);
      const adjZ = (targetZ + zOffset) / unitScale;
      const adjX = targetX / unitScale;
      const adjY = targetY / unitScale;
      outLines.push(`G0 X${adjX.toFixed(3)} Y${adjY.toFixed(3)} Z${adjZ.toFixed(3)}`);
      curX = targetX;
      curY = targetY;
      curZ = targetZ;
      continue;
    }

    // Pour G2/G3 on linéarise d'abord l'arc, puis on ajuste chaque point
    if (motionMode === 'G2' || motionMode === 'G3') {
      const iOffset = hasI ? words.get('I')![words.get('I')!.length - 1] * unitScale : 0;
      const jOffset = hasJ ? words.get('J')![words.get('J')!.length - 1] * unitScale : 0;
      const rVal = hasR ? words.get('R')![words.get('R')!.length - 1] * unitScale : undefined;

      const arcPts = interpolateArc(
        { x: curX, y: curY, z: curZ },
        { x: targetX, y: targetY, z: targetZ },
        iOffset,
        jOffset,
        rVal,
        motionMode === 'G2'
      );

      for (let pIdx = 0; pIdx < arcPts.length; pIdx++) {
        const pt = arcPts[pIdx];
        const zOffset = sampleHeightmapZ(pt.x, pt.y, grid);
        const adjX = pt.x / unitScale;
        const adjY = pt.y / unitScale;
        const adjZ = (pt.z + zOffset) / unitScale;
        const feedStr = pIdx === 0 && fVals ? ` F${(currentFeed / unitScale).toFixed(0)}` : '';
        outLines.push(`G1 X${adjX.toFixed(3)} Y${adjY.toFixed(3)} Z${adjZ.toFixed(3)}${feedStr}`);
      }

      curX = targetX;
      curY = targetY;
      curZ = targetZ;
      continue;
    }

    // Mouvement linéaire G1 : subdivision en pas <= 5 mm
    const xyDist = Math.hypot(targetX - curX, targetY - curY);
    const steps = Math.max(1, Math.ceil(xyDist / MAX_SEGMENT_STEP_MM));

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const ix = curX + (targetX - curX) * t;
      const iy = curY + (targetY - curY) * t;
      const iz = curZ + (targetZ - curZ) * t;
      const zOffset = sampleHeightmapZ(ix, iy, grid);

      const outX = ix / unitScale;
      const outY = iy / unitScale;
      const outZ = (iz + zOffset) / unitScale;
      const feedStr = s === 1 && fVals ? ` F${(currentFeed / unitScale).toFixed(0)}` : '';
      outLines.push(`G1 X${outX.toFixed(3)} Y${outY.toFixed(3)} Z${outZ.toFixed(3)}${feedStr}`);
    }

    curX = targetX;
    curY = targetY;
    curZ = targetZ;
  }

  return outLines.join('\n');
}

/**
 * Générateur de G-Code de surfaçage de martyr (Spoilboard Surfacing) en zigzag + passe de finition périmétrique
 */
export function generateSurfacingGCode(params: {
  width: number;
  height: number;
  toolDiameter: number;
  stepoverPercent: number;
  depth: number;
  feedRate: number;
  spindleSpeed: number;
}): string {
  const width = Math.max(10, params.width);
  const height = Math.max(10, params.height);
  const toolDia = Math.max(1, params.toolDiameter);
  const stepoverRatio = Math.max(0.1, Math.min(0.95, params.stepoverPercent / 100));
  const stepY = Number((toolDia * stepoverRatio).toFixed(3));
  const cutZ = -Math.abs(params.depth);
  const safeZ = 5.0;
  const plungeFeed = Math.max(100, Math.round(params.feedRate * 0.35));

  const lines: string[] = [
    '; =========================================================',
    '; SMART CNC - SURFACAGE DU MARTYR (SPOILBOARD SURFACING)',
    `; Dimensions : ${width} x ${height} mm`,
    `; Fraise     : Ø${toolDia} mm (Recouvrement ${params.stepoverPercent}% -> pas ${stepY} mm)`,
    `; Profondeur : ${cutZ.toFixed(2)} mm | Avance : ${params.feedRate} mm/min | Broche : ${params.spindleSpeed} RPM`,
    '; =========================================================',
    'G21 ; Unités en millimètres',
    'G90 ; Coordonnées absolues',
    'G17 ; Plan XY',
    `G0 Z${safeZ.toFixed(3)}`,
    `M3 S${Math.round(params.spindleSpeed)}`,
    'G0 X0.000 Y0.000',
    `G1 Z${cutZ.toFixed(3)} F${plungeFeed}`,
  ];

  const numPasses = Math.ceil(height / stepY) + 1;
  for (let i = 0; i < numPasses; i++) {
    const currentY = Math.min(height, Number((i * stepY).toFixed(3)));
    if (i > 0) {
      lines.push(`G1 Y${currentY.toFixed(3)} F${params.feedRate}`);
    }
    if (i % 2 === 0) {
      lines.push(`G1 X${width.toFixed(3)} Y${currentY.toFixed(3)} F${params.feedRate}`);
    } else {
      lines.push(`G1 X0.000 Y${currentY.toFixed(3)} F${params.feedRate}`);
    }
    if (currentY >= height) break;
  }

  // Passe de cadre périmétrique de finition
  lines.push('; --- Passe de finition périmétrique ---');
  lines.push(`G1 X0.000 Y${height.toFixed(3)} F${params.feedRate}`);
  lines.push(`G1 X0.000 Y0.000 F${params.feedRate}`);
  lines.push(`G1 X${width.toFixed(3)} Y0.000 F${params.feedRate}`);
  lines.push(`G1 X${width.toFixed(3)} Y${height.toFixed(3)} F${params.feedRate}`);

  // Fin de cycle
  lines.push(`G0 Z${safeZ.toFixed(3)}`);
  lines.push('M5 ; Arrêt broche');
  lines.push('G0 X0.000 Y0.000');
  lines.push('M30 ; Fin de programme');

  return lines.join('\n');
}

/**
 * Construit le G-Code de la Rosace Géométrique 3D (Sculpture V-Bit / Fraise boule 80x80mm)
 */
function buildRosace3DGCode(): string {
  const lines: string[] = [
    '; =========================================================',
    '; SMART CNC - ROSACE GEOMETRIQUE 3D (80x80mm)',
    '; Sculpture sinusoïdale 3D pour Fraise V-Bit 60° ou Boule Ø3.175mm',
    '; Origine : Bas-Gauche (0,0) | Centre : (40,40) | Z0 = Surface',
    '; =========================================================',
    'G21 G90 G17',
    'G0 Z5.000',
    'M3 S12000',
  ];

  const cx = 40;
  const cy = 40;
  // Cadre octogonal chanfreiné
  lines.push('; --- Cadre octogonal extérieur ---');
  lines.push('G0 X15.000 Y5.000');
  lines.push('G1 Z-1.200 F300');
  lines.push('G1 X65.000 Y5.000 F900');
  lines.push('G1 X75.000 Y15.000');
  lines.push('G1 X75.000 Y65.000');
  lines.push('G1 X65.000 Y75.000');
  lines.push('G1 X15.000 Y75.000');
  lines.push('G1 X5.000 Y65.000');
  lines.push('G1 X5.000 Y15.000');
  lines.push('G1 X15.000 Y5.000');
  lines.push('G0 Z4.000');

  // Couronnes harmoniques 3D à profondeur Z modulée
  const rings = [
    { baseR: 31, ampR: 3.5, petals: 8, zMin: -2.6, zMax: -0.5, steps: 96 },
    { baseR: 22, ampR: 2.8, petals: 12, zMin: -3.2, zMax: -0.6, steps: 96 },
    { baseR: 13, ampR: 2.2, petals: 6, zMin: -2.4, zMax: -0.4, steps: 72 },
  ];

  rings.forEach((ring, idx) => {
    lines.push(`; --- Couronne harmonique 3D #${idx + 1} (R=${ring.baseR}mm, ${ring.petals} pétales) ---`);
    for (let s = 0; s <= ring.steps; s++) {
      const theta = (s / ring.steps) * Math.PI * 2;
      const wave = Math.cos(theta * ring.petals);
      const r = ring.baseR + ring.ampR * wave;
      const x = cx + Math.cos(theta) * r;
      const y = cy + Math.sin(theta) * r;
      const z = ring.zMin + ((wave + 1) * 0.5) * (ring.zMax - ring.zMin);
      if (s === 0) {
        lines.push(`G0 X${x.toFixed(3)} Y${y.toFixed(3)}`);
        lines.push(`G1 Z${z.toFixed(3)} F350`);
      } else {
        lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)} F850`);
      }
    }
    lines.push('G0 Z4.000');
  });

  // Rayons solaires sculptés en V-Carve 3D (plongée progressive vers le coeur)
  lines.push('; --- 16 Rayons sculptés 3D ---');
  for (let p = 0; p < 16; p++) {
    const angle = (p / 16) * Math.PI * 2;
    const rStart = 4.0;
    const rEnd = 29.0;
    const subSteps = 8;
    for (let k = 0; k <= subSteps; k++) {
      const t = k / subSteps;
      const r = rStart + (rEnd - rStart) * t;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      // Profondeur sinusoïdale creusée au milieu du rayon
      const z = -0.3 - Math.sin(t * Math.PI) * 2.5;
      if (k === 0) {
        lines.push(`G0 X${x.toFixed(3)} Y${y.toFixed(3)}`);
        lines.push(`G1 Z${z.toFixed(3)} F350`);
      } else {
        lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)} F750`);
      }
    }
    lines.push('G0 Z3.500');
  }

  lines.push('G0 Z8.000');
  lines.push('M5');
  lines.push('G0 X0.000 Y0.000');
  lines.push('M30');
  return lines.join('\n');
}

/**
 * 4 Fichiers G-Code d'exemple intégrés pour tester et calibrer la CNC Router (Arduino Uno + CNC Shield V3.0)
 */
export const SAMPLE_GCODES: {
  id: string;
  name: string;
  description: string;
  content: string;
}[] = [
  {
    id: 'calibration-100x100',
    name: 'Calibration Carré + Cercle + Diagonales (100x100mm)',
    description:
      'Idéal pour vérifier les pas/mm ($100, $101), l’équerrage XY et le jeu mécanique (backlash) de la CNC Shield V3.0.',
    content: `; =========================================================
; SMART CNC - MIRE DE CALIBRATION MECANIQUE (100x100mm)
; Vérification Steps/mm ($100, $101, $102) et équerrage XY
; Outil : Fraise à graver / V-Bit ou Pointe sèche | Z-1.0mm
; =========================================================
G21 ; Millimètres
G90 ; Absolu
G17 ; Plan XY
T1 M6
G0 Z5.000
M3 S10000

; --- 1. Carré extérieur de référence 90x90mm (de X5 Y5 à X95 Y95) ---
G0 X5.000 Y5.000
G1 Z-1.000 F250
G1 X95.000 Y5.000 F800
G1 X95.000 Y95.000
G1 X5.000 Y95.000
G1 X5.000 Y5.000
G0 Z5.000

; --- 2. Carré intermédiaire 60x60mm (de X20 Y20 à X80 Y80) ---
G0 X20.000 Y20.000
G1 Z-1.000 F250
G1 X80.000 Y20.000 F800
G1 X80.000 Y80.000
G1 X20.000 Y80.000
G1 X20.000 Y20.000
G0 Z5.000

; --- 3. Cercle inscrit Ø80mm (Centre X50 Y50, test d'interpolation G2) ---
G0 X90.000 Y50.000
G1 Z-1.000 F250
G2 X10.000 Y50.000 I-40.000 J0.000 F700
G2 X90.000 Y50.000 I40.000 J0.000 F700
G0 Z5.000

; --- 4. Cercle central Ø30mm (Test anti-horaire G3) ---
G0 X65.000 Y50.000
G1 Z-1.000 F250
G3 X35.000 Y50.000 I-15.000 J0.000 F650
G3 X65.000 Y50.000 I15.000 J0.000 F650
G0 Z5.000

; --- 5. Diagonales d'équerrage & Réticule central ---
G0 X5.000 Y5.000
G1 Z-0.800 F250
G1 X95.000 Y95.000 F900
G0 Z5.000

G0 X5.000 Y95.000
G1 Z-0.800 F250
G1 X95.000 Y5.000 F900
G0 Z5.000

; Croix médiane X/Y
G0 X50.000 Y0.000
G1 Z-0.600 F250
G1 X50.000 Y100.000 F900
G0 Z5.000

G0 X0.000 Y50.000
G1 Z-0.600 F250
G1 X100.000 Y50.000 F900
G0 Z8.000
M5
G0 X0.000 Y0.000
M30`,
  },
  {
    id: 'plaque-smart-cnc',
    name: 'Plaque Atelier "SMART CNC" (Gravure + Découpe 120x60mm)',
    description:
      'Parcours complet multi-opérations : perçages de fixation, cartouche décoratif, gravure vectorielle "CNC" et découpe avec attaches.',
    content: `; =========================================================
; SMART CNC - PLAQUE ATELIER "SMART CNC" (120x60mm)
; Outil : Fraise Carbure Ø3.175mm (1/8") | Brut : 120x60x5mm
; =========================================================
G21 G90 G17
T1 M6
G0 Z6.000
M3 S12000

; --- Opération 1 : 4 Alésages de fixation aux coins ---
G0 X12.000 Y10.000
G1 Z-2.500 F200
G2 X8.000 Y10.000 I-2.000 J0.000 F400
G2 X12.000 Y10.000 I2.000 J0.000
G0 Z5.000

G0 X112.000 Y10.000
G1 Z-2.500 F200
G2 X108.000 Y10.000 I-2.000 J0.000 F400
G2 X112.000 Y10.000 I2.000 J0.000
G0 Z5.000

G0 X112.000 Y50.000
G1 Z-2.500 F200
G2 X108.000 Y50.000 I-2.000 J0.000 F400
G2 X112.000 Y50.000 I2.000 J0.000
G0 Z5.000

G0 X12.000 Y50.000
G1 Z-2.500 F200
G2 X8.000 Y50.000 I-2.000 J0.000 F400
G2 X12.000 Y50.000 I2.000 J0.000
G0 Z5.000

; --- Opération 2 : Rainure Cartouche Intérieur Arrondi ---
G0 X18.000 Y8.000
G1 Z-1.000 F300
G1 X102.000 Y8.000 F850
G3 X108.000 Y14.000 I0.000 J6.000
G1 X108.000 Y46.000
G3 X102.000 Y52.000 I-6.000 J0.000
G1 X18.000 Y52.000
G3 X12.000 Y46.000 I0.000 J-6.000
G1 X12.000 Y14.000
G3 X18.000 Y8.000 I6.000 J0.000
G0 Z5.000

; --- Opération 3 : Gravure Vectorielle "SMART CNC" ---
; Lettre C (gauche)
G0 X42.000 Y38.000
G1 Z-1.200 F250
G1 X28.000 Y38.000 F700
G1 X25.000 Y34.000
G1 X25.000 Y22.000
G1 X28.000 Y18.000
G1 X42.000 Y18.000
G0 Z5.000

; Lettre N (centre)
G0 X50.000 Y18.000
G1 Z-1.200 F250
G1 X50.000 Y38.000 F700
G1 X68.000 Y18.000
G1 X68.000 Y38.000
G0 Z5.000

; Lettre C (droite)
G0 X94.000 Y38.000
G1 Z-1.200 F250
G1 X80.000 Y38.000 F700
G1 X77.000 Y34.000
G1 X77.000 Y22.000
G1 X80.000 Y18.000
G1 X94.000 Y18.000
G0 Z5.000

; Soulignement dynamique
G0 X24.000 Y13.500
G1 Z-0.900 F250
G1 X96.000 Y13.500 F900
G0 Z5.000

; --- Opération 4 : Découpe Contour 120x60mm avec 4 Attaches (Tabs) ---
G0 X2.000 Y2.000
G1 Z-3.500 F250
; Bas avec attache à X60
G1 X56.000 Y2.000 F750
G1 Z-1.200 F400
G1 X64.000 Y2.000 F750
G1 Z-3.500 F300
G1 X118.000 Y2.000 F750
; Droite avec attache à Y30
G1 X118.000 Y26.000
G1 Z-1.200 F400
G1 X118.000 Y34.000
G1 Z-3.500 F300
G1 X118.000 Y58.000
; Haut avec attache à X60
G1 X64.000 Y58.000
G1 Z-1.200 F400
G1 X56.000 Y58.000
G1 Z-3.500 F300
G1 X2.000 Y58.000
; Gauche avec attache à Y30
G1 X2.000 Y34.000
G1 Z-1.200 F400
G1 X2.000 Y26.000
G1 Z-3.500 F300
G1 X2.000 Y2.000

G0 Z8.000
M5
G0 X0.000 Y0.000
M30`,
  },
  {
    id: 'rosace-3d-80x80',
    name: 'Rosace Géométrique 3D (Sculpture V-Bit / Fraise boule 80x80mm)',
    description:
      'Parcours 3D simultané XYZ avec modulations sinusoïdales en Z pour tester la fluidité du planificateur GRBL.',
    content: buildRosace3DGCode(),
  },
  {
    id: 'pcb-isolation-50x50',
    name: 'Grille de test PCB / Gravure fine (50x50mm)',
    description:
      'Circuit imprimé d’isolation ultra-fin (Z = -0.10mm) conçu pour tester le palpage surfacique Auto-Leveling (Heightmap).',
    content: `; =========================================================
; SMART CNC - TEST GRAVURE ISOLATION PCB (50x50mm)
; Profondeur ultra-fine Z = -0.10mm (Idéal pour démo Heightmap)
; Outil : Javelot carbure PCB 30° Ø0.2mm
; =========================================================
G21 G90 G17
T2 M6
G0 Z3.000
M3 S15000

; --- Contour de la carte PCB 50x50mm ---
G0 X0.000 Y0.000
G1 Z-0.100 F150
G1 X50.000 Y0.000 F500
G1 X50.000 Y50.000
G1 X0.000 Y50.000
G1 X0.000 Y0.000
G0 Z2.000

; --- 8 Pastilles IC DIP-8 centrales (Pas 2.54mm / 5.08mm) ---
; Rangée gauche (X18)
G0 X19.200 Y17.000
G1 Z-0.100 F150
G2 X16.800 Y17.000 I-1.200 J0.000 F350
G2 X19.200 Y17.000 I1.200 J0.000
G0 Z2.000

G0 X19.200 Y22.080
G1 Z-0.100 F150
G2 X16.800 Y22.080 I-1.200 J0.000 F350
G2 X19.200 Y22.080 I1.200 J0.000
G0 Z2.000

G0 X19.200 Y27.160
G1 Z-0.100 F150
G2 X16.800 Y27.160 I-1.200 J0.000 F350
G2 X19.200 Y27.160 I1.200 J0.000
G0 Z2.000

G0 X19.200 Y32.240
G1 Z-0.100 F150
G2 X16.800 Y32.240 I-1.200 J0.000 F350
G2 X19.200 Y32.240 I1.200 J0.000
G0 Z2.000

; Rangée droite (X32)
G0 X33.200 Y17.000
G1 Z-0.100 F150
G2 X30.800 Y17.000 I-1.200 J0.000 F350
G2 X33.200 Y17.000 I1.200 J0.000
G0 Z2.000

G0 X33.200 Y22.080
G1 Z-0.100 F150
G2 X30.800 Y22.080 I-1.200 J0.000 F350
G2 X33.200 Y22.080 I1.200 J0.000
G0 Z2.000

G0 X33.200 Y27.160
G1 Z-0.100 F150
G2 X30.800 Y27.160 I-1.200 J0.000 F350
G2 X33.200 Y27.160 I1.200 J0.000
G0 Z2.000

G0 X33.200 Y32.240
G1 Z-0.100 F150
G2 X30.800 Y32.240 I-1.200 J0.000 F350
G2 X33.200 Y32.240 I1.200 J0.000
G0 Z2.000

; --- Pistes de routage à 45° vers le connecteur de bord ---
G0 X16.800 Y17.000
G1 Z-0.100 F150
G1 X10.000 Y17.000 F450
G1 X5.000 Y12.000
G1 X5.000 Y4.000
G0 Z2.000

G0 X16.800 Y22.080
G1 Z-0.100 F150
G1 X12.000 Y22.080 F450
G1 X8.000 Y18.080
G1 X8.000 Y4.000
G0 Z2.000

G0 X16.800 Y27.160
G1 Z-0.100 F150
G1 X12.000 Y27.160 F450
G1 X8.000 Y31.160
G1 X8.000 Y46.000
G0 Z2.000

G0 X16.800 Y32.240
G1 Z-0.100 F150
G1 X10.000 Y32.240 F450
G1 X5.000 Y37.240
G1 X5.000 Y46.000
G0 Z2.000

G0 X33.200 Y17.000
G1 Z-0.100 F150
G1 X40.000 Y17.000 F450
G1 X45.000 Y12.000
G1 X45.000 Y4.000
G0 Z2.000

G0 X33.200 Y22.080
G1 Z-0.100 F150
G1 X38.000 Y22.080 F450
G1 X42.000 Y18.080
G1 X42.000 Y4.000
G0 Z2.000

G0 X33.200 Y27.160
G1 Z-0.100 F150
G1 X38.000 Y27.160 F450
G1 X42.000 Y31.160
G1 X42.000 Y46.000
G0 Z2.000

G0 X33.200 Y32.240
G1 Z-0.100 F150
G1 X40.000 Y32.240 F450
G1 X45.000 Y37.240
G1 X45.000 Y46.000
G0 Z2.000

; --- Serpentin de calibration de gravure fine au centre ---
G0 X22.000 Y15.000
G1 Z-0.100 F150
G1 X28.000 Y15.000 F450
G1 X28.000 Y19.000
G1 X22.000 Y19.000
G1 X22.000 Y23.000
G1 X28.000 Y23.000
G1 X28.000 Y27.000
G1 X22.000 Y27.000
G1 X22.000 Y31.000
G1 X28.000 Y31.000
G1 X28.000 Y35.000
G1 X22.000 Y35.000

G0 Z5.000
M5
G0 X0.000 Y0.000
M30`,
  },
];
