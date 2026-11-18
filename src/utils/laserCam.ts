import { parseGCode, stripComments } from "./gcodeParser";
import type { GCodeSegment } from "../types/cnc";

export interface Point2 {
  x: number;
  y: number;
}
export interface LaserPath {
  points: Point2[];
  power?: number;
  feed?: number;
  label?: string;
  /** SVG subpaths share a paint group so holes follow the source fill rule. */
  fillGroup?: string;
  fillRule?: "evenodd" | "nonzero";
  fillEnabled?: boolean;
  fillClosed?: boolean;
  /** Opaque SVG white knocks out earlier ink; it is never laser-on paint. */
  fillOperation?: "add" | "subtract";
  contourEnabled?: boolean;
  /** A single straight hatch segment that can receive scan compensation. */
  scanline?: true;
  compensateScan?: false;
  overscan?: number;
}

export function laserContourPaths(paths: LaserPath[]): LaserPath[] {
  return paths.filter(
    (path) => path.contourEnabled ?? path.fillOperation !== "subtract",
  );
}
export interface Bounds2 {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}
export interface Placement {
  width: number;
  height: number;
  x: number;
  y: number;
  anchor: "bottom-left" | "center";
  rotation: number;
  mirrorX: boolean;
  mirrorY: boolean;
}
export interface LaserCutSettings {
  feed: number;
  power: number;
  maxPower: number;
  passes: number;
  mode: "M3" | "M4";
  focus?: LaserFocusSettings;
  scanOffsets?: readonly LaserScanOffset[];
  contourDirection?: "original" | "reverse" | "alternate";
}
export interface LaserScanOffset {
  /** Engraving speed in mm/min. */
  feed: number;
  /** Shift in mm opposite the scan direction. */
  offset: number;
}
export const MAX_LASER_SCAN_OFFSET = 50;
export interface LaserFocusSettings {
  enabled: boolean;
  spotDiameter: number;
  offset: number;
  controlZ: boolean;
  referenceZ: number;
  zFeed: number;
  restoreZ: boolean;
}

export const defaultLaserFocusSettings: LaserFocusSettings = {
  enabled: false, spotDiameter: 1, offset: 2, controlZ: false, referenceZ: 0, zFeed: 300, restoreZ: true,
};

export function laserSpotDiameter(cut: LaserCutSettings): number {
  return cut.focus?.enabled ? cut.focus.spotDiameter : 0.15;
}

