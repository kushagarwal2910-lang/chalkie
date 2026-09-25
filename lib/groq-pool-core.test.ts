import assert from "node:assert/strict";
import test from "node:test";
import { GroqPool, GroqFreeLimitError, GroqHttpError, GroqRequestTimeoutError, parseResetDuration, parseRetryAfter, retryAtFromResponse, type GroqPoolKey } from "./groq-pool-core.ts";

const keys: GroqPoolKey[] = [1, 2, 3].map((slot) => ({ id: `key-${slot}`, secret: `fake-secret-${slot}`, slot, masked: `••••00${slot}`, source: "byok" }));
const ok = () => Response.json({ ok: true });
const rateLimit = (seconds: number) => new Response("Too many requests", { status: 429, headers: { "retry-after": String(seconds) } });
const keyFrom = (init?: RequestInit) => new Headers(init?.headers).get("Authorization")?.replace("Bearer fake-secret-", "");
const request = (handler: (init?: RequestInit) => Response | Promise<Response>): typeof fetch => async (_url, init) => handler(init);
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };

test("first key remains sticky; failure moves it back and polling/preferred hints cannot reorder", async () => {
  let now = 1000;
  let failFirst = false;
  const calls: string[] = [];
  const pool = new GroqPool({ now: () => now, fetch: request((init) => {
    const id = keyFrom(init)!; calls.push(id); return id === "1" && failFirst ? rateLimit(60) : ok();
  }) });
  await pool.fetch(keys, "byok", "/chat/completions", {});
  await pool.fetch(keys, "byok", "/chat/completions", {});
  failFirst = true;
  await pool.fetch(keys, "byok", "/chat/completions", {});
  assert.deepEqual(calls, ["1", "1", "1", "2"]);
  for (let i = 0; i < 4; i++) pool.getSnapshot(keys, "byok", `page-${i}`);
  await pool.fetch(keys, "byok", "/chat/completions", {}, { preferredKeyId: "key-1", sessionId: "different-page" });
  assert.equal(calls.at(-1), "2");
  now += 61_000;
  await pool.fetch(keys, "byok", "/chat/completions", {});
  const snapshot = pool.getSnapshot(keys, "byok");
  assert.equal(snapshot.activeKeyId, "key-2");
  assert.deepEqual(snapshot.keys.map((key) => key.id), ["key-2", "key-3", "key-1"]);
  assert.equal(snapshot.keys[2].status, "ready");
});

test("all unavailable returns the earliest actual retry, and never calls a cooling key", async () => {
  let now = 5000;
  const calls: string[] = [];
  const pool = new GroqPool({ now: () => now, fetch: request((init) => { const id = keyFrom(init)!; calls.push(id); return rateLimit(id === "2" ? 30 : 90); }) });
  await assert.rejects(pool.fetch(keys, "byok", "/chat/completions", {}), (error) => {
    assert.ok(error instanceof GroqFreeLimitError);
    assert.equal(error.quota.allUnavailable, true);
    assert.equal(error.quota.nextRetryAt, 35000);
    return true;
  });
  await assert.rejects(pool.fetch(keys, "byok", "/chat/completions", {}, { sessionId: "new" }), GroqFreeLimitError);
  assert.deepEqual(calls, ["1", "2", "3"]);
  now = 35_000;
  const snapshot = pool.getSnapshot(keys, "byok");
  assert.equal(snapshot.allUnavailable, false);
  assert.equal(snapshot.keys.find((key) => key.id === "key-2")?.status, "ready");
});

