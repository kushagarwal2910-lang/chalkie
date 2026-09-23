"use client";

import { AlertCircle, CheckCircle2, Gauge, KeyRound, RotateCcw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { clearAllClientStorage } from "@/lib/client-storage";

type KeyStatus = "unknown" | "active" | "ready" | "cooldown" | "exhausted" | "invalid";
type DegradationReason = "all_keys_exhausted" | "all_keys_invalid" | "cooldown_active" | "no_keys";

export type ProviderQuota = {
  source: "byok" | "server" | "none";
  activeKeyId?: string;
  allUnavailable: boolean;
  keys: Array<{
    id: string;
    slot: number;
    masked: string;
    source: "byok" | "server";
    status: KeyStatus;
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
    consecutiveFailures?: number;
    queuePosition?: number;
  }>;
};

export type ProviderQuotaWithDegradation = ProviderQuota & {
  degradationReason?: DegradationReason;
  nextRetryAt?: number;
};

type ProviderSummary = {
  configured: boolean;
  source: "byok" | "server" | "none";
  tavilyConfigured: boolean;
  tavilySource?: "byok" | "server";
  encryptionReady: boolean;
  personalKeysNeedReentry: boolean;
  quota: ProviderQuota;
};

const STATUS_EVENT = "chalkie:provider-status";
const STATUS_STORAGE = "chalkie:provider-quota";
const ACTIVE_KEY_STORAGE = "chalkie:groq-active";
const BYOK_SAVED_STORAGE = "chalkie:byok-saved";

export function publishProviderStatus(quota: ProviderQuota) {
  if (typeof window === "undefined" || !quota?.keys) return;
  window.localStorage.setItem(STATUS_STORAGE, JSON.stringify(quota));
  if (quota.activeKeyId) window.localStorage.setItem(ACTIVE_KEY_STORAGE, quota.activeKeyId);
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: quota }));
}

export function preferredGroqKeyId() {
  return typeof window === "undefined" ? undefined : window.localStorage.getItem(ACTIVE_KEY_STORAGE) || undefined;
}

