import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareLaserFill,
  laserFillRegions,
  type LaserFillSettings,
} from "../src/utils/laserFill";
import {
  boundsOfPaths,
  expandLaserBounds,
  generateVectorGCode,
  generateRasterGCode,
  type LaserPath,
  type LaserCutSettings,
} from "../src/utils/laserCam";

const rectangle = (
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<LaserPath> = {},
): LaserPath => ({
  points: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ],
  ...extra,
});
const fill: LaserFillSettings = {
  mode: "fill",
  spacing: 0.5,
  angle: 0,
  crossHatch: false,
  respectSvgFill: true,
};
const cut: LaserCutSettings = {
  feed: 1000,
  power: 20,
  maxPower: 1000,
  passes: 1,
  mode: "M4",
};

test("surfaces: trous conservés et compensation du rayon du spot sur les bords", () => {
  const result = prepareLaserFill(
    [rectangle(0, 0, 10, 10), rectangle(3, 3, 4, 4)],
    fill,
    1,
  );
  assert.ok(result.paths.length > 10);
  for (const path of result.paths) {
    const b = boundsOfPaths([path]);
    assert.ok(b.minX >= 0.5 && b.maxX <= 9.5 && b.minY >= 0.5 && b.maxY <= 9.5);
    if (b.minY > 3 && b.minY < 7)
      assert.ok(b.maxX <= 2.5 || b.minX >= 7.5, "Aucune hachure dans le trou");
  }
});

test("SVG: règles nonzero/evenodd et union des éléments peints indépendamment", () => {
  const a = rectangle(0, 0, 10, 10, {
    fillGroup: "a",
    fillRule: "nonzero",
    fillClosed: true,
    fillEnabled: true,
  });
  const b = rectangle(3, 3, 4, 4, {
    fillGroup: "a",
    fillRule: "nonzero",
    fillClosed: true,
    fillEnabled: true,
  });
  assert.equal(
    laserFillRegions([a, b], true).length,
    1,
    "Même orientation nonzero : intérieur plein",
  );
  assert.equal(
    laserFillRegions(
      [
        { ...a, fillRule: "evenodd" },
        { ...b, fillRule: "evenodd" },
      ],
      true,
    ).length,
    2,
    "Evenodd : contour extérieur + trou",
  );
  assert.equal(
    laserFillRegions(
      [
        { ...a, fillRule: "evenodd" },
        { ...b, fillGroup: "b", fillRule: "evenodd" },
      ],
      true,
    ).length,
    1,
    "Deux éléments pleins distincts ne créent pas un trou",
  );
  assert.equal(
    laserFillRegions([{ ...a, fillEnabled: false }], true).length,
    0,
  );
  assert.equal(
    laserFillRegions([{ ...a, fillEnabled: false }], false).length,
    1,
  );
});

test("surfaces: hachures croisées, angle et tracés ouverts", () => {
  const paths = [rectangle(0, 0, 10, 10)];
  const single = prepareLaserFill(paths, fill, 0.15);
  const cross = prepareLaserFill(paths, { ...fill, crossHatch: true }, 0.15);
  assert.equal(cross.paths.length, single.paths.length * 2);
  const rotated = prepareLaserFill(paths, { ...fill, angle: 45 }, 0.15);
  assert.ok(
    rotated.paths.some(
      (path) => Math.abs(path.points[1].y - path.points[0].y) > 1,
    ),
  );
  assert.throws(
    () =>
      prepareLaserFill(
        [
          {
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
          },
        ],
        fill,
        0.15,
      ),
    /Aucune surface/,
  );
  const mixed = prepareLaserFill(
    paths,
    { ...fill, mode: "fill-and-contours" },
    0.15,
  );
  assert.equal(mixed.paths.length, single.paths.length + 1);
  assert.throws(() => prepareLaserFill(paths, { ...fill, spacing: NaN }, 0.15));
  assert.throws(
    () => prepareLaserFill([rectangle(0, 0, 0.2, 0.2)], fill, 1),
    /Aucune surface/,
  );
});

test("DXF: les contours extérieurs qui se chevauchent forment une surface unie", () => {
  const regions = laserFillRegions(
    [rectangle(0, 0, 10, 10), rectangle(5, 0, 10, 10)],
    true,
  );
  assert.equal(regions.length, 1);
  const result = prepareLaserFill(
    [rectangle(0, 0, 10, 10), rectangle(5, 0, 10, 10)],
    fill,
    0.15,
  );
  assert.ok(
    result.paths.some(
      (path) =>
        boundsOfPaths([path]).minX < 5 && boundsOfPaths([path]).maxX > 10,
    ),
    "La zone de recouvrement doit être remplie",
  );
});

const focused: LaserCutSettings = {
  ...cut,
  focus: {
    enabled: true,
    spotDiameter: 1.2,
    offset: 2,
    controlZ: false,
    referenceZ: 10,
    zFeed: 200,
    restoreZ: true,
  },
};
function checkZLaserOff(code: string) {
  let on = false,
    zMoves = 0;
  for (const line of code.split("\n")) {
    if (line === "M5") on = false;
    if (/^M[34]/.test(line)) on = true;
    if (/^[GXYZ].*\bZ[+-]?\d/.test(line)) {
      assert.equal(
        on,
        false,
        "Le laser doit être éteint pendant tout déplacement Z",
      );
      zMoves++;
    }
  }
  return zMoves;
}
test("hors focus: manuel sans Z, Z automatique explicite et retour à la référence", () => {
  const paths = [rectangle(0, 0, 10, 10)];
  assert.equal(checkZLaserOff(generateVectorGCode(paths, focused)), 0);
  const automatic = {
    ...focused,
    focus: { ...focused.focus!, controlZ: true },
  };
  const code = generateVectorGCode(paths, automatic);
  assert.equal(checkZLaserOff(code), 2);
  assert.ok(code.includes("G1 Z12 F200"));
  assert.ok(code.includes("G1 Z10 F200"));
  assert.ok(code.indexOf("G1 Z12") < code.indexOf("G0 X"));
  const raster = generateRasterGCode(
    { width: 1, height: 1, gray: Uint8Array.from([0]) },
    {
      width: 1,
      height: 1,
      x: 0,
      y: 0,
      interval: 1,
      threshold: 128,
      grayscale: true,
      invert: false,
    },
    automatic,
    "image",
  );
  assert.equal(checkZLaserOff(raster), 2);
  assert.equal(
    checkZLaserOff(
      generateVectorGCode(paths, {
        ...automatic,
        focus: { ...automatic.focus, restoreZ: false },
      }),
    ),
    1,
  );
  assert.throws(() =>
    generateVectorGCode(paths, {
      ...automatic,
      focus: { ...automatic.focus, spotDiameter: NaN },
    }),
  );
  assert.throws(() =>
    generateVectorGCode(paths, {
      ...automatic,
      focus: { ...automatic.focus, zFeed: 0 },
    }),
  );
});

test("traits larges: limites et cadrage incluent le rayon mesuré", () => {
  const expanded = expandLaserBounds(
    { minX: 10, minY: 20, maxX: 30, maxY: 40, width: 20, height: 20 },
    2,
  );
  assert.deepEqual(expanded, {
    minX: 9,
    minY: 19,
    maxX: 31,
    maxY: 41,
    width: 22,
    height: 22,
  });
});
