import assert from "node:assert/strict";
import test from "node:test";
import {
  analyseLaserGCode,
  generateRasterGCode,
  generateVectorGCode,
  type LaserCutSettings,
} from "../src/utils/laserCam";
import {
  defaultLaserJobPlacement,
  frameLaserJob,
  laserJobTranslation,
  placeLaserJob,
  type LaserJobAnchor,
} from "../src/utils/laserJobPlacement";

const bounds = { minX: 12, minY: -5, maxX: 18, maxY: 3, width: 6, height: 8 };
const cut: LaserCutSettings = { feed: 1000, power: 20, maxPower: 1000, passes: 1, mode: "M4" };

test("les neuf ancrages alignent le point choisi sur la position de travail", () => {
  const translations: Record<LaserJobAnchor, [number, number]> = {
    "bottom-left": [30, 52],
    "bottom-center": [27, 52],
    "bottom-right": [24, 52],
    "middle-left": [30, 48],
    center: [27, 48],
    "middle-right": [24, 48],
    "top-left": [30, 44],
    "top-center": [27, 44],
    "top-right": [24, 44],
  };
  for (const [anchor, [x, y]] of Object.entries(translations)) {
    assert.deepEqual(laserJobTranslation(bounds, {
      ...defaultLaserJobPlacement,
      startFrom: "current-position",
      anchor: anchor as LaserJobAnchor,
      offset: { x: 2, y: -3 },
    }, { x: 40, y: 50 }), { x, y });
  }
});

test("le repère absolu conserve le dessin et l’origine utilisateur est indépendante de la tête", () => {
  const offset = { x: 5, y: 8 };
  assert.deepEqual(laserJobTranslation(bounds, { ...defaultLaserJobPlacement, offset }), offset);
  assert.deepEqual(laserJobTranslation(bounds, { ...defaultLaserJobPlacement, startFrom: "work-origin", anchor: "top-right" }), { x: -18, y: -3 });
  assert.deepEqual(laserJobTranslation(bounds, {
    ...defaultLaserJobPlacement,
    startFrom: "user-origin",
    anchor: "top-right",
    userOrigin: { x: 25, y: 20 },
  }, { x: 900, y: 400 }), { x: 7, y: 17 });
  assert.throws(() => laserJobTranslation(bounds, { ...defaultLaserJobPlacement, startFrom: "user-origin" }), /Mémorisez/);
  assert.throws(() => laserJobTranslation(bounds, { ...defaultLaserJobPlacement, startFrom: "current-position" }), /indisponible/);
  assert.throws(() => laserJobTranslation(bounds, { ...defaultLaserJobPlacement, offset: { x: NaN, y: 0 } }), /invalide/);
});

test("le placement vectoriel conserve les commandes Z, la puissance et les commentaires", () => {
  const raw = generateVectorGCode([{ points: [{ x: 12, y: -5 }, { x: 18, y: 3 }] }], {
    ...cut,
    focus: { enabled: true, spotDiameter: 0.35, offset: 2, controlZ: true, referenceZ: 4, zFeed: 100, restoreZ: true },
  }, "Dessin X100 Y200");
  const code = placeLaserJob(`${raw}\n${raw}`, bounds, {
    ...defaultLaserJobPlacement,
    offset: { x: -1.5, y: 6 },
  });
  assert.equal(code, `${raw}\n${raw}`.replaceAll("X12 Y-5", "X10.5 Y1").replaceAll("X18 Y3", "X16.5 Y9"));
  assert.deepEqual(analyseLaserGCode(code, "Dessin").bounds, {
    minX: 10.5, minY: 1, maxX: 16.5, maxY: 9, width: 6, height: 8,
  });
});

test("la translation affecte aussi les trajets de surbalayage et le cadre reste sans laser", () => {
  const raw = generateRasterGCode({ width: 2, height: 2, gray: new Uint8Array(4) }, {
    width: 2, height: 2, x: 12, y: 8, interval: 1,
    threshold: 128, grayscale: false, invert: false, overscan: 2,
  }, cut, "Raster");
  const rawBounds = analyseLaserGCode(raw, "Raster").bounds!;
  const code = placeLaserJob(raw, rawBounds, { ...defaultLaserJobPlacement, offset: { x: 10, y: -2 } });
  assert.match(code, /G0 X20 Y7\.5/);
  assert.match(code, /G0 X26 Y6\.5/);
  assert.match(code, /G1 X22 S0/);
  assert.match(code, /G1 X24 S200/);
  const placed = analyseLaserGCode(code, "Raster").bounds!;
  const frame = frameLaserJob(placed, 1, 1000, { x: 27.5, y: 14 });
  assert.match(frame, /G0 X21 Y5\.5/);
  assert.match(frame, /G1 X25 Y8\.5 F1000/);
  assert.doesNotMatch(frame, /\bM[34]\b|\bS[1-9]/);
  assert.match(frame, /M5\nG0 X27\.5 Y14\nM5$/);
  assert.equal(analyseLaserGCode(frame, "Cadre").engraving.length, 0);
});

test("le placement refuse les mouvements XY relatifs ou en pouces", () => {
  const placement = { ...defaultLaserJobPlacement, offset: { x: 1, y: 0 } };
  assert.throws(() => placeLaserJob("G21\nG91\nG0 X3 Y2", bounds, placement), /absolus en millimètres/);
  assert.throws(() => placeLaserJob("G20\nG90\nG0 X3 Y2", bounds, placement), /absolus en millimètres/);
  assert.throws(() => placeLaserJob("G21\nG90\nG0 X100000 Y2", bounds, placement), /100 000 mm/);
});
