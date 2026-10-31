import test from 'node:test';
import assert from 'node:assert/strict';
import { ArrivalGate, inZone } from '../dist/detection.mjs';
const config = { confidence: .55, zone: .8, minHeight: .2 };
test('Only sufficiently close, confident people inside the foot-point area trigger', () => {
  const person = { class: 'person', score: .8, bbox: [250, 100, 100, 300] };
  assert.equal(inZone(person, 640, 480, config), true);
  assert.equal(inZone({ ...person, class: 'dog' }, 640, 480, config), false);
  assert.equal(inZone({ ...person, score: .4 }, 640, 480, config), false);
  assert.equal(inZone({ ...person, bbox: [0, 100, 50, 300] }, 640, 480, config), false);
  assert.equal(inZone({ ...person, bbox: [250, 100, 50, 50] }, 640, 480, config), false);
});
test('Two observations confirm arrival; a lingering group never repeats', () => {
  const gate = new ArrivalGate();
  assert.equal(gate.step(true, 0, 30000), false);
  assert.equal(gate.step(true, 500, 30000), true);
  for (let t = 1000; t < 70000; t += 500) assert.equal(gate.step(true, t, 30000), false);
});
test('Brief missed detections do not count as a new group', () => {
  const gate = new ArrivalGate();
  gate.step(true, 0, 1000); gate.step(true, 500, 1000);
  gate.step(false, 2000, 1000);
  assert.equal(gate.step(true, 2500, 1000), false);
  assert.equal(gate.step(true, 3000, 1000), false);
});
test('Next group requires both a clear area and the cooldown to expire', () => {
  const gate = new ArrivalGate();
  gate.step(true, 0, 30000); gate.step(true, 500, 30000);
  gate.step(false, 4000, 30000);
  assert.equal(gate.step(true, 5000, 30000), false);
  assert.equal(gate.step(true, 5500, 30000), false);
  gate.step(false, 29000, 30000);
  assert.equal(gate.step(true, 30500, 30000), false);
  assert.equal(gate.step(true, 31000, 30000), true);
});
test('A long detection gap requires fresh confirmation', () => {
  const gate = new ArrivalGate();
  gate.step(true, 0, 1000);
  assert.equal(gate.step(true, 5000, 1000), false);
  assert.equal(gate.step(true, 5500, 1000), true);
});