function shortNumber(value: number) {
  return Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function statusLabel(status: KeyStatus) {
  if (status === "active") return "Active";
  if (status === "ready") return "Ready";
  if (status === "cooldown") return "Cooling down";
  if (status === "exhausted") return "Daily limit reached";
  if (status === "invalid") return "Invalid key";
  return "Waiting for first request";
}

function statusColor(status: KeyStatus) {
  if (status === "active" || status === "ready") return "bg-[#35a477]";
  if (status === "cooldown") return "bg-[#e49b3f]";
  if (status === "exhausted") return "bg-[#d95061] animate-pulse";
  if (status === "invalid") return "bg-[#d95061]";
  return "bg-[#9da2aa]";
}

export function ProviderControl({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ProviderSummary | null>(null);
  const [keys, setKeys] = useState(["", "", ""]);
  const [tavilyKey, setTavilyKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sessionId = window.localStorage.getItem("chalkie:session") || "home";
    const preferred = preferredGroqKeyId();
    const params = new URLSearchParams({ sessionId });
    if (preferred) params.set("preferredKeyId", preferred);
    const response = await fetch(`/api/byok?${params}`, { cache: "no-store" });
    if (!response.ok) return;
    const next = await response.json() as ProviderSummary;
    if (window.localStorage.getItem(BYOK_SAVED_STORAGE) === "1" && next.source !== "byok") next.personalKeysNeedReentry = true;
    setSummary(next);
    publishProviderStatus(next.quota);
  }, []);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => void refresh(), 0);
    const handle = (event: Event) => {
      const quota = (event as CustomEvent<ProviderQuota>).detail;
      if (!quota?.keys) return;
      setSummary((current) => current ? { ...current, source: quota.source, configured: quota.keys.length > 0, quota } : { configured: quota.keys.length > 0, source: quota.source, tavilyConfigured: false, encryptionReady: true, personalKeysNeedReentry: false, quota });
    };
    window.addEventListener(STATUS_EVENT, handle);
    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener(STATUS_EVENT, handle);
    };
  }, [refresh]);

  const active = useMemo(() => summary?.quota.keys.find((key) => key.id === summary.quota.activeKeyId)
    ?? summary?.quota.keys.find((key) => !["invalid", "exhausted", "cooldown"].includes(key.status))
    ?? summary?.quota.keys[0], [summary]);
  const activeKeyLabel = summary?.source === "byok" ? "BYOK" : "Key";
  const topLabel = summary?.personalKeysNeedReentry
    ? "Re-enter API keys"
    : !summary?.configured
    ? "Add API keys"
    : summary.quota.allUnavailable
      ? "FREE limit reached"
      : active?.remainingRequests !== undefined
        ? `${activeKeyLabel} ${active.slot} · ${shortNumber(active.remainingRequests)} req`
        : `${activeKeyLabel} ${active?.slot ?? 1} ready`;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groqKeys: keys, tavilyKey }),
      });
      const data = await response.json() as { error?: string; savedGroqKeys?: number };
      if (!response.ok) throw new Error(data.error || "Could not save provider keys");
      window.localStorage.setItem(BYOK_SAVED_STORAGE, "1");
      setKeys(["", "", ""]);
      setTavilyKey("");
      setMessage(`${data.savedGroqKeys ?? 0} Groq key${data.savedGroqKeys === 1 ? "" : "s"} saved securely`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save provider keys");
    } finally {
      setSaving(false);
    }
  }

  async function resetEverything() {
    if (!confirm("Clear all saved keys, server caches, and local workspace data to start fresh?")) return;
    setSaving(true);
    setMessage(null);
    try {
      await fetch("/api/reset", { method: "POST" });
      await clearAllClientStorage();
      setMessage("All keys, caches, and storage cleared. Workspace is fresh.");
      setKeys(["", "", ""]);
      setTavilyKey("");
      await refresh();
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  async function clearByok() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/byok", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove saved keys");
      window.localStorage.removeItem(STATUS_STORAGE);
      window.localStorage.removeItem(ACTIVE_KEY_STORAGE);
      window.localStorage.removeItem(BYOK_SAVED_STORAGE);
      setMessage("Personal keys removed; server keys will be used when available");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove saved keys");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${summary?.personalKeysNeedReentry || summary?.quota.allUnavailable ? "border-[#efb7bf] bg-[#fff1f3] text-[#ad3043]" : "border-[#d9dde4] bg-white text-[#555b64] hover:bg-[#f4f6f9]"} ${className}`} title="Provider keys and live rate limits">
        <span className={`h-2 w-2 rounded-full ${summary?.personalKeysNeedReentry ? "bg-[#e49b3f]" : !summary?.configured ? "bg-[#9da2aa]" : summary.quota.allUnavailable ? "bg-[#d95061]" : "bg-[#35a477]"}`} />
        <span className="max-w-[130px] truncate">{topLabel}</span>
        <Gauge size={14} />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-[#11131a]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="provider-title">
          <div className="flex max-h-[92vh] w-[min(680px,96vw)] flex-col overflow-hidden rounded-[24px] border border-[#d9dde4] bg-white text-[#202124] shadow-2xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-[#e4e6eb] px-5 py-4">
              <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#eeeafd] text-[#654dcb]"><KeyRound size={18} /></span>
              <div><h2 id="provider-title" className="font-semibold tracking-[-.02em]">AI provider keys</h2><p className="mt-0.5 text-xs text-[#777d86]">Sticky key usage with automatic failover</p></div>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-[#dfe3e8] text-[#6e747d] transition hover:bg-[#f3f5f8]" aria-label="Close API key settings"><X size={16} /></button>
            </div>

            <div className="scrollbar-none overflow-y-auto p-5">
              <div className="rounded-2xl border border-[#dbe4e1] bg-[#f3faf7] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#276b54]"><ShieldCheck size={16} /> Private by design</div>
                <p className="mt-1.5 text-xs leading-5 text-[#5f746c]">Keys are encrypted into an HttpOnly, same-site cookie. Canvas code and local storage never receive them after submission. They are sent only from the backend to Groq or Tavily.</p>
              </div>

              {summary?.personalKeysNeedReentry && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#f0d2a4] bg-[#fff8eb] p-4 text-[#8b5a16]"><AlertCircle className="mt-0.5 shrink-0" size={16} /><div><p className="text-sm font-semibold">Re-enter your personal keys once</p><p className="mt-1 text-xs leading-5">The saved cookie was created with a previous local encryption secret and can no longer be opened. Paste the keys again below; future server restarts will remember them.</p></div></div>}

              <section className="mt-5" aria-labelledby="quota-heading">
                <div className="flex items-center justify-between"><h3 id="quota-heading" className="text-sm font-semibold">Live Groq status</h3><span className="rounded-full bg-[#f0f1f5] px-2.5 py-1 text-[11px] font-semibold text-[#747983]">{summary?.source === "byok" ? "Personal keys" : summary?.source === "server" ? "Server keys" : "No keys"}</span></div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(summary?.quota.keys ?? []).map((key, index) => (
                    <div key={key.id} className={`rounded-xl border p-3 ${key.id === summary?.quota.activeKeyId ? "border-[#9b8ae0] bg-[#f7f5ff]" : "border-[#e1e4e9] bg-[#fafbfc]"}`}>
                      <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${statusColor(key.status)}`} /><span className="text-xs font-semibold">Key {key.slot}</span>{key.queuePosition !== undefined && <span className="ml-auto rounded-full bg-[#eeeafd] px-1.5 py-0.5 text-[9px] font-bold text-[#7560d8]">Q{key.queuePosition}</span>}<span className="font-mono text-[10px] text-[#8b9098]">{key.masked}</span></div>
                      <p className="mt-2 text-[11px] font-medium text-[#666c75]">{statusLabel(key.status)}</p>
                      <p className="mt-1 text-[11px] leading-4 text-[#858a92]">{key.remainingDailyTokens !== undefined ? `${key.remainingDailyTokens.toLocaleString()} daily tokens remain` : key.remainingRequests !== undefined ? `${key.remainingRequests.toLocaleString()} requests left today` : "Daily requests update after use"}</p>
                      <p className="text-[11px] leading-4 text-[#858a92]">{key.retryAt && ["cooldown", "exhausted"].includes(key.status) ? `Retry after ${new Date(key.retryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : key.remainingTokens !== undefined ? `${key.remainingTokens.toLocaleString()} tokens left this minute` : "Minute tokens update after use"}</p>
                      {key.consecutiveFailures !== undefined && key.consecutiveFailures > 0 && <p className="mt-1 text-[10px] font-medium text-[#c9515d]">{key.consecutiveFailures} consecutive failure{key.consecutiveFailures === 1 ? "" : "s"}</p>}
                    </div>
                  ))}
                  {!summary?.quota.keys.length && <div className="sm:col-span-3 rounded-xl border border-dashed border-[#d7dae1] bg-[#fafbfc] p-4 text-center text-sm text-[#777d86]">No Groq keys configured yet.</div>}
                </div>

                {summary?.quota.allUnavailable && (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#f0c5aa] bg-[#fff6f0] p-3 text-[#8b4513]">
                    <AlertCircle className="mt-0.5 shrink-0" size={15} />
                    <div>
                      <p className="text-xs font-semibold">All keys are currently unavailable</p>
                      <p className="mt-0.5 text-[11px] leading-4">
                        {((summary.quota as ProviderQuotaWithDegradation).degradationReason === "all_keys_invalid")
                          ? "Please check and re-enter your API keys below."
                          : (summary.quota as ProviderQuotaWithDegradation).nextRetryAt
                            ? `The earliest key will recover at ${new Date((summary.quota as ProviderQuotaWithDegradation).nextRetryAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
                            : "Add another Groq key or wait for a cooldown reset."}
                      </p>
                    </div>
                  </div>
                )}
                <p className="mt-2 text-[11px] leading-4 text-[#8a8f97]">Groq exposes daily request and per-minute token headers. It does not expose a general free-credit balance on successful requests.</p>
              </section>

              <form onSubmit={save} className="mt-5 border-t border-[#e5e7eb] pt-5">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Bring your own keys</h3><span className={`text-xs font-medium ${summary?.tavilyConfigured ? "text-[#2f8c69]" : "text-[#8a8f97]"}`}>Tavily {summary?.tavilyConfigured ? "ready" : "not configured"}</span></div>
                <p className="mt-1 text-xs leading-5 text-[#777d86]">The first Groq key stays active. A rate-limited or invalid key moves to the back and the next key is tried immediately.</p>
                <div className="mt-3 space-y-2">
                  {keys.map((key, index) => (
                    <label key={index} className="block">
                      <span className="mb-1 block text-xs font-semibold text-[#676d76]">Groq key {index + 1}{index === 0 ? "" : " · optional"}</span>
                      <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(event) => setKeys((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="gsk_…" className="h-10 w-full rounded-xl border border-[#d9dde4] bg-white px-3 font-mono text-sm outline-none transition focus:border-[#7560d8] focus:ring-3 focus:ring-[#7560d8]/10" />
                    </label>
                  ))}
                  <label className="block pt-1">
                    <span className="mb-1 block text-xs font-semibold text-[#676d76]">Tavily key · optional</span>
                    <input type="password" autoComplete="off" spellCheck={false} value={tavilyKey} onChange={(event) => setTavilyKey(event.target.value)} placeholder="tvly-…" className="h-10 w-full rounded-xl border border-[#d9dde4] bg-white px-3 font-mono text-sm outline-none transition focus:border-[#7560d8] focus:ring-3 focus:ring-[#7560d8]/10" />
                  </label>
                </div>

                {message && <div className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${/saved|removed/i.test(message) ? "bg-[#edf8f4] text-[#267657]" : "bg-[#fff1f3] text-[#a83245]"}`}>{/saved|removed/i.test(message) ? <CheckCircle2 className="mt-0.5 shrink-0" size={14} /> : <AlertCircle className="mt-0.5 shrink-0" size={14} />}<span>{message}</span></div>}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="submit" disabled={saving || (!keys.some((key) => key.trim()) && !tavilyKey.trim())} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#684fd1] px-4 text-sm font-semibold text-white transition hover:bg-[#5942c0] disabled:cursor-not-allowed disabled:opacity-40"><Save size={15} /> {saving ? "Saving…" : "Save personal keys"}</button>
                  {summary?.source === "byok" && <button type="button" disabled={saving} onClick={() => void clearByok()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e3cbd0] bg-white px-4 text-sm font-semibold text-[#a53a4c] transition hover:bg-[#fff3f5] disabled:opacity-40"><Trash2 size={14} /> Remove personal keys</button>}
                  <button type="button" disabled={saving} onClick={() => void resetEverything()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dfe3e8] bg-white px-4 text-sm font-semibold text-[#666d77] transition hover:bg-[#f3f5f8] disabled:opacity-40" title="Reset all keys, server caches, and local workspace"><RotateCcw size={14} /> Reset all data & cache</button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
