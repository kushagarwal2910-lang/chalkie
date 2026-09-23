import { resolveProviderCredentials, type ProviderGroqKey } from "@/lib/provider-credentials";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export type GroqKeyStatus = "unknown" | "active" | "ready" | "cooldown" | "exhausted" | "invalid";

export type GroqKeyQuota = {
  id: string;
  slot: number;
  masked: string;
  source: "byok" | "server";
  status: GroqKeyStatus;
  remainingRequests?: number;
  requestLimit?: number;
  remainingTokens?: number;
  tokenLimit?: number;
  remainingDailyTokens?: number;
  dailyTokenLimit?: number;
  requestedTokens?: number;
  resetRequests?: string;
  resetTokens?: string;
  retryAt?: number;
  updatedAt?: number;
  consecutiveFailures?: number;
  queuePosition?: number;
};

export type DegradationReason = "all_keys_exhausted" | "all_keys_invalid" | "cooldown_active" | "no_keys";

export type GroqQuotaSnapshot = {
  source: "byok" | "server" | "none";
  activeKeyId?: string;
  allUnavailable: boolean;
  degradationReason?: DegradationReason;
  nextRetryAt?: number;
  keys: GroqKeyQuota[];
};

export type GroqCallOptions = {
  sessionId?: string;
  preferredKeyId?: string;
  onStatus?: (snapshot: GroqQuotaSnapshot) => void;
  timeoutMs?: number;
};

type PoolState = {
  order: string[];
  statuses: Map<string, GroqKeyQuota>;
  consecutiveFailures: Map<string, number>;
};

declare global {
  var chalkieGroqPoolStates: Map<string, PoolState> | undefined;
}

const poolStates = globalThis.chalkieGroqPoolStates ?? new Map<string, PoolState>();
globalThis.chalkieGroqPoolStates = poolStates;

/** Maximum consecutive failures before a key is marked invalid. */
const MAX_CONSECUTIVE_FAILURES = 5;
/** Default cooldown for server errors (5xx). */
const SERVER_ERROR_COOLDOWN_MS = 30_000;
/** Default cooldown for network/timeout errors. */
const NETWORK_ERROR_COOLDOWN_MS = 15_000;
/** Default cooldown when retry-after header is missing on a 429. */
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;

function poolId(keys: ProviderGroqKey[], sessionId = "default") {
  return `${sessionId.slice(0, 120)}:${keys.map((key) => key.id).join("-")}`;
}

function stateFor(keys: ProviderGroqKey[], sessionId?: string, preferredKeyId?: string) {
  const id = poolId(keys, sessionId);
  let state = poolStates.get(id);
  if (!state) {
    state = {
      order: keys.map((key) => key.id),
      statuses: new Map(keys.map((key) => [key.id, { id: key.id, slot: key.slot, masked: key.masked, source: key.source, status: "unknown" as const }])),
      consecutiveFailures: new Map(),
    };
    poolStates.set(id, state);
  }
  if (!state.consecutiveFailures) {
    state.consecutiveFailures = new Map();
  }
  if (!state.statuses) {
    state.statuses = new Map();
  }
  if (!Array.isArray(state.order)) {
    state.order = keys.map((key) => key.id);
  }
  const allowed = new Set(keys.map((key) => key.id));
  state.order = [...state.order.filter((keyId) => allowed.has(keyId)), ...keys.map((key) => key.id).filter((keyId) => !state!.order.includes(keyId))];
  if (preferredKeyId && allowed.has(preferredKeyId)) state.order = [preferredKeyId, ...state.order.filter((keyId) => keyId !== preferredKeyId)];
  for (const key of keys) {
    const existing = state.statuses.get(key.id);
    if (!existing) state.statuses.set(key.id, { id: key.id, slot: key.slot, masked: key.masked, source: key.source, status: "unknown" });
    else state.statuses.set(key.id, {
      ...existing,
      slot: key.slot,
      masked: key.masked,
      source: key.source,
      ...(existing.retryAt && existing.retryAt <= Date.now() ? { status: "ready" as const, retryAt: undefined } : {}),
    });
  }
  return state;
}

