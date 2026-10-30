import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import ClipperLib from "clipper-lib";
import { importSvg } from "../src/utils/laserImport";
import { laserFillRegions, prepareLaserFill } from "../src/utils/laserFill";
import {
  boundsOfPaths,
  placePaths,
  type LaserPath,
} from "../src/utils/laserCam";

globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
const svg = (shapes: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="20mm" viewBox="0 0 20 20">${shapes}</svg>`;
const regionArea = (regions: LaserPath[]) =>
  Math.abs(
    regions.reduce(
      (area, path) =>
        area +
        ClipperLib.Clipper.Area(path.points.map((p) => ({ X: p.x, Y: p.y }))),
      0,
    ),
  );
const fill = {
  mode: "fill" as const,
  spacing: 0.2,
  angle: 0,
  crossHatch: false,
  respectSvgFill: true,
};
const fixture = readFileSync(
  new URL("./fixtures/laser-wolf-white-background.svg", import.meta.url),
  "utf8",
);

test("SVG réel : le fond Illustrator blanc ne comble pas le loup ni ses évidements", () => {
  const result = importSvg(fixture);
  assert.equal(result.paths[0].fillOperation, "subtract");
  assert.equal(result.paths[0].contourEnabled, false);
  const ink = result.paths.filter((path) => path.fillOperation !== "subtract");
  const inkBounds = boundsOfPaths(ink),
    pageBounds = boundsOfPaths(result.paths);
  assert.ok(
    result.widthMm < pageBounds.width * 0.7,
    "Le fond blanc ne doit pas dicter la largeur du motif",
  );
  assert.equal(result.widthMm, inkBounds.width);
  const regions = laserFillRegions(result.paths, true);
  assert.ok(regions.length > 2, "Les zones évidées doivent subsister");
  assert.ok(
    regionArea(regions) < result.widthMm * result.heightMm * 0.6,
    "Le remplissage ne doit pas couvrir le rectangle complet",
  );
  const withoutBackground = laserFillRegions(ink, true);
  assert.ok(
    Math.abs(regionArea(regions) - regionArea(withoutBackground)) < 0.001,
  );
  const placed = placePaths(result.paths, {
    width: 100,
    height: (100 * result.heightMm) / result.widthMm,
    x: 10,
    y: 10,
    rotation: 0,
    mirrorX: false,
    mirrorY: false,
    anchor: "bottom-left",
  });
  const a = prepareLaserFill(placed, fill, 0.15),
    b = prepareLaserFill(
      placed.filter((p) => p.fillOperation !== "subtract"),
      fill,
      0.15,
    );
  assert.deepEqual(
    a.paths,
    b.paths,
    "Avec ou sans fond blanc, le G-code doit graver les mêmes hachures",
  );
  const contours = prepareLaserFill(
    placed,
    { ...fill, mode: "contours" },
    0.15,
  );
  assert.ok(contours.paths.every((p) => p.fillOperation !== "subtract"));
  const mixed = prepareLaserFill(
    placed,
    { ...fill, mode: "fill-and-contours" },
    0.15,
  );
  const bounds = boundsOfPaths(mixed.paths);
  assert.ok(
    Math.abs(bounds.width - 100) < 0.01,
    "Le contour du fond blanc ne doit pas être ajouté après le remplissage",
  );
});

test("SVG : blanc au-dessus du noir soustrait, noir ultérieur rétablit une île", () => {
  const result = importSvg(
    svg(
      '<rect width="20" height="20" fill="black"/><rect x="5" y="5" width="10" height="10" fill="white"/><rect x="8" y="8" width="4" height="4" fill="black"/>',
    ),
  );
  assert.equal(regionArea(laserFillRegions(result.paths, true)), 316);
  const reversed = importSvg(
    svg(
      '<rect x="5" y="5" width="10" height="10" fill="white"/><rect width="20" height="20" fill="black"/>',
    ),
  );
  assert.equal(regionArea(laserFillRegions(reversed.paths, true)), 400);
  const knockout = importSvg(
    svg(
      '<rect width="20" height="20" fill="black"/><rect x="5" y="5" width="10" height="10" fill="#FFF"/>',
    ),
  );
  assert.equal(
    regionArea(laserFillRegions(knockout.paths, false)),
    300,
    "Forcer le remplissage des contours ne doit pas réactiver les blancs",
  );
  const erased = importSvg(
    svg(
      '<rect width="20" height="20" fill="black"/><rect width="20" height="20" fill="white"/>',
    ),
  );
  assert.throws(
    () => prepareLaserFill(erased.paths, fill, 0.15),
    /Aucune surface/,
  );
  const cropped = importSvg(
    svg(
      '<rect width="20" height="20" fill="black"/><rect x="10" width="10" height="20" fill="white"/>',
    ),
  );
  const outlines = prepareLaserFill(
    cropped.paths,
    { ...fill, mode: "contours" },
    0.15,
  );
  assert.equal(
    boundsOfPaths(outlines.paths).width,
    10,
    "Les contours noirs masqués par du blanc ne doivent pas être gravés",
  );
});

test("SVG : formats CSS du blanc, héritage de couleur et contour noir sur blanc", () => {
  for (const white of [
    "white",
    "#FFF",
    "#FFFFFF",
    "#FFFFFFFF",
    "rgb(255 255 255)",
    "rgb(100%, 100%, 100%)",
    "hsl(0 0% 100%)",
  ]) {
    const result = importSvg(
      svg(
        `<rect width="20" height="20"/><rect x="5" y="5" width="10" height="10" fill="${white}"/>`,
      ),
    );
    assert.equal(regionArea(laserFillRegions(result.paths, true)), 300, white);
  }
  const current = importSvg(
    svg(
      '<rect width="20" height="20"/><g color="white"><rect x="5" y="5" width="10" height="10" fill="currentColor"/></g>',
    ),
  );
  assert.equal(regionArea(laserFillRegions(current.paths, true)), 300);
  const stroked = importSvg(
    svg('<rect width="20" height="20" fill="white" stroke="black"/>'),
  );
  assert.equal(
    prepareLaserFill(stroked.paths, { ...fill, mode: "contours" }, 0.15).paths
      .length,
    1,
  );
});
