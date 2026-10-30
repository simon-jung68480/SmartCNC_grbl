import ClipperLib from "clipper-lib";
import {
  boundsOfPaths,
  laserContourPaths,
  type LaserPath,
  type Point2,
} from "./laserCam";

export interface LaserFillSettings {
  mode: "contours" | "fill" | "fill-and-contours";
  spacing: number;
  angle: number;
  crossHatch: boolean;
  respectSvgFill: boolean;
}

const SCALE = 10000;
const same = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y) < 0.001;
const toInt = (points: Point2[]): ClipperLib.Path =>
  points.map((p) => ({
    X: Math.round(p.x * SCALE),
    Y: Math.round(p.y * SCALE),
  }));

function union(
  paths: ClipperLib.Paths,
  rule: "evenodd" | "nonzero",
): ClipperLib.Paths {
  const clipper = new ClipperLib.Clipper();
  clipper.StrictlySimple = true;
  clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const solution: ClipperLib.Paths = [];
  const type =
    rule === "evenodd"
      ? ClipperLib.PolyFillType.pftEvenOdd
      : ClipperLib.PolyFillType.pftNonZero;
  if (!clipper.Execute(ClipperLib.ClipType.ctUnion, solution, type, type))
    throw new Error("Impossible de calculer les surfaces du dessin.");
  return solution;
}

function subtract(
  subject: ClipperLib.Paths,
  clip: ClipperLib.Paths,
): ClipperLib.Paths {
  if (!subject.length || !clip.length) return subject;
  const clipper = new ClipperLib.Clipper(),
    solution: ClipperLib.Paths = [];
  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  if (
    !clipper.Execute(
      ClipperLib.ClipType.ctDifference,
      solution,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero,
    )
  )
    throw new Error("Impossible de calculer les zones blanches du SVG.");
  return solution;
}

function fillable(path: LaserPath, respect: boolean): boolean {
  return (
    path.points.length >= 3 &&
    (!!path.fillClosed ||
      same(path.points[0], path.points[path.points.length - 1])) &&
    (!respect || path.fillEnabled !== false)
  );
}

function dxfPaintGroups(paths: LaserPath[]): Map<LaserPath, string> {
  if (paths.length > 2500)
    throw new Error(
      "Trop de contours DXF fermés : simplifiez le dessin avant remplissage.",
    );
  const polygons = paths.map((path) => {
    const polygon = toInt(path.points);
    return {
      path,
      polygon,
      bounds: boundsOfPaths([path]),
      area: Math.abs(ClipperLib.Clipper.Area(polygon)),
    };
  });
  const parents = paths.map(() => -1);
  let comparisons = 0;
  for (let i = 0; i < polygons.length; i++) {
    const a = polygons[i],
      area = a.area;
    let parentArea = Infinity;
    for (let j = 0; j < polygons.length; j++) {
      if (i === j) continue;
      const b = polygons[j],
        bb = b.bounds,
        ab = a.bounds;
      if (
        bb.minX > ab.minX ||
        bb.minY > ab.minY ||
        bb.maxX < ab.maxX ||
        bb.maxY < ab.maxY
      )
        continue;
      const candidateArea = b.area;
      if (candidateArea <= area || candidateArea >= parentArea) continue;
      if (++comparisons > 20000)
        throw new Error(
          "Imbrication des contours trop complexe. Simplifiez le DXF.",
        );
      const clipper = new ClipperLib.Clipper(),
        outside: ClipperLib.Paths = [];
      clipper.AddPath(a.polygon, ClipperLib.PolyType.ptSubject, true);
      clipper.AddPath(b.polygon, ClipperLib.PolyType.ptClip, true);
      if (
        !clipper.Execute(
          ClipperLib.ClipType.ctDifference,
          outside,
          ClipperLib.PolyFillType.pftEvenOdd,
          ClipperLib.PolyFillType.pftEvenOdd,
        )
      )
        throw new Error("Imbrication DXF invalide.");
      if (
        !outside.some((poly) => Math.abs(ClipperLib.Clipper.Area(poly)) > 1)
      ) {
        parents[i] = j;
        parentArea = candidateArea;
      }
    }
  }
  return new Map(
    paths.map((path, i) => {
      let root = i;
      while (parents[root] >= 0) root = parents[root];
      return [path, `dxf-${root}`];
    }),
  );
}

