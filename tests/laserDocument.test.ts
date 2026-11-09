import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseLaserGCode, type LaserCutSettings } from '../src/utils/laserCam';
import { duplicateLaserObject, generateLaserDocument, type LaserDocumentObject } from '../src/utils/laserDocument';

const cut: LaserCutSettings = { feed: 600, power: 20, maxPower: 1000, passes: 1, mode: 'M4' };
const object = (id: string, x: number): LaserDocumentObject => ({
  id, name: id, enabled: true, warnings: [],
  paths: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }], fillEnabled: true, fillGroup: 'same-id', fillClosed: true }],
  placement: { x, y: 0, width: 10, height: 10, anchor: 'bottom-left', rotation: 0, mirrorX: false, mirrorY: false },
  cut, fill: { mode: 'contours', spacing: .1, angle: 0, crossHatch: false, respectSvgFill: true },
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