export function expandLaserBounds(bounds: Bounds2, diameter: number): Bounds2 {
  if (!Number.isFinite(diameter) || diameter < 0 || diameter > 20)
    throw new Error("Largeur de trait invalide (0 à 20 mm).");
  const radius = diameter / 2;
  return {
    minX: bounds.minX - radius,
    minY: bounds.minY - radius,
    maxX: bounds.maxX + radius,
    maxY: bounds.maxY + radius,
    width: bounds.width + diameter,
    height: bounds.height + diameter,
  };
}
export interface RasterData {
  width: number;
  height: number;
  gray: Uint8Array;
}
export interface RasterSettings {
  width: number;
  height: number;
  x: number;
  y: number;
  interval: number;
  threshold: number;
  grayscale: boolean;
  invert: boolean;
  overscan?: number;
  bidirectional?: boolean;
}
export const MAX_LASER_LINES = 300_000;
const fmt = (n: number) => Number(n.toFixed(3)).toString();
const positive = (n: number, name: string) => {
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${name} doit être supérieur à zéro.`);
};

function makeScanOffsetLookup(entries: readonly LaserScanOffset[] = []) {
  const sorted = [...entries].sort((a, b) => a.feed - b.feed);
  for (const [index, entry] of sorted.entries()) {
    positive(entry.feed, "La vitesse de compensation du balayage");
    if (!Number.isFinite(entry.offset) || Math.abs(entry.offset) > MAX_LASER_SCAN_OFFSET)
      throw new Error(`Le décalage du balayage doit être compris entre −${MAX_LASER_SCAN_OFFSET} et +${MAX_LASER_SCAN_OFFSET} mm.`);
    if (index > 0 && sorted[index - 1].feed === entry.feed)
      throw new Error("La table de compensation contient deux fois la même vitesse.");
  }
  return (feed: number) => {
    if (!sorted.length) return 0;
    if (feed <= sorted[0].feed) return sorted[0].offset;
    const upperIndex = sorted.findIndex((entry) => entry.feed >= feed);
    if (upperIndex < 0) return sorted[sorted.length - 1].offset;
    const lower = sorted[upperIndex - 1], upper = sorted[upperIndex];
    const ratio = (feed - lower.feed) / (upper.feed - lower.feed);
    return lower.offset + ratio * (upper.offset - lower.offset);
  };
}

function shiftScanline(points: Point2[], offset: number) {
  if (!offset || points.length !== 2) return points;
  const dx = points[1].x - points[0].x;
  const dy = points[1].y - points[0].y;
  const length = Math.hypot(dx, dy);
  if (!length) return points;
  const shift = offset / length;
  return points.map(({ x, y }) => ({ x: x - dx * shift, y: y - dy * shift }));
}

export function boundsOfPaths(paths: LaserPath[]): Bounds2 {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const path of paths)
    for (const p of path.points) {
      if (
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        Math.abs(p.x) > 100_000 ||
        Math.abs(p.y) > 100_000
      )
        throw new Error(
          "Le dessin contient des coordonnées invalides ou dépasse 100 000 mm.",
        );
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  if (!Number.isFinite(minX))
    throw new Error("Aucun contour exploitable dans ce dessin.");
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function placePaths(paths: LaserPath[], config: Placement): LaserPath[] {
  const b = boundsOfPaths(laserContourPaths(paths));
  if (b.width > 0) positive(config.width, "La largeur");
  if (b.height > 0) positive(config.height, "La hauteur");
  if (![config.x, config.y, config.rotation].every(Number.isFinite))
    throw new Error("Position invalide.");
  const angle = (config.rotation * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const scaled = paths.map((path) => ({
    ...path,
    points: path.points.map((p) => {
      const x =
        (p.x - b.minX) *
        (b.width ? config.width / b.width : 1) *
        (config.mirrorX ? -1 : 1);
      const y =
        (p.y - b.minY) *
        (b.height ? config.height / b.height : 1) *
        (config.mirrorY ? -1 : 1);
      return { x: x * c - y * s, y: x * s + y * c };
    }),
  }));
  const out = boundsOfPaths(laserContourPaths(scaled)),
    centered = config.anchor === "center";
  return scaled.map((path) => ({
    ...path,
    points: path.points.map((p) => ({
      x: p.x - out.minX - (centered ? out.width / 2 : 0) + config.x,
      y: p.y - out.minY - (centered ? out.height / 2 : 0) + config.y,
    })),
  }));
}

function validateCut(c: LaserCutSettings) {
  positive(c.feed, "L’avance");
  positive(c.maxPower, "La valeur S maximale");
  if (!Number.isFinite(c.power) || c.power <= 0 || c.power > 100)
    throw new Error(
      "La puissance doit être comprise entre 0 (exclu) et 100 %.",
    );
  if (!Number.isInteger(c.passes) || c.passes < 1 || c.passes > 50)
    throw new Error("Choisissez entre 1 et 50 passes.");
  if (!["M3", "M4"].includes(c.mode)) throw new Error("Mode laser invalide.");
  if (c.focus?.enabled) {
    const f = c.focus;
    if (
      !Number.isFinite(f.spotDiameter) ||
      f.spotDiameter < 0.02 ||
      f.spotDiameter > 20
    )
      throw new Error(
        "La largeur mesurée du spot doit être comprise entre 0,02 et 20 mm.",
      );
    if (!Number.isFinite(f.offset) || Math.abs(f.offset) > 50)
      throw new Error(
        "Le décalage de focus doit être compris entre −50 et +50 mm.",
      );
    if (
      f.controlZ &&
      (![f.referenceZ, f.zFeed, f.referenceZ + f.offset].every(
        Number.isFinite,
      ) ||
        Math.abs(f.referenceZ + f.offset) > 100_000 ||
        f.zFeed <= 0 ||
        f.zFeed > 5000)
    )
      throw new Error("Référence Z ou avance Z invalide.");
  }
}

function focusStart(f?: LaserFocusSettings): string[] {
  if (!f?.enabled) return [];
  const comment = `; Hors focus ${fmt(f.offset)} mm - spot mesure ${fmt(f.spotDiameter)} mm`;
  return f.controlZ
    ? [comment, "M5", `G1 Z${fmt(f.referenceZ + f.offset)} F${fmt(f.zFeed)}`]
    : [
        comment,
        "; Mise au point manuelle avant lancement - aucun deplacement Z",
      ];
}
function focusEnd(f?: LaserFocusSettings): string[] {
  return f?.enabled && f.controlZ && f.restoreZ
    ? ["M5", `G1 Z${fmt(f.referenceZ)} F${fmt(f.zFeed)}`]
    : [];
}
const header = (name: string) => [
  `; SmartCNC laser - ${name.replace(/[\r\n]/g, " ")}`,
  "M5",
  "G21",
  "G90",
  "G17",
  "G94",
];

export function generateVectorGCode(
  paths: LaserPath[],
  cut: LaserCutSettings,
  name = "Contours",
): string {
  validateCut(cut);
  const scanOffsetAtFeed = makeScanOffsetLookup(cut.scanOffsets);
  const compensated = cut.scanOffsets?.length
    ? paths.map((path) => path.scanline && path.compensateScan !== false
      ? { ...path, points: shiftScanline(path.points, scanOffsetAtFeed(path.feed ?? cut.feed)) }
      : path)
    : paths;
  boundsOfPaths(compensated);
  const lines = [...header(name), ...focusStart(cut.focus)];
  for (let pass = 0; pass < cut.passes; pass++) {
    lines.push(`; Passe ${pass + 1}/${cut.passes}`);
    for (const path of compensated) {
      if (path.points.length < 2) continue;
      const feed = path.feed ?? cut.feed,
        percent = path.power ?? cut.power;
      positive(feed, "L’avance du contour");
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
        throw new Error("Puissance du contour invalide.");
      const power = Math.min(
        Math.floor(cut.maxPower),
        Math.round((cut.maxPower * percent) / 100),
      );
      if (power < 1)
        throw new Error(
          "La puissance choisie est trop faible pour cette échelle S.",
        );
      const reverse = !path.scanline && (cut.contourDirection === "reverse" || (cut.contourDirection === "alternate" && pass % 2 === 1));
      const points = reverse ? [...path.points].reverse() : path.points;
      const first = points[0];
      const overscan = path.scanline ? path.overscan ?? 0 : 0;
      const last = points[points.length - 1];
      const length = Math.hypot(last.x - first.x, last.y - first.y);
      const extraX = overscan && length ? overscan * (last.x - first.x) / length : 0;
      const extraY = overscan && length ? overscan * (last.y - first.y) / length : 0;
      if (path.label) lines.push(`; ${path.label.replace(/[\r\n]/g, " ")}`);
      lines.push(
        "M5",
        `G0 X${fmt(first.x - extraX)} Y${fmt(first.y - extraY)}`,
        `${cut.mode} S0`,
        `G1 F${fmt(feed)}`,
      );
      if (overscan) lines.push(`G1 X${fmt(first.x)} Y${fmt(first.y)} S0`);
      for (const p of points.slice(1))
        lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} S${power}`);
      if (overscan) lines.push(`G1 X${fmt(last.x + extraX)} Y${fmt(last.y + extraY)} S0`);
      lines.push("M5");
      if (lines.length > MAX_LASER_LINES)
        throw new Error(
          "Programme trop volumineux : réduisez le nombre de contours ou de passes.",
        );
    }
  }
  lines.push("M5", ...focusEnd(cut.focus), "G90");
  return lines.join("\n");
}