test("provider retry seconds, HTTP dates, composite reset durations and body-only delays", () => {
  const now = Date.UTC(2026, 8, 25, 12);
  assert.equal(parseResetDuration("2m59.56s"), 179560);
  assert.equal(parseResetDuration("1d2h3m4.5s"), 93784500);
  assert.equal(parseResetDuration("500ms"), 500);
  assert.equal(parseResetDuration("not a duration"), undefined);
  assert.equal(parseRetryAfter("1.5", now), now + 1500);
  assert.equal(parseRetryAfter("Fri, 25 Sep 2026 12:02:00 GMT", now), now + 120000);
  assert.equal(parseRetryAfter("-1", now), undefined);
  assert.equal(retryAtFromResponse(new Headers(), "Try again in 1h2m3.4s.", now), now + 3723400);
  assert.equal(retryAtFromResponse(new Headers(), "Try again in 2m.", now), now + 120000);
});

test("only exhausted buckets constrain retry, and unknown counts remain unknown", async () => {
  const now = 1000;
  const headers = new Headers({ "retry-after": "5", "x-ratelimit-reset-requests": "23h", "x-ratelimit-remaining-requests": "50", "x-ratelimit-reset-tokens": "12s", "x-ratelimit-remaining-tokens": "0" });
  assert.equal(retryAtFromResponse(headers, "Rate limit", now), 13000);
  const pool = new GroqPool({ now: () => now, fetch: request(() => ok()) });
  await pool.fetch(keys, "byok", "/chat/completions", {});
  const active = pool.getSnapshot(keys, "byok").keys[0];
  assert.equal(active.remainingTokens, undefined);
  assert.equal(active.remainingRequests, undefined);
});

test("daily failure retains reported usage and reset, with no fake replenishment", async () => {
  let now = 1000;
  const pool = new GroqPool({ now: () => now, fetch: request(() => new Response("tokens per day (TPD): Limit 100, Used 95, Requested 20. Try again in 1h", { status: 429 })) });
  await assert.rejects(pool.fetch(keys.slice(0, 1), "byok", "/chat/completions", {}), GroqFreeLimitError);
  const quota = pool.getSnapshot(keys.slice(0, 1), "byok").keys[0];
  assert.equal(quota.status, "exhausted");
  assert.equal(quota.remainingDailyTokens, 5);
  assert.equal(quota.retryAt, 3601000);
  now = 3601000;
  const recovered = pool.getSnapshot(keys.slice(0, 1), "byok").keys[0];
  assert.equal(recovered.status, "ready");
  assert.equal(recovered.remainingDailyTokens, 5);
});

test("ordinary 400s never rotate or invalidate credentials even after repeated requests", async () => {
  const calls: string[] = [];
  const pool = new GroqPool({ fetch: request((init) => { calls.push(keyFrom(init)!); return new Response("Invalid model", { status: 400 }); }) });
  for (let i = 0; i < 8; i++) await assert.rejects(pool.fetch(keys, "byok", "/chat/completions", {}), GroqHttpError);
  assert.deepEqual(calls, Array(8).fill("1"));
  assert.equal(pool.getSnapshot(keys, "byok").keys[0].status, "unknown");
  assert.equal(pool.getSnapshot(keys, "byok").keys[0].consecutiveFailures, undefined);
});

test("invalid credentials stay invalid; network/server failures cool down and fail over", async () => {
  const calls: string[] = [];
  const pool = new GroqPool({ fetch: request((init) => {
    const id = keyFrom(init)!; calls.push(id);
    if (id === "1") return new Response("Unauthorized", { status: 401 });
    if (id === "2") throw new TypeError("Network unavailable");
    return ok();
  }) });
  await pool.fetch(keys, "byok", "/audio/speech", {});
  assert.deepEqual(calls, ["1", "2", "3"]);
  const snapshot = pool.getSnapshot(keys, "byok");
  assert.equal(snapshot.activeKeyId, "key-3");
  assert.equal(snapshot.keys.find((key) => key.id === "key-1")?.status, "invalid");
  assert.equal(snapshot.keys.find((key) => key.id === "key-2")?.status, "cooldown");
});

