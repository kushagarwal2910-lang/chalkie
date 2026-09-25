import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CanvasPlaybackGate, playDeviceNarration, playRecordedNarration } from '../lib/playback-sync.ts';
import { getProgressiveVisibleObjects } from '../lib/progressive-scene.ts';

const cues = [{ charIndex: 0, targetId: 'junction' }, { charIndex: 26, targetId: 'current' }];
function fixture() {
  const controller = new AbortController();
  const events = [];
  const options = {
    signal: controller.signal, cues,
    onStart: () => events.push('start'), onTarget: id => events.push(id),
    onEnd: () => events.push('end'), onError: () => events.push('error'),
  };
  return { controller, events, options };
}

test('slow canvas/layout cannot release audio; only the requested scene can', async () => {
  const gate = new CanvasPlaybackGate();
  const { controller } = fixture();
  let started = false;
  const pending = gate.wait(2, controller.signal).then(() => { started = true; });
  gate.update({ status: 'ready', request: 1 });
  await Promise.resolve();
  assert.equal(started, false);
  gate.update({ status: 'loading', request: 2 });
  await Promise.resolve();
  assert.equal(started, false);
  gate.update({ status: 'ready', request: 2 });
  await pending;
  assert.equal(started, true);
});

test('pausing during canvas loading cancels the pending start', async () => {
  const gate = new CanvasPlaybackGate();
  const { controller } = fixture();
  const pending = gate.wait(3, controller.signal);
  controller.abort();
  gate.update({ status: 'ready', request: 3 });
  await assert.rejects(pending, { name: 'AbortError' });
});

test('an unavailable/licensed-out canvas rejects playback rather than advancing', async () => {
  const gate = new CanvasPlaybackGate();
  const { controller } = fixture();
  const pending = gate.wait(1, controller.signal);
  gate.update({ status: 'error', request: 1, message: 'Whiteboard unavailable' });
  await assert.rejects(pending, /Whiteboard unavailable/);
});

test('queued device speech does not reveal or move the cursor until onstart', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const utterance = { rate: 1 };
  playDeviceNarration({ speak() {}, cancel() {} }, utterance, f.options);
  t.mock.timers.tick(10_000);
  assert.deepEqual(f.events, []);
  utterance.onstart();
  t.mock.timers.tick(0);
  assert.deepEqual(f.events, ['start', 'junction']);
  f.controller.abort();
});

test('native boundaries cancel all estimates, even when the actual voice is slower', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const utterance = { rate: 1 };
  playDeviceNarration({ speak() {}, cancel() {} }, utterance, f.options);
  utterance.onstart();
  utterance.onboundary({ name: 'word', charIndex: 0 });
  t.mock.timers.tick(20_000);
  assert.deepEqual(f.events, ['start', 'junction']);
  utterance.onboundary({ name: 'word', charIndex: 26 });
  assert.equal(f.events.at(-1), 'current');
  utterance.onend();
  assert.equal(f.events.at(-1), 'end');
});

test('voices without word events respect speech rate and cancel stale callbacks', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const utterance = { rate: 0.5 };
  playDeviceNarration({ speak() {}, cancel() {} }, utterance, f.options);
  utterance.onstart();
  t.mock.timers.tick(2000);
  assert.deepEqual(f.events, ['start', 'junction']);
  const lateBoundary = utterance.onboundary;
  const lateEnd = utterance.onend;
  f.controller.abort();
  t.mock.timers.tick(10_000);
  lateBoundary({ name: 'word', charIndex: 26 });
  lateEnd();
  assert.deepEqual(f.events, ['start', 'junction']);
});

test('recorded TTS uses actual playback time; stalled/paused audio cannot run ahead', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const audio = { currentTime: 0, duration: 20, paused: false, play: async () => {}, pause() { this.paused = true; } };
  playRecordedNarration(audio, 52, f.options);
  assert.deepEqual(f.events, []);
  audio.onplaying();
  audio.currentTime = 2;
  audio.ontimeupdate();
  t.mock.timers.tick(30_000);
  assert.deepEqual(f.events, ['start', 'junction']);
  audio.currentTime = 10;
  audio.paused = true;
  audio.ontimeupdate();
  assert.equal(f.events.at(-1), 'junction');
  audio.paused = false;
  audio.onplaying(); // Resuming a buffer must not restart/reveal a second time.
  audio.ontimeupdate();
  assert.deepEqual(f.events, ['start', 'junction', 'current']);
  const lateEnd = audio.onended;
  f.controller.abort();
  lateEnd();
  assert.equal(f.events.includes('end'), false);
});

test('autoplay rejection stops the step instead of silently skipping it', async () => {
  const f = fixture();
  const audio = { play: async () => { throw new Error('NotAllowedError'); }, pause() {} };
  playRecordedNarration(audio, 52, f.options);
  await Promise.resolve();
  assert.deepEqual(f.events, ['error']);
});

test('progressive visibility stages nothing before speech and never reveals the whole final step early', () => {
  const plan = {
    objects: [
      { id: 'junction', label: 'Junction', role: 'component' },
      { id: 'current', label: 'Current', role: 'component' },
      { id: 'extra', label: '', role: 'component' },
    ],
    segments: [{ targetIds: ['junction#0'] }, { targetIds: ['current'] }],
  };
  const ids = (step, presenting = true) => getProgressiveVisibleObjects(plan, step, presenting).map(o => o.id);
  assert.deepEqual(ids(-1), []);
  assert.deepEqual(ids(0), ['junction']);
  assert.deepEqual(ids(1), ['junction', 'current']);
  assert.deepEqual(ids(1, false), ['junction', 'current', 'extra']);
});
