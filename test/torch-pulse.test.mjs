import test from 'node:test';
import assert from 'node:assert/strict';
import { TorchPulse, supportsTorch } from '../dist/torch-pulse.mjs';

test('Only offer the light for a camera that reports torch support', () => {
  assert.equal(supportsTorch({ getCapabilities: () => ({ torch: true }) }), true);
  assert.equal(supportsTorch({ getCapabilities: () => ({ torch: [true, false] }) }), true);
  assert.equal(supportsTorch({ getCapabilities: () => ({ torch: false }) }), false);
  assert.equal(supportsTorch({}), false);
});
test('Pulses stop after five seconds and leave the light off', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const states = [];
  const track = { readyState: 'live', applyConstraints: async value => { states.push(value.advanced[0].torch); } };
  const pulse = new TorchPulse(track, error => { throw error; });
  pulse.start(); await pulse.queue;
  assert.equal(states.at(-1), true);
  for (let i = 0; i < 9; i++) { t.mock.timers.tick(500); await pulse.queue; }
  assert.equal(states.at(-1), false);
  t.mock.timers.tick(500); await pulse.queue;
  assert.equal(states.at(-1), false);
  assert.equal(states.filter(Boolean).length, 5);
  const length = states.length;
  t.mock.timers.tick(10000); await pulse.queue;
  assert.equal(states.length, length);
});
test('Stopping during an in-flight light-on request still finishes off', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release;
  const states = [];
  const track = { readyState: 'live', applyConstraints: async value => {
    const on = value.advanced[0].torch;
    if (on) await new Promise(resolve => { release = resolve; });
    states.push(on);
  } };
  const pulse = new TorchPulse(track, error => { throw error; });
  pulse.start();
  for (let i = 0; i < 8 && !release; i++) await Promise.resolve();
  assert.ok(release);
  const stopped = pulse.stop(); release(); await stopped;
  assert.equal(states.at(-1), false);
  const length = states.length;
  t.mock.timers.tick(10000); await pulse.queue;
  assert.equal(states.length, length);
});
test('A constraint failure is reported and no more pulses are scheduled', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let errors = 0, attempts = 0;
  const pulse = new TorchPulse({ readyState: 'live', applyConstraints: async () => { attempts++; throw new Error('unavailable'); } }, () => errors++);
  pulse.start(); await pulse.queue;
  assert.equal(errors, 1);
  const previous = attempts;
  t.mock.timers.tick(10000); await pulse.queue;
  assert.equal(attempts, previous);
});
