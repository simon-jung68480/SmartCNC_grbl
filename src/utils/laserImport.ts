import svgpath from "svgpath";
import colorString from "color-string";
import DxfParser, {
  type IEntity,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPolylineEntity,
  type ICircleEntity,
  type IArcEntity,
  type IEllipseEntity,
  type IInsertEntity,
  type ISplineEntity,
} from "dxf-parser";
import {
  boundsOfPaths,
  laserContourPaths,
  type LaserPath,
  type Point2,
  type RasterData,
} from "./laserCam";

export interface VectorImport {
  paths: LaserPath[];
  warnings: string[];
  widthMm: number;
  heightMm: number;
}
const MAX_POINTS = 200_000;

function svgPaint(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "none") return { visible: false, white: false, alpha: 0 };
  const color = colorString.get(normalized);
  if (!color)
    throw new Error(
      `Couleur SVG non prise en charge : « ${value} ». Convertissez les dégradés et motifs en image.`,
    );
  const [a, b, c, alpha] = color.value;
  const white =
    color.model === "rgb"
      ? a === 255 && b === 255 && c === 255
      : color.model === "hsl"
        ? c === 100
        : b >= 100 && c === 0;
  return { visible: alpha > 0, white, alpha };
}

/** Flatten curves adaptively. Each SVG moveto remains a separate laser-off transition. */
export function flattenSvgPath(
  d: string,
  transform = "",
  tolerance = 0.1,
): LaserPath[] {
  const path = svgpath(d).transform(transform).abs().unshort().unarc();
  if ((path as unknown as { err: string }).err)
    throw new Error(
      `Chemin SVG invalide : ${(path as unknown as { err: string }).err}`,
    );
  const paths: LaserPath[] = [];
  let points: Point2[] = [],
    current = { x: 0, y: 0 },
    start = current,
    count = 0;
  const push = (p: Point2) => {
    if (++count > MAX_POINTS)
      throw new Error("Dessin trop détaillé. Simplifiez les contours.");
    points.push(p);
    current = p;
  };
  const finish = () => {
    if (points.length > 1) paths.push({ points });
    points = [];
  };
  const mid = (a: Point2, b: Point2) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const distance = (p: Point2, a: Point2, b: Point2) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return length < 1e-10
      ? Math.hypot(p.x - a.x, p.y - a.y)
      : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) /
          length;
  };
  const cubic = (a: Point2, b: Point2, c: Point2, end: Point2, depth = 0) => {
    const polygon =
      Math.hypot(b.x - a.x, b.y - a.y) +
      Math.hypot(c.x - b.x, c.y - b.y) +
      Math.hypot(end.x - c.x, end.y - c.y);
    if (
      depth >= 16 ||
      (distance(b, a, end) <= tolerance &&
        distance(c, a, end) <= tolerance &&
        polygon - Math.hypot(end.x - a.x, end.y - a.y) <= tolerance)
    ) {
      push(end);
      return;
    }
    const ab = mid(a, b),
      bc = mid(b, c),
      cd = mid(c, end),
      abc = mid(ab, bc),
      bcd = mid(bc, cd),
      center = mid(abc, bcd);
    cubic(a, ab, abc, center, depth + 1);
    cubic(center, bcd, cd, end, depth + 1);
  };
  path.iterate((segment) => {
    switch (segment[0]) {
      case "M":
        finish();
        current = { x: segment[1], y: segment[2] };
        start = current;
        push(current);
        break;
      case "L":
        push({ x: segment[1], y: segment[2] });
        break;
      case "H":
        push({ x: segment[1], y: current.y });
        break;
      case "V":
        push({ x: current.x, y: segment[1] });
        break;
      case "C":
        cubic(
          current,
          { x: segment[1], y: segment[2] },
          { x: segment[3], y: segment[4] },
          { x: segment[5], y: segment[6] },
        );
        break;
      case "Q": {
        const control = { x: segment[1], y: segment[2] },
          end = { x: segment[3], y: segment[4] };
        cubic(
          current,
          {
            x: current.x + ((control.x - current.x) * 2) / 3,
            y: current.y + ((control.y - current.y) * 2) / 3,
          },
          {
            x: end.x + ((control.x - end.x) * 2) / 3,
            y: end.y + ((control.y - end.y) * 2) / 3,
          },
          end,
        );
        break;
      }
      case "Z":
      case "z":
        push({ ...start });
        finish();
        break;
    }
  });
  finish();
  return paths;
}

