import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newestProviderQuota, parseProviderFailure, providerKeysetIdentity, providerRetryReducer, providerRetryView, quotaMatchesConfiguration, retryCountdown, sanitizeProviderQuota } from '../lib/provider-retry.ts';
import { readProviderEventStream } from '../lib/provider-event-stream.ts';

const now = 1_800_000_000_000;
const quota = (extra = {}) => ({ source: 'byok', allUnavailable: true, degradationReason: 'cooldown_active', nextRetryAt: now + 65000,
  keys: [{ id: 'abcdef012345', slot: 1, masked: 'saved', source: 'byok', status: 'cooldown', retryAt: now + 65000 }], ...extra });
const initial = () => ({ requestId: 0, status: 'idle', operation: null, failure: null });
const error = parseProviderFailure({ code: 'FREE_LIMIT_REACHED', message: 'Provider unavailable', retryable: true });

test('countdown uses a live clock, rounds up remaining seconds, and unlocks at the exact boundary', () => {
  assert.equal(retryCountdown(now + 65000, now), '1m 5s');
  assert.equal(retryCountdown(now + 899, now), '1s');
  assert.equal(retryCountdown(now + 3661000, now), '1h 1m 1s');
  assert.equal(retryCountdown(now, now), null);
  assert.equal(retryCountdown(now - 1, now), null);
  assert.equal(retryCountdown(undefined, now), null);
  assert.equal(providerRetryView(error, quota(), now + 64999).canRetry, false);
  const ready = providerRetryView(error, quota(), now + 65000);
  assert.equal(ready.canRetry, true);
  assert.match(ready.detail, /provider will confirm availability/i);
  assert.doesNotMatch(ready.detail, /recovered|replenished|guaranteed/i);
});

test('missing keys require configuration and saved keys unlock the original failed request', () => {
  const missing = sanitizeProviderQuota({ source: 'none', keys: [], allUnavailable: false });
  const failure = parseProviderFailure({ code: 'FREE_LIMIT_REACHED', retryable: false, quota: missing });
  assert.equal(providerRetryView(failure, missing, now).canRetry, false);
  assert.match(providerRetryView(failure, missing, now).title, /add a Groq key/i);
  const saved = quota({ allUnavailable: false, degradationReason: undefined, nextRetryAt: undefined });
  assert.equal(providerRetryView(failure, saved, now).canRetry, true);
});

test('invalid keys have distinct guidance without a fake countdown', () => {
  const invalid = quota({ degradationReason: 'all_keys_invalid', nextRetryAt: undefined });
  const view = providerRetryView(error, invalid, now);
  assert.equal(view.needsKeys, true);
  assert.equal(view.canRetry, false);
  assert.equal(view.countdown, null);
  assert.match(view.title, /rejected/i);
});

test('temporary errors without quota remain retryable while invalid input does not', () => {
  const temporary = parseProviderFailure(new TypeError('Failed to fetch'));
  assert.equal(providerRetryView(temporary, null, now).canRetry, true);
  assert.equal(providerRetryView(parseProviderFailure({ code: 'INVALID_REQUEST', message: 'Question too long', retryable: false }), null, now).canRetry, false);
});

test('a newer ready snapshot removes an old retry deadline without claiming recovery', () => {
  const failure = parseProviderFailure({ ...error, nextRetryAt: now + 999999 });
  const view = providerRetryView(failure, quota({ allUnavailable: false }), now);
  assert.equal(view.countdown, null);
  assert.equal(view.canRetry, true);
});

test('unknown provider reset time permits a manual check without inventing a reset', () => {
  const view = providerRetryView(error, quota({ degradationReason: 'all_keys_exhausted', nextRetryAt: undefined }), now);
  assert.equal(view.canRetry, true);
  assert.equal(view.countdown, null);
  assert.match(view.detail, /did not give a retry time/);
});