function numberHeader(headers: Headers, name: string) {
  const value = Number.parseInt(headers.get(name) ?? "", 10);
  return Number.isFinite(value) ? value : undefined;
}

function parseRetryMilliseconds(headers: Headers, body: string) {
  const headerSeconds = Number.parseFloat(headers.get("retry-after") ?? "");
  if (Number.isFinite(headerSeconds)) return Math.max(1000, headerSeconds * 1000);
  const text = body.match(/try again in\s+(?:(\d+)h)?(?:(\d+)m)?([0-9.]+)s/i);
  if (!text) return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  return ((Number(text[1] || 0) * 3600) + (Number(text[2] || 0) * 60) + Number(text[3] || 0)) * 1000;
}

function parseDailyTokenUsage(body: string) {
  const match = body.match(/tokens per day[\s\S]*?Limit\s+(\d+),\s+Used\s+(\d+),\s+Requested\s+(\d+)/i);
  if (!match) return {};
  const limit = Number(match[1]);
  const used = Number(match[2]);
  const requested = Number(match[3]);
  return { dailyTokenLimit: limit, remainingDailyTokens: Math.max(0, limit - used), requestedTokens: requested };
}

function computeDegradationReason(quotas: GroqKeyQuota[]): DegradationReason | undefined {
  if (!quotas.length) return "no_keys";
  const unavailable = quotas.filter((key) => ["cooldown", "exhausted", "invalid"].includes(key.status) && (!key.retryAt || key.retryAt > Date.now()));
  if (unavailable.length < quotas.length) return undefined;
  if (unavailable.every((key) => key.status === "invalid")) return "all_keys_invalid";
  if (unavailable.every((key) => key.status === "exhausted")) return "all_keys_exhausted";
  return "cooldown_active";
}

function computeNextRetryAt(quotas: GroqKeyQuota[]): number | undefined {
  const retryTimes = quotas
    .filter((key) => key.retryAt && ["cooldown", "exhausted"].includes(key.status))
    .map((key) => key.retryAt!);
  return retryTimes.length ? Math.min(...retryTimes) : undefined;
}

function snapshot(keys: ProviderGroqKey[], state: PoolState, source: GroqQuotaSnapshot["source"]): GroqQuotaSnapshot {
  const quotas: GroqKeyQuota[] = [];
  const order = Array.isArray(state.order) ? state.order : [];
  for (let i = 0; i < order.length; i++) {
    const keyId = order[i];
    const status = state.statuses?.get(keyId);
    const key = keys.find((k) => k.id === keyId);
    if (!status || !key) continue;
    quotas.push({
      ...status,
      slot: key.slot,
      masked: key.masked,
      source: key.source,
      consecutiveFailures: state.consecutiveFailures?.get(keyId) ?? 0,
      queuePosition: i + 1,
    });
  }

  const degradationReason = computeDegradationReason(quotas);
  return {
    source,
    activeKeyId: quotas.find((key) => key.status === "active")?.id,
    allUnavailable: Boolean(quotas.length) && quotas.every((key) => ["cooldown", "exhausted", "invalid"].includes(key.status) && (!key.retryAt || key.retryAt > Date.now())),
    degradationReason,
    nextRetryAt: computeNextRetryAt(quotas),
    keys: quotas,
  };
}

function moveToBack(state: PoolState, keyId: string) {
  const order = Array.isArray(state.order) ? state.order : [];
  state.order = [...order.filter((id) => id !== keyId), keyId];
}

function moveToFront(state: PoolState, keyId: string) {
  const order = Array.isArray(state.order) ? state.order : [];
  state.order = [keyId, ...order.filter((id) => id !== keyId)];
}

function incrementFailures(state: PoolState, keyId: string): number {
  if (!state.consecutiveFailures) state.consecutiveFailures = new Map();
  const current = (state.consecutiveFailures.get(keyId) ?? 0) + 1;
  state.consecutiveFailures.set(keyId, current);
  return current;
}

