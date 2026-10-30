import assert from "node:assert/strict";
import test from "node:test";
import {
  analyseLaserGCode,
  boundsOfPaths,
  calibrationPaths,
  framingGCode,
  generateRasterGCode,
  generateVectorGCode,
  materialTestPaths,
  placePaths,
  type LaserCutSettings,
} from "../src/utils/laserCam";
import { flattenSvgPath, importDxf } from "../src/utils/laserImport";

const cut: LaserCutSettings = {
  feed: 1000,
  power: 20,
  maxPower: 1000,
  passes: 1,
  mode: "M4",
};
const codeWords = (code: string) =>
  code.split("\n").filter((line) => !line.startsWith(";"));

test("contours: placement, passes et puissance, laser éteint à chaque transition", () => {
  const paths = placePaths(calibrationPaths("square-circle", 10), {
    width: 20,
    height: 10,
    x: 30,
    y: 40,
    rotation: 90,
    mirrorX: true,
    mirrorY: false,
    anchor: "center",
  });
  const bounds = boundsOfPaths(paths);
  assert.deepEqual(
    [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY],
    [25, 35, 30, 50],
  );
  const code = generateVectorGCode(paths, { ...cut, passes: 2 });
  assert.ok(code.includes("S200"));
  assert.ok(code.endsWith("M5\nG90"));
  assert.equal((code.match(/M4 S0/g) || []).length, 4);
  let on = false;
  for (const line of codeWords(code)) {
    if (line === "M5") on = false;
    if (line.startsWith("M4")) on = true;
    if (line.startsWith("G0"))
      assert.equal(
        on,
        false,
        "Un déplacement rapide doit se faire laser éteint",
      );
    assert.doesNotMatch(line, /\bZ[+-]?\d/);
  }
  const analysis = analyseLaserGCode(code, "precision.nc");
  assert.equal(analysis.canFrame, true);
  assert.deepEqual(analysis.bounds, bounds);
});

test("matrice: toutes les combinaisons vitesse-puissance et dimensions attendues", () => {
  const paths = materialTestPaths({
    columns: 3,
    rows: 2,
    size: 10,
    gap: 2,
    minFeed: 500,
    maxFeed: 1500,
    minPower: 10,
    maxPower: 40,
    hatch: 1,
  });
  assert.equal(paths.length, 6);
  assert.deepEqual(
    paths.map((p) => [p.feed, p.power]),
    [
      [500, 10],
      [1000, 10],
      [1500, 10],
      [500, 40],
      [1000, 40],
      [1500, 40],
    ],
  );
  assert.equal(boundsOfPaths(paths).width, 34);
  assert.equal(boundsOfPaths(paths).height, 22);
  assert.throws(() =>
    materialTestPaths({
      columns: NaN,
      rows: 2,
      size: 10,
      gap: 2,
      minFeed: 500,
      maxFeed: 1500,
      minPower: 10,
      maxPower: 40,
      hatch: 1,
    }),
  );
});

test("raster: serpentin, blanc éteint, puissance variable et orientation verticale", () => {
  const image = {
    width: 4,
    height: 2,
    gray: Uint8Array.from([0, 255, 128, 255, 255, 0, 0, 255]),
  };
  const code = generateRasterGCode(
    image,
    {
      width: 4,
      height: 2,
      x: 10,
      y: 20,
      interval: 1,
      threshold: 128,
      grayscale: true,
      invert: false,
    },
    cut,
    "image",
  );
  assert.ok(
    code.includes("G0 X10 Y21.5"),
    "La première ligne image doit être en haut",
  );
  assert.ok(
    code.includes("G0 X13 Y20.5"),
    "La deuxième ligne doit partir de droite",
  );
  assert.ok(
    code.includes("G1 X12 S0"),
    "La zone blanche doit éteindre le laser",
  );
  const analysis = analyseLaserGCode(code, "image.nc");
  assert.deepEqual(analysis.bounds, {
    minX: 10,
    minY: 20.5,
    maxX: 13,
    maxY: 21.5,
    width: 3,
    height: 1,
  });
  assert.throws(
    () =>
      generateRasterGCode(
        { width: 1, height: 1, gray: Uint8Array.from([255]) },
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
        cut,
        "blank",
      ),
    /aucun pixel/,
  );
});

test("cadrage: marge, aucun M3/M4 ni Z et limites de gravure sans déplacements rapides", () => {
  const analysis = analyseLaserGCode(
    "G21 G90\nM5\nG0 X10 Y20\nM4 S100\nG1 X30 Y40 F1000\nM5\nG0 X100 Y200",
    "test",
  );
  assert.deepEqual(analysis.bounds, {
    minX: 10,
    minY: 20,
    maxX: 30,
    maxY: 40,
    width: 20,
    height: 20,
  });
  const code = framingGCode(analysis.bounds!, 2, 500);
  assert.ok(code.includes("G0 X8 Y18"));
  assert.ok(code.includes("G1 X32 Y42 F500"));
  assert.doesNotMatch(codeWords(code).join("\n"), /\bM[34]\b|\bZ\d/);
  assert.equal(analyseLaserGCode("M3 S0\nG1 X10 F500", "zero").bounds, null);
  assert.equal(
    analyseLaserGCode("M3 S100\nG53 G1 X10 F500", "machine").canFrame,
    false,
  );
  assert.equal(
    analyseLaserGCode("M3 S100\nG2 X10 Y0 I5 J0 F500", "arc").canFrame,
    false,
  );
});

