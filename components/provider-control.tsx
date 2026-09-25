"use client";

import { AlertCircle, CheckCircle2, Gauge, KeyRound, RotateCcw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clearAllClientStorage } from "@/lib/client-storage";
import { newestProviderQuota, providerKeysetIdentity, providerRetryView, quotaMatchesConfiguration, retryCountdown, sanitizeProviderQuota, type ProviderKeyStatus, type ProviderQuota } from "@/lib/provider-retry";
export type { ProviderQuota } from "@/lib/provider-retry";

type ProviderSummary = {
  configured: boolean;
  source: "byok" | "server" | "none";
  tavilyConfigured: boolean;
  tavilySource?: "byok" | "server";
  encryptionReady: boolean;
  personalKeysNeedReentry: boolean;
  quota: ProviderQuota;
};

export const PROVIDER_STATUS_EVENT = "chalkie:provider-status";
export const PROVIDER_CONFIGURATION_EVENT = "chalkie:provider-configuration";
const STATUS_STORAGE = "chalkie:provider-quota";
const ACTIVE_KEY_STORAGE = "chalkie:groq-active";
const BYOK_SAVED_STORAGE = "chalkie:byok-saved";

export function publishProviderStatus(value: unknown) {
  if (typeof window === "undefined") return;
  const quota = sanitizeProviderQuota(value);
  if (!quota) return;
  // Status is ephemeral. Queue order belongs to the backend, never a saved pin.
  window.dispatchEvent(new CustomEvent(PROVIDER_STATUS_EVENT, { detail: quota }));
}

