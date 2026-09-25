"use client";

import { AlertCircle, CheckCircle2, Gauge, KeyRound, RotateCcw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
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
  if (status === "active" || status === "ready") return "bg-[#a9c9b0]";
  if (status === "cooldown") return "bg-[#d6b58f]";
  if (status === "exhausted") return "bg-[#d6a0a7]";
  if (status === "invalid") return "bg-[#d6a0a7]";
  return "bg-[#a9adb6]";
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
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button type="button" aria-label={`AI provider keys: ${topLabel}`} className={`inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-2.5 text-[11px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[#c4b5fd] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17191c] sm:px-3 sm:text-xs ${summary?.personalKeysNeedReentry || summary?.quota.allUnavailable ? "border-[#645344] bg-[#302920] text-[#e1c3a2]" : "border-[#363a40] bg-[#202327] text-[#d2d4d9] hover:bg-[#282c31] hover:text-[#f3f3ee]"} ${className}`} title="Provider keys and live rate limits">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${summary?.personalKeysNeedReentry ? "bg-[#d6b58f]" : !summary?.configured ? "bg-[#a9adb6]" : summary.quota.allUnavailable ? "bg-[#d6b58f]" : "bg-[#a9c9b0]"}`} />
          <span className="hidden max-w-[96px] truncate min-[480px]:inline sm:max-w-[140px]">{topLabel}</span>
          <Gauge size={14} className="shrink-0" aria-hidden="true" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[2147483646] bg-[#090b0d]/75 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[2147483647] flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[680px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] border border-[#363a40] bg-[#202327] text-[#f3f3ee] shadow-[0_28px_100px_#0008] outline-none">
          <header className="flex shrink-0 items-start gap-3 border-b border-[#363a40] px-4 py-4 sm:px-6 sm:py-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#514a65] bg-[#302c3b] text-[#c4b5fd]"><KeyRound size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[#a9adb6]">Connections</p>
              <DialogPrimitive.Title className="text-base font-semibold tracking-[-.025em] sm:text-lg">AI provider keys</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-xs leading-5 text-[#a9adb6]">Your keys, with live usage and automatic failover.</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#a9adb6] outline-none transition hover:bg-[#30343a] hover:text-[#f3f3ee] focus-visible:ring-2 focus-visible:ring-[#c4b5fd]" aria-label="Close API key settings"><X size={18} /></DialogPrimitive.Close>
          </header>

          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 [scrollbar-width:thin] [scrollbar-color:#50555d_transparent]">
            <div className="flex items-start gap-3 rounded-2xl border border-[#394d40] bg-[#252f29] p-3.5">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#a9c9b0]" />
              <div><p className="text-xs font-semibold text-[#c5ddcb]">Saved securely in this browser</p><p className="mt-1 text-xs leading-5 text-[#b0c2b6]">Keys are encrypted in an HttpOnly cookie and sent to Groq or Tavily only by the backend. They never enter canvas data or local storage.</p></div>
            </div>
            {summary?.personalKeysNeedReentry && <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-[#645344] bg-[#302920] p-3.5 text-[#e1c3a2]"><AlertCircle className="mt-0.5 shrink-0" size={16} /><div><p className="text-sm font-semibold">Re-enter your personal keys</p><p className="mt-1 text-xs leading-5">The saved keys could not be decrypted. Paste them again below to update the secure cookie.</p></div></div>}

            <section className="mt-6" aria-labelledby="quota-heading">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="quota-heading" className="text-sm font-semibold">Live Groq status</h3><span className="rounded-full border border-[#3c4148] bg-[#282c31] px-2.5 py-1 text-[10px] font-medium text-[#a9adb6]">{summary?.source === "byok" ? "Personal keys" : summary?.source === "server" ? "Server keys" : "No keys"}</span></div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                {(summary?.quota.keys ?? []).map((key) => (
                  <div key={key.id} className={`min-w-0 rounded-2xl border p-3.5 ${key.id === summary?.quota.activeKeyId ? "border-[#655b80] bg-[#2d2937]" : "border-[#363a40] bg-[#17191c]"}`}>
                    <div className="flex items-center gap-2"><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusColor(key.status)}`} /><span className="text-xs font-semibold">Key {key.slot}</span>{key.queuePosition !== undefined && <span className="ml-auto rounded-md bg-[#373141] px-1.5 py-0.5 text-[9px] font-semibold text-[#c4b5fd]">Q{key.queuePosition}</span>}<span className="font-mono text-[10px] text-[#a9adb6]">{key.masked}</span></div>
                    <p className="mt-3 text-[11px] font-medium text-[#e1e2e6]">{statusLabel(key.status)}</p>
                    <p className="mt-1 text-[11px] leading-[1.7] text-[#a9adb6]">{key.remainingDailyTokens !== undefined ? `${key.remainingDailyTokens.toLocaleString()} daily tokens remain` : key.remainingRequests !== undefined ? `${key.remainingRequests.toLocaleString()} requests remain in the reported window` : "Request limits update after use"}</p>
                    <p className="text-[11px] leading-[1.7] text-[#a9adb6]">{key.retryAt && ["cooldown", "exhausted"].includes(key.status) ? (retryCountdown(key.retryAt, now) ? `Retry window in ${retryCountdown(key.retryAt, now)}` : "Ready to check again") : key.remainingTokens !== undefined ? `${key.remainingTokens.toLocaleString()} tokens remain in the reported window` : "Token limits update after use"}</p>
                    {key.consecutiveFailures !== undefined && key.consecutiveFailures > 0 && <p className="mt-1 text-[10px] font-medium text-[#e4aaaa]">{key.consecutiveFailures} consecutive failure{key.consecutiveFailures === 1 ? "" : "s"}</p>}
                  </div>
                ))}
                {!summary?.quota.keys.length && <div className="rounded-2xl border border-dashed border-[#444950] bg-[#17191c] px-4 py-5 text-center text-xs text-[#a9adb6] sm:col-span-3">Add a Groq key below to start teaching.</div>}
              </div>
              {summary?.quota.allUnavailable && <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-[#645344] bg-[#302920] p-3.5 text-[#e1c3a2]"><AlertCircle className="mt-0.5 shrink-0" size={15} /><div><p className="text-xs font-semibold">{retryView.title}</p><p className="mt-1 text-[11px] leading-5 text-[#c6b49f]">{retryView.detail}</p></div></div>}
              <p className="mt-2.5 text-[11px] leading-5 text-[#a9adb6]">Usage and retry times come from Groq. A retry time permits another attempt; it does not guarantee that quota has replenished.</p>
            </section>

            <form onSubmit={save} className="mt-6 border-t border-[#363a40] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Bring your own keys</h3><span className={`text-[11px] ${summary?.tavilyConfigured ? "text-[#a9c9b0]" : "text-[#a9adb6]"}`}>Tavily {summary?.tavilyConfigured ? "ready" : "not configured"}</span></div>
              <p className="mt-2 text-xs leading-5 text-[#a9adb6]">The first Groq key stays active. A rate-limited or invalid key moves to the back and the next key is tried immediately.</p>
              <p className="mt-1 text-xs leading-5 text-[#a9adb6]">Enter the complete Groq list to replace your keys. Leave these fields blank to keep saved keys while updating Tavily.</p>
              <div className="mt-4 space-y-3">
                {keys.map((key, index) => <label key={index} className="block"><span className="mb-1.5 block text-xs font-medium text-[#d2d4d9]">Groq key {index + 1}{index === 0 ? "" : " · optional"}</span><input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(event) => setKeys((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="gsk_…" className="h-11 w-full min-w-0 rounded-xl border border-[#3c4148] bg-[#17191c] px-3.5 font-mono text-base text-[#f3f3ee] outline-none transition placeholder:text-[#737985] focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#c4b5fd]/15 sm:text-sm" /></label>)}
                <label className="block pt-1"><span className="mb-1.5 block text-xs font-medium text-[#d2d4d9]">Tavily key · optional</span><input type="password" autoComplete="off" spellCheck={false} value={tavilyKey} onChange={(event) => setTavilyKey(event.target.value)} placeholder="tvly-…" className="h-11 w-full min-w-0 rounded-xl border border-[#3c4148] bg-[#17191c] px-3.5 font-mono text-base text-[#f3f3ee] outline-none transition placeholder:text-[#737985] focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#c4b5fd]/15 sm:text-sm" /></label>
              </div>
              {message && <div role="status" className={`mt-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-xs leading-5 ${/saved|removed/i.test(message) ? "bg-[#252f29] text-[#b8d4c0]" : "bg-[#35282a] text-[#e4aaaa]"}`}>{/saved|removed/i.test(message) ? <CheckCircle2 className="mt-0.5 shrink-0" size={14} /> : <AlertCircle className="mt-0.5 shrink-0" size={14} />}<span className="min-w-0 break-words">{message}</span></div>}
              <div className="mt-5 grid gap-2.5 sm:flex sm:flex-wrap">
                <button type="submit" disabled={saving || (!keys.some((key) => key.trim()) && !tavilyKey.trim())} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#c4b5fd] px-4 py-2.5 text-xs font-semibold text-[#211d2c] outline-none transition hover:bg-[#d3c8ff] focus-visible:ring-2 focus-visible:ring-[#eee8ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#202327] disabled:cursor-not-allowed disabled:opacity-40"><Save size={15} />{saving ? "Saving…" : "Save personal keys"}</button>
                {(summary?.source === "byok" || summary?.tavilySource === "byok" || summary?.personalKeysNeedReentry) && <button type="button" disabled={saving} onClick={() => void clearByok()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#5b4548] bg-[#30272a] px-4 py-2.5 text-xs font-medium text-[#e4aaaa] outline-none transition hover:bg-[#3d2e32] focus-visible:ring-2 focus-visible:ring-[#c4b5fd] disabled:opacity-40"><Trash2 size={14} />Remove personal keys</button>}
                <button type="button" disabled={saving} onClick={() => void resetEverything()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#3c4148] bg-[#282c31] px-4 py-2.5 text-xs font-medium text-[#d2d4d9] outline-none transition hover:bg-[#33383f] focus-visible:ring-2 focus-visible:ring-[#c4b5fd] disabled:opacity-40" title="Reset all keys, server caches, and local workspace"><RotateCcw size={14} />Reset all data & cache</button>
              </div>
            </form>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
