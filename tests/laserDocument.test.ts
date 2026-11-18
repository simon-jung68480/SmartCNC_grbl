import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseLaserGCode, type LaserCutSettings } from '../src/utils/laserCam';
import { duplicateLaserObject, generateLaserDocument, moveLaserObject, type LaserDocumentObject } from '../src/utils/laserDocument';
import { laserShapePath } from '../src/utils/laserShapes';
import { applyLaserLayerSettings, assignLaserLayerColor, laserLayerGroups, readLaserLayerSettings, shareLaserLayerSettings } from '../src/utils/laserLayerSettings';
import { parseLaserPresets } from '../src/utils/laserPresets';

const cut: LaserCutSettings = { feed: 600, power: 20, maxPower: 1000, passes: 1, mode: 'M4' };
const object = (id: string, x: number): LaserDocumentObject => ({
  id, name: id, enabled: true, warnings: [],
  paths: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }], fillEnabled: true, fillGroup: 'same-id', fillClosed: true }],
  placement: { x, y: 0, width: 10, height: 10, anchor: 'bottom-left', rotation: 0, mirrorX: false, mirrorY: false },
  cut, fill: { mode: 'contours', spacing: .1, angle: 0, crossHatch: false, respectSvgFill: true },
});

test('same-color vectors share one recipe while a same-color raster keeps its own', () => {
  const first = { ...object('first', 0), color: '#000000', cut: { ...cut, feed: 700 } };
  const second = { ...object('second', 20), color: '#000000', cut: { ...cut, feed: 200 } };
  const image: LaserDocumentObject = { ...object('photo', 40), color: '#000000', paths: [], raster: {
    image: { width: 1, height: 1, gray: new Uint8Array([0]) }, previewUrl: 'data:image/png;base64,AA==',
    settings: { grayscale: true, invert: false, interval: 1, threshold: 128 },
  } };
  assert.deepEqual(laserLayerGroups([first, image, second]).map(group => group.map(layer => layer.id)), [['first', 'second'], ['photo']]);
  const inherited = assignLaserLayerColor(second, '#000000', [first, image]);
  assert.equal(inherited.cut.feed, 700);
  const edited = shareLaserLayerSettings([first, image, second], second);
  assert.equal(edited[0].cut.feed, 200);
  assert.equal(edited[1], image);
  const { engraving } = analyseLaserGCode(generateLaserDocument([first, image, second], cut).code, 'grouped');
  assert.ok(engraving.slice(0, 8).every(segment => segment.feedRate === 700));
  assert.equal(engraving[8].feedRate, cut.feed);
  assert.deepEqual(moveLaserObject([first, image, second], second.id, 1).map(layer => layer.id), ['photo', 'first', 'second']);
});

test('presets carry machining settings without geometry or machine power scale', () => {
  const source = { ...object('source', 0), cut: { ...cut, power: 45, maxPower: 2000 } };
  const target = object('target', 8);
  const settings = readLaserLayerSettings(source);
  const [preset] = parseLaserPresets(JSON.stringify([{ id: 'one', name: 'Bois', category: 'Matériaux', settings }]));
  const applied = applyLaserLayerSettings(target, preset.settings);
  assert.equal(applied.cut.power, 45);
  assert.equal(applied.cut.maxPower, target.cut.maxPower);
  assert.equal(applied.placement, target.placement);
  assert.throws(() => parseLaserPresets(JSON.stringify([{ ...preset, settings: { ...settings, kind: 'raster' } }])), /invalide/);
});

test('composition preserves placement, per-object feeds, powers and passes with global PWM scale', () => {
  const first = object('first.svg', 5), second = object('second.dxf', 30);
  second.cut = { ...cut, feed: 900, power: 50, passes: 2, maxPower: 255 };
  const { code } = generateLaserDocument([first, second], { ...cut, maxPower: 2000 });
  const analysis = analyseLaserGCode(code, 'composition');
  assert.equal(analysis.engraving.length, 12);
  assert.equal(analysis.bounds?.minX, 5);
  assert.equal(analysis.bounds?.maxX, 40);
  assert.equal(analysis.engraving[0].feedRate, 600);
  assert.equal(analysis.engraving[0].spindleSpeed, 400);
  assert.equal(analysis.engraving[4].feedRate, 900);
  assert.equal(analysis.engraving[4].spindleSpeed, 1000);
  assert.equal(analysis.canFrame, true);
  assert.match(code, /M5\n; SmartCNC laser - second.dxf\nM5\nG21/);
});

