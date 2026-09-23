"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Check, Mic2, Play, Square, Volume2, Sparkles } from "lucide-react";
import { ChalkieIcon } from "@/components/chalkie-icon";

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

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    const storedRate = window.localStorage.getItem(SPEECH_RATE_KEY);
    if (storedRate) {
      const parsed = parseFloat(storedRate);
      if (!isNaN(parsed) && parsed >= 0.7 && parsed <= 1.3) setSpeechRate(parsed);
    }
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
    <Dialog open={open} onOpenChange={(val) => {
      if (!val && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        setIsPlayingSample(false);
      }
      onOpenChange(val);
    }}>
      <DialogContent className="max-w-[480px] rounded-2xl border border-[#222636] bg-[#0e1017] p-6 text-[#f3f4f6] shadow-2xl">
        <DialogHeader className="space-y-1 pb-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#141624] p-1 ring-1 ring-[#282d40]">
              <ChalkieIcon size={20} alt="Chalkie" />
            </span>
            <DialogTitle className="text-base font-semibold text-[#f3f4f6]">
              Voice & Pronunciation Settings
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[#9ca3af]">
            Select your preferred narrator voice and pacing for clear visual lessons.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Speaking Pace */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">
              Teaching Cadence & Speed
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Deliberate", rate: 0.86 },
                { label: "Teacher", rate: 0.92, popular: true },
                { label: "Normal", rate: 1.0 },
                { label: "Brisk", rate: 1.08 },
              ].map((item) => {
                const isSelected = Math.abs(speechRate - item.rate) < 0.02;
                return (
                  <button
                    key={item.rate}
                    type="button"
                    onClick={() => handleSelectRate(item.rate)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition ${
                      isSelected
                        ? "border-[#818cf8] bg-[#1d1b32] text-[#c7d2fe] shadow-sm"
                        : "border-[#222636] bg-[#141620] text-[#9ca3af] hover:border-[#32384e] hover:bg-[#1a1d2b] hover:text-[#f3f4f6]"
                    }`}
                  >
                    <span className="text-xs font-medium">{item.label}</span>
                    <span className="mt-0.5 text-[10px] text-[#6b7280]">{item.rate}x</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Voice Selection */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">
                Narrator Voice
              </label>
              <span className="flex items-center gap-1 text-[11px] text-[#a5b4fc]">
                <Sparkles size={11} /> Natural Neural voices ranked first
              </span>
            </div>

            <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
              {!voices.length && (
                <p className="py-4 text-center text-xs text-[#6b7280]">
                  Loading browser speech engines…
                </p>
              )}
              {voices.slice(0, 10).map((v) => {
                const isSelected = selectedUri === v.voiceURI || selectedUri === v.name;
                const isNatural = /natural|neural|online/i.test(v.name);
                const displayLabel = formatVoiceLabel(v);

                return (
                  <button
                    key={v.voiceURI || v.name}
                    type="button"
                    onClick={() => handleSelectVoice(v.voiceURI || v.name)}
                    className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-left transition ${
                      isSelected
                        ? "border-[#818cf8] bg-[#1d1b32] text-[#c7d2fe]"
                        : "border-[#222636] bg-[#141620] text-[#d1d5db] hover:border-[#32384e] hover:bg-[#1a1d2b]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium">{displayLabel}</span>
                        {isNatural && (
                          <span className="rounded-full bg-[#183d2f] px-1.5 py-0.2 text-[10px] font-semibold text-[#34d399]">
                            HD Natural
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 block text-[10px] text-[#6b7280]">{v.lang}</span>
                    </div>

                    {isSelected && (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#818cf8] text-[#0e1017]">
                        <Check size={12} strokeWidth={2.8} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Test Voice Sample Bar */}
          <div className="flex items-center justify-between rounded-xl border border-[#222636] bg-[#141620] p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#f3f4f6]">Test Pronunciation</p>
              <p className="text-[11px] text-[#6b7280]">
                {isPlayingSample ? "Speaking sample…" : "Listen to pacing and clarity sample"}
              </p>
            </div>
            <button
              type="button"
              onClick={playSample}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition ${
                isPlayingSample
                  ? "bg-[#e11d48] text-white hover:bg-[#be123c]"
                  : "bg-[#818cf8] text-[#0e1017] hover:bg-[#6366f1] hover:text-white"
              }`}
            >
              {isPlayingSample ? (
                <>
                  <Square size={12} fill="currentColor" /> Stop
                </>
              ) : (
                <>
                  <Play size={12} fill="currentColor" /> Preview
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