/** Union paint groups independently, then union their painted regions. This keeps
 * SVG holes without turning overlapping independent shapes into empty areas. */
export function laserFillRegions(
  paths: LaserPath[],
  respectSvgFill: boolean,
  inset = 0,
): LaserPath[] {
  boundsOfPaths(paths);
  if (!Number.isFinite(inset) || inset < 0 || inset > 10)
    throw new Error("Compensation du spot invalide.");
  const groups = new Map<
    string,
    {
      paths: ClipperLib.Paths;
      rule: "evenodd" | "nonzero";
      operation: "add" | "subtract";
    }
  >();
  const eligible = paths.filter((path) => fillable(path, respectSvgFill));
  const dxfGroups = dxfPaintGroups(eligible.filter((path) => !path.fillGroup));
  for (const path of eligible) {
    const key = path.fillGroup || dxfGroups.get(path)!;
    const group = groups.get(key) || {
      paths: [],
      rule: path.fillRule || "evenodd",
      operation: path.fillOperation || "add",
    };
    group.paths.push(toInt(path.points));
    groups.set(key, group);
  }
  if (!groups.size) return [];
  // SVG paint order matters: white over black removes ink; black over white adds it back.
  let combined: ClipperLib.Paths = [],
    pending: ClipperLib.Paths = [];
  const flush = () => {
    if (pending.length) {
      combined = union([...combined, ...pending], "nonzero");
      pending = [];
    }
  };
  for (const group of groups.values()) {
    const regions = union(group.paths, group.rule);
    if (group.operation === "subtract") {
      flush();
      combined = subtract(combined, regions);
    } else pending.push(...regions);
  }
  flush();
  if (inset > 0 && combined.length) {
    const offset = new ClipperLib.ClipperOffset(2, 0.01 * SCALE);
    offset.AddPaths(
      combined,
      ClipperLib.JoinType.jtRound,
      ClipperLib.EndType.etClosedPolygon,
    );
    const insetPaths: ClipperLib.Paths = [];
    offset.Execute(insetPaths, -inset * SCALE);
    combined = insetPaths;
  }
  return combined.map((path) => {
    const points = path.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE }));
    return {
      points: [...points, { ...points[0] }],
      fillRule: "evenodd",
      fillClosed: true,
    };
  });
}

function hatch(
  regions: LaserPath[],
  spacing: number,
  angle: number,
): LaserPath[] {
  if (!regions.length) return [];
  const radians = (angle * Math.PI) / 180,
    c = Math.cos(radians),
    s = Math.sin(radians);
  const rotate = (p: Point2) => ({
    x: p.x * c + p.y * s,
    y: -p.x * s + p.y * c,
  });
  const restore = (p: Point2) => ({
    x: p.x * c - p.y * s,
    y: p.x * s + p.y * c,
  });
  const rotated = regions.map((path) => ({ points: path.points.map(rotate) })),
    b = boundsOfPaths(rotated);
  const rows = Math.max(2, Math.ceil(b.height / spacing) + 1);
  const edges: { a: Point2; b: Point2 }[] = [];
  for (const path of rotated)
    for (let i = 1; i < path.points.length; i++)
      if (Math.abs(path.points[i].y - path.points[i - 1].y) > 1e-10)
        edges.push({ a: path.points[i - 1], b: path.points[i] });
  if (rows > 20000 || rows * edges.length > 30_000_000)
    throw new Error(
      "Remplissage trop détaillé : augmentez le pas ou simplifiez le dessin.",
    );
  const result: LaserPath[] = [];
  for (let row = 0; row < rows; row++) {
    const epsilon = Math.min(1e-7, b.height / 1000);
    const y = b.minY + epsilon + (row * (b.height - 2 * epsilon)) / (rows - 1),
      intersections: number[] = [];
    for (const { a, b: end } of edges)
      if ((a.y <= y && end.y > y) || (end.y <= y && a.y > y))
        intersections.push(a.x + ((y - a.y) * (end.x - a.x)) / (end.y - a.y));
    intersections.sort((a, b) => a - b);
    const spans: LaserPath[] = [];
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const x1 = intersections[i],
        x2 = intersections[i + 1];
      if (x2 - x1 < 0.001) continue;
      const points =
        row % 2
          ? [
              { x: x2, y },
              { x: x1, y },
            ]
          : [
              { x: x1, y },
              { x: x2, y },
            ];
      spans.push({ points: points.map(restore), label: "Remplissage" });
    }
    if (row % 2) spans.reverse();
    result.push(...spans);
    if (result.length > 35000)
      throw new Error("Trop de lignes de remplissage. Augmentez le pas.");
  }
  return result;
}