test('disabled objects never enter the generated program', () => {
  const excluded = object('excluded', 100); excluded.enabled = false;
  const { code } = generateLaserDocument([object('included', 0), excluded], cut);
  assert.doesNotMatch(code, /excluded/);
  assert.equal(analyseLaserGCode(code, 'project').bounds?.maxX, 10);
  assert.throws(() => generateLaserDocument([excluded], cut), /au moins un objet/);
});

test('visibility and layer color leave the generated program intact', () => {
  const layer = object('drawing', 0);
  assert.equal(generateLaserDocument([{ ...layer, hidden: true, color: '#0369a1' }], cut).code, generateLaserDocument([layer], cut).code);
});

test('images and vectors share layer order, placement and output toggles', () => {
  const vector = object('trait.dxf', 5);
  const image = object('photo.png', 40);
  image.paths = [];
  image.placement = { ...image.placement, anchor: 'center', width: 4, height: 2, y: 8 };
  image.raster = {
    image: { width: 2, height: 1, gray: new Uint8Array([0, 0]) }, previewUrl: 'data:image/png;base64,AA==',
    settings: { interval: 2, threshold: 128, grayscale: false, invert: false, overscan: 3 },
  };
  const { code, rasterOverscan } = generateLaserDocument([image, vector], cut);
  const burn = analyseLaserGCode(code, 'composition').engraving;
  assert.equal(rasterOverscan, 3);
  assert.deepEqual([burn[0].start.x, burn[0].end.x, burn[0].start.y], [38, 42, 8]);
  assert.equal(burn[1].start.x, 5);
  assert.equal(generateLaserDocument([{ ...image, enabled: false }, vector], cut).rasterOverscan, 0);
});

test('drawn shapes enter the vector pipeline with their actual dimensions', () => {
  const start = { x: 15, y: 24 }, end = { x: 5, y: 4 };
  for (const shape of ['rectangle', 'ellipse'] as const) {
    const path = laserShapePath(shape, start, end)!;
    assert.deepEqual(path.points[0], path.points.at(-1));
    const layer = object(shape, 5);
    layer.paths = [path];
    layer.placement = { ...layer.placement, y: 4, height: 20 };
    assert.deepEqual(analyseLaserGCode(generateLaserDocument([layer], cut).code, shape).bounds, {
      minX: 5, minY: 4, maxX: 15, maxY: 24, width: 10, height: 20,
    });
  }
  assert.equal(laserShapePath('rectangle', start, { ...start, x: 10 }), null);
  assert.deepEqual(laserShapePath('line', start, { ...start, x: 10 })?.points, [start, { ...start, x: 10 }]);
});

test('imported objects retain separate SVG paint groups and independent fill operations', () => {
  const first = object('first', 0), second = object('second', 20);
  first.fill = { ...first.fill, mode: 'fill', spacing: 1 };
  second.fill = { ...second.fill, mode: 'fill', spacing: 1 };
  const { code } = generateLaserDocument([first, second], cut);
  const engraving = analyseLaserGCode(code, 'fill').engraving;
  assert.ok(engraving.some(segment => segment.start.x < 10));
  assert.ok(engraving.some(segment => segment.start.x > 20));
  assert.ok(engraving.every(segment => Math.abs(segment.end.x - segment.start.x) < 10));
});

test('duplication moves the copy without changing its source object', () => {
  const original = object('drawing', 0), duplicate = duplicateLaserObject(original, 'copy');
  duplicate.placement.width = 20;
  assert.equal(duplicate.id, 'copy');
  assert.equal(duplicate.placement.x, 5);
  assert.equal(original.placement.width, 10);
  assert.equal(original.placement.x, 0);
});

test('layer reordering changes program order without changing the source document', () => {
  const first = object('first', 0), second = object('second', 20);
  const original = [first, second];
  const moved = moveLaserObject(original, second.id, -1);
  assert.deepEqual(moved, [second, first]);
  assert.deepEqual(original, [first, second]);
  assert.equal(moveLaserObject(moved, first.id, 1), moved);
  assert.equal(moveLaserObject(moved, 'missing', 1), moved);
  assert.equal(analyseLaserGCode(generateLaserDocument(moved, cut).code, 'ordered').engraving[0].start.x, 20);
});