export interface MaterialTest {
  columns: number;
  rows: number;
  size: number;
  gap: number;
  minFeed: number;
  maxFeed: number;
  minPower: number;
  maxPower: number;
  hatch: number;
}
export function materialTestPaths(t: MaterialTest): LaserPath[] {
  if (
    ![t.columns, t.rows].every((n) => Number.isInteger(n) && n >= 2 && n <= 10)
  )
    throw new Error("La grille accepte de 2 à 10 lignes et colonnes.");
  positive(t.size, "La taille du carré");
  positive(t.hatch, "L’espacement de remplissage");
  if (t.hatch < 0.05 || t.size / t.hatch > 500)
    throw new Error(
      "Choisissez un espacement de remplissage plus grand (au moins 0,05 mm).",
    );
  if (!Number.isFinite(t.gap) || t.gap < 0)
    throw new Error("L’écart doit être positif ou nul.");
  positive(t.minFeed, "L’avance minimale");
  positive(t.maxFeed, "L’avance maximale");
  if (
    t.maxFeed < t.minFeed ||
    t.minPower <= 0 ||
    t.maxPower > 100 ||
    t.maxPower < t.minPower
  )
    throw new Error("Vérifiez les plages de vitesse et de puissance.");
  const paths: LaserPath[] = [];
  for (let row = 0; row < t.rows; row++)
    for (let col = 0; col < t.columns; col++) {
      const x = col * (t.size + t.gap),
        y = row * (t.size + t.gap);
      const feed =
        t.minFeed + ((t.maxFeed - t.minFeed) * col) / (t.columns - 1);
      const power =
        t.minPower + ((t.maxPower - t.minPower) * row) / (t.rows - 1);
      const points: Point2[] = [];
      const count = Math.ceil(t.size / t.hatch);
      for (let n = 0; n <= count; n++) {
        const yy = y + (n * t.size) / count;
        points.push(
          { x: x + (n % 2 ? t.size : 0), y: yy },
          { x: x + (n % 2 ? 0 : t.size), y: yy },
        );
      }
      paths.push({
        points,
        feed,
        power,
        label: `Case L${row + 1} C${col + 1} - F${fmt(feed)} - ${fmt(power)}%`,
      });
    }
  return paths;
}