test('failed retry retains the exact follow-up operation and original board context', () => {
  const originalBoard = { id: 'lesson-a', objects: [{ id: 'cell' }] };
  const operation = { kind: 'followup', question: 'Why is this cell active?', currentLesson: originalBoard };
  let state = providerRetryReducer(initial(), { type: 'begin', requestId: 1, operation });
  state = providerRetryReducer(state, { type: 'fail', requestId: 1, failure: error });
  assert.equal(state.status, 'failed');
  assert.equal(state.operation, operation);
  assert.equal(state.operation.currentLesson, originalBoard);
  state = providerRetryReducer(state, { type: 'begin', requestId: 2, operation: state.operation });
  assert.equal(state.operation.question, 'Why is this cell active?');
  assert.equal(state.operation.kind, 'followup');
  assert.equal(state.failure, null);
});

test('late errors or completions cannot replace the newer pending question', () => {
  let state = providerRetryReducer(initial(), { type: 'begin', requestId: 1, operation: { kind: 'lesson', question: 'Old query' } });
  state = providerRetryReducer(state, { type: 'begin', requestId: 2, operation: { kind: 'lesson', question: 'New query' } });
  const current = state;
  assert.equal(providerRetryReducer(state, { type: 'fail', requestId: 1, failure: error }), current);
  assert.equal(providerRetryReducer(state, { type: 'complete', requestId: 1 }), current);
  assert.equal(providerRetryReducer(state, { type: 'begin', requestId: 1, operation: { kind: 'lesson', question: 'Stale replay' } }), current);
});

test('success and explicit clearing release the retained recording and prevent stale failure', () => {
  const audio = new Blob(['recording'], { type: 'audio/webm' });
  let state = providerRetryReducer(initial(), { type: 'begin', requestId: 1, operation: { kind: 'transcribe', audio } });
  state = providerRetryReducer(state, { type: 'fail', requestId: 1, failure: error });
  assert.equal(state.operation.audio, audio);
  state = providerRetryReducer(state, { type: 'begin', requestId: 2, operation: state.operation });
  state = providerRetryReducer(state, { type: 'complete', requestId: 2 });
  assert.equal(state.operation, null);
  assert.equal(state.failure, null);
  const clear = providerRetryReducer(state, { type: 'clear', requestId: 3 });
  assert.equal(providerRetryReducer(clear, { type: 'fail', requestId: 2, failure: error }), clear);
});

test('public provider events whitelist only quota fields and never include credentials or masked key fragments', () => {
  const clean = sanitizeProviderQuota({ ...quota(), secret: 'gsk_topsecret', tavilyKey: 'tvly-secret', keys: [
    { ...quota().keys[0], masked: 'gsk_topsecret', apiKey: 'gsk_topsecret', resetTokens: 'gsk_anothersecret', remainingTokens: 42 },
    { id: 'gsk_topsecret', slot: 2, status: 'ready', source: 'byok' },
  ] });
  const json = JSON.stringify(clean);
  assert.doesNotMatch(json, /gsk_|tvly-|secret|apiKey/);
  assert.equal(clean.keys.length, 1);
  assert.equal(clean.keys[0].remainingTokens, 42);
  assert.equal(clean.keys[0].masked, 'saved');
});

test('server messages containing an accidental raw provider key are redacted', () => {
  const failure = parseProviderFailure({ message: 'Key gsk_doNotExpose failed; tvly-alsoPrivate was rejected.' });
  assert.equal(failure.message, 'Key [redacted] failed; [redacted] was rejected.');
});

test('older concurrent quota responses cannot replace newer state for the same keys', () => {
  const current = quota({ updatedAt: now + 100, allUnavailable: false });
  assert.equal(newestProviderQuota(current, quota({ updatedAt: now })), current);
  const fresh = quota({ updatedAt: now + 101 });
  assert.equal(newestProviderQuota(current, fresh), fresh);
  const changed = quota({ updatedAt: now, keys: [{ ...quota().keys[0], id: '012345abcdef' }] });
  assert.equal(newestProviderQuota(current, changed), changed);
});

