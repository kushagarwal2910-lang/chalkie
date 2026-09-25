export type ProviderKeyStatus = "unknown" | "active" | "ready" | "cooldown" | "exhausted" | "invalid";
export type ProviderDegradationReason = "all_keys_exhausted" | "all_keys_invalid" | "cooldown_active" | "no_keys";
export type ProviderQuota = {
  source: "byok" | "server" | "none";
  activeKeyId?: string;
  allUnavailable: boolean;
  degradationReason?: ProviderDegradationReason;
  nextRetryAt?: number;
  updatedAt?: number;
  keys: Array<{
    id: string; slot: number; masked: string; source: "byok" | "server"; status: ProviderKeyStatus;
    remainingRequests?: number; requestLimit?: number; remainingTokens?: number; tokenLimit?: number;
    remainingDailyTokens?: number; dailyTokenLimit?: number; requestedTokens?: number;
    resetRequests?: string; resetTokens?: string; retryAt?: number; consecutiveFailures?: number; queuePosition?: number;
  }>;
};
export type ProviderFailure = { code: string; message: string; retryable: boolean; quota?: ProviderQuota; nextRetryAt?: number };

const statuses = new Set(["unknown", "active", "ready", "cooldown", "exhausted", "invalid"]);
const reasons = new Set(["all_keys_exhausted", "all_keys_invalid", "cooldown_active", "no_keys"]);
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
const publicId = (value: unknown) => typeof value === "string" && /^[a-f0-9]{8,64}$/i.test(value) ? value : undefined;

/** Whitelist status fields before publishing a browser event. Never persist keys. */
export function sanitizeProviderQuota(value: unknown): ProviderQuota | undefined {
  if (!value || typeof value !== "object" || !Array.isArray((value as ProviderQuota).keys)) return;
  const raw = value as ProviderQuota;
  const keys = raw.keys.flatMap((key) => {
    if (!key || typeof key !== "object") return [];
    const id = publicId(key.id);
    if (!id) return [];
    const result: ProviderQuota["keys"][number] = {
      id, slot: finite(key.slot) ?? 1, masked: key.source === "server" ? "managed" : "saved",
      source: key.source === "server" ? "server" : "byok", status: statuses.has(key.status) ? key.status : "unknown",
    };
    for (const name of ["remainingRequests", "requestLimit", "remainingTokens", "tokenLimit", "remainingDailyTokens", "dailyTokenLimit", "requestedTokens", "retryAt", "consecutiveFailures", "queuePosition"] as const) {
      const number = finite(key[name]);
      if (number !== undefined) result[name] = number;
    }
    // Only interval notation is useful here; never forward arbitrary vendor text.
    for (const name of ["resetRequests", "resetTokens"] as const) if (typeof key[name] === "string" && /^[\d.hms\s]+$/.test(key[name]!)) result[name] = key[name];
    return [result];
  });
  const source = raw.source === "byok" || raw.source === "server" ? raw.source : "none";
  return { source, keys, allUnavailable: raw.allUnavailable === true || keys.length === 0,
    activeKeyId: keys.some(key => key.id === raw.activeKeyId) ? raw.activeKeyId : undefined,
    degradationReason: keys.length === 0 ? "no_keys" : reasons.has(raw.degradationReason || "") ? raw.degradationReason : undefined,
    nextRetryAt: finite(raw.nextRetryAt), updatedAt: finite(raw.updatedAt) };
}

export function newestProviderQuota(current: ProviderQuota | null, incoming: ProviderQuota): ProviderQuota {
  const sameKeys = current?.source === incoming.source && current.keys.map(key => key.id).sort().join(",") === incoming.keys.map(key => key.id).sort().join(",");
  return current && sameKeys && current.updatedAt !== undefined && incoming.updatedAt !== undefined && incoming.updatedAt < current.updatedAt ? current : incoming;
}

export function providerKeysetIdentity(quota: ProviderQuota): string {
  return `${quota.source}:${quota.keys.map(key => key.id).sort().join(",")}`;
}