export function calibrationPaths(
  kind: "square-circle" | "lines",
  size: number,
): LaserPath[] {
  positive(size, "La taille");
  if (kind === "lines")
    return Array.from({ length: 10 }, (_, i) => ({
      points: [
        { x: 0, y: (i * size) / 9 },
        { x: size, y: (i * size) / 9 },
      ],
      label: `Ligne ${i + 1}`,
    }));
  return [
    {
      points: [
        { x: 0, y: 0 },
        { x: size, y: 0 },
        { x: size, y: size },
        { x: 0, y: size },
        { x: 0, y: 0 },
      ],
      label: "Carré extérieur",
    },
    {
      points: Array.from({ length: 181 }, (_, i) => ({
        x: size / 2 + size * 0.4 * Math.cos((i * Math.PI) / 90),
        y: size / 2 + size * 0.4 * Math.sin((i * Math.PI) / 90),
      })),
      label: "Cercle intérieur",
    },
  ];
}

export function generateRasterGCode(
  image: RasterData,
  config: RasterSettings,
  cut: LaserCutSettings,
  name: string,
): string {
  validateCut(cut);
  const scanOffset = config.bidirectional === false ? 0 : makeScanOffsetLookup(cut.scanOffsets)(cut.feed);
  positive(config.width, "La largeur");
  positive(config.height, "La hauteur");
  positive(config.interval, "Le pas de balayage");
  if (
    !Number.isFinite(config.threshold) ||
    config.threshold < 0 ||
    config.threshold > 255
  )
    throw new Error("Le seuil doit être compris entre 0 et 255.");
  const overscan = config.overscan ?? 0;
  if (!Number.isFinite(overscan) || overscan < 0 || overscan > 50)
    throw new Error(
      "La marge de balayage doit être comprise entre 0 et 50 mm.",
    );
  if (![config.x, config.y].every(Number.isFinite))
    throw new Error("Position invalide.");
  const cols = Math.ceil(config.width / config.interval),
    rows = Math.ceil(config.height / config.interval);
  if (cols * rows * cut.passes > 1_000_000 || cols > 10000 || rows > 10000)
    throw new Error(
      "Résolution trop élevée : augmentez le pas ou réduisez la taille / les passes (1 million de pixels maximum).",
    );
  if (config.interval < 0.025)
    throw new Error("Le pas minimal est de 0,025 mm.");
  if (
    !image.width ||
    !image.height ||
    image.gray.length !== image.width * image.height
  )
    throw new Error("Image invalide.");
  const lines = [...header(name), ...focusStart(cut.focus)],
    dx = config.width / cols,
    dy = config.height / rows;
  let hasBurn = false;
  for (let pass = 0; pass < cut.passes; pass++) {
    lines.push(`; Passe ${pass + 1}/${cut.passes}`);
    for (let row = 0; row < rows; row++) {
      const values: number[] = [];
      for (let col = 0; col < cols; col++) {
        const sx = Math.min(
          image.width - 1,
          Math.floor(((col + 0.5) / cols) * image.width),
        );
        const sy = Math.min(
          image.height - 1,
          Math.floor(((row + 0.5) / rows) * image.height),
        );
        let gray = image.gray[sy * image.width + sx];
        if (config.invert) gray = 255 - gray;
        const darkness = config.grayscale
          ? (255 - gray) / 255
          : gray < config.threshold
            ? 1
            : 0;
        // 32 niveaux limitent la taille des fichiers et les variations PWM inutiles.
        values.push(
          Math.min(
            Math.floor(cut.maxPower),
            Math.round(
              (((cut.maxPower * cut.power) / 100) * Math.round(darkness * 31)) /
                31,
            ),
          ),
        );
      }
      const first = values.findIndex((v) => v > 0);
      if (first < 0) continue;
      hasBurn = true;
      let last = values.length - 1;
      while (values[last] === 0) last--;
      const reverse = config.bidirectional !== false && row % 2 === 1,
        start = reverse ? last + 1 : first;
      const y = config.y + config.height - (row + 0.5) * dy;
      const rowX = config.x + (reverse ? scanOffset : -scanOffset);
      const startX = rowX + start * dx;
      lines.push(
        "M5",
        `G0 X${fmt(startX + (reverse ? overscan : -overscan))} Y${fmt(y)}`,
        `${cut.mode} S0`,
        `G1 F${fmt(cut.feed)}`,
      );
      if (overscan) lines.push(`G1 X${fmt(startX)} S0`);
      let col = reverse ? last : first;
      while (reverse ? col >= first : col <= last) {
        const power = values[col];
        let end = col;
        while (
          reverse
            ? end > first && values[end - 1] === power
            : end < last && values[end + 1] === power
        )
          end += reverse ? -1 : 1;
        const edge = reverse ? end : end + 1;
        lines.push(`G1 X${fmt(rowX + edge * dx)} S${power}`);
        col = end + (reverse ? -1 : 1);
      }
      if (overscan)
        lines.push(
          `G1 X${fmt(rowX + (reverse ? first * dx - overscan : (last + 1) * dx + overscan))} S0`,
        );
      lines.push("M5");
      if (lines.length > MAX_LASER_LINES)
        throw new Error(
          "Programme trop volumineux : augmentez le pas de balayage.",
        );
    }
  }
  if (!hasBurn)
    throw new Error(
      "L’image ne contient aucun pixel à graver avec ces paramètres.",
    );
  lines.push("M5", ...focusEnd(cut.focus), "G90");
  return lines.join("\n");
}

