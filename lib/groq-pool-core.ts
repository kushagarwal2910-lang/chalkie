/** Provider-key scheduling without Next.js, cookies, or stored credentials. */
export type GroqKeyStatus = "unknown" | "active" | "ready" | "cooldown" | "exhausted" | "invalid";
export type DegradationReason = "all_keys_exhausted" | "all_keys_invalid" | "cooldown_active" | "no_keys";
export interface GroqPoolKey { id: string; secret: string; slot: number; masked: string; source: "byok" | "server" }
export interface GroqKeyQuota {
  id: string; slot: number; masked: string; source: "byok" | "server"; status: GroqKeyStatus;
  remainingRequests?: number; requestLimit?: number; remainingTokens?: number; tokenLimit?: number;
  remainingDailyTokens?: number; dailyTokenLimit?: number; requestedTokens?: number;
  resetRequests?: string; resetTokens?: string; resetRequestsAt?: number; resetTokensAt?: number;
  retryAt?: number; updatedAt?: number; consecutiveFailures?: number; queuePosition?: number;
}
export interface GroqQuotaSnapshot {
  source: "byok" | "server" | "none"; activeKeyId?: string; allUnavailable: boolean;
  degradationReason?: DegradationReason; nextRetryAt?: number; updatedAt?: number; keys: GroqKeyQuota[];
}
export interface GroqCallOptions {
  sessionId?: string;
  /** Legacy browser hint, intentionally ignored. The server owns queue order. */
  preferredKeyId?: string;
  onStatus?: (snapshot: GroqQuotaSnapshot) => void;
  /** Total deadline across failover attempts, including response bodies. */
  timeoutMs?: number;
  attemptTimeoutMs?: number;
  signal?: AbortSignal;
}

export class GroqHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) { super(`Groq request failed (${status}): ${body.slice(0, 500)}`); this.status = status; this.body = body; }
}
export class GroqFreeLimitError extends Error {
  readonly code = "FREE_LIMIT_REACHED";
  quota: GroqQuotaSnapshot;
  constructor(quota: GroqQuotaSnapshot) {
    const messages: Record<DegradationReason, string> = {
      all_keys_exhausted: "All configured Groq keys have reached a daily limit. Retry when a key's waiting period ends, or update your keys.",
      all_keys_invalid: "All configured Groq keys were rejected. Check or replace your keys.",
      cooldown_active: "All configured Groq keys are temporarily unavailable. Retry when the earliest waiting period ends.",
      no_keys: "No Groq keys are configured. Add a key to continue.",
    };
    super(messages[quota.degradationReason ?? "cooldown_active"]);
    this.quota = quota;
  }
}
export class GroqRequestTimeoutError extends Error {
  readonly code = "PROVIDER_TIMEOUT";
  quota: GroqQuotaSnapshot;
  constructor(quota: GroqQuotaSnapshot) { super("The provider request timed out. Retry the request."); this.quota = quota; }
}

interface PoolState {
  order: string[];
  statuses: Map<string, GroqKeyQuota>;
  /** Failure generations prevent an older success from reviving a cooling key. */
  revisions: Map<string, number>;
  touchedAt: number;
}
export interface GroqPoolDependencies { fetch?: typeof fetch; now?: () => number }
const BASE_URL = "https://api.groq.com/openai/v1";

/** Groq reset headers use durations such as 2m59.56s, not clock timestamps. */
export function parseResetDuration(value: string | null | undefined): number | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(text)) { const result = Number(text) * 1000; return Number.isFinite(result) ? result : undefined; }
  let milliseconds = 0;
  let consumed = "";
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(ms|d|h|m|s)/gi)) {
    const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
    milliseconds += Number(match[1]) * multipliers[match[2].toLowerCase()];
    consumed += match[0];
  }
  return consumed.replace(/\s/g, "").toLowerCase() === text.replace(/\s/g, "").toLowerCase() && Number.isFinite(milliseconds) ? milliseconds : undefined;
}

export function parseRetryAfter(value: string | null | undefined, now: number): number | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(text)) { const result = now + Number(text) * 1000; return Number.isFinite(result) ? result : undefined; }
  const date = /\d{2}:\d{2}:\d{2}/.test(text) ? Date.parse(text) : NaN;
  return Number.isFinite(date) ? Math.max(now, date) : undefined;
}