function resetFailures(state: PoolState, keyId: string) {
  if (!state.consecutiveFailures) state.consecutiveFailures = new Map();
  state.consecutiveFailures.set(keyId, 0);
}

function quotaFromResponse(key: ProviderGroqKey, response: Response): GroqKeyQuota {
  return {
    id: key.id,
    slot: key.slot,
    masked: key.masked,
    source: key.source,
    status: "active",
    remainingRequests: numberHeader(response.headers, "x-ratelimit-remaining-requests"),
    requestLimit: numberHeader(response.headers, "x-ratelimit-limit-requests"),
    remainingTokens: numberHeader(response.headers, "x-ratelimit-remaining-tokens"),
    tokenLimit: numberHeader(response.headers, "x-ratelimit-limit-tokens"),
    resetRequests: response.headers.get("x-ratelimit-reset-requests") || undefined,
    resetTokens: response.headers.get("x-ratelimit-reset-tokens") || undefined,
    updatedAt: Date.now(),
  };
}

export class GroqHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Groq request failed (${status}): ${body.slice(0, 500)}`);
    this.status = status;
    this.body = body;
  }
}

export class GroqFreeLimitError extends Error {
  readonly code = "FREE_LIMIT_REACHED";
  quota: GroqQuotaSnapshot;
  constructor(quota: GroqQuotaSnapshot) {
    const reason = quota.degradationReason;
    const nextRetry = quota.nextRetryAt ? ` Next key available at ${new Date(quota.nextRetryAt).toLocaleTimeString()}.` : "";
    const messages: Record<string, string> = {
      all_keys_exhausted: `All Groq API keys have hit their daily limit.${nextRetry} Add another key or wait for a reset.`,
      all_keys_invalid: "All Groq API keys are invalid. Please check and re-enter your keys.",
      cooldown_active: `All Groq API keys are cooling down.${nextRetry} They'll recover automatically.`,
      no_keys: "No Groq API keys configured. Add at least one key to get started.",
    };
    super(messages[reason ?? "no_keys"] ?? `All keys unavailable.${nextRetry}`);
    this.quota = quota;
  }
}

export async function getGroqQuotaSnapshot(sessionId?: string, preferredKeyId?: string) {
  const credentials = await resolveProviderCredentials();
  if (!credentials.groqKeys.length) return { source: credentials.source, allUnavailable: true, degradationReason: "no_keys" as const, keys: [] } satisfies GroqQuotaSnapshot;
  const state = stateFor(credentials.groqKeys, sessionId, preferredKeyId);
  return snapshot(credentials.groqKeys, state, credentials.source);
}