export function analyseLaserGCode(code: string, name: string) {
  // Units apply to the entire block, including words preceding G20/G21.
  const rawLines = code.split(/\r?\n/);
  const normalized = rawLines
    .map((line) => {
      const unit = stripComments(line).match(/G\s*(20|21)(?![\d.])/i);
      return unit ? `G${unit[1]} ${line}` : line;
    })
    .join("\n");
  const parsed = { ...parseGCode(normalized, name), lines: rawLines },
    enabled: boolean[] = [],
    warnings = new Set<string>();
  const burningLines = new Set(
    parsed.segments
      .filter((s) => s.type !== "G0" && s.spindleSpeed > 0)
      .map((s) => s.lineIndex),
  );
  const coordinateSystems = new Set<string>();
  let on = false,
    ended = false,
    absolute = true,
    knownX = false,
    knownY = false;
  for (const [i, line] of parsed.lines.entries()) {
    const clean = stripComments(line).toUpperCase();
    const words = [...clean.matchAll(/([GM])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g)];
    for (const [, letter, value] of words) {
      const n = Number(value);
      if (letter === "M") {
        if (n === 3 || n === 4) on = true;
        if (n === 5) on = false;
        if (n === 2 || n === 30) ended = true;
      } else if (
        ![
          0, 1, 2, 3, 4, 17, 20, 21, 54, 55, 56, 57, 58, 59, 90, 91, 94,
        ].includes(n)
      ) {
        warnings.add(
          `G${n} : position ou mouvement non pris en charge par l’aperçu. Cadrage désactivé.`,
        );
      }
      if (letter === "G" && n >= 54 && n <= 59) coordinateSystems.add(`G${n}`);
      if (letter === "G" && n === 90) absolute = true;
      if (letter === "G" && n === 91) absolute = false;
    }
    if (/[XYIJR]\s*[+-]?(?:\d|\.)/.test(clean) && !ended) {
      // An unknown initial position cannot produce reliable engraving limits.
      const hasX = /X\s*[+-]?(?:\d|\.)/.test(clean),
        hasY = /Y\s*[+-]?(?:\d|\.)/.test(clean);
      if (on && burningLines.has(i) && (!knownX || !knownY))
        warnings.add(
          "Départ XY non défini avant la gravure : aperçu relatif à X0 Y0, cadrage désactivé.",
        );
      if (absolute) {
        knownX ||= hasX;
        knownY ||= hasY;
      }
    }
    if (/\$|\b[ABCUVW]\s*[+-]?\d/.test(clean))
      warnings.add(
        "Commande machine ou axe supplémentaire : cadrage non disponible.",
      );
    enabled[i] = on && !ended;
  }
  const engraving = parsed.segments.filter(
    (s) => s.type !== "G0" && s.spindleSpeed > 0 && enabled[s.lineIndex],
  );
  let bounds: Bounds2 | null = null;
  if (engraving.length)
    bounds = boundsOfPaths(
      engraving.map((s) => ({ points: [s.start, s.end] })),
    );
  // Les arcs du parseur sont discrétisés ; les limites ne sont donc qu'approximatives.
  const hasArcs = engraving.some((s) => s.type === "G2" || s.type === "G3");
  if (hasArcs)
    warnings.add(
      "Arcs G2/G3 : aperçu discrétisé. Convertissez en segments G1 pour le cadrage.",
    );
  return {
    ...parsed,
    engraving,
    bounds,
    coordinateSystems: [...coordinateSystems],
    warnings: [...warnings],
    canFrame: !!bounds && !warnings.size,
  };
}