function numberHeader(headers: Headers, name: string) {
  const raw = headers.get(name);
  return raw !== null && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : undefined;
}

export function retryAtFromResponse(headers: Headers, body: string, now: number) {
  const explicit = parseRetryAfter(headers.get("retry-after"), now);
  const retryText = body.match(/try again in\s+((?:\d+(?:\.\d+)?\s*(?:ms|d|h|m|s)\s*)+)/i)?.[1];
  const bodyDuration = parseResetDuration(retryText);
  const applicableResets: number[] = [];
  // Only an exhausted bucket's reset constrains retry. An unrelated RPD reset
  // must not turn a short token cooldown into a full-day wait.
  for (const bucket of ["requests", "tokens"]) {
    if (numberHeader(headers, `x-ratelimit-remaining-${bucket}`) !== 0) continue;
    const duration = parseResetDuration(headers.get(`x-ratelimit-reset-${bucket}`));
    if (duration !== undefined) applicableResets.push(now + duration);
  }
  const times = [...applicableResets, ...(explicit !== undefined ? [explicit] : []), ...(bodyDuration !== undefined ? [now + bodyDuration] : [])];
  return Math.max(now + 1000, ...(times.length ? times : [now + 60_000]));
}

function publicKey(key: GroqPoolKey): GroqKeyQuota {
  return { id: key.id, slot: key.slot, masked: key.masked, source: key.source, status: "unknown" };
}

function quotaFromResponse(key: GroqPoolKey, response: Response, now: number): GroqKeyQuota {
  const resetRequests = response.headers.get("x-ratelimit-reset-requests") || undefined;
  const resetTokens = response.headers.get("x-ratelimit-reset-tokens") || undefined;
  const requestDuration = parseResetDuration(resetRequests), tokenDuration = parseResetDuration(resetTokens);
  return {
    ...publicKey(key), status: "active", updatedAt: now,
    remainingRequests: numberHeader(response.headers, "x-ratelimit-remaining-requests"),
    requestLimit: numberHeader(response.headers, "x-ratelimit-limit-requests"),
    remainingTokens: numberHeader(response.headers, "x-ratelimit-remaining-tokens"),
    tokenLimit: numberHeader(response.headers, "x-ratelimit-limit-tokens"),
    resetRequests, resetTokens,
    resetRequestsAt: requestDuration === undefined ? undefined : now + requestDuration,
    resetTokensAt: tokenDuration === undefined ? undefined : now + tokenDuration,
  };
}

function dailyUsage(body: string) {
  const match = body.match(/tokens per day[\s\S]*?Limit\s+(\d+),\s+Used\s+(\d+),\s+Requested\s+(\d+)/i);
  return match ? { dailyTokenLimit: Number(match[1]), remainingDailyTokens: Math.max(0, Number(match[1]) - Number(match[2])), requestedTokens: Number(match[3]) } : {};
}
function callerAbort() { return new DOMException("The request was cancelled.", "AbortError"); }

export class GroqPool {
  private states = new Map<string, PoolState>();
  private request: typeof fetch;
  private now: () => number;
  constructor(dependencies: GroqPoolDependencies = {}) {
    this.request = dependencies.fetch ?? fetch;
    this.now = dependencies.now ?? Date.now;
  }

  private stateFor(keys: GroqPoolKey[]) {
    // Sessions/navigation cannot reset a real provider cooldown. The same ordered
    // key set shares scheduling; different credentials remain separate.
    const id = JSON.stringify(keys.map((key) => [key.source, key.id]));
    const now = this.now();
    let state = this.states.get(id);
    if (!state) {
      // Bound idle metadata without evicting any future provider waiting period.
      for (const [otherId, other] of this.states) {
        if (now - other.touchedAt > 86_400_000 && ![...other.statuses.values()].some((quota) => (quota.retryAt ?? 0) > now)) this.states.delete(otherId);
      }
      state = { order: keys.map((key) => key.id), statuses: new Map(keys.map((key) => [key.id, publicKey(key)])), revisions: new Map(), touchedAt: now };
      this.states.set(id, state);
    }
    state.touchedAt = now;
    for (const [keyId, quota] of state.statuses) {
      if ((quota.status === "cooldown" || quota.status === "exhausted") && quota.retryAt !== undefined && quota.retryAt <= now) {
        // Eligible to try again is not proof that the provider replenished quota.
        state.statuses.set(keyId, { ...quota, status: "ready", retryAt: undefined });
      }
    }
    return state;
  }