export function quotaMatchesConfiguration(configuredKeyset: string | null, quota: ProviderQuota): boolean {
  return configuredKeyset === null || configuredKeyset === providerKeysetIdentity(quota);
}

export function parseProviderFailure(value: unknown, fallback = "The request could not be completed."): ProviderFailure {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const message = typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : value instanceof Error ? value.message : fallback;
  return { code: typeof data.code === "string" ? data.code : "REQUEST_FAILED",
    message: message.replace(/\b(?:gsk_|tvly-)[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 350),
    retryable: data.retryable !== false, quota: sanitizeProviderQuota(data.quota ?? data.providerStatus), nextRetryAt: finite(data.nextRetryAt) };
}

export function providerFailureError(value: unknown, fallback?: string): Error & ProviderFailure {
  const failure = parseProviderFailure(value, fallback);
  return Object.assign(new Error(failure.message), failure);
}

export function retryCountdown(nextRetryAt: number | undefined, now: number): string | null {
  if (nextRetryAt === undefined || !Number.isFinite(nextRetryAt)) return null;
  const seconds = Math.max(0, Math.ceil((nextRetryAt - now) / 1000));
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
  return hours ? `${hours}h ${minutes}m ${rest}s` : minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function providerRetryView(failure: ProviderFailure | null, quota: ProviderQuota | null, now: number) {
  const unavailable = quota?.allUnavailable === true;
  const reason = unavailable ? quota?.degradationReason : undefined;
  const needsKeys = reason === "no_keys" || reason === "all_keys_invalid";
  const nextRetryAt = quota ? (unavailable ? quota.nextRetryAt : undefined) : failure?.nextRetryAt;
  const countdown = retryCountdown(nextRetryAt, now);
  const retryable = !needsKeys && !countdown && (failure?.retryable !== false || (!!quota && !unavailable && ["NO_KEYS_CONFIGURED", "FREE_LIMIT_REACHED", "PROVIDER_UNAVAILABLE"].includes(failure?.code || "")));
  const messages: Record<string, string> = {
    no_keys: "Add a Groq key to generate your lesson.",
    all_keys_invalid: "The saved Groq keys were rejected. Check or replace them.",
    all_keys_exhausted: "The Groq keys have reached a provider limit.",
    cooldown_active: "The Groq keys are temporarily unavailable.",
  };
  return { canRetry: retryable, countdown, needsKeys,
    title: reason ? messages[reason] : failure?.message || "The request could not be completed.",
    detail: countdown ? `Provider retry window opens in ${countdown}. Availability will be checked when you retry.`
      : needsKeys ? "Open Manage keys, save your keys, then retry this request."
      : nextRetryAt !== undefined ? "You can try again now. The provider will confirm availability."
      : unavailable ? "The provider did not give a retry time. Try again later or update your keys."
      : "Your board is unchanged. Retry the same request when you are ready." };
}

export type ProviderRetryState<Operation> = {
  requestId: number; status: "idle" | "pending" | "failed"; operation: Operation | null; failure: ProviderFailure | null;
};
export type ProviderRetryEvent<Operation> =
  | { type: "begin"; requestId: number; operation: Operation }
  | { type: "fail"; requestId: number; failure: ProviderFailure }
  | { type: "complete"; requestId: number }
  | { type: "clear"; requestId: number };

/** A late response cannot overwrite a newer request or its retry payload. */
export function providerRetryReducer<Operation>(state: ProviderRetryState<Operation>, event: ProviderRetryEvent<Operation>): ProviderRetryState<Operation> {
  if (event.type === "begin") return event.requestId > state.requestId ? { requestId: event.requestId, status: "pending", operation: event.operation, failure: null } : state;
  if (event.type === "clear") return event.requestId >= state.requestId ? { requestId: event.requestId, status: "idle", operation: null, failure: null } : state;
  if (event.requestId !== state.requestId || state.status !== "pending") return state;
  return event.type === "fail" ? { ...state, status: "failed", failure: event.failure }
    : { requestId: state.requestId, status: "idle", operation: null, failure: null };
}