function shortNumber(value: number) {
  return Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function statusLabel(status: ProviderKeyStatus) {
  if (status === "active") return "Active";
  if (status === "ready") return "Ready";
  if (status === "cooldown") return "Cooling down";
  if (status === "exhausted") return "Daily limit reached";
  if (status === "invalid") return "Invalid key";
  return "Waiting for first request";
}

function statusColor(status: ProviderKeyStatus) {
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
  const [now, setNow] = useState(() => Date.now());
  const configuredKeysetRef = useRef<string | null>(null);
  const configurationRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++configurationRequestRef.current;
    const sessionId = window.localStorage.getItem("chalkie:session") || "home";
    const params = new URLSearchParams({ sessionId });
    const response = await fetch(`/api/byok?${params}`, { cache: "no-store" });
    if (!response.ok) return;
    const next = await response.json() as ProviderSummary;
    if (requestId !== configurationRequestRef.current) return;
    const quota = sanitizeProviderQuota(next.quota);
    if (!quota) return;
    configuredKeysetRef.current = providerKeysetIdentity(quota);
    setSummary(current => ({ ...next, quota: newestProviderQuota(current?.quota ?? null, quota) }));
    window.dispatchEvent(new CustomEvent(PROVIDER_CONFIGURATION_EVENT, { detail: quota }));
    publishProviderStatus(quota);
  }, []);

  useEffect(() => {
    window.localStorage.removeItem(STATUS_STORAGE);
    window.localStorage.removeItem(ACTIVE_KEY_STORAGE);
    window.localStorage.removeItem(BYOK_SAVED_STORAGE);
    const refreshTimer = window.setTimeout(() => void refresh(), 0);
    const handle = (event: Event) => {
      const quota = sanitizeProviderQuota((event as CustomEvent<ProviderQuota>).detail);
      if (!quota || !quotaMatchesConfiguration(configuredKeysetRef.current, quota)) return;
      setSummary((current) => current ? { ...current, source: quota.source, configured: quota.keys.length > 0, quota: newestProviderQuota(current.quota, quota) } : { configured: quota.keys.length > 0, source: quota.source, tavilyConfigured: false, encryptionReady: true, personalKeysNeedReentry: false, quota });
    };
    window.addEventListener(PROVIDER_STATUS_EVENT, handle);
    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener(PROVIDER_STATUS_EVENT, handle);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open && !summary?.quota.allUnavailable) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, summary?.quota.allUnavailable]);
  const retryView = providerRetryView(null, summary?.quota ?? null, now);

  const active = useMemo(() => summary?.quota.keys.find((key) => key.id === summary.quota.activeKeyId)
    ?? summary?.quota.keys.find((key) => !["invalid", "exhausted", "cooldown"].includes(key.status))
    ?? summary?.quota.keys[0], [summary]);
  const activeKeyLabel = summary?.source === "byok" ? "BYOK" : "Key";
  const topLabel = summary?.personalKeysNeedReentry
    ? "Re-enter API keys"
    : !summary?.configured
    ? "Add API keys"
    : summary.quota.allUnavailable
      ? (retryView.needsKeys ? "Check API keys" : "Provider unavailable")
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
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${summary?.personalKeysNeedReentry || summary?.quota.allUnavailable ? "border-[#5c232a] bg-[#291216] text-[#f87171]" : "border-[#262a38] bg-[#141620] text-[#d1d5db] hover:border-[#33394c] hover:bg-[#1a1d2b]"} ${className}`} title="Provider keys and live rate limits">
        <span className={`h-2 w-2 rounded-full ${summary?.personalKeysNeedReentry ? "bg-[#e49b3f]" : !summary?.configured ? "bg-[#9da2aa]" : summary.quota.allUnavailable ? "bg-[#d95061]" : "bg-[#35a477]"}`} />
        <span className="max-w-[130px] truncate">{topLabel}</span>
        <Gauge size={14} />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-[#000000]/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="provider-title">
          <div className="flex max-h-[92vh] w-[min(680px,96vw)] flex-col overflow-hidden rounded-[24px] border border-[#222636] bg-[#0e1017] text-[#f3f4f6] shadow-2xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-[#1f2333] px-5 py-4">
              <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#201d36] text-[#818cf8]"><KeyRound size={18} /></span>
              <div><h2 id="provider-title" className="font-semibold tracking-[-.02em] text-[#f3f4f6]">AI provider keys</h2><p className="mt-0.5 text-xs text-[#9ca3af]">Up to three Groq keys, tried in queue order</p></div>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-[#222636] text-[#9ca3af] transition hover:bg-[#1a1d2b] hover:text-[#f3f4f6]" aria-label="Close API key settings"><X size={16} /></button>
            </div>

            <div className="scrollbar-none overflow-y-auto p-5">
              <div className="rounded-2xl border border-[#183d2f] bg-[#0c241c] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#4ade80]"><ShieldCheck size={16} /> Private by design</div>
                <p className="mt-1.5 text-xs leading-5 text-[#86efac]">Keys are encrypted into an HttpOnly, same-site cookie. Canvas code and local storage never receive them after submission. They are sent only from the backend to Groq or Tavily.</p>
              </div>

              {summary?.personalKeysNeedReentry && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#5c3018] bg-[#24130a] p-4 text-[#fdba74]"><AlertCircle className="mt-0.5 shrink-0" size={16} /><div><p className="text-sm font-semibold">Re-enter your personal keys</p><p className="mt-1 text-xs leading-5">The saved keys could not be decrypted. Paste them again below to update the secure cookie.</p></div></div>}

              <section className="mt-5" aria-labelledby="quota-heading">
                <div className="flex items-center justify-between"><h3 id="quota-heading" className="text-sm font-semibold text-[#f3f4f6]">Live Groq status</h3><span className="rounded-full bg-[#181a26] px-2.5 py-1 text-[11px] font-semibold text-[#9ca3af]">{summary?.source === "byok" ? "Personal keys" : summary?.source === "server" ? "Server keys" : "No keys"}</span></div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(summary?.quota.keys ?? []).map((key) => (
                    <div key={key.id} className={`rounded-xl border p-3 ${key.id === summary?.quota.activeKeyId ? "border-[#4f46e5] bg-[#161528]" : "border-[#222636] bg-[#12141e]"}`}>
                      <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${statusColor(key.status)}`} /><span className="text-xs font-semibold text-[#f3f4f6]">Key {key.slot}</span>{key.queuePosition !== undefined && <span className="ml-auto rounded-full bg-[#25203e] px-1.5 py-0.5 text-[9px] font-bold text-[#a5b4fc]">Q{key.queuePosition}</span>}<span className="font-mono text-[10px] text-[#6b7280]">{key.masked}</span></div>
                      <p className="mt-2 text-[11px] font-medium text-[#d1d5db]">{statusLabel(key.status)}</p>
                      <p className="mt-1 text-[11px] leading-4 text-[#9ca3af]">{key.remainingDailyTokens !== undefined ? `${key.remainingDailyTokens.toLocaleString()} daily tokens remain` : key.remainingRequests !== undefined ? `${key.remainingRequests.toLocaleString()} requests remain in the reported window` : "Request limits update after use"}</p>
                      <p className="text-[11px] leading-4 text-[#9ca3af]">{key.retryAt && ["cooldown", "exhausted"].includes(key.status) ? (retryCountdown(key.retryAt, now) ? `Retry window in ${retryCountdown(key.retryAt, now)}` : "Ready to check again") : key.remainingTokens !== undefined ? `${key.remainingTokens.toLocaleString()} tokens remain in the reported window` : "Token limits update after use"}</p>
                      {key.consecutiveFailures !== undefined && key.consecutiveFailures > 0 && <p className="mt-1 text-[10px] font-medium text-[#f87171]">{key.consecutiveFailures} consecutive failure{key.consecutiveFailures === 1 ? "" : "s"}</p>}
                    </div>
                  ))}
                  {!summary?.quota.keys.length && <div className="sm:col-span-3 rounded-xl border border-dashed border-[#282d3e] bg-[#12141e] p-4 text-center text-sm text-[#9ca3af]">No Groq keys configured yet.</div>}
                </div>

                {summary?.quota.allUnavailable && (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#5c3018] bg-[#24130a] p-3 text-[#fdba74]">
                    <AlertCircle className="mt-0.5 shrink-0" size={15} />
                    <div>
                      <p className="text-xs font-semibold">{retryView.title}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-[#ea580c]">
                        {retryView.detail}
                      </p>
                    </div>
                  </div>
                )}
                <p className="mt-2 text-[11px] leading-4 text-[#6b7280]">Usage and retry times come from Groq. A retry time permits another attempt; it does not guarantee that quota has replenished.</p>
              </section>

              <form onSubmit={save} className="mt-5 border-t border-[#1f2333] pt-5">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-[#f3f4f6]">Bring your own keys</h3><span className={`text-xs font-medium ${summary?.tavilyConfigured ? "text-[#34d399]" : "text-[#6b7280]"}`}>Tavily {summary?.tavilyConfigured ? "ready" : "not configured"}</span></div>
                <p className="mt-1 text-xs leading-5 text-[#9ca3af]">The first Groq key stays active. A rate-limited or invalid key moves to the back and the next key is tried immediately.</p>
                <p className="mt-1 text-xs leading-5 text-[#9ca3af]">To replace Groq keys, enter the complete list in the order you want. Leave all Groq fields blank to keep saved keys while updating Tavily.</p>
                <div className="mt-3 space-y-2">
                  {keys.map((key, index) => (
                    <label key={index} className="block">
                      <span className="mb-1 block text-xs font-semibold text-[#9ca3af]">Groq key {index + 1}{index === 0 ? "" : " · optional"}</span>
                      <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(event) => setKeys((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="gsk_…" className="h-10 w-full rounded-xl border border-[#262b3c] bg-[#141620] px-3 font-mono text-sm text-[#f3f4f6] outline-none transition focus:border-[#818cf8] focus:ring-3 focus:ring-[#818cf8]/15" />
                    </label>
                  ))}
                  <label className="block pt-1">
                    <span className="mb-1 block text-xs font-semibold text-[#9ca3af]">Tavily key · optional</span>
                    <input type="password" autoComplete="off" spellCheck={false} value={tavilyKey} onChange={(event) => setTavilyKey(event.target.value)} placeholder="tvly-…" className="h-10 w-full rounded-xl border border-[#262b3c] bg-[#141620] px-3 font-mono text-sm text-[#f3f4f6] outline-none transition focus:border-[#818cf8] focus:ring-3 focus:ring-[#818cf8]/15" />
                  </label>
                </div>

                {message && <div className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${/saved|removed/i.test(message) ? "bg-[#0c241c] text-[#34d399]" : "bg-[#291216] text-[#f87171]"}`}>{/saved|removed/i.test(message) ? <CheckCircle2 className="mt-0.5 shrink-0" size={14} /> : <AlertCircle className="mt-0.5 shrink-0" size={14} />}<span>{message}</span></div>}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="submit" disabled={saving || (!keys.some((key) => key.trim()) && !tavilyKey.trim())} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#6366f1] px-4 text-sm font-semibold text-white transition hover:bg-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-40"><Save size={15} /> {saving ? "Saving…" : "Save personal keys"}</button>
                  {(summary?.source === "byok" || summary?.tavilySource === "byok" || summary?.personalKeysNeedReentry) && <button type="button" disabled={saving} onClick={() => void clearByok()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#522129] bg-[#241216] px-4 text-sm font-semibold text-[#f87171] transition hover:bg-[#33171d] disabled:opacity-40"><Trash2 size={14} /> Remove personal keys</button>}
                  <button type="button" disabled={saving} onClick={() => void resetEverything()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#262a38] bg-[#141620] px-4 text-sm font-semibold text-[#d1d5db] transition hover:bg-[#1a1d2b] disabled:opacity-40" title="Reset all keys, server caches, and local workspace"><RotateCcw size={14} /> Reset all data & cache</button>
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