  private snapshot(keys: GroqPoolKey[], state: PoolState, source: GroqQuotaSnapshot["source"]): GroqQuotaSnapshot {
    const quotas = state.order.map((id, index) => ({ ...state.statuses.get(id)!, queuePosition: index + 1 }));
    const allUnavailable = !keys.length || quotas.every((quota) => ["cooldown", "exhausted", "invalid"].includes(quota.status));
    const retryTimes = quotas.filter((quota) => quota.status !== "invalid" && quota.retryAt !== undefined).map((quota) => quota.retryAt!);
    const degradationReason = !keys.length ? "no_keys" : !allUnavailable ? undefined : quotas.every((quota) => quota.status === "invalid") ? "all_keys_invalid" : quotas.every((quota) => quota.status === "exhausted") ? "all_keys_exhausted" : "cooldown_active";
    return { source, activeKeyId: quotas.find((quota) => quota.status === "active")?.id, allUnavailable, degradationReason,
      nextRetryAt: allUnavailable && retryTimes.length ? Math.min(...retryTimes) : undefined, updatedAt: this.now(), keys: quotas };
  }

  getSnapshot(keys: GroqPoolKey[], source: GroqQuotaSnapshot["source"], _sessionId?: string) {
    void _sessionId;
    return this.snapshot(keys, this.stateFor(keys), source);
  }

  private fail(state: PoolState, key: GroqPoolKey, quota: GroqKeyQuota) {
    const existing = state.statuses.get(key.id);
    state.revisions.set(key.id, (state.revisions.get(key.id) ?? 0) + 1);
    // A late short failure must not shorten an existing longer cooldown.
    const retryAt = Math.max(existing?.retryAt ?? 0, quota.retryAt ?? 0) || undefined;
    const status = existing?.status === "invalid" ? "invalid" : existing?.status === "exhausted" && (existing.retryAt ?? 0) >= (quota.retryAt ?? 0) && quota.status !== "invalid" ? "exhausted" : quota.status;
    state.statuses.set(key.id, { ...existing, ...quota, status,
      retryAt: status === "invalid" ? undefined : retryAt, consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1 });
    state.order = [...state.order.filter((id) => id !== key.id), key.id];
  }