export function prepareLaserFill(
  paths: LaserPath[],
  settings: LaserFillSettings,
  spotDiameter: number,
): { paths: LaserPath[]; notes: string[] } {
  if (settings.mode === "contours") {
    const contours = laserContourPaths(paths);
    if (
      !paths.some(
        (path) =>
          path.fillOperation === "subtract" &&
          fillable(path, settings.respectSvgFill),
      )
    )
      return { paths: contours, notes: [] };
    return {
      paths: [
        ...laserFillRegions(paths, settings.respectSvgFill),
        ...contours.filter(
          (path) =>
            !fillable(path, settings.respectSvgFill) ||
            path.fillOperation === "subtract",
        ),
      ],
      notes: [],
    };
  }
  if (
    !Number.isFinite(settings.spacing) ||
    settings.spacing < 0.025 ||
    settings.spacing > 10
  )
    throw new Error(
      "Le pas de remplissage doit être compris entre 0,025 et 10 mm.",
    );
  if (!Number.isFinite(settings.angle))
    throw new Error("Angle de remplissage invalide.");
  if (!Number.isFinite(spotDiameter) || spotDiameter <= 0 || spotDiameter > 20)
    throw new Error("Largeur du spot invalide.");
  const regions = laserFillRegions(
    paths,
    settings.respectSvgFill,
    spotDiameter / 2,
  );
  const filled = [
    ...hatch(regions, settings.spacing, settings.angle),
    ...(settings.crossHatch
      ? hatch(regions, settings.spacing, settings.angle + 90)
      : []),
  ];
  if (!filled.length && settings.mode === "fill")
    throw new Error(
      "Aucune surface à remplir après compensation du spot. Vérifiez les contours fermés, les aplats SVG et la largeur mesurée du trait.",
    );
  const notes: string[] = [];
  if (filled.length)
    notes.push(
      "Le remplissage tient compte du rayon du spot mesuré ; les détails plus fins que ce spot peuvent disparaître.",
    );
  if (!filled.length)
    notes.push(
      "Aucune surface remplissable : seuls les contours sont conservés.",
    );
  if (settings.spacing > spotDiameter)
    notes.push(
      "Le pas dépasse la largeur mesurée du spot : le remplissage peut laisser des bandes non gravées.",
    );
  if (settings.crossHatch)
    notes.push(
      "Hachures croisées : chaque zone reçoit deux balayages par passe.",
    );
  if (
    paths.some(
      (p) =>
        p.points.length > 1 &&
        !p.fillClosed &&
        !same(p.points[0], p.points[p.points.length - 1]),
    )
  )
    notes.push("Les tracés ouverts ne sont pas remplis.");
  const boundaries =
    settings.mode === "fill-and-contours"
      ? laserFillRegions(paths, settings.respectSvgFill)
      : [];
  const strokes = laserContourPaths(paths).filter(
    (path) =>
      !fillable(path, settings.respectSvgFill) ||
      path.fillOperation === "subtract",
  );
  return {
    paths:
      settings.mode === "fill-and-contours"
        ? [...filled, ...boundaries, ...strokes]
        : filled,
    notes,
  };
}