test('saving new keys ignores late old-keyset statuses while retaining the same pending retry', () => {
  const oldQuota = quota({ updatedAt: now + 100 });
  const configured = quota({ allUnavailable: false, updatedAt: now, keys: [{ ...quota().keys[0], id: '012345abcdef', status: 'unknown' }] });
  const identity = providerKeysetIdentity(configured);
  assert.equal(quotaMatchesConfiguration(identity, oldQuota), false);
  assert.equal(quotaMatchesConfiguration(identity, configured), true);
  const operation = { kind: 'lesson', question: 'Keep this exact question' };
  let retry = providerRetryReducer(initial(), { type: 'begin', requestId: 1, operation });
  retry = providerRetryReducer(retry, { type: 'fail', requestId: 1, failure: parseProviderFailure({ ...error, quota: oldQuota }) });
  assert.equal(retry.operation, operation);
  assert.equal(providerRetryView(retry.failure, configured, now).canRetry, true);
  const deleted = sanitizeProviderQuota({ source: 'none', keys: [], allUnavailable: true });
  assert.equal(quotaMatchesConfiguration(providerKeysetIdentity(deleted), configured), false);
  assert.equal(providerRetryView(retry.failure, deleted, now).canRetry, false);
});

test('configuration identity ignores queue ordering but distinguishes provider source and key set', () => {
  const original = quota({ keys: [...quota().keys, { ...quota().keys[0], id: '111111111111', slot: 2 }] });
  const reversed = { ...original, keys: [...original.keys].reverse() };
  assert.equal(quotaMatchesConfiguration(providerKeysetIdentity(original), reversed), true);
  assert.equal(quotaMatchesConfiguration(providerKeysetIdentity(original), { ...original, source: 'server' }), false);
  assert.equal(quotaMatchesConfiguration(null, original), true);
});

function responseStream(chunks, close = false) {
  let cancelled = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); if (close) controller.close(); },
    cancel() { cancelled = true; },
  });
  return { response: new Response(stream), stream, cancelled: () => cancelled };
}

test('successful streamed results require terminal done and release/cancel the reader', async () => {
  const input = responseStream(['event: lesson\ndata: {"lesson":{"id":"fresh"}}\n\n', 'event: done\ndata: {"ok":true}\n\n']);
  const events = [];
  await readProviderEventStream(input.response, (type, data) => events.push([type, data]));
  assert.deepEqual(events.map(([type]) => type), ['lesson', 'done']);
  assert.equal(input.cancelled(), true);
  assert.equal(input.stream.locked, false);
});

test('premature clean EOF after a plan fails before the caller can commit its staged board', async () => {
  const input = responseStream(['event: lesson\ndata: {"lesson":{"id":"incomplete"}}\n\n'], true);
  let staged = null, committed = 'old-board';
  await assert.rejects(async () => {
    await readProviderEventStream(input.response, (type, data) => { if (type === 'lesson') staged = data.lesson; });
    committed = staged;
  }, /before the request finished/);
  assert.equal(staged.id, 'incomplete');
  assert.equal(committed, 'old-board');
  assert.equal(input.stream.locked, false);
});

test('structured stream errors cancel reading and preserve failure metadata', async () => {
  const input = responseStream(['event: error\ndata: {"code":"FREE_LIMIT_REACHED","message":"Wait for a retry","retryable":true,"nextRetryAt":1800000065000}\n\n']);
  await assert.rejects(() => readProviderEventStream(input.response, () => {}), error => {
    assert.equal(error.code, 'FREE_LIMIT_REACHED');
    assert.equal(error.nextRetryAt, now + 65000);
    return true;
  });
  assert.equal(input.cancelled(), true);
  assert.equal(input.stream.locked, false);
});

test('stream callback failures cancel reading, and fragmented CRLF terminal markers work', async () => {
  const broken = responseStream(['event: lesson\ndata: {}\n\n']);
  await assert.rejects(() => readProviderEventStream(broken.response, () => { throw new Error('schema invalid'); }), /schema invalid/);
  assert.equal(broken.cancelled(), true);
  assert.equal(broken.stream.locked, false);
  const valid = responseStream(['event: done\r', '\ndata: {"ok":', 'true}\r\n\r', '\n']);
  await readProviderEventStream(valid.response, () => {});
  assert.equal(valid.cancelled(), true);
});

test('done false is an error even if an earlier event contained a lesson', async () => {
  const input = responseStream(['event: lesson\ndata: {"lesson":{"id":"partial"}}\n\nevent: done\ndata: {"ok":false}\n\n']);
  await assert.rejects(() => readProviderEventStream(input.response, () => {}), /did not finish successfully/);
  assert.equal(input.cancelled(), true);
});
