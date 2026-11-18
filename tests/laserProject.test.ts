import test from "node:test";
import assert from "node:assert/strict";
import { parseLaserProject, serializeLaserProject, type LaserProject } from "../src/utils/laserProject";

function fixture(): LaserProject {
  const cut = { feed: 1200, power: 20, maxPower: 1000, passes: 1, mode: "M4" as const };
  return { selectedId: "one", cut, objects: [{
    id: "one", name: "Plaque.svg", enabled: true, warnings: [], cut,
    paths: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 20 }], fillGroup: "ink", fillRule: "evenodd" }],
    placement: { width: 10, height: 20, x: 30, y: 40, rotation: 90, anchor: "center", mirrorX: false, mirrorY: true },
    fill: { mode: "fill-and-contours", spacing: 0.1, angle: 45, crossHatch: true, respectSvgFill: true },
  }] };
}

test("projet laser : géométrie, placement et paramètres conservés au rechargement", () => {
  const project = fixture();
  assert.deepEqual(parseLaserProject(serializeLaserProject(project)), project);
  project.objects[0].contourCut = { feed: 400, power: 50, passes: 2 };
  project.objects[0].hidden = true;
  project.objects[0].color = "#0369a1";
  assert.deepEqual(parseLaserProject(serializeLaserProject(project)), project);
});

test("projet laser : un calque image conserve son aperçu, ses pixels et ses réglages", () => {
  const project = fixture();
  project.objects.push({
    ...project.objects[0], id: "image", name: "photo.png", paths: [],
    placement: { ...project.objects[0].placement, rotation: 0, mirrorY: false },
    raster: {
      image: { width: 2, height: 1, gray: new Uint8Array([0, 255]) }, previewUrl: "data:image/png;base64,AA==",
      settings: { interval: 0.2, threshold: 128, grayscale: true, invert: false, overscan: 2 },
    },
  });
  const json = serializeLaserProject(project);
  assert.deepEqual(parseLaserProject(json), project);
  const invalid = JSON.parse(json);
  invalid.objects[1].raster.image.width = 3;
  assert.throws(() => parseLaserProject(JSON.stringify(invalid)), /invalide/);
});

test("projet laser : le focus global historique est repris dans les calques", () => {
  const project = fixture();
  const focus = { enabled: true, spotDiameter: 1, offset: 2, controlZ: true, referenceZ: 0, zFeed: 300, restoreZ: true };
  const saved = JSON.parse(serializeLaserProject(project));
  saved.version = 1;
  saved.cut.focus = focus;
  saved.objects[0].cut.focus = { ...focus, offset: 5 };
  assert.deepEqual(parseLaserProject(JSON.stringify(saved)).objects[0].cut.focus, focus);
  saved.version = 2;
  assert.equal(parseLaserProject(JSON.stringify(saved)).objects[0].cut.focus?.offset, 5);
});

test("projet historique : les réglages distincts des anciens calques de même couleur sont conservés", () => {
  const project = fixture();
  project.objects[0].color = "#000000";
  project.objects.push({ ...project.objects[0], id: "two", cut: { ...project.cut, power: 70 } });
  const previous = JSON.parse(serializeLaserProject(project));
  previous.version = 2;
  const migrated = parseLaserProject(JSON.stringify(previous));
  assert.equal(migrated.objects[0].isolatedColor, undefined);
  assert.equal(migrated.objects[1].isolatedColor, true);
  assert.equal(migrated.objects[1].cut.power, 70);
  assert.equal(parseLaserProject(serializeLaserProject(migrated)).objects[1].isolatedColor, true);
});

test("projet laser : rejette version inconnue, données invalides et objets ambigus", () => {
  const source = JSON.parse(serializeLaserProject(fixture()));
  for (const change of [
    (p: any) => { p.version = 4; },
    (p: any) => { p.selectedId = "missing"; },
    (p: any) => { p.objects.push(p.objects[0]); },
    (p: any) => { p.objects[0].paths[0].points[0].x = null; },
    (p: any) => { p.objects[0].fill.spacing = 0; },
    (p: any) => { p.objects[0].cut.passes = 1.5; },
    (p: any) => { p.objects[0].contourCut = { feed: 400, power: 50, passes: 0 }; },
    (p: any) => { p.cut.power = 120; },
    (p: any) => { p.objects[0].paths[0].fillOperation = "erase-all"; },
  ]) {
    const altered = structuredClone(source);
    change(altered);
    assert.throws(() => parseLaserProject(JSON.stringify(altered)), /invalide/);
  }
  assert.throws(() => parseLaserProject("not json"), /invalide/);
});