  async fetch(keys: GroqPoolKey[], source: GroqQuotaSnapshot["source"], path: string, init: RequestInit, options: GroqCallOptions = {}): Promise<Response> {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Groq API path");
    const state = this.stateFor(keys);
    const status = () => this.snapshot(keys, state, source);
    // An observer error must never cause a successful provider call to be retried.
    const notify = () => { try { options.onStatus?.(status()); } catch { /* observer only */ } };
    const timeout = Math.max(1, options.timeoutMs ?? 90_000);
    const deadline = this.now() + timeout;
    const initialAvailableCount = Math.max(1, [...state.statuses.values()].filter((quota) => !["cooldown", "exhausted", "invalid"].includes(quota.status)).length);
    const defaultAttemptBudget = Math.ceil(timeout / initialAvailableCount);
    const attempted = new Set<string>();
    const signals = [options.signal, init.signal].filter((signal): signal is AbortSignal => Boolean(signal));
    if (signals.some((signal) => signal.aborted)) throw callerAbort();
    while (attempted.size < keys.length) {
      this.stateFor(keys);
      const candidate = state.order.find((id) => !attempted.has(id) && !["cooldown", "exhausted", "invalid"].includes(state.statuses.get(id)!.status));
      if (!candidate) break;
      const key = keys.find((item) => item.id === candidate)!;
      attempted.add(key.id);
      const revision = state.revisions.get(key.id) ?? 0;
      const remaining = deadline - this.now();
      if (remaining <= 0) { notify(); throw new GroqRequestTimeoutError(status()); }
      const attemptBudget = Math.min(remaining, Math.max(1, options.attemptTimeoutMs ?? defaultAttemptBudget));
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort(callerAbort());
      for (const signal of signals) signal.addEventListener("abort", abort, { once: true });
      if (signals.some((signal) => signal.aborted)) abort();
      const timer = setTimeout(() => { timedOut = true; controller.abort(new DOMException("Provider attempt timed out.", "TimeoutError")); }, attemptBudget);
      try {
        const operation = (async () => {
          const response = await this.request(`${BASE_URL}${path}`, { ...init, signal: controller.signal,
            headers: { ...Object.fromEntries(new Headers(init.headers).entries()), Authorization: `Bearer ${key.secret}` } });
          // Keep the timer alive through stalled JSON/audio bodies, not just headers.
          const bytes = await response.arrayBuffer();
          return new Response([204, 205, 304].includes(response.status) ? null : bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
        })();
        let removeAbort = () => {};
        const cancellation = new Promise<never>((_, reject) => {
          const listener = () => reject(controller.signal.reason);
          if (controller.signal.aborted) listener();
          else { controller.signal.addEventListener("abort", listener, { once: true }); removeAbort = () => controller.signal.removeEventListener("abort", listener); }
        });
        let response: Response;
        try { response = await Promise.race([operation, cancellation]); } finally { removeAbort(); }
        const now = this.now();
        if (response.ok) {
          if ((state.revisions.get(key.id) ?? 0) === revision) {
            for (const [id, quota] of state.statuses) if (quota.status === "active" && id !== key.id) state.statuses.set(id, { ...quota, status: "ready" });
            state.statuses.set(key.id, { ...quotaFromResponse(key, response, now), consecutiveFailures: 0 });
            // Success stays sticky; status reads never promote a recovered key.
            state.order = [key.id, ...state.order.filter((id) => id !== key.id)];
          }
          notify(); return response;
        }
        let raw = await response.text();
        for (const credential of keys) raw = raw.replaceAll(credential.secret, "[redacted]");
        const quota = quotaFromResponse(key, response, now);
        if (response.status === 429) {
          const daily = /per day|\bTPD\b|\bRPD\b/i.test(raw) || quota.remainingRequests === 0;
          this.fail(state, key, { ...quota, ...(daily ? dailyUsage(raw) : {}), status: daily ? "exhausted" : "cooldown", retryAt: retryAtFromResponse(response.headers, raw, now) });
          notify(); continue;
        }
        if (response.status === 401 || response.status === 403) {
          this.fail(state, key, { ...quota, status: "invalid" }); notify(); continue;
        }
        if (response.status >= 500 || response.status === 408) {
          const count = state.statuses.get(key.id)?.consecutiveFailures ?? 0;
          const suggested = parseRetryAfter(response.headers.get("retry-after"), now);
          this.fail(state, key, { ...quota, status: "cooldown", retryAt: suggested ?? now + Math.min(30_000 * 1.5 ** count, 300_000) });
          notify(); continue;
        }
        // Payload/model/context errors do not prove an API key is bad.
        throw new GroqHttpError(response.status, raw);
      } catch (error) {
        if (signals.some((signal) => signal.aborted)) throw callerAbort();
        if (timedOut || error instanceof TypeError || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) {
          const previous = state.statuses.get(key.id) ?? publicKey(key);
          this.fail(state, key, { ...previous, status: "cooldown", updatedAt: this.now(), retryAt: this.now() + Math.min(15_000 * 1.5 ** (previous.consecutiveFailures ?? 0), 120_000) });
          notify();
          if (timedOut && attemptBudget >= remaining) throw new GroqRequestTimeoutError(status());
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timer);
        for (const signal of signals) signal.removeEventListener("abort", abort);
      }
    }
    this.stateFor(keys);
    notify();
    const current = status();
    if (current.allUnavailable) throw new GroqFreeLimitError(current);
    // A key may recover while other attempts are in flight. Do not claim all
    // keys are exhausted merely because each was tried once in this operation.
    throw new GroqHttpError(503, "Provider attempts failed. A key can be retried now.");
  }
}