export function framingGCode(
  bounds: Bounds2,
  margin: number,
  feed: number,
): string {
  positive(feed, "L’avance de cadrage");
  if (!Number.isFinite(margin) || margin < 0)
    throw new Error("Marge invalide.");
  const { minX, minY, maxX, maxY } = bounds;
  if (![minX, minY, maxX, maxY].every(Number.isFinite))
    throw new Error("Limites invalides.");
  return [
    ...header("Cadrage sans émission laser"),
    `G0 X${fmt(minX - margin)} Y${fmt(minY - margin)}`,
    ...[
      [maxX + margin, minY - margin],
      [maxX + margin, maxY + margin],
      [minX - margin, maxY + margin],
      [minX - margin, minY - margin],
    ].map(([x, y]) => `G1 X${fmt(x)} Y${fmt(y)} F${fmt(feed)}`),
    "M5",
  ].join("\n");
}

export function previewPath(segments: GCodeSegment[], limit = 16000): string {
  // Sous-échantillonner les segments plutôt que de les joindre évite les faux traits.
  const stride = Math.max(1, Math.ceil(segments.length / limit));
  let path = "";
  for (let i = 0; i < segments.length; i += stride) {
    const s = segments[i];
    path += `M${fmt(s.start.x)},${fmt(-s.start.y)}L${fmt(s.end.x)},${fmt(-s.end.y)}`;
  }
  return path;
}