export async function groqFetch(path: string, init: RequestInit, options: GroqCallOptions = {}) {
  const credentials = await resolveProviderCredentials();
  if (!credentials.groqKeys.length) throw new GroqFreeLimitError({ source: "none", allUnavailable: true, degradationReason: "no_keys", keys: [] });
  const state = stateFor(credentials.groqKeys, options.sessionId, options.preferredKeyId);
  const keyById = new Map(credentials.groqKeys.map((key) => [key.id, key]));

  // Build candidate list: keys that are not currently unavailable (or have recovered)
  const candidates = state.order.map((id) => keyById.get(id)).filter((key): key is ProviderGroqKey => Boolean(key)).filter((key) => {
    const status = state.statuses.get(key.id);
    if (!status) return true;
    // Skip invalid keys that have exceeded max consecutive failures permanently
    if (status.status === "invalid") return false;
    // Allow cooldown/exhausted keys that have passed their retry time
    if (["cooldown", "exhausted"].includes(status.status)) {
      if (status.retryAt && status.retryAt <= Date.now()) {
        state.statuses.set(key.id, { ...status, status: "ready", retryAt: undefined });
        return true;
      }
      return false;
    }
    return true;
  });

  if (!candidates.length) {
    const minRetry = computeNextRetryAt(Array.from(state.statuses.values()));
    const waitTime = minRetry ? minRetry - Date.now() : -1;
    if (waitTime > 0 && waitTime <= 4000) {
      await new Promise((resolve) => setTimeout(resolve, waitTime + 200));
      return groqFetch(path, init, options);
    }
    const current = snapshot(credentials.groqKeys, state, credentials.source);
    options.onStatus?.(current);
    throw new GroqFreeLimitError(current);
  }

  let lastError: GroqHttpError | Error | undefined;
  for (const key of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);
    try {
      const response = await fetch(`${GROQ_BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { ...Object.fromEntries(new Headers(init.headers).entries()), Authorization: `Bearer ${key.secret}` },
      });

      if (response.ok) {
        // Success: reset failures, promote to front, mark active
        resetFailures(state, key.id);
        for (const [id, status] of state.statuses) if (status.status === "active" && id !== key.id) state.statuses.set(id, { ...status, status: "ready" });
        state.statuses.set(key.id, quotaFromResponse(key, response));
        moveToFront(state, key.id);
        options.onStatus?.(snapshot(credentials.groqKeys, state, credentials.source));
        return response;
      }

      const raw = await response.text();
      lastError = new GroqHttpError(response.status, raw);
      const failures = incrementFailures(state, key.id);

      // 429 — Rate limited: parse retry timing, move to back
      if (response.status === 429) {
        const daily = /per day|\bTPD\b|\bRPD\b/i.test(raw);
        const retryAt = Date.now() + parseRetryMilliseconds(response.headers, raw);
        state.statuses.set(key.id, { ...quotaFromResponse(key, response), ...(daily ? parseDailyTokenUsage(raw) : {}), status: daily ? "exhausted" : "cooldown", retryAt });
        moveToBack(state, key.id);
        options.onStatus?.(snapshot(credentials.groqKeys, state, credentials.source));
        continue;
      }

      // 401/403 — Invalid key: mark invalid, move to back
      if (response.status === 401 || response.status === 403) {
        state.statuses.set(key.id, { ...quotaFromResponse(key, response), status: "invalid" });
        moveToBack(state, key.id);
        options.onStatus?.(snapshot(credentials.groqKeys, state, credentials.source));
        continue;
      }

      // 5xx — Server error: cooldown with backoff, move to back, try next key
      if (response.status >= 500) {
        const cooldown = Math.min(SERVER_ERROR_COOLDOWN_MS * Math.pow(1.5, failures - 1), 300_000);
        state.statuses.set(key.id, { ...quotaFromResponse(key, response), status: "cooldown", retryAt: Date.now() + cooldown });
        moveToBack(state, key.id);
        options.onStatus?.(snapshot(credentials.groqKeys, state, credentials.source));
        continue;
      }

      // Other 4xx errors: if too many consecutive failures, mark invalid
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        state.statuses.set(key.id, { ...(state.statuses.get(key.id) ?? { id: key.id, slot: key.slot, masked: key.masked, source: key.source, status: "unknown" }), status: "invalid" });
        moveToBack(state, key.id);
        options.onStatus?.(snapshot(credentials.groqKeys, state, credentials.source));
        continue;
      }

      // Non-retriable client error — throw immediately
      throw lastError;
    } catch (error) {
      clearTimeout(timer);
      // Network error or abort: cooldown, move to back, try next key
      if (error instanceof TypeError || (error as Error).name === "AbortError") {
        const failures = incrementFailures(state, key.id);
        const cooldown = Math.min(NETWORK_ERROR_COOLDOWN_MS * Math.pow(1.5, failures - 1), 120_000);
        const existing = state.statuses.get(key.id) ?? { id: key.id, slot: key.slot, masked: key.masked, source: key.source, status: "unknown" as const };
        state.statuses.set(key.id, { ...existing, status: "cooldown", retryAt: Date.now() + cooldown });
        moveToBack(state, key.id);
        lastError = error as Error;
        options.onStatus?.(snapshot(credentials.groqKeys, state, credentials.source));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  const current = snapshot(credentials.groqKeys, state, credentials.source);
  options.onStatus?.(current);
  if (current.allUnavailable) throw new GroqFreeLimitError(current);
  throw lastError ?? new GroqFreeLimitError(current);
}

