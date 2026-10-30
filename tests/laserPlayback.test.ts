import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseLaserGCode } from '../src/utils/laserCam';
import { executedLaserStrokes } from '../src/utils/laserPlayback';
import { GrblController } from '../server/grblController';

test('lecture laser : trait partiel, déplacements éteints, fin et nouveau départ', () => {
  const code = 'G21 G90\nM4 S200\nG1 X10 F600\nG1 X20 S0\nG1 Y10 S200\nM5';
  const { engraving } = analyseLaserGCode(code, 'lecture.nc');
  const midway = executedLaserStrokes(engraving, 2, { x: 4, y: 0, z: 0 });
  assert.equal(midway.length, 1);
  assert.equal(midway[0].end.x, 4);
  const travel = executedLaserStrokes(engraving, 3, { x: 15, y: 0, z: 0 });
  assert.equal(travel.length, 1);
  assert.equal(travel[0].end.x, 10);
  const next = executedLaserStrokes(engraving, 4, { x: 20, y: 3, z: 0 });
  assert.equal(next.length, 2);
  assert.equal(next[1].end.y, 3);
  assert.deepEqual(executedLaserStrokes(engraving, 5, { x: 20, y: 10, z: 0 }, true), engraving);
  assert.deepEqual(executedLaserStrokes(engraving, 0, { x: 0, y: 0, z: 0 }), []);
  assert.equal(engraving[0].end.x, 10, 'la lecture ne modifie pas le dessin source');
});

test('lecture laser : un arc est tracé jusqu’à la tête, sans révéler sa fin', () => {
  const { engraving } = analyseLaserGCode('G21 G90\nG0 X10 Y0\nM4 S200\nG3 X0 Y10 I-10 J0 F600\nM5', 'arc.nc');
  assert.ok(engraving.length > 2);
  const middle = Math.floor(engraving.length / 2);
  const s = engraving[middle];
  const p = { x: (s.start.x + s.end.x) / 2, y: (s.start.y + s.end.y) / 2, z: 0 };
  const trace = executedLaserStrokes(engraving, s.lineIndex, p);
  assert.equal(trace.length, middle + 1);
  assert.ok(Math.abs(trace.at(-1)!.end.x - p.x) < 1e-6);
  assert.ok(Math.abs(trace.at(-1)!.end.y - p.y) < 1e-6);
});

test('Play Arduino : connexion automatique, pause/reprise, achèvement et rejeu', async () => {
  const c = new GrblController();
  const waitUntil = async (condition: () => boolean) => {
    const end = Date.now() + 5000;
    while (!condition()) {
      if (Date.now() > end) throw new Error('Simulation bloquée');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  try {
    const code = 'G21 G90\nM4 S200\nG1 X6 F600\nG1 Y2 S0\nG1 X0 S200\nM5';
    await c.simulateLaserJob('play.nc', code);
    assert.equal(c.getStatus().isSimulator, true);
    await waitUntil(() => c.getStatus().wpos.x > 0 && c.getJobStatus().currentLineIndex === 2);
    assert.ok(c.getStatus().wpos.x < 6);
    c.pauseJob();
    const frozen = { ...c.getStatus().wpos };
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.deepEqual(c.getStatus().wpos, frozen);
    assert.equal(c.getJobStatus().state, 'paused');
    await assert.rejects(c.simulateLaserJob('autre.nc', code), /programme en cours/);
    c.resumeJob();
    await waitUntil(() => c.getJobStatus().state === 'completed');
    assert.equal(c.getStatus().wpos.x, 0);
    assert.equal(c.getStatus().wpos.y, 2);
    const previousStart = c.getJobStatus().startTime;
    await c.simulateLaserJob('play.nc', code);
    assert.notEqual(c.getJobStatus().startTime, previousStart);
    assert.equal(c.getJobStatus().state, 'running');
    c.stopJob();
    await waitUntil(() => c.getJobStatus().state === 'aborted');
  } finally { await c.disconnect(); }
});

test('Play Arduino refuse une machine réelle sans la déconnecter ni lui envoyer de commande', async () => {
  const c = new GrblController();
  const status = c.getStatus();
  status.connected = true;
  status.isSimulator = false;
  let commands = 0;
  c.sendCommand = () => { commands++; };
  await assert.rejects(c.simulateLaserJob('test.nc', 'G1 X1'), /machine réelle/);
  assert.equal(c.getStatus(), status);
  assert.equal(status.connected, true);
  assert.equal(commands, 0);
});
