import type { LaserCutSettings } from "./laserCam";
import type { LaserDocumentObject } from "./laserDocument";

export interface LaserProject {
  objects: LaserDocumentObject[];
  selectedId: string;
  cut: LaserCutSettings;
}

const invalid = () => { throw new Error("Projet laser invalide ou incompatible."); };
const record = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : invalid();
const finite = (v: unknown, min = -100_000, max = 100_000) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const bool = (v: unknown) => typeof v === "boolean";
function validateCut(value: unknown) {
  const c = record(value);
  if (!finite(c.feed, 0.001) || !finite(c.power, 0.001, 100) ||
      !finite(c.maxPower, 0.001, 1_000_000) || !Number.isInteger(c.passes) ||
      !finite(c.passes, 1, 50) || !["M3", "M4"].includes(c.mode)) invalid();
  if (c.focus !== undefined) {
    const f = record(c.focus);
    if (![f.enabled, f.controlZ, f.restoreZ].every(bool) ||
        !finite(f.spotDiameter, 0.02, 20) || !finite(f.offset) ||
        !finite(f.referenceZ) || !finite(f.zFeed, 0.001)) invalid();
  }
}

/** A project contains geometry and settings only; loading never sends machine commands. */
export function parseLaserProject(text: string): LaserProject {
  if (text.length > 32_000_000) throw new Error("Projet trop volumineux (32 Mo maximum).");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return invalid(); }
  const project = record(raw);
  if (project.format !== "smartcnc-laser" || project.version !== 1 ||
      !Array.isArray(project.objects) || !project.objects.length || project.objects.length > 200 ||
      typeof project.selectedId !== "string") invalid();
  validateCut(project.cut);
  const ids = new Set<string>();
  let points = 0;
  for (const value of project.objects) {
    const object = record(value);
    if (typeof object.id !== "string" || !object.id || ids.has(object.id) ||
        typeof object.name !== "string" || object.name.length > 1000 || !bool(object.enabled) ||
        !Array.isArray(object.warnings) || !object.warnings.every((v: unknown) => typeof v === "string") ||
        !Array.isArray(object.paths) || !object.paths.length) invalid();
    ids.add(object.id);
    const p = record(object.placement), fill = record(object.fill);
    if (!finite(p.width, 0) || !finite(p.height, 0) || !finite(p.x) || !finite(p.y) ||
        !finite(p.rotation) || !["bottom-left", "center"].includes(p.anchor) ||
        !bool(p.mirrorX) || !bool(p.mirrorY) ||
        !["contours", "fill", "fill-and-contours"].includes(fill.mode) ||
        !finite(fill.spacing, 0.001, 100) || !finite(fill.angle) ||
        !bool(fill.crossHatch) || !bool(fill.respectSvgFill)) invalid();
    validateCut(object.cut);
    for (const value of object.paths) {
      const path = record(value);
      if (!Array.isArray(path.points) || path.points.length < 2) invalid();
      points += path.points.length;
      if (points > 200_000) throw new Error("Projet trop détaillé (200 000 points maximum).");
      for (const value of path.points) {
        const point = record(value);
        if (!finite(point.x) || !finite(point.y)) invalid();
      }
      if (path.power !== undefined && !finite(path.power, 0, 100)) invalid();
      if (path.feed !== undefined && !finite(path.feed, 0.001)) invalid();
      for (const key of ["fillEnabled", "fillClosed", "contourEnabled"])
        if (path[key] !== undefined && !bool(path[key])) invalid();
      if (path.fillRule !== undefined && !["evenodd", "nonzero"].includes(path.fillRule)) invalid();
      if (path.fillOperation !== undefined && !["add", "subtract"].includes(path.fillOperation)) invalid();
      if (path.fillGroup !== undefined && typeof path.fillGroup !== "string") invalid();
    }
  }
  if (!ids.has(project.selectedId)) invalid();
  return { objects: project.objects, selectedId: project.selectedId, cut: project.cut };
}

export function serializeLaserProject(project: LaserProject): string {
  const text = JSON.stringify({ format: "smartcnc-laser", version: 1, ...project });
  parseLaserProject(text);
  return text;
}
