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
});

test("projet laser : rejette version inconnue, données invalides et objets ambigus", () => {
  const source = JSON.parse(serializeLaserProject(fixture()));
  for (const change of [
    (p: any) => { p.version = 2; },
    (p: any) => { p.selectedId = "missing"; },
    (p: any) => { p.objects.push(p.objects[0]); },
    (p: any) => { p.objects[0].paths[0].points[0].x = null; },
    (p: any) => { p.objects[0].fill.spacing = 0; },
    (p: any) => { p.objects[0].cut.passes = 1.5; },
    (p: any) => { p.cut.power = 120; },
    (p: any) => { p.objects[0].paths[0].fillOperation = "erase-all"; },
  ]) {
    const altered = structuredClone(source);
    change(altered);
    assert.throws(() => parseLaserProject(JSON.stringify(altered)), /invalide/);
  }
  assert.throws(() => parseLaserProject("not json"), /invalide/);
});