test('machine scan offsets are applied to layer fills at their own speed', () => {
  const layer = object('fill', 0);
  layer.cut = { ...cut, feed: 900 };
  layer.fill = { ...layer.fill, mode: 'fill', spacing: 1 };
  const uncorrected = analyseLaserGCode(generateLaserDocument([layer], cut).code, 'uncorrected');
  const corrected = analyseLaserGCode(generateLaserDocument([layer], {
    ...cut,
    scanOffsets: [{ feed: 600, offset: 0 }, { feed: 900, offset: 1 }],
  }).code, 'corrected');

  assert.notDeepEqual(corrected.engraving.map(segment => segment.start.x), uncorrected.engraving.map(segment => segment.start.x));
  assert.equal(corrected.engraving.length, uncorrected.engraving.length);
});

test('combined layers run fill before contours with independent settings', () => {
  const layer = object('combined', 0);
  layer.fill = { ...layer.fill, mode: 'fill-and-contours', spacing: 1 };
  layer.contourCut = { feed: 300, power: 60, passes: 2 };
  const { code } = generateLaserDocument([layer], cut);
  const { engraving } = analyseLaserGCode(code, 'combined');
  const firstContour = engraving.findIndex(segment => segment.feedRate === 300);
  assert.ok(firstContour > 0);
  assert.ok(engraving.slice(0, firstContour).every(segment => segment.feedRate === 600 && segment.spindleSpeed === 200));
  assert.equal(engraving.length - firstContour, 8);
  assert.ok(engraving.slice(firstContour).every(segment => segment.feedRate === 300 && segment.spindleSpeed === 600));
});

test('the generated composition applies focus per layer and restores Z before the next layer', () => {
  const first = object('wide', 0), regular = object('regular', 20), last = object('narrow', 40);
  const focus = { enabled: true, controlZ: true, referenceZ: 4, offset: 2, zFeed: 100, restoreZ: false, spotDiameter: 1 };
  first.cut = { ...cut, focus };
  last.cut = { ...cut, focus: { ...focus, offset: -1, spotDiameter: 0.4 } };
  const { code, spotDiameter } = generateLaserDocument([first, regular, last], cut);
  assert.deepEqual(code.match(/^G1 Z.+$/gm), ['G1 Z6 F100', 'G1 Z4 F100', 'G1 Z3 F100']);
  assert.match(code, /M5\nG1 Z4 F100\nG90\nM5\n; SmartCNC laser - regular/);
  assert.equal(spotDiameter, 1);
  first.cut = { ...cut, focus: { ...focus, controlZ: false } };
  assert.throws(() => generateLaserDocument([first, regular], cut), /hauteurs de focus différentes/);
});

test('vector overscan follows the hatch angle and contour direction can alternate by pass', () => {
  const layer = object('fill', 20);
  layer.fill = { ...layer.fill, mode: 'fill', angle: 90, spacing: 4, bidirectional: false, overscan: 2 };
  const generated = generateLaserDocument([layer], { ...cut, scanOffsets: [{ feed: 600, offset: 1 }] });
  const parsed = analyseLaserGCode(generated.code, 'overscan');
  assert.equal(generated.rasterOverscan, 2);
  assert.ok(parsed.engraving.length > 1);
  assert.ok(parsed.engraving.every(segment => segment.end.y > segment.start.y && segment.end.x === segment.start.x));
  assert.match(generated.code, /G0 X[\d.]+ Y-1\.925\nM4 S0\nG1 F600\nG1 X[\d.]+ Y0\.075 S0/);
  assert.match(generated.code, /G1 X[\d.]+ Y11\.925 S0\nM5/);

  layer.fill = { ...layer.fill, mode: 'contours' };
  layer.cut = { ...cut, passes: 2, contourDirection: 'alternate' };
  const { engraving } = analyseLaserGCode(generateLaserDocument([layer], cut).code, 'contours');
  assert.deepEqual([engraving[0].end.x, engraving[0].end.y, engraving[4].end.x, engraving[4].end.y], [30, 0, 20, 10]);
});
