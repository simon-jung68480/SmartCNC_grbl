import assert from 'node:assert/strict';
import test from 'node:test';
import { GrblController } from '../server/grblController';

function simulator() {
  const controller = new GrblController();
  Object.assign(controller.getStatus(), { connected: true, isSimulator: true, state: 'Idle' });
  controller.sendCommand('$23=0');
  controller.sendCommand('$25=60');
  controller.sendCommand('$24=60');
  controller.sendCommand('$27=1');
  const tick = (seconds: number) => (controller as unknown as { tickSimulator(seconds: number): void }).tickSimulator(seconds);
  return { controller, tick };
}

for (const first of ['x', 'y'] as const) {
  test(`homing : Z puis XY, ${first.toUpperCase()} s’arrête seul et l’autre continue`, () => {
    const { controller, tick } = simulator();
    const other = first === 'x' ? 'y' : 'x';
    const status = controller.getStatus();
    status.mpos = { x: -5, y: -5, z: -2 };
    status.mpos[first] = -1;
    status.wco = { x: 7, y: 8, z: 9 };
    controller.sendCommand('$H');
    for (let i = 0; i < 6; i++) {
      tick(0.25);
      assert.equal(status.mpos.x, first === 'x' ? -1 : -5, 'X immobile pendant la recherche Z');
      assert.equal(status.mpos.y, first === 'y' ? -1 : -5, 'Y immobile pendant la recherche Z');
    }
    let reachedFirst = false;
    let otherKeptMoving = false;
    let previousOther = status.mpos[other];
    for (let i = 0; i < 100 && status.state !== 'Idle'; i++) {
      tick(0.25);
      if (status.pins[`${first}Limit`] && !status.pins[`${other}Limit`]) {
        assert.equal(status.mpos[first], 0);
        assert.ok(status.mpos[other] < 0);
        if (reachedFirst && status.mpos[other] > previousOther) otherKeptMoving = true;
        reachedFirst = true;
      }
      previousOther = status.mpos[other];
    }
    assert.ok(reachedFirst, 'le premier contact ne déclenche pas le second');
    assert.ok(otherKeptMoving, 'le second axe continue pendant que le premier reste arrêté');
    assert.equal(status.state, 'Idle');
    assert.deepEqual(status.mpos, { x: -1, y: -1, z: -1 }, 'dégagement final $27');
    assert.deepEqual(status.wco, { x: 7, y: 8, z: 9 }, 'aucune réécriture de l’origine pièce');
    assert.deepEqual(status.wpos, { x: -8, y: -9, z: -10 });
    assert.equal(status.pins.xLimit || status.pins.yLimit || status.pins.zLimit, false);
    assert.equal(status.buffer.rxBytesAvailable, 128);
  });
}

test('homing : direction et courses GRBL respectées, aucun override', () => {
  const { controller, tick } = simulator();
  controller.sendCommand('$23=3');
  controller.sendCommand('$130=10');
  controller.sendCommand('$131=20');
  controller.getStatus().mpos = { x: -8, y: -15, z: -2 };
  controller.getStatus().overrides.feed = 10;
  controller.sendCommand('$H');
  tick(1);
  assert.equal(controller.getStatus().mpos.z, -1);
  tick(100);
  assert.deepEqual(controller.getStatus().mpos, { x: -9, y: -19, z: -1 });
  assert.equal(controller.getStatus().state, 'Idle');
});

test('homing : refus si $22=0 et aucune nouvelle séquence pendant Home', () => {
  const { controller, tick } = simulator();
  const logs: string[] = [];
  controller.on('console', entry => logs.push(entry.text));
  controller.sendCommand('$22=0');
  controller.sendCommand('$H');
  assert.equal(controller.getStatus().state, 'Idle');
  assert.ok(logs.some(line => line.includes('error:5')));
  controller.sendCommand('$22=1');
  controller.getStatus().mpos = { x: -1, y: -5, z: -2 };
  controller.sendCommand('$H');
  controller.sendCommand('$H');
  assert.ok(logs.some(line => line.includes('error:8')));
  tick(100);
  assert.equal(controller.getStatus().state, 'Idle');
});

test('rapports GRBL : Pn:X ne déclenche ni Y ni une remise à zéro XY', () => {
  const c = new GrblController();
  const incoming = (line: string) => (c as unknown as { handleIncomingLine(line: string): void }).handleIncomingLine(line);
  incoming('<Home|MPos:-10,-20,-2|Pn:X>');
  assert.equal(c.getStatus().pins.xLimit, true);
  assert.equal(c.getStatus().pins.yLimit, false);
  assert.deepEqual(c.getStatus().mpos, { x: -10, y: -20, z: -2 });
  incoming('<Home|MPos:-10,-21,-2|Pn:X>');
  assert.equal(c.getStatus().mpos.y, -21);
  incoming('<Idle|MPos:-10,-22,-2>');
  assert.equal(c.getStatus().pins.xLimit, false);
});