const svgLength = (value: string | null, fallback = 0): number => {
  if (value === null) return fallback;
  const match = value
    .trim()
    .match(
      /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|mm|cm|in|pt|pc)?$/i,
    );
  if (!match)
    throw new Error(
      `Longueur SVG non prise en charge : « ${value} ». Convertissez les dimensions en unités absolues.`,
    );
  const factors: Record<string, number> = {
    px: 1,
    mm: 96 / 25.4,
    cm: 96 / 2.54,
    in: 96,
    pt: 96 / 72,
    pc: 16,
  };
  return Number(match[1]) * factors[(match[2] || "px").toLowerCase()];
};

export function importSvg(text: string): VectorImport {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (
    doc.getElementsByTagName("parsererror").length ||
    root.localName !== "svg"
  )
    throw new Error("Fichier SVG invalide.");
  const warnings = new Set<string>();
  const paths: LaserPath[] = [];
  const viewBox = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewWidth =
    viewBox?.length === 4
      ? viewBox[2]
      : svgLength(root.getAttribute("width"), 100);
  const viewHeight =
    viewBox?.length === 4
      ? viewBox[3]
      : svgLength(root.getAttribute("height"), 100);
  const rootWidthPx =
    root.hasAttribute("width") && !root.getAttribute("width")?.includes("%")
      ? svgLength(root.getAttribute("width"))
      : viewWidth;
  const rootHeightPx =
    root.hasAttribute("height") && !root.getAttribute("height")?.includes("%")
      ? svgLength(root.getAttribute("height"))
      : viewHeight;
  if (
    ![viewWidth, viewHeight, rootWidthPx, rootHeightPx].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    throw new Error("Dimensions SVG invalides.");
  let scaleX = rootWidthPx / viewWidth,
    scaleY = rootHeightPx / viewHeight;
  const aspect = root.getAttribute("preserveAspectRatio") || "";
  if (!/\bnone\b/.test(aspect))
    scaleX = scaleY = /\bslice\b/.test(aspect)
      ? Math.max(scaleX, scaleY)
      : Math.min(scaleX, scaleY);
  scaleX *= 25.4 / 96;
  scaleY *= 25.4 / 96;
  let count = 0,
    paintGroup = 0;
  const visit = (
    element: Element,
    transforms: string,
    inherited = {
      fill: "black",
      rule: "nonzero" as "evenodd" | "nonzero",
      fillOpacity: 1,
      opacity: 1,
      color: "black",
      stroke: "none",
      strokeOpacity: 1,
    },
  ) => {
    const tag = element.localName;
    if (
      [
        "defs",
        "metadata",
        "title",
        "desc",
        "namedview",
        "script",
        "foreignObject",
      ].includes(tag)
    )
      return;
    const style = element.getAttribute("style") || "";
    const property = (key: string) =>
      style
        .match(new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+)`, "i"))?.[1]
        ?.trim() ?? element.getAttribute(key);
    const opacityValue = (
      value: string | null | undefined,
      fallback: number,
    ) =>
      !value || value === "inherit"
        ? fallback
        : Math.max(
            0,
            Math.min(
              1,
              Number(value.replace("%", "")) / (value.includes("%") ? 100 : 1),
            ),
          );
    const fill = property("fill"),
      rule = property("fill-rule");
    const opacity = inherited.opacity * opacityValue(property("opacity"), 1);
    const paint = {
      fill: !fill || fill === "inherit" ? inherited.fill : fill,
      rule: (!rule || rule === "inherit" ? inherited.rule : rule) as
        | "evenodd"
        | "nonzero",
      fillOpacity: opacityValue(
        property("fill-opacity"),
        inherited.fillOpacity,
      ),
      opacity,
      color:
        !property("color") || property("color") === "inherit"
          ? inherited.color
          : property("color")!,
      stroke:
        !property("stroke") || property("stroke") === "inherit"
          ? inherited.stroke
          : property("stroke")!,
      strokeOpacity: opacityValue(
        property("stroke-opacity"),
        inherited.strokeOpacity,
      ),
    };
    if (opacity === 0) return;
    if (
      element.getAttribute("display") === "none" ||
      element.getAttribute("visibility") === "hidden" ||
      /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(style)
    )
      return;
    if (
      element.hasAttribute("clip-path") ||
      element.hasAttribute("mask") ||
      /clip-path\s*:|mask\s*:|transform\s*:/i.test(style)
    )
      throw new Error(
        "SVG avec masque, découpe ou transformation CSS : appliquez ces effets puis convertissez en chemins.",
      );
    const transform =
      `${transforms} ${element.getAttribute("transform") || ""}`.trim();
    const n = (key: string, fallback = 0) =>
      svgLength(element.getAttribute(key), fallback);
    let d = "";
    switch (tag) {
      case "svg":
        if (element !== root)
          throw new Error(
            "SVG imbriqué : aplatissez le dessin en un seul document SVG.",
          );
        break;
      case "g":
      case "a":
        break;
      case "path":
        d = element.getAttribute("d") || "";
        break;
      case "line":
        d = `M${n("x1")} ${n("y1")}L${n("x2")} ${n("y2")}`;
        break;
      case "polyline":
      case "polygon": {
        const raw = element.getAttribute("points") || "";
        const values =
          raw.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi)?.map(Number) ||
          [];
        if (values.length % 2) throw new Error("Polygone SVG invalide.");
        if (values.length >= 4)
          d = `M${values[0]} ${values[1]}${values.slice(2).reduce((out, val, i) => out + (i % 2 ? ` ${val}` : `L${val}`), "")}${tag === "polygon" ? "Z" : ""}`;
        break;
      }
      case "rect": {
        const x = n("x"),
          y = n("y"),
          w = n("width"),
          h = n("height");
        const rx = Math.min(w / 2, n("rx", n("ry"))),
          ry = Math.min(h / 2, n("ry", rx));
        if (w > 0 && h > 0)
          d =
            rx > 0 && ry > 0
              ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
              : `M${x} ${y}h${w}v${h}h${-w}Z`;
        break;
      }
      case "circle":
      case "ellipse": {
        const x = n("cx"),
          y = n("cy"),
          rx = tag === "circle" ? n("r") : n("rx"),
          ry = tag === "circle" ? rx : n("ry");
        if (rx > 0 && ry > 0)
          d = `M${x - rx} ${y}A${rx} ${ry} 0 1 0 ${x + rx} ${y}A${rx} ${ry} 0 1 0 ${x - rx} ${y}Z`;
        break;
      }
      case "style":
        throw new Error(
          "SVG avec feuille de style : exportez un SVG simple avec styles et transformations appliqués aux chemins.",
        );
      default:
        warnings.add(
          `Élément SVG « ${tag} » ignoré. Convertissez les textes et les instances en chemins avant l’export.`,
        );
        return;
    }
    if (d) {
      const fillPaint = svgPaint(
        paint.fill.toLowerCase() === "currentcolor" ? paint.color : paint.fill,
      );
      const strokePaint = svgPaint(
        paint.stroke.toLowerCase() === "currentcolor"
          ? paint.color
          : paint.stroke,
      );
      const fillAlpha = fillPaint.alpha * paint.fillOpacity * paint.opacity;
      if (fillPaint.white && fillAlpha > 0 && fillAlpha < 1)
        throw new Error(
          "SVG avec blanc semi-transparent : convertissez le dessin en image pour conserver les niveaux de gris.",
        );
      if (fillPaint.white && fillAlpha > 0)
        warnings.add(
          "Les zones blanches ne sont pas gravées et retirent le noir situé sous elles.",
        );
      const fillGroup = `svg-${paintGroup++}`;
      const contours = flattenSvgPath(
        d,
        transform,
        Math.max(0.001, Math.abs(viewWidth) / 4000),
      );
      for (const contour of contours) {
        count += contour.points.length;
        if (count > MAX_POINTS)
          throw new Error("SVG trop détaillé : simplifiez les chemins.");
        // SVG Y increases downwards; machine Y increases upwards.
        paths.push({
          fillGroup,
          fillClosed: tag !== "line",
          fillOperation: fillPaint.white ? "subtract" : "add",
          contourEnabled:
            (fillPaint.visible &&
              !fillPaint.white &&
              paint.fillOpacity > 0 &&
              tag !== "line") ||
            (strokePaint.visible &&
              !strokePaint.white &&
              paint.strokeOpacity > 0),
          fillEnabled:
            tag !== "line" &&
            fillPaint.visible &&
            paint.fillOpacity > 0 &&
            paint.opacity > 0,
          fillRule: paint.rule === "evenodd" ? "evenodd" : "nonzero",
          points: contour.points.map((p) => ({
            x: p.x * scaleX,
            y: -p.y * scaleY,
          })),
        });
      }
    }
    for (const child of Array.from(element.childNodes))
      if (child.nodeType === 1) visit(child as Element, transform, paint);
  };
  visit(root, "");
  const b = boundsOfPaths(laserContourPaths(paths));
  return {
    paths,
    warnings: [...warnings],
    widthMm: b.width,
    heightMm: b.height,
  };
}

type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const apply = (p: Point2, m: Matrix): Point2 => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

function arcPoints(
  center: Point2,
  radius: number,
  start: number,
  sweep: number,
): Point2[] {
  const count = Math.min(
    2048,
    Math.max(
      8,
      Math.ceil(Math.abs(sweep) * Math.sqrt(Math.max(radius, 1) / 0.05)),
    ),
  );
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: center.x + radius * Math.cos(start + (sweep * i) / count),
    y: center.y + radius * Math.sin(start + (sweep * i) / count),
  }));
}

function bulgePoints(a: Point2 & { bulge?: number }, b: Point2): Point2[] {
  const bulge = a.bulge || 0,
    chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (Math.abs(bulge) < 1e-8 || chord < 1e-8) return [a, b];
  const offset = (chord * (1 - bulge * bulge)) / (4 * bulge);
  const center = {
    x: (a.x + b.x) / 2 - ((b.y - a.y) / chord) * offset,
    y: (a.y + b.y) / 2 + ((b.x - a.x) / chord) * offset,
  };
  const points = arcPoints(
    center,
    Math.hypot(a.x - center.x, a.y - center.y),
    Math.atan2(a.y - center.y, a.x - center.x),
    4 * Math.atan(bulge),
  );
  points[0] = a;
  points[points.length - 1] = b;
  return points;
}

export function importDxf(text: string): VectorImport {
  if (text.startsWith("AutoCAD Binary DXF"))
    throw new Error("DXF binaire non pris en charge. Exportez un DXF ASCII.");
  const doc = new DxfParser().parseSync(text);
  if (!doc?.entities) throw new Error("DXF invalide ou sans entités.");
  const warnings = new Set<string>(),
    paths: LaserPath[] = [];
  const unit = Number(doc.header?.$INSUNITS || 0);
  const units: Record<number, number> = {
    1: 25.4,
    2: 304.8,
    4: 1,
    5: 10,
    6: 1000,
    8: 0.0000254,
    9: 0.0254,
    10: 914.4,
    13: 0.001,
    14: 100,
    15: 10000,
  };
  if (unit && !units[unit])
    throw new Error(
      "Unités DXF non prises en charge. Exportez en millimètres.",
    );
  const unitScale = units[unit] || 1;
  if (!unit)
    warnings.add("DXF sans unité : 1 unité = 1 mm. Vérifiez les dimensions.");
  let count = 0;
  const add = (points: Point2[], transform: Matrix) => {
    if (points.length < 2) return;
    count += points.length;
    if (count > MAX_POINTS)
      throw new Error("DXF trop détaillé : simplifiez les entités.");
    paths.push({ points: points.map((p) => apply(p, transform)) });
  };
  const visit = (entity: IEntity, transform: Matrix, depth = 0) => {
    if (depth > 10) throw new Error("Blocs DXF récursifs ou trop imbriqués.");
    const raw = entity as unknown as {
      extrusionDirection?: { x: number; y: number; z: number };
      extrusionDirectionZ?: number;
      inPaperSpace?: boolean;
      visible?: boolean;
    };
    if (raw.inPaperSpace || raw.visible === false) return;
    const layer = doc.tables?.layer?.layers?.[entity.layer];
    if (layer && (layer.visible === false || layer.frozen)) return;
    if (
      (raw.extrusionDirection &&
        (raw.extrusionDirection.z !== 1 ||
          raw.extrusionDirection.x ||
          raw.extrusionDirection.y)) ||
      (raw.extrusionDirectionZ !== undefined && raw.extrusionDirectionZ !== 1)
    ) {
      warnings.add(
        "Entité DXF avec plan d’extrusion non XY ignorée. Aplatissez le dessin.",
      );
      return;
    }
    switch (entity.type) {
      case "LINE":
        add((entity as ILineEntity).vertices, transform);
        break;
      case "LWPOLYLINE":
      case "POLYLINE": {
        const poly = entity as ILwpolylineEntity | IPolylineEntity;
        if (
          "is3dPolygonMesh" in poly &&
          (poly.is3dPolygonMesh || poly.isPolyfaceMesh || poly.is3dPolyline)
        ) {
          warnings.add("Maillage ou polyligne 3D ignoré. Aplatissez en XY.");
          break;
        }
        const points: Point2[] = [],
          vertices = poly.vertices;
        for (let i = 0; i < vertices.length - (poly.shape ? 0 : 1); i++) {
          const arc = bulgePoints(
            vertices[i],
            vertices[(i + 1) % vertices.length],
          );
          points.push(...(i ? arc.slice(1) : arc));
        }
        add(points, transform);
        break;
      }
      case "CIRCLE":
      case "ARC": {
        const circle = entity as ICircleEntity | IArcEntity;
        let sweep =
          entity.type === "CIRCLE"
            ? Math.PI * 2
            : circle.endAngle - circle.startAngle;
        if (sweep <= 0) sweep += Math.PI * 2;
        add(
          arcPoints(
            circle.center,
            circle.radius,
            entity.type === "CIRCLE" ? 0 : circle.startAngle,
            sweep,
          ),
          transform,
        );
        break;
      }
      case "ELLIPSE": {
        const ellipse = entity as IEllipseEntity,
          major = ellipse.majorAxisEndPoint,
          angle = Math.atan2(major.y, major.x),
          r = Math.hypot(major.x, major.y);
        let sweep = ellipse.endAngle - ellipse.startAngle;
        if (sweep <= 0) sweep += Math.PI * 2;
        add(
          arcPoints({ x: 0, y: 0 }, r, ellipse.startAngle, sweep).map((p) => ({
            x:
              ellipse.center.x +
              p.x * Math.cos(angle) -
              p.y * ellipse.axisRatio * Math.sin(angle),
            y:
              ellipse.center.y +
              p.x * Math.sin(angle) +
              p.y * ellipse.axisRatio * Math.cos(angle),
          })),
          transform,
        );
        break;
      }
      case "SPLINE": {
        const spline = entity as ISplineEntity;
        const controls = spline.controlPoints || [],
          knots = spline.knotValues || [],
          degree = spline.degreeOfSplineCurve;
        if (
          spline.rational ||
          !Number.isInteger(degree) ||
          degree < 1 ||
          degree > 10 ||
          controls.length <= degree ||
          knots.length !== controls.length + degree + 1
        ) {
          warnings.add(
            "Spline DXF rationnelle ou incomplète ignorée. Convertissez-la en polyligne.",
          );
          break;
        }
        const low = knots[degree],
          high = knots[controls.length];
        if (
          !(high > low) ||
          knots.some(
            (k, i) => !Number.isFinite(k) || (i > 0 && k < knots[i - 1]),
          )
        )
          throw new Error("Nœuds de spline DXF invalides.");
        const points: Point2[] = [];
        const steps = Math.min(4096, Math.max(64, controls.length * 32));
        for (let sample = 0; sample <= steps; sample++) {
          const u = low + ((high - low) * sample) / steps;
          let span = controls.length - 1;
          if (sample < steps) {
            span = degree;
            while (span < controls.length - 1 && u >= knots[span + 1]) span++;
          }
          const d = Array.from({ length: degree + 1 }, (_, j) => ({
            ...controls[span - degree + j],
          }));
          // de Boor evaluation of a non-rational B-spline in the XY plane.
          for (let r = 1; r <= degree; r++)
            for (let j = degree; j >= r; j--) {
              const i = span - degree + j,
                denominator = knots[i + degree - r + 1] - knots[i];
              const alpha = denominator ? (u - knots[i]) / denominator : 0;
              d[j] = {
                ...d[j],
                x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
                y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
              };
            }
          points.push(d[degree]);
        }
        add(points, transform);
        break;
      }
      case "INSERT": {
        const insert = entity as IInsertEntity,
          block = doc.blocks?.[insert.name];
        if (!block) {
          warnings.add(`Bloc DXF « ${insert.name} » introuvable.`);
          break;
        }
        const angle = ((insert.rotation || 0) * Math.PI) / 180,
          c = Math.cos(angle),
          s = Math.sin(angle),
          sx = insert.xScale ?? 1,
          sy = insert.yScale ?? 1;
        const rows = insert.rowCount || 1,
          cols = insert.columnCount || 1;
        if (rows * cols > 1000)
          throw new Error("Trop d’instances de bloc DXF.");
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < cols; col++) {
            const base = block.position || { x: 0, y: 0 };
            const local: Matrix = [
              c * sx,
              s * sx,
              -s * sy,
              c * sy,
              insert.position.x +
                c * col * (insert.columnSpacing || 0) -
                s * row * (insert.rowSpacing || 0),
              insert.position.y +
                s * col * (insert.columnSpacing || 0) +
                c * row * (insert.rowSpacing || 0),
            ];
            const m = multiply(
              transform,
              multiply(local, [1, 0, 0, 1, -base.x, -base.y]),
            );
            for (const child of block.entities || [])
              visit(child, m, depth + 1);
          }
        break;
      }
      default:
        warnings.add(
          `Entité DXF « ${entity.type} » ignorée. Convertissez textes, splines et hachures en polylignes.`,
        );
    }
  };
  for (const entity of doc.entities) visit(entity, identity);
  const scaled = paths.map((path) => ({
    points: path.points.map((p) => ({
      x: p.x * unitScale,
      y: p.y * unitScale,
    })),
  }));
  const b = boundsOfPaths(scaled);
  return {
    paths: scaled,
    warnings: [...warnings],
    widthMm: b.width,
    heightMm: b.height,
  };
}

/** Decode raster locally, composite transparency on white, cap memory use. */
export async function importRaster(
  file: File,
): Promise<RasterData & { previewUrl: string }> {
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height) throw new Error("Image vide.");
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale)),
      height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Le traitement d’image est indisponible.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data,
      gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++)
      gray[i] = Math.round(
        0.2126 * rgba[i * 4] +
          0.7152 * rgba[i * 4 + 1] +
          0.0722 * rgba[i * 4 + 2],
      );
    return { width, height, gray, previewUrl: canvas.toDataURL("image/png") };
  } finally {
    image.close();
  }
}