test("SVG: sous-chemins distincts, courbes et transformations sans raccord gravé", () => {
  const paths = flattenSvgPath(
    "M0 0h10v10z M20 0c0 10 10 10 10 0",
    "translate(10 20) scale(2)",
  );
  assert.equal(paths.length, 2);
  assert.deepEqual(paths[0].points[0], { x: 10, y: 20 });
  assert.deepEqual(paths[1].points[0], { x: 50, y: 20 });
  assert.ok(paths[1].points.length > 3);
  assert.equal(boundsOfPaths(paths).maxX, 70);
});

const dxf = (entities: string, extra = "") =>
  `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n${extra}0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
test("DXF: lignes, cercle et polyligne fermée avec bulge", () => {
  const result = importDxf(
    dxf(
      "0\nLINE\n8\n0\n10\n0\n20\n0\n30\n0\n11\n10\n21\n0\n31\n0\n0\nCIRCLE\n8\n0\n10\n20\n20\n20\n40\n5\n0\nLWPOLYLINE\n8\n0\n90\n2\n70\n1\n10\n0\n20\n0\n42\n1\n10\n10\n20\n0\n",
    ),
  );
  assert.equal(result.paths.length, 3);
  const poly = result.paths[2].points;
  assert.deepEqual(poly[0], poly.at(-1));
  assert.ok(
    poly.some((p) => p.y < -4.9),
    "Le bulge doit être un arc, pas une corde",
  );
  assert.equal(result.warnings.length, 0);
  assert.throws(() => importDxf("AutoCAD Binary DXF"), /binaire/);
});

test("les données invalides ne produisent pas de coordonnées ni puissances non finies", () => {
  assert.throws(() =>
    generateVectorGCode(
      [
        {
          points: [
            { x: 0, y: 0 },
            { x: NaN, y: 1 },
          ],
        },
      ],
      cut,
    ),
  );
  assert.throws(() =>
    generateVectorGCode(calibrationPaths("lines", 10), {
      ...cut,
      maxPower: NaN,
    }),
  );
  assert.throws(() =>
    generateRasterGCode(
      { width: 1, height: 1, gray: Uint8Array.from([0]) },
      {
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        interval: 0.01,
        threshold: 128,
        grayscale: true,
        invert: false,
      },
      cut,
      "large",
    ),
  );
});

test("balayage: accélération hors gravure à puissance nulle et limites inchangées", () => {
  const code = generateRasterGCode(
    { width: 1, height: 1, gray: Uint8Array.from([0]) },
    {
      width: 10,
      height: 1,
      x: 0,
      y: 0,
      interval: 1,
      threshold: 128,
      grayscale: true,
      invert: false,
      overscan: 3,
    },
    cut,
    "overscan",
  );
  assert.ok(code.includes("G0 X-3 Y0.5"));
  assert.ok(code.includes("G1 X0 S0"));
  assert.ok(code.includes("G1 X13 S0"));
  assert.equal(analyseLaserGCode(code, "overscan").bounds?.width, 10);
});

test("G-code importé: unités pour le bloc entier et départ indéterminé signalé", () => {
  const code = "G90\nM5\nX1 Y1 G20 G0\nM4 S100\nG1 X2 Y2 F100\nM5";
  assert.deepEqual(analyseLaserGCode(code, "inch").bounds, {
    minX: 25.4,
    minY: 25.4,
    maxX: 50.8,
    maxY: 50.8,
    width: 25.4,
    height: 25.4,
  });
  assert.equal(
    analyseLaserGCode("G91\nM4 S100\nG1 X10 Y10 F1000", "relative").canFrame,
    false,
  );
});

test("DXF: spline cubique et instance de bloc transformée", () => {
  const spline =
    "0\nSPLINE\n8\n0\n70\n8\n71\n3\n72\n8\n73\n4\n74\n0\n" +
    [0, 0, 0, 0, 1, 1, 1, 1].map((k) => `40\n${k}\n`).join("") +
    [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
    ]
      .map(([x, y]) => `10\n${x}\n20\n${y}\n30\n0\n`)
      .join("");
  const curve = importDxf(dxf(spline));
  assert.equal(curve.paths.length, 1);
  assert.deepEqual(curve.paths[0].points[0], { x: 0, y: 0 });
  assert.deepEqual(curve.paths[0].points.at(-1), { x: 10, y: 0 });
  assert.equal(curve.heightMm, 7.5);
  const block =
    "0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n8\n0\n2\nTEST\n70\n0\n10\n0\n20\n0\n30\n0\n0\nLINE\n8\n0\n10\n0\n20\n0\n30\n0\n11\n10\n21\n0\n31\n0\n0\nENDBLK\n0\nENDSEC\n";
  const drawing = importDxf(
    dxf(
      "0\nINSERT\n8\n0\n2\nTEST\n10\n20\n20\n30\n30\n0\n41\n2\n42\n2\n50\n90\n",
      block,
    ),
  );
  assert.deepEqual(drawing.paths[0].points[0], { x: 20, y: 30 });
  assert.ok(Math.abs(drawing.paths[0].points[1].x - 20) < 1e-8);
  assert.equal(drawing.paths[0].points[1].y, 50);
});
