"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  formatVoiceLabel,
  getBestAvailableVoice,
  getRankedVoices,
  DEFAULT_SPEECH_RATE,
  DEFAULT_SPEECH_PITCH,
  PREFERRED_VOICE_KEY,
  SPEECH_RATE_KEY,
} from "@/lib/voice-selection";
import { formatNarrationForSpeech } from "@/lib/speech-formatter";
import { Check, Play, Square, Volume2, Sparkles, X } from "lucide-react";

interface VoiceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoiceChange?: (voiceUri: string, rate: number) => void;
}

export function VoiceSettingsDialog({
  open,
  onOpenChange,
  onVoiceChange,
}: VoiceSettingsDialogProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedUri, setSelectedUri] = useState<string>("");
  const [speechRate, setSpeechRate] = useState<number>(DEFAULT_SPEECH_RATE);
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length) {
        const ranked = getRankedVoices(available);
        setVoices(ranked);

        const storedUri = window.localStorage.getItem(PREFERRED_VOICE_KEY);
        const best = getBestAvailableVoice(ranked, storedUri);
        if (best) setSelectedUri(best.voiceURI || best.name);
      }
    };

    const initialLoad = window.setTimeout(() => {
      loadVoices();
      const storedRate = window.localStorage.getItem(SPEECH_RATE_KEY);
      if (storedRate) {
        const parsed = parseFloat(storedRate);
        if (!isNaN(parsed) && parsed >= 0.7 && parsed <= 1.3) setSpeechRate(parsed);
      }
    }, 0);
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.clearTimeout(initialLoad);
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  const handleSelectVoice = (uri: string) => {
    setSelectedUri(uri);
    window.localStorage.setItem(PREFERRED_VOICE_KEY, uri);
    onVoiceChange?.(uri, speechRate);
  };

  const handleSelectRate = (rate: number) => {
    setSpeechRate(rate);
    window.localStorage.setItem(SPEECH_RATE_KEY, rate.toString());
    onVoiceChange?.(selectedUri, rate);
  };

  const playSample = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (isPlayingSample) {
      window.speechSynthesis.cancel();
      setIsPlayingSample(false);
      return;
    }

    window.speechSynthesis.cancel();
    const sampleText = formatNarrationForSpeech(
      "Welcome to Chalkie! I explain mechanisms, processes, and systems clearly on the chalkboard with natural pacing."
    );

    const utterance = new SpeechSynthesisUtterance(sampleText);
    const matchedVoice = voices.find((v) => v.voiceURI === selectedUri || v.name === selectedUri);
    if (matchedVoice) utterance.voice = matchedVoice;
    utterance.rate = speechRate;
    utterance.pitch = DEFAULT_SPEECH_PITCH;

    utterance.onend = () => setIsPlayingSample(false);
    utterance.onerror = () => setIsPlayingSample(false);

    setIsPlayingSample(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(val) => {
      if (!val && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        setIsPlayingSample(false);
      }
      onOpenChange(val);
    }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[2147483646] bg-[#090b0d]/75 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={() => { if (document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement; }}
          onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}
          className="fixed left-1/2 top-1/2 z-[2147483647] flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[500px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] border border-[#363a40] bg-[#202327] text-[#f3f3ee] shadow-[0_28px_100px_#0008] outline-none"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-[#363a40] px-4 py-4 sm:px-6 sm:py-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#514a65] bg-[#302c3b] text-[#c4b5fd]"><Volume2 size={19} /></span>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[#a9adb6]">Make it yours</p>
              <DialogPrimitive.Title className="text-base font-semibold tracking-[-.025em] sm:text-lg">Voice & pacing</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-xs leading-5 text-[#a9adb6]">Find a voice and a rhythm that help you learn.</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#a9adb6] outline-none transition hover:bg-[#30343a] hover:text-[#f3f3ee] focus-visible:ring-2 focus-visible:ring-[#c4b5fd]" aria-label="Close voice settings"><X size={18} /></DialogPrimitive.Close>
          </header>

          <div className="min-h-0 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 [scrollbar-width:thin] [scrollbar-color:#50555d_transparent]">
            <fieldset>
              <legend className="mb-3 text-sm font-semibold">Speaking pace</legend>
              <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
                {[
                  { label: "Deliberate", rate: 0.86 },
                  { label: "Teacher", rate: 0.92, popular: true },
                  { label: "Normal", rate: 1.0 },
                  { label: "Brisk", rate: 1.08 },
                ].map((item) => {
                  const isSelected = Math.abs(speechRate - item.rate) < 0.02;
                  return <button key={item.rate} type="button" aria-pressed={isSelected} onClick={() => handleSelectRate(item.rate)} className={`flex min-h-[66px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-[#e3daff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#202327] ${isSelected ? "border-[#c4b5fd] bg-[#c4b5fd] text-[#211d2c]" : "border-[#3c4148] bg-[#17191c] text-[#d2d4d9] hover:border-[#66606f] hover:bg-[#282c31]"}`}>
                    <span className="text-xs font-semibold">{item.label}</span><span className={`text-[11px] ${isSelected ? "text-[#494057]" : "text-[#a9adb6]"}`}>{item.rate}×</span>
                  </button>;
                })}
              </div>
            </fieldset>

            <section aria-labelledby="voice-choice-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 id="voice-choice-heading" className="text-sm font-semibold">Narrator voice</h3><span className="inline-flex items-center gap-1.5 text-[10px] text-[#a9c9b0]"><Sparkles size={12} />Natural voices first</span></div>
              <div className="max-h-[min(36dvh,300px)] min-h-[72px] space-y-2 overflow-y-auto overscroll-contain rounded-xl pr-1 [scrollbar-width:thin] [scrollbar-color:#50555d_transparent]">
                {!voices.length && <div className="rounded-xl border border-dashed border-[#444950] bg-[#17191c] px-4 py-5 text-center text-xs leading-5 text-[#a9adb6]">Loading voices available on your device…</div>}
                {voices.slice(0, 10).map((voice) => {
                  const isSelected = selectedUri === voice.voiceURI || selectedUri === voice.name;
                  const isNatural = /natural|neural|online/i.test(voice.name);
                  const displayLabel = formatVoiceLabel(voice);
                  return <button key={voice.voiceURI || voice.name} type="button" aria-pressed={isSelected} onClick={() => handleSelectVoice(voice.voiceURI || voice.name)} className={`flex min-h-[64px] w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c4b5fd] ${isSelected ? "border-[#655b80] bg-[#302c3b] text-[#f0eaff]" : "border-[#363a40] bg-[#17191c] text-[#d2d4d9] hover:border-[#555b65] hover:bg-[#282c31]"}`}>
                    <div className="min-w-0 flex-1"><p className="break-words text-xs font-medium leading-5">{displayLabel}</p><div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-[10px] text-[#a9adb6]">{voice.lang}</span>{isNatural && <span className="rounded-md bg-[#2d3c32] px-1.5 py-0.5 text-[9px] font-medium text-[#b9d7c1]">Natural</span>}</div></div>
                    {isSelected ? <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#c4b5fd] text-[#211d2c]"><Check size={12} strokeWidth={2.8} /></span> : <span className="h-5 w-5 shrink-0 rounded-full border border-[#454b54]" aria-hidden="true" />}
                  </button>;
                })}
              </div>
            </section>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#363a40] bg-[#282c31] px-4 py-4 sm:px-6">
            <div className="min-w-0"><p className="text-xs font-medium">Hear a preview</p><p role="status" className="mt-1 text-[11px] leading-4 text-[#a9adb6]">{isPlayingSample ? "Playing your voice sample…" : "A little clarity before you begin."}</p></div>
            <button type="button" onClick={playSample} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#eee8ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#282c31] ${isPlayingSample ? "bg-[#dfb3b8] text-[#302125] hover:bg-[#ebc3c7]" : "bg-[#c4b5fd] text-[#211d2c] hover:bg-[#d3c8ff]"}`}>
              {isPlayingSample ? <><Square size={13} fill="currentColor" />Stop</> : <><Play size={13} fill="currentColor" />Preview</>}
            </button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