test("a late concurrent success cannot revive or promote a failed key", async () => {
  const first = deferred<Response>();
  const entered = deferred<void>();
  let firstCalls = 0;
  const pool = new GroqPool({ fetch: request((init) => {
    if (keyFrom(init) !== "1") return ok();
    if (++firstCalls === 1) { entered.resolve(); return first.promise; }
    return rateLimit(60);
  }) });
  const old = pool.fetch(keys, "byok", "/chat/completions", {});
  await entered.promise;
  await pool.fetch(keys, "byok", "/chat/completions", {});
  first.resolve(ok());
  await old;
  const snapshot = pool.getSnapshot(keys, "byok");
  assert.equal(snapshot.activeKeyId, "key-2");
  assert.equal(snapshot.keys.find((key) => key.id === "key-1")?.status, "cooldown");
});

test("caller cancellation does not penalize keys or retry with another credential", async () => {
  const entered = deferred<void>();
  let calls = 0;
  const pool = new GroqPool({ fetch: request(() => { calls++; entered.resolve(); return new Promise<Response>(() => {}); }) });
  const controller = new AbortController();
  const task = pool.fetch(keys, "byok", "/chat/completions", {}, { signal: controller.signal });
  await entered.promise;
  controller.abort();
  await assert.rejects(task, { name: "AbortError" });
  assert.equal(calls, 1);
  assert.equal(pool.getSnapshot(keys, "byok").keys[0].status, "unknown");
});

test("a stalled response body is timed out and the next key can succeed", async () => {
  const calls: string[] = [];
  const pool = new GroqPool({ fetch: request((init) => {
    const id = keyFrom(init)!; calls.push(id);
    return id === "1" ? new Response(new ReadableStream({ start() {} })) : ok();
  }) });
  await pool.fetch(keys, "byok", "/chat/completions", {}, { timeoutMs: 1000, attemptTimeoutMs: 10 });
  assert.deepEqual(calls, ["1", "2"]);
  assert.equal(pool.getSnapshot(keys, "byok").activeKeyId, "key-2");
});

test("total operation deadline is bounded even when transport ignores cancellation", async () => {
  let calls = 0;
  const pool = new GroqPool({ fetch: request(() => { calls++; return new Promise<Response>(() => {}); }) });
  await assert.rejects(pool.fetch(keys, "byok", "/chat/completions", {}, { timeoutMs: 10, attemptTimeoutMs: 1000 }), GroqRequestTimeoutError);
  assert.equal(calls, 1);
});

test("snapshots/error bodies never include credential secrets; observers do not trigger retries", async () => {
  let calls = 0;
  const pool = new GroqPool({ fetch: request(() => { calls++; return ok(); }) });
  await pool.fetch(keys, "byok", "/chat/completions", {}, { onStatus: () => { throw new TypeError("Broken UI observer"); } });
  assert.equal(calls, 1);
  const snapshot = JSON.stringify(pool.getSnapshot(keys, "byok"));
  for (const key of keys) assert.ok(!snapshot.includes(key.secret));
  const errors = new GroqPool({ fetch: request(() => new Response(`echo ${keys[0].secret}`, { status: 400 })) });
  await assert.rejects(errors.fetch(keys, "byok", "/chat/completions", {}), (error) => error instanceof GroqHttpError && !error.body.includes(keys[0].secret));
});

test("different credentials do not inherit another user's unavailable state; empty pool is explicit", async () => {
  const pool = new GroqPool({ fetch: request(() => rateLimit(60)) });
  await assert.rejects(pool.fetch(keys, "byok", "/chat/completions", {}), GroqFreeLimitError);
  const other = keys.map((key) => ({ ...key, id: `other-${key.id}`, secret: `other-${key.secret}` }));
  assert.equal(pool.getSnapshot(other, "byok").allUnavailable, false);
  await assert.rejects(pool.fetch([], "none", "/chat/completions", {}), (error) => error instanceof GroqFreeLimitError && error.quota.degradationReason === "no_keys");
});
