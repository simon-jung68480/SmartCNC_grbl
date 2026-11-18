import type { LaserCutSettings } from "./laserCam";
import type { LaserDocumentObject } from "./laserDocument";
import { preserveLegacyLaserColors, type LaserLayerSettings } from "./laserLayerSettings";

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
function validateOperation(value: unknown) {
  const c = record(value);
  if (!finite(c.feed, 0.001) || !finite(c.power, 0.001, 100) ||
      !Number.isInteger(c.passes) || !finite(c.passes, 1, 50)) invalid();
  if (c.contourDirection !== undefined && !["original", "reverse", "alternate"].includes(c.contourDirection)) invalid();
  return c;
}
function validateRecipeCut(value: unknown) {
  const c = validateOperation(value);
  if (c.focus !== undefined) {
    const f = record(c.focus);
    if (![f.enabled, f.controlZ, f.restoreZ].every(bool) ||
        !finite(f.spotDiameter, 0.02, 20) || !finite(f.offset) ||
        !finite(f.referenceZ) || !finite(f.zFeed, 0.001)) invalid();
  }
  return c;
}

function validateCut(value: unknown) {
  const c = validateRecipeCut(value);
  if (!finite(c.maxPower, 0.001, 1_000_000) || !["M3", "M4"].includes(c.mode)) invalid();
}

function validateFill(value: unknown) {
  const fill = record(value);
  if (!["contours", "fill", "fill-and-contours"].includes(fill.mode) ||
      !finite(fill.spacing, 0.001, 100) || !finite(fill.angle) || !bool(fill.crossHatch) || !bool(fill.respectSvgFill) ||
      (fill.bidirectional !== undefined && !bool(fill.bidirectional)) ||
      (fill.overscan !== undefined && !finite(fill.overscan, 0, 50))) invalid();
}

function validateRasterSettings(value: unknown) {
  const settings = record(value);
  if (!finite(settings.interval, 0.025) || !finite(settings.threshold, 0, 255) || !bool(settings.grayscale) || !bool(settings.invert) ||
      (settings.bidirectional !== undefined && !bool(settings.bidirectional)) ||
      (settings.overscan !== undefined && !finite(settings.overscan, 0, 50))) invalid();
}

export function validateLaserLayerSettings(value: unknown): LaserLayerSettings {
  const settings = record(value);
  validateRecipeCut(settings.cut);
  if (settings.kind === "raster") validateRasterSettings(settings.raster);
  else if (settings.kind === "vector") {
    validateFill(settings.fill);
    if (settings.contourCut !== undefined) validateOperation(settings.contourCut);
  } else invalid();
  return settings as LaserLayerSettings;
}

function loadRaster(value: unknown) {
  const raster = record(value);
  const image = record(raster.image);
  validateRasterSettings(raster.settings);
  if (!Number.isInteger(image.width) || !finite(image.width, 1, 1600) ||
      !Number.isInteger(image.height) || !finite(image.height, 1, 1600) ||
      typeof image.gray !== "string" || image.gray.length !== 4 * Math.ceil(image.width * image.height / 3) ||
      typeof raster.previewUrl !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(raster.previewUrl)) invalid();
  let pixels: string;
  try { pixels = atob(image.gray); } catch { return invalid(); }
  if (pixels.length !== image.width * image.height) invalid();
  image.gray = Uint8Array.from(pixels, pixel => pixel.charCodeAt(0));
}

/** A project contains geometry and settings only; loading never sends machine commands. */
export function parseLaserProject(text: string): LaserProject {
  if (text.length > 32_000_000) throw new Error("Projet trop volumineux (32 Mo maximum).");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return invalid(); }
  const project = record(raw);
  if (project.format !== "smartcnc-laser" || ![1, 2, 3].includes(project.version) ||
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
        !Array.isArray(object.paths) || (object.raster === undefined && !object.paths.length)) invalid();
    ids.add(object.id);
    const p = record(object.placement);
    if (!finite(p.width, 0) || !finite(p.height, 0) || !finite(p.x) || !finite(p.y) ||
        !finite(p.rotation) || !["bottom-left", "center"].includes(p.anchor) || !bool(p.mirrorX) || !bool(p.mirrorY)) invalid();
    validateFill(object.fill);
    validateCut(object.cut);
    if (project.version === 1) {
      if (project.cut.focus === undefined) delete object.cut.focus;
      else object.cut.focus = { ...project.cut.focus };
    }
    if (object.contourCut !== undefined) validateOperation(object.contourCut);
    if (object.color !== undefined && (typeof object.color !== "string" || !/^#[0-9a-f]{6}$/i.test(object.color))) invalid();
    if (object.hidden !== undefined && !bool(object.hidden)) invalid();
    if (object.isolatedColor !== undefined && !bool(object.isolatedColor)) invalid();
    if (object.raster !== undefined) {
      if (object.paths.length || p.width <= 0 || p.height <= 0 || p.rotation !== 0 || p.mirrorX || p.mirrorY) invalid();
      loadRaster(object.raster);
    }
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
  return { objects: project.version < 3 ? preserveLegacyLaserColors(project.objects) : project.objects, selectedId: project.selectedId, cut: project.cut };
}

export function serializeLaserProject(project: LaserProject): string {
  const objects = project.objects.map(object => {
    if (!object.raster) return object;
    const { image } = object.raster;
    let binary = "";
    for (let index = 0; index < image.gray.length; index += 8192)
      binary += String.fromCharCode(...image.gray.subarray(index, index + 8192));
    return { ...object, raster: { ...object.raster, image: { ...image, gray: btoa(binary) } } };
  });
  const text = JSON.stringify({ format: "smartcnc-laser", version: 3, ...project, objects });
  parseLaserProject(text);
  return text;
}
