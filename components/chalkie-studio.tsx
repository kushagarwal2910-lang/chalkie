"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  BookOpen,
  Check,
  CircleHelp,
  Clock3,
  Cloud,
  FileText,
  Focus,
  Headphones,
  HardDriveUpload,
  Layers3,
  MessageSquare,
  Mic,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Volume2,
  WandSparkles,
  Waves,
  X,
  AlertTriangle,
  KeyRound,
  RotateCcw,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { followUpPlanSchema, lessonPlanSchema, type LessonPlan, type LessonSegment } from "@/lib/lesson-schema";
import { useRealtime } from "@/hooks/use-realtime";
import { clearAllClientStorage, loadCurrentLesson, loadLessonById, saveCurrentLesson } from "@/lib/client-storage";
import { repairAndValidateLessonPlan } from "@/lib/lesson-layout";
import { mergeFollowUpLesson } from "@/lib/follow-up";
import { preferredGroqKeyId, ProviderControl, publishProviderStatus, type ProviderQuota } from "@/components/provider-control";
import { ChalkieIcon } from "@/components/chalkie-icon";
import { VoiceSettingsDialog } from "@/components/voice-settings-dialog";
import { formatNarrationForSpeech } from "@/lib/speech-formatter";
import {
  getBestAvailableVoice,
  PREFERRED_VOICE_KEY,
  SPEECH_RATE_KEY,
  DEFAULT_SPEECH_RATE,
  DEFAULT_SPEECH_PITCH,
} from "@/lib/voice-selection";

const ChalkCanvas = dynamic(
  () => import("@/components/chalk-canvas").then((mod) => mod.ChalkCanvas),
  { ssr: false, loading: () => <CanvasLoading /> },
);

const sourceColors = ["text-[#bcb3ff]", "text-[#75ddbe]", "text-[#ffbb79]", "text-[#76b9ff]", "text-[#ff8da1]"];

const emptyLesson: LessonPlan = {
  id: "new-lesson",
  title: "New visual lesson",
  question: "",
  summary: "",
  diagramType: "system",
  visualStrategy: "",
  sources: [],
  objects: [],
  connections: [],
  segments: [],
};

function CanvasLoading() {
  return (
    <div className="soft-grid absolute inset-0 grid place-items-center bg-[#0c0d12] text-[#e5e7eb]">
      <div className="flex items-center gap-3 rounded-full border border-[#222638] bg-[#141622] px-4 py-2 text-sm text-[#e5e7eb] shadow-xl">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#818cf8]" />
        Warming up the chalkboard…
      </div>
    </div>
  );
}

function IconButton({ label, children, className = "", onClick }: { label: string; children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#222636] bg-[#141620] text-[#9ca3af] transition hover:border-[#32384e] hover:bg-[#1a1d2b] hover:text-[#f3f4f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8] ${className}`}
    >
      {children}
    </button>
  );
}

async function readEventStream(response: Response, onEvent: (type: string, data: Record<string, unknown>) => void) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const type = block.match(/^event:\s*(.+)$/m)?.[1] ?? "message";
      const raw = block.match(/^data:\s*(.+)$/m)?.[1];
      if (raw) onEvent(type, JSON.parse(raw) as Record<string, unknown>);
    }
    if (done) break;
  }
}

const STOP_WORDS = new Set([
  "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
  "does", "that", "this", "these", "those", "about", "with", "from", "into",
  "have", "more", "also", "then", "here", "there", "explain", "teach", "please",
  "could", "would", "should", "work", "works", "mean", "means", "show", "tell",
  "visual", "lesson", "canvas", "board", "draw", "chalk", "step"
]);

function isLikelyNewTopic(q: string, current: LessonPlan): boolean {
  const trimmed = q.trim().toLowerCase();
  if (/^(new|fresh|create|topic|start fresh|reset):\s*/i.test(trimmed)) return true;
  if (/^(teach me|create a lesson|make a lesson|give me a lesson|new topic|start a new)\b/i.test(trimmed)) return true;

  // Extract meaningful query keywords (length >= 4, not in stop words)
  const words = trimmed
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  // If there are at least 2 substantive topic words and ZERO match the current board, treat as a new lesson
  if (words.length >= 2 && current && current.objects.length > 0) {
    const boardText = `${current.title} ${current.question} ${current.summary} ${current.visualStrategy} ${current.objects.map((o) => o.label).join(" ")}`.toLowerCase();
    const hasOverlap = words.some((w) => boardText.includes(w));
    if (!hasOverlap) return true;
  }
  return false;
}

export function ChalkieStudio() {
  const [lesson, setLesson] = useState<LessonPlan>(emptyLesson);
  const [promptMode, setPromptMode] = useState<"auto" | "doubt" | "new">("auto");
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [visualSegment, setVisualSegment] = useState<LessonSegment | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [generationStage, setGenerationStage] = useState("Ready");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFollowUpGenerating, setIsFollowUpGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "transcribing" | "thinking" | "speaking">("idle");
  const [lastHeard, setLastHeard] = useState("");
  const [lastAnswer, setLastAnswer] = useState("");
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeMobilePanel, setActiveMobilePanel] = useState<"sources" | "canvas" | "studio">("canvas");

  const toggleLeftPanel = () => {
    setLeftPanelOpen((prev) => !prev);
    setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
    setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
  };

  const toggleRightPanel = () => {
    setRightPanelOpen((prev) => !prev);
    setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
    setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
  };
  const [toast, setToast] = useState<string | null>(null);
  const [degradation, setDegradation] = useState<{ active: boolean; message: string; nextRetryAt?: number } | null>(null);
  const degradationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [degradationCountdown, setDegradationCountdown] = useState<string | null>(null);
  const [sessionId] = useState(() => {
    if (typeof window === "undefined") return "chalkie-session-pending";
    const stored = window.localStorage.getItem("chalkie:session");
    if (stored) return stored;
    const value = crypto.randomUUID();
    window.localStorage.setItem("chalkie:session", value);
    return value;
  });
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackRunRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pendingAutoplayRef = useRef<number | null>(null);
  const startupHandledRef = useRef(false);
  const voiceMonitorRef = useRef<number | null>(null);
  const voiceContextRef = useRef<AudioContext | null>(null);
  const preferredGroqKeyRef = useRef<string | undefined>(undefined);
  const { status: connectionStatus, send: sendRealtime } = useRealtime(sessionId, (event) => {
    if (event.type === "interrupt") stopPlayback(false);
  });
  const displaySources = lesson.sources.filter((source) => `${source.title} ${source.publisher}`.toLowerCase().includes(sourceQuery.toLowerCase()));
  const hasLesson = lesson.segments.length > 0;
  const isBusy = isGenerating || isFollowUpGenerating;
  const totalDuration = Math.round(lesson.segments.reduce((total, segment) => total + segment.durationMs, 0) / 1000);

  useEffect(() => {
    preferredGroqKeyRef.current = preferredGroqKeyId();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const onVoices = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoices);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      };
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQuestion = params.get("q")?.trim() ?? "";
    const lessonId = params.get("id")?.trim() ?? "";

    if (initialQuestion.length >= 3) {
      startupHandledRef.current = true;
      params.delete("q");
      const suffix = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}`);
      // Defer until after React's development mount check so the request is not aborted by its test cleanup.
      window.setTimeout(() => void generateLesson(initialQuestion), 0);
      return;
    }

    let cancelled = false;
    const loader = lessonId ? loadLessonById(lessonId) : loadCurrentLesson();

    void loader.then((stored) => {
      if (cancelled || !stored) return;
      try {
        const repaired = repairAndValidateLessonPlan(stored);
        setLesson(repaired);
        setGenerationStage("Lesson restored");
      } catch {
        const parsed = lessonPlanSchema.safeParse(stored);
        if (parsed.success) {
          setLesson(parsed.data);
          setGenerationStage("Lesson restored");
        } else if (stored && (stored as LessonPlan).objects?.length) {
          setLesson(stored as LessonPlan);
          setGenerationStage("Lesson restored");
        }
      }
    }).catch(() => undefined);

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get("id")?.trim() ?? "";
      if (targetId && targetId !== lesson.id) {
        void loadLessonById(targetId).then((stored) => {
          if (stored) {
            try {
              setLesson(repairAndValidateLessonPlan(stored));
            } catch {
              setLesson(stored);
            }
            setGenerationStage("Lesson restored");
          }
        });
      }
    };
    window.addEventListener("popstate", handleUrlChange);
    return () => window.removeEventListener("popstate", handleUrlChange);
  }, [lesson.id]);

  useEffect(() => {
    const driveState = new URLSearchParams(window.location.search).get("drive");
    if (driveState === "connected") notify("Google Drive connected");
    if (driveState === "unavailable") notify("Google Drive sync requires GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in .env");
    if (driveState === "error") notify("Google Drive connection failed");
    if (driveState) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (hasLesson) void saveCurrentLesson(lesson).catch(() => undefined);
  }, [hasLesson, lesson]);

  useEffect(() => {
    const startIndex = pendingAutoplayRef.current;
    if (startIndex === null || !hasLesson || !lesson.segments[startIndex]) return;
    pendingAutoplayRef.current = null;
    const run = playbackRunRef.current + 1;
    playbackRunRef.current = run;
    void playStep(startIndex, run);
    // A newly generated lesson should start teaching, rather than waiting behind a second play click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, lesson.segments.length]);

  useEffect(() => () => {
    abortRef.current?.abort();
    audioRef.current?.pause();
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    if (voiceMonitorRef.current) cancelAnimationFrame(voiceMonitorRef.current);
    void voiceContextRef.current?.close();
    window.speechSynthesis?.cancel();
  }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  function handleProviderStatus(value: unknown) {
    const quota = value as ProviderQuota;
    if (!quota?.keys || !Array.isArray(quota.keys)) return;
    if (quota.activeKeyId) preferredGroqKeyRef.current = quota.activeKeyId;
    publishProviderStatus(quota);

    // Degradation state management
    if (quota.allUnavailable) {
      const reason = (quota as Record<string, unknown>).degradationReason as string | undefined;
      const nextRetryAt = (quota as Record<string, unknown>).nextRetryAt as number | undefined;
      const messages: Record<string, string> = {
        all_keys_exhausted: "All Groq API keys have hit their daily limit.",
        all_keys_invalid: "All Groq API keys are invalid. Please re-enter your keys.",
        cooldown_active: "All Groq API keys are cooling down.",
        no_keys: "No Groq API keys configured.",
      };
      setDegradation({ active: true, message: messages[reason ?? "no_keys"] ?? "All keys unavailable.", nextRetryAt });
      // Start countdown timer
      if (nextRetryAt && nextRetryAt > Date.now()) {
        if (degradationTimerRef.current) clearInterval(degradationTimerRef.current);
        degradationTimerRef.current = setInterval(() => {
          const remaining = Math.max(0, nextRetryAt - Date.now());
          if (remaining <= 0) {
            setDegradationCountdown(null);
            if (degradationTimerRef.current) clearInterval(degradationTimerRef.current);
            return;
          }
          const minutes = Math.floor(remaining / 60_000);
          const seconds = Math.floor((remaining % 60_000) / 1000);
          setDegradationCountdown(minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
        }, 1000);
      }
    } else if (degradation?.active) {
      // Keys recovered — auto-dismiss
      setDegradation(null);
      setDegradationCountdown(null);
      if (degradationTimerRef.current) clearInterval(degradationTimerRef.current);
      notify("Groq API key recovered — you can ask questions again");
    }
  }

  function submitQuestion(event: FormEvent) {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || isBusy) return;
    setPrompt("");
    void askQuestion(question);
  }

  async function askQuestion(question: string) {
    const cleanQuestion = question.replace(/^(new|fresh|create|topic|start fresh|reset):\s*/i, "").trim();
    if (promptMode === "new") {
      await generateLesson(cleanQuestion);
    } else if (promptMode === "doubt") {
      if (hasLesson) await askFollowUp(cleanQuestion);
      else await generateLesson(cleanQuestion);
    } else {
      // Auto mode: dynamically route between generating a fresh lesson vs asking a follow-up doubt
      if (!hasLesson || isLikelyNewTopic(question, lesson)) {
        await generateLesson(cleanQuestion);
      } else {
        await askFollowUp(cleanQuestion);
      }
    }
  }

  async function generateLesson(question: string) {
    stopPlayback(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setVoiceState("thinking");
    setLastHeard(question);
    setGenerationStage("Understanding the question");
    notify(`Preparing a visual lesson for “${question.slice(0, 34)}${question.length > 34 ? "…" : ""}”`);

    try {
      const response = await fetch("/api/lesson", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId, useWeb: true, preferredGroqKeyId: preferredGroqKeyRef.current }),
      });
      if (!response.ok || !response.body) throw new Error("The lesson connection could not be established");
      await readEventStream(response, (type, data) => {
        if (type === "status") setGenerationStage(String(data.message ?? "Working"));
        if (type === "provider_status") handleProviderStatus(data);
        if (type === "sources" && Array.isArray(data.sources)) {
          const indexedSources = data.sources as LessonPlan["sources"];
          setLesson((current) => ({ ...current, question: current.question || question, sources: indexedSources }));
          setGenerationStage(`Indexed ${indexedSources.length} sources for this lesson`);
        }
        if (type === "lesson" && data.lesson) {
          const generated = data.lesson as LessonPlan;
          pendingAutoplayRef.current = 0;
          setIsPlaying(true);
          setLesson({ ...generated, id: `${generated.id.slice(0, 56)}-${Date.now()}` });
          setActiveStep(0);
          setLastAnswer("");
          setGenerationStage(data.mode === "demo" ? "Demo lesson ready" : "Lesson ready");
          notify(data.mode === "demo" ? "Demo mode · add API keys for live research" : "Your visual lesson is ready");
        }
        if (type === "error") {
          if (data.code === "FREE_LIMIT_REACHED") setGenerationStage("FREE limit reached");
          else if (data.code === "NO_KEYS_CONFIGURED") {
            setGenerationStage("No Groq keys configured");
            setDegradation({
              active: true,
              message: "No Groq API keys configured. Click 'Manage keys' to add your Groq key to generate custom visual lessons.",
            });
          }
          throw new Error(String(data.message ?? "Lesson generation failed"));
        }
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") notify(error instanceof Error ? error.message : "Lesson generation failed");
    } finally {
      setIsGenerating(false);
      if (pendingAutoplayRef.current === null && voiceState !== "speaking") setVoiceState("idle");
    }
  }

  async function askFollowUp(question: string) {
    const currentLesson = lesson;
    stopPlayback(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsFollowUpGenerating(true);
    setVoiceState("thinking");
    setLastHeard(question);
    setGenerationStage("Understanding your doubt");
    sendRealtime({ type: "voice_query", question });

    try {
      const response = await fetch("/api/follow-up", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId, currentLesson, preferredGroqKeyId: preferredGroqKeyRef.current }),
      });
      if (!response.ok || !response.body) throw new Error("The follow-up connection could not be established");
      await readEventStream(response, (type, data) => {
        if (type === "status") {
          const message = String(data.message ?? "Working");
          setGenerationStage(message);
          sendRealtime({ type: "generation", stage: String(data.stage ?? "working"), message });
        }
        if (type === "provider_status") handleProviderStatus(data);
        if (type === "decision") {
          setGenerationStage(data.coverage === "append" ? "Adding only the missing visual" : "Answer found on the current canvas");
        }
        if (type === "sketch") {
          setGenerationStage(`Sketching ${String(data.label || "the next visual")} · ${Number(data.index) + 1}/${Number(data.total)}`);
        }
        if (type === "followup" && data.plan) {
          const plan = followUpPlanSchema.parse(data.plan);
          const merged = mergeFollowUpLesson(currentLesson, plan);
          pendingAutoplayRef.current = merged.startIndex;
          setLastAnswer(plan.answer);
          setActiveStep(merged.startIndex);
          setIsPlaying(true);
          setVoiceState("speaking");
          setLesson(merged.lesson);
          setGenerationStage(plan.coverage === "append" ? "Teaching the new connected visual" : "Pointing through the answer");
          notify(plan.coverage === "append" ? "New explanation added beside the lesson" : "Answering from the current board");
        }
        if (type === "error") {
          if (data.code === "FREE_LIMIT_REACHED") setGenerationStage("FREE limit reached");
          throw new Error(String(data.message ?? "Follow-up failed"));
        }
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") notify(error instanceof Error ? error.message : "Follow-up failed");
      setVoiceState("idle");
      setIsPlaying(false);
    } finally {
      setIsFollowUpGenerating(false);
    }
  }

  function stopPlayback(broadcast: boolean) {
    playbackRunRef.current += 1;
    setIsPlaying(false);
    setVisualSegment(null);
    setActiveTargetId(null);
    setVoiceState("idle");
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    if (broadcast) sendRealtime({ type: "interrupt" });
  }

  async function playStep(index: number, run: number) {
    if (run !== playbackRunRef.current) return;
    const segment = lesson.segments[index];
    if (!segment) { stopPlayback(false); return; }
    setIsPlaying(true);
    setVoiceState("thinking");

    const beginVisualTeaching = () => {
      if (run !== playbackRunRef.current) return false;
      setActiveStep(index);
      setVisualSegment({ ...segment });
      setActiveTargetId(segment.targetIds[0] ?? null);
      setVoiceState("speaking");
      sendRealtime({ type: "timeline", segmentId: segment.id, targetIds: segment.targetIds, action: segment.action });
      sendRealtime({ type: "pointer", segmentId: segment.id, targetIds: segment.targetIds, action: segment.action });
      return true;
    };

    const advance = () => {
      if (run !== playbackRunRef.current) return;
      if (index + 1 < lesson.segments.length) void playStep(index + 1, run);
      else { setIsPlaying(false); setActiveTargetId(null); setVoiceState("idle"); }
    };

    // Format narration text for maximum speech clarity, unit expansion, and natural breath pauses
    const spokenNarration = formatNarrationForSpeech(segment.narration);

    // Precalculate target mention positions in the spoken narration
    const targetPositions: Array<{ charIndex: number; targetId: string }> = [];
    for (const tId of segment.targetIds) {
      const obj = lesson.objects.find((o) => o.id === tId);
      const label = obj?.label?.toLowerCase().trim();
      if (label && label.length >= 3) {
        const idx = spokenNarration.toLowerCase().indexOf(label);
        if (idx !== -1) {
          targetPositions.push({ charIndex: idx, targetId: tId });
        }
      }
    }
    targetPositions.sort((a, b) => a.charIndex - b.charIndex);

    // Audio-timed target progression fallback for Groq TTS / device audio
    if (segment.targetIds.length > 1) {
      const stepDuration = Math.max(segment.durationMs || 5000, 3000) / segment.targetIds.length;
      segment.targetIds.forEach((tId, tIdx) => {
        if (tIdx > 0) {
          setTimeout(() => {
            if (playbackRunRef.current === run) {
              setActiveTargetId(tId);
            }
          }, tIdx * stepDuration);
        }
      });
    }

    if (process.env.NEXT_PUBLIC_USE_GROQ_TTS === "true") {
      try {
        const response = await fetch("/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: spokenNarration, sessionId, preferredGroqKeyId: preferredGroqKeyRef.current }) });
        const providerHeader = response.headers.get("x-chalkie-provider-status");
        if (providerHeader) {
          try { handleProviderStatus(JSON.parse(decodeURIComponent(providerHeader))); }
          catch { /* ignore malformed optional status */ }
        }
        if (response.ok) {
          const url = URL.createObjectURL(await response.blob());
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => { URL.revokeObjectURL(url); advance(); };
          audio.onerror = () => { URL.revokeObjectURL(url); advance(); };
          if (!beginVisualTeaching()) return;
          await audio.play();
          return;
        }
      } catch { /* use the device voice below */ }
    }

    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(spokenNarration);
      const voices = window.speechSynthesis.getVoices();
      const preferredUri = typeof window !== "undefined" ? window.localStorage.getItem(PREFERRED_VOICE_KEY) : null;
      utterance.voice = getBestAvailableVoice(voices, preferredUri);

      const storedRate = typeof window !== "undefined" ? window.localStorage.getItem(SPEECH_RATE_KEY) : null;
      const rate = storedRate ? parseFloat(storedRate) : DEFAULT_SPEECH_RATE;
      utterance.rate = !isNaN(rate) && rate >= 0.7 && rate <= 1.3 ? rate : DEFAULT_SPEECH_RATE;
      utterance.pitch = DEFAULT_SPEECH_PITCH;

      // Real-time word boundary synchronization:
      // When the teacher voice speaks the name of a component, the laser pointer instantly glides to it!
      utterance.onboundary = (event) => {
        if (event.name === "word") {
          const match = [...targetPositions].reverse().find((tp) => event.charIndex >= tp.charIndex - 8);
          if (match) {
            setActiveTargetId(match.targetId);
          } else if (segment.targetIds.length > 1) {
            const ratio = event.charIndex / Math.max(1, spokenNarration.length);
            const tIdx = Math.min(segment.targetIds.length - 1, Math.floor(ratio * segment.targetIds.length));
            setActiveTargetId(segment.targetIds[tIdx]);
          }
        }
      };

      utterance.onend = advance;
      utterance.onerror = advance;
      if (!beginVisualTeaching()) return;
      window.speechSynthesis.speak(utterance);
    } else {
      if (!beginVisualTeaching()) return;
      stepTimerRef.current = setTimeout(advance, segment.durationMs);
    }
  }

  function togglePlayback() {
    if (isPlaying) stopPlayback(true);
    else {
      const run = playbackRunRef.current + 1;
      playbackRunRef.current = run;
      void playStep(activeStep, run);
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      recorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      stopPlayback(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        if (voiceMonitorRef.current) cancelAnimationFrame(voiceMonitorRef.current);
        voiceMonitorRef.current = null;
        await voiceContextRef.current?.close().catch(() => undefined);
        voiceContextRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        const form = new FormData();
        form.set("audio", new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" }), "question.webm");
        form.set("sessionId", sessionId);
        if (preferredGroqKeyRef.current) form.set("preferredGroqKeyId", preferredGroqKeyRef.current);
        setVoiceState("transcribing");
        setGenerationStage("Transcribing your question");
        try {
          const response = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await response.json() as { text?: string; error?: string; code?: string; providerStatus?: ProviderQuota };
          if (data.providerStatus) handleProviderStatus(data.providerStatus);
          if (!response.ok) throw new Error(data.error || "Transcription failed");
          const transcript = data.text?.trim() || "";
          if (!transcript) throw new Error("I could not hear a question. Please try again.");
          setPrompt("");
          setLastHeard(transcript);
          await askQuestion(transcript);
        } catch (error) {
          setVoiceState("idle");
          notify(error instanceof Error ? error.message : "Transcription failed");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setVoiceState("listening");
      notify("Listening… I’ll respond when you finish speaking");

      const audioContext = new AudioContext();
      voiceContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const startedAt = performance.now();
      let heardSpeech = false;
      let lastSpeechAt = startedAt;
      const monitor = () => {
        if (recorder.state !== "recording") return;
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          energy += normalized * normalized;
        }
        const rms = Math.sqrt(energy / samples.length);
        const now = performance.now();
        if (rms > 0.028) {
          heardSpeech = true;
          lastSpeechAt = now;
        }
        if ((heardSpeech && now - lastSpeechAt > 1350) || now - startedAt > 30000) {
          recorder.stop();
          setIsRecording(false);
          return;
        }
        voiceMonitorRef.current = requestAnimationFrame(monitor);
      };
      voiceMonitorRef.current = requestAnimationFrame(monitor);
    } catch {
      setVoiceState("idle");
      notify("Microphone access is needed for voice questions");
    }
  }

  async function syncToDrive() {
    try {
      const response = await fetch("/api/drive/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lesson }) });
      const data = await response.json() as { error?: string; connectUrl?: string };
      if (response.status === 401 && data.connectUrl) { window.location.href = data.connectUrl; return; }
      if (response.status === 503) {
        notify("Google Drive not configured in .env. Downloading lesson backup JSON.");
        exportLessonJson();
        return;
      }
      if (!response.ok) throw new Error(data.error || "Drive sync failed");
      notify("Lesson backed up to Google Drive");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Drive sync failed");
    }
  }

  function exportLessonJson() {
    try {
      const json = JSON.stringify(lesson, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(lesson.title || "chalkie-lesson").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify("Lesson JSON downloaded");
    } catch {
      notify("Export unavailable");
    }
  }

  async function shareLesson() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("Local lesson link copied");
    } catch {
      notify("Copying is unavailable in this browser");
    }
  }

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "create_visual_lesson",
      title: "Create visual lesson",
      description: "Research a question and replace the visible Chalkie canvas with a new narrated visual lesson.",
      inputSchema: { type: "object", additionalProperties: false, required: ["question"], properties: { question: { type: "string", minLength: 3, maxLength: 1000 } } },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const question = typeof input === "object" && input !== null && "question" in input ? String((input as { question: unknown }).question).trim() : "";
        if (question.length < 3 || question.length > 1000) throw new Error("question must contain 3 to 1000 characters");
        await generateLesson(question);
        return { status: "ready", question };
      },
    }, { signal: lifecycle.signal })).catch((error) => {
      if (!(error instanceof DOMException) || error.name !== "AbortError") console.warn("[chalkie] WebMCP registration failed", error);
    });
    return () => lifecycle.abort();
    // Register once; the visible action and tool intentionally share generateLesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="h-dvh min-h-[680px] bg-[#090a0f] text-[#f3f4f6]">
      <div className="flex h-full flex-col overflow-hidden bg-[#090a0f]">
        {degradation?.active && (
          <div className="flex shrink-0 items-center gap-3 border-b border-[#5c3018] bg-gradient-to-r from-[#24130a] to-[#1a0e07] px-4 py-2.5 sm:px-5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#452210] text-[#fb923c]">
              <AlertTriangle size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#fdba74]">{degradation.message}</p>
              <p className="mt-0.5 text-xs text-[#ea580c]">
                {degradationCountdown ? `Next key available in ${degradationCountdown}` : degradation.nextRetryAt ? `Recovery expected at ${new Date(degradation.nextRetryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Add another Groq key or wait for a reset"}
              </p>
            </div>
            <button type="button" onClick={() => { const btn = document.querySelector<HTMLButtonElement>("[title='Provider keys and live rate limits']"); btn?.click(); }} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#5c3018] bg-[#24130a] px-3 text-xs font-semibold text-[#fdba74] shadow-sm transition hover:bg-[#331b0e]">
              <KeyRound size={13} /> Manage keys
            </button>
          </div>
        )}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#1f2333] bg-[#0e1017] px-3.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 rounded-lg py-1 pr-1 transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8]"
              aria-label="Back to Chalkie home"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#141624] p-1 ring-1 ring-[#262c3e] shadow-[0_4px_14px_rgba(0,0,0,0.5)]">
                <ChalkieIcon size={24} alt="Chalkie logo" />
              </span>
              <span className="text-sm font-semibold tracking-[-0.02em] text-[#f3f4f6]">Chalkie</span>
            </Link>

            <button
              type="button"
              onClick={toggleLeftPanel}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
                leftPanelOpen
                  ? "bg-[#181b28] text-[#c7d2fe] hover:bg-[#202436]"
                  : "text-[#9ca3af] hover:bg-[#161824] hover:text-[#f3f4f6]"
              }`}
              title={leftPanelOpen ? "Collapse Sources sidebar" : "Expand Sources sidebar"}
              aria-label={leftPanelOpen ? "Collapse Sources sidebar" : "Expand Sources sidebar"}
            >
              {leftPanelOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>

            <span className="h-4 w-px bg-[#1f2333]" />

            <span className="max-w-[200px] truncate text-xs font-medium text-[#9ca3af] sm:max-w-[320px]">
              {hasLesson ? lesson.title : "New visual lesson"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div
              className="hidden items-center gap-1.5 rounded-full px-2 py-1 text-xs text-[#9ca3af] lg:flex"
              title={connectionStatus === "realtime" ? "Realtime connected" : "Connecting…"}
            >
              <span className="live-pulse h-1.5 w-1.5 rounded-full bg-[#34d399]" />
              <span className="text-[11px] font-medium text-[#34d399]/90">Live</span>
            </div>

            <ProviderControl className="hidden sm:inline-flex" />

            <Link
              href="/"
              className="flex h-8 items-center gap-1.5 rounded-lg bg-[#6366f1] px-3 text-xs font-semibold text-white shadow-[0_2px_10px_#6366f12b] transition hover:bg-[#4f46e5]"
            >
              <Plus size={14} strokeWidth={2.4} />
              <span>New</span>
            </Link>

            <button
              type="button"
              onClick={() => void syncToDrive()}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#222636] bg-[#141620] px-3 text-xs font-medium text-[#d1d5db] transition hover:border-[#38bdf8]/40 hover:bg-[#15202e] hover:text-[#38bdf8]"
              title="Back up lesson to Google Drive (or download JSON)"
            >
              <Cloud size={13} className="text-[#38bdf8]" />
              <span className="hidden sm:inline">Google Sync</span>
            </button>

            <button
              type="button"
              onClick={() => void shareLesson()}
              className="hidden h-8 items-center gap-1.5 rounded-lg border border-[#222636] bg-[#141620] px-3 text-xs font-medium text-[#d1d5db] transition hover:border-[#32384e] hover:bg-[#1a1d2b] sm:flex"
              title="Share lesson link"
            >
              <Share2 size={13} />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                if (!confirm("Clear this lesson, reset server research cache, and start fresh?")) return;
                await clearAllClientStorage();
                try { await fetch("/api/reset", { method: "POST" }); } catch { /* ignore */ }
                setLesson(emptyLesson);
                notify("Workspace cleared");
              }}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3af] transition hover:bg-[#281116] hover:text-[#f87171]"
              title="Clear lesson and start fresh"
              aria-label="Clear lesson"
            >
              <Trash2 size={15} />
            </button>

            <button
              type="button"
              onClick={() => notify("Type a question or tap the microphone. Chalkie researches, draws, and teaches automatically.")}
              className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3af] transition hover:bg-[#161824] hover:text-[#f3f4f6] sm:grid"
              title="How to use Chalkie"
              aria-label="How to use Chalkie"
            >
              <CircleHelp size={16} />
            </button>

            <span className="hidden h-4 w-px bg-[#1f2333] lg:inline" />

            <button
              type="button"
              onClick={toggleRightPanel}
              className={`hidden h-8 w-8 shrink-0 place-items-center rounded-lg transition lg:grid ${
                rightPanelOpen
                  ? "bg-[#181b28] text-[#c7d2fe] hover:bg-[#202436]"
                  : "text-[#9ca3af] hover:bg-[#161824] hover:text-[#f3f4f6]"
              }`}
              title={rightPanelOpen ? "Collapse Lesson Guide sidebar" : "Expand Lesson Guide sidebar"}
              aria-label={rightPanelOpen ? "Collapse Lesson Guide sidebar" : "Expand Lesson Guide sidebar"}
            >
              {rightPanelOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
            </button>
          </div>
        </header>

        <nav className="grid h-11 shrink-0 grid-cols-3 border-b border-[#1f2333] bg-[#0e1017] lg:hidden" aria-label="Workspace panels">
          {(["sources", "canvas", "studio"] as const).map((panel) => (
            <button
              key={panel}
              onClick={() => setActiveMobilePanel(panel)}
              className={`text-xs font-semibold capitalize transition ${activeMobilePanel === panel ? "border-b-2 border-[#818cf8] text-[#c7d2fe]" : "text-[#6b7280]"}`}
            >
              {panel}
            </button>
          ))}
        </nav>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside
            className={`${
              activeMobilePanel === "sources" ? "flex w-full" : "hidden"
            } min-h-0 shrink-0 flex-col border-r border-[#1f2333] bg-[#0e1017] transition-all duration-300 ease-in-out lg:flex ${
              leftPanelOpen
                ? "lg:w-[288px] opacity-100"
                : "lg:w-0 overflow-hidden border-r-0 p-0 opacity-0 pointer-events-none"
            }`}
          >
            <div className="flex h-full w-full min-h-0 flex-col lg:w-[288px]">
            <div className="flex h-14 shrink-0 items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <Layers3 size={16} className="text-[#9c8cff]" />
                <h2 className="text-sm font-semibold text-[#f3f4f6]">Sources</h2>
                <span className="rounded-full bg-[#201d36] px-2 py-0.5 text-xs font-medium text-[#a5b4fc]">{lesson.sources.length} / 20</span>
              </div>
            </div>

            <div className="px-3 pb-3">
              <label className="flex h-10 items-center gap-2 rounded-xl border border-[#222636] bg-[#141620] px-3 text-[#9ca3af] shadow-sm focus-within:border-[#818cf8] focus-within:ring-2 focus-within:ring-[#818cf8]/15">
                <Search size={14} />
                <input value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-[#f3f4f6] outline-none placeholder:text-[#6b7280]" placeholder="Search sources" aria-label="Search lesson sources" />
              </label>
            </div>

            <div className="scrollbar-none flex-1 overflow-y-auto px-3 pb-3">
              <button disabled={!lesson.question || isBusy} onClick={() => void generateLesson(lesson.question)} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#282e42] bg-[#141624] py-3 text-sm font-medium text-[#a5b4fc] transition hover:border-[#818cf8]/50 hover:bg-[#1c2035] disabled:cursor-not-allowed disabled:opacity-40">
                <Sparkles size={14} className="text-[#9c8cff]" /> Refresh research
              </button>

              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[.12em] text-[#6b7280]">Ranked for this lesson</p>
              <div className="space-y-1.5">
                {!displaySources.length && (
                  <div className="rounded-2xl border border-dashed border-[#262b3c] bg-[#131520] px-4 py-7 text-center">
                    <Search className="mx-auto mb-2 text-[#6f737c]" size={18} />
                    <p className="text-sm font-medium text-[#d1d5db]">{lesson.sources.length ? "No matching sources" : "Sources appear after you ask"}</p>
                    <p className="mt-1 text-xs leading-5 text-[#6b7280]">{lesson.sources.length ? "Try another title or publisher." : "Research is ranked around your exact question."}</p>
                  </div>
                )}
                {displaySources.map((source, index) => (
                  <button key={source.id} onClick={() => window.open(source.url, "_blank", "noopener,noreferrer")} className="group flex w-full items-start gap-3 rounded-xl border border-transparent p-2.5 text-left transition hover:border-[#262c3e] hover:bg-[#151722] hover:shadow-sm">
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#1c1f2e] ${sourceColors[index % sourceColors.length]}`}>
                      {source.url.includes("youtube") ? <Play size={13} /> : <FileText size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#e5e7eb]">{source.title}</span>
                      <span className="mt-1 block truncate text-xs text-[#9ca3af]">{source.publisher}</span>
                    </span>
                    <span className="mt-1 grid h-4 w-4 place-items-center rounded border border-[#818cf8]/50 bg-[#818cf8]/15 text-[#a5b4fc]"><Check size={10} /></span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-[#1f2333] bg-[#0c0d14]/80 p-3">
              <div className="rounded-xl border border-[#1f2333] bg-[#131520] p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-[#9ca3af]"><Cloud size={12} /> Research index</span>
                  <span className={isBusy ? "max-w-[140px] truncate text-[#fb923c]" : "max-w-[140px] truncate text-[#34d399]"}>{lesson.sources.length ? `${lesson.sources.length} sources indexed` : generationStage}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#1c202e]"><div className={`h-full rounded-full bg-gradient-to-r from-[#6d55d8] to-[#34d399] transition-all duration-500 ${isBusy ? "w-2/3 animate-pulse" : lesson.sources.length ? "w-full" : "w-0"}`} /></div>
                <p className="mt-2 text-xs leading-4 text-[#6b7280]">Semantic + lexical + question-aware ranking</p>
              </div>
              <button onClick={syncToDrive} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[#222636] bg-[#141620] py-2.5 text-xs font-medium text-[#9ca3af] transition hover:bg-[#1a1d2b] hover:text-[#f3f4f6]">
                <HardDriveUpload size={13} /> Back up to Google Drive
              </button>
            </div>
            </div>
          </aside>

          <section className={`${activeMobilePanel === "canvas" ? "flex w-full" : "hidden"} relative min-h-0 min-w-0 flex-1 flex-col bg-[#090a0f] transition-all duration-300 ease-in-out lg:flex`}>
            <div className="relative m-2 mb-0 min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#1f2333] bg-[#0c0d12] shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
              <ChalkCanvas
                lesson={lesson}
                activeSegment={isPlaying ? visualSegment : null}
                activeStep={activeStep}
                isPresenting={isPlaying}
                isSpeaking={voiceState === "speaking"}
                activeTargetId={activeTargetId}
              />

              {!hasLesson && !isGenerating && (
                <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center bg-[radial-gradient(circle_at_center,#141724fa_0%,#0e1017ef_60%,#090a0fcc_100%)] px-6 text-[#f3f4f6]">
                  <div className="pointer-events-auto w-full max-w-[560px] text-center">
                    <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#141624] p-2 ring-1 ring-[#282d40] shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
                      <ChalkieIcon size={46} alt="Chalkie" />
                    </div>
                    <h1 className="text-balance text-3xl font-semibold tracking-[-.045em] text-[#f3f4f6]">Learn it by seeing it</h1>
                    <p className="mx-auto mt-3 max-w-md text-base leading-6 text-[#9ca3af]">Ask about a mechanism, system, process, place, or idea. Chalkie researches it and builds the right visual model.</p>
                    <button
                      type="button"
                      onClick={toggleRecording}
                      className="mx-auto mt-6 flex h-13 items-center gap-3 rounded-full bg-[#6366f1] px-6 text-sm font-semibold text-white shadow-[0_12px_28px_#6650cf44] transition hover:-translate-y-0.5 hover:bg-[#4f46e5]"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15"><Mic size={17} /></span>
                      Talk to Chalkie
                    </button>
                    <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
                      {["Show me how a camera focuses light", "Why do tides change?", "Teach me supply and demand"].map((example) => (
                        <button key={example} onClick={() => void generateLesson(example)} className="rounded-full border border-[#262c3e] bg-[#141624] px-3.5 py-2 text-[#d1d5db] shadow-sm transition hover:border-[#818cf8]/50 hover:bg-[#1e2238] hover:text-[#c7d2fe]">{example}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {isGenerating && (
                <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center bg-[#0c0d12]/92 text-[#e5e7eb] backdrop-blur-[4px]">
                  <div className="w-[min(420px,82vw)] rounded-[24px] border border-[#282d40] bg-[#141622]/95 p-6 text-center text-[#f3f4f6] shadow-[0_22px_60px_rgba(0,0,0,0.85)]">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#818cf8]/15 text-[#818cf8]"><Waves className="animate-pulse" size={23} /></div>
                    <p className="mt-4 text-lg font-semibold tracking-[-.025em] text-[#f3f4f6]">Building your visual explanation</p>
                    <p className="mt-2 text-sm text-[#9ca3af]">{generationStage}</p>
                    {lastHeard && <p className="mt-4 line-clamp-2 rounded-xl bg-[#1a1d2b] px-3 py-2 text-xs italic text-[#cbd5e1]">“{lastHeard}”</p>}
                  </div>
                </div>
              )}

              {isFollowUpGenerating && (
                <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex w-[min(520px,86%)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#3d336b] bg-[#161426]/95 px-4 py-3 text-[#e5e7eb] shadow-[0_16px_38px_rgba(0,0,0,0.7)] backdrop-blur-md">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#25203e] text-[#a5b4fc]"><Waves className="animate-pulse" size={17} /></span>
                  <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-[.11em] text-[#a5b4fc]">Live follow-up</span><span className="mt-0.5 block truncate text-sm text-[#f3f4f6]">{generationStage}</span></span>
                </div>
              )}
            </div>

            <div className="shrink-0 bg-[#090a0f] p-3 sm:p-4">
              <div className="mx-auto mb-2 flex w-full max-w-[620px] items-center justify-between px-1">
                {hasLesson ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPromptMode("auto")}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                        promptMode === "auto"
                          ? "border border-[#818cf8]/50 bg-[#25203e] text-[#c7d2fe]"
                          : "border border-transparent text-[#9ca3af] hover:text-[#e5e7eb]"
                      }`}
                      title="Chalkie auto-detects if your question is a follow-up doubt or a new topic"
                    >
                      <Sparkles size={11} className={promptMode === "auto" ? "text-[#818cf8]" : ""} />
                      <span>Auto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptMode("doubt")}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                        promptMode === "doubt"
                          ? "border border-[#818cf8]/50 bg-[#25203e] text-[#c7d2fe]"
                          : "border border-transparent text-[#9ca3af] hover:text-[#e5e7eb]"
                      }`}
                      title="Ask a doubt about the shapes on this whiteboard"
                    >
                      <MessageSquare size={11} className={promptMode === "doubt" ? "text-[#818cf8]" : ""} />
                      <span>Ask Doubt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptMode("new")}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                        promptMode === "new"
                          ? "border border-[#6366f1]/60 bg-[#1e1b4b] text-[#c7d2fe]"
                          : "border border-transparent text-[#9ca3af] hover:text-[#e5e7eb]"
                      }`}
                      title="Create a completely fresh visual lesson board"
                    >
                      <Plus size={11} className={promptMode === "new" ? "text-[#818cf8]" : ""} />
                      <span>New Lesson</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
                    <Sparkles size={12} className="text-[#818cf8]" />
                    <span>Visual Lesson Generator</span>
                  </div>
                )}
                {hasLesson && (
                  <span className="text-[11px] text-[#6b7280]">
                    {promptMode === "new"
                      ? "Creates a fresh whiteboard"
                      : promptMode === "doubt"
                      ? "Explains from current board"
                      : "Auto-detects doubt vs new topic"}
                  </span>
                )}
              </div>

              <form onSubmit={submitQuestion} className="mx-auto flex w-full max-w-[620px] items-end gap-2 rounded-[20px] border border-[#222636] bg-[#12141e] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.6)] focus-within:border-[#818cf8] focus-within:ring-3 focus-within:ring-[#818cf8]/15">
                <button
                  type="button"
                  onClick={toggleRecording}
                  aria-label={isRecording ? "Stop recording" : "Ask with your voice"}
                  title={isRecording ? "Stop recording" : "Ask with your voice"}
                  className={`mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${isRecording ? "voice-ring border-[#f43f5e]/45 bg-[#2a1016] text-[#f43f5e]" : "border-[#2e3448] bg-[#1c1f2e] text-[#a5b4fc] hover:bg-[#252a40]"}`}
                ><Mic size={17} /></button>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={1}
                  placeholder={
                    promptMode === "new"
                      ? "Ask Chalkie to explain any new topic visually…"
                      : promptMode === "doubt"
                      ? "Ask a doubt about this canvas…"
                      : hasLesson
                      ? "Ask a doubt, or explain any new topic…"
                      : "Ask Chalkie to explain anything visually…"
                  }
                  className="max-h-24 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-5 text-[#f3f4f6] outline-none placeholder:text-[#6b7280]"
                />
                <button type="submit" aria-label="Send question" title="Send question" className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#6366f1] text-white transition hover:scale-[1.04] hover:bg-[#4f46e5] disabled:opacity-35" disabled={!prompt.trim() || isBusy || degradation?.active}>
                  {isBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Send size={16} />}
                </button>
              </form>
              <p className="mt-2 text-center text-xs text-[#6b7280]">
                {isRecording
                  ? "Listening — pause when you finish"
                  : voiceState === "transcribing"
                  ? "Turning your voice into a question…"
                  : voiceState === "thinking"
                  ? generationStage
                  : voiceState === "speaking"
                  ? "Chalkie is teaching — tap the microphone to interrupt"
                  : promptMode === "new"
                  ? "Type or speak any topic — Chalkie will research and draw a fresh lesson"
                  : promptMode === "doubt"
                  ? "Ask a doubt — Chalkie will point and explain using this canvas"
                  : hasLesson
                  ? "Ask a doubt about this board or ask any new topic to create a new lesson"
                  : "Type or speak naturally · important facts should still be verified"}
              </p>
            </div>
          </section>

          <aside
            className={`${
              activeMobilePanel === "studio" ? "flex w-full" : "hidden"
            } min-h-0 shrink-0 flex-col border-l border-[#1f2333] bg-[#0e1017] transition-all duration-300 ease-in-out lg:flex ${
              rightPanelOpen
                ? "lg:w-[332px] opacity-100"
                : "lg:w-0 overflow-hidden border-l-0 p-0 opacity-0 pointer-events-none"
            }`}
          >
            <div className="flex h-full w-full min-h-0 flex-col lg:w-[332px]">
              <div className="flex h-14 shrink-0 items-center px-4">
                <div className="flex items-center gap-2"><BookOpen size={16} className="text-[#fb923c]" /><h2 className="text-sm font-semibold text-[#f3f4f6]">Lesson guide</h2></div>
              </div>

            <div className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
              <div className="mb-4 overflow-hidden rounded-2xl border border-[#2b2742] bg-gradient-to-br from-[#1a1829] to-[#0d0e15] text-white shadow-[0_10px_28px_rgba(0,0,0,0.6)]">
                <div className="relative min-h-28 overflow-hidden border-b border-white/8 p-4">
                  <div className="absolute -right-5 -top-12 h-28 w-28 rounded-full bg-[#818cf8]/20 blur-2xl" />
                  <div className="relative flex items-center justify-between text-xs font-semibold uppercase tracking-[.12em] text-[#c7d2fe]">
                    <div className="flex items-center gap-2">
                      <Headphones size={13} /> Voice lesson
                    </div>
                    <button
                      type="button"
                      onClick={() => setVoiceSettingsOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-normal normal-case text-neutral-300 transition hover:border-[#818cf8]/40 hover:bg-white/10 hover:text-white"
                      title="Voice model, clarity & cadence settings"
                    >
                      <SlidersHorizontal size={12} className="text-[#818cf8]" />
                      <span>Voice settings</span>
                    </button>
                  </div>
                  <h3 className="relative mt-2 truncate text-base font-semibold tracking-[-.01em] text-white">{hasLesson ? lesson.title : "Your lesson will speak here"}</h3>
                  <p className="relative mt-1 line-clamp-3 text-xs leading-5 text-[#9ca3af]">{lastAnswer || (hasLesson ? lesson.visualStrategy : "Ask with your voice or the message box")}</p>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-3">
                    <button disabled={!hasLesson} onClick={togglePlayback} aria-label={isPlaying ? "Pause lesson" : "Play lesson"} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#818cf8] text-[#090a0f] shadow-[0_6px_18px_#818cf844] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100">
                      {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex h-5 items-end gap-[3px]">
                        {[7, 13, 9, 17, 12, 6, 15, 19, 10, 14, 8, 17, 12, 7, 14, 10, 5, 12].map((height, index) => (
                          <span key={index} className={`w-full rounded-full ${index < 5 ? "bg-[#818cf8]" : "bg-white/10"}`} style={{ height }} />
                        ))}
                      </div>
                      <div className="mt-1.5 flex justify-between text-xs text-[#9ca3af]"><span>{isPlaying ? `Step ${activeStep + 1}` : "Ready"}</span><span>{Math.floor(totalDuration / 60)}:{String(totalDuration % 60).padStart(2, "0")}</span></div>
                    </div>
                    <Volume2 size={15} className="text-[#6b7280]" />
                  </div>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-[.13em] text-[#6b7280]">Teaching sequence</p>
                <span className="flex items-center gap-1 text-xs text-[#6b7280]"><Clock3 size={12} /> {lesson.segments.length} steps</span>
              </div>

              <div className="space-y-1">
                {!hasLesson && (
                  <div className="rounded-2xl border border-dashed border-[#262b3c] bg-[#131520] p-6 text-center">
                    <Waves className="mx-auto text-[#6b7280]" size={20} />
                    <p className="mt-2 text-sm font-medium text-[#d1d5db]">Built for your question</p>
                    <p className="mt-1 text-xs leading-5 text-[#6b7280]">The visual strategy and sequence are generated together.</p>
                  </div>
                )}
                {lesson.segments.map((step, index) => {
                  const state = index < activeStep ? "done" : index === activeStep ? "active" : "next";
                  return (
                  <button onClick={() => { stopPlayback(false); setActiveStep(index); }} key={step.id} className={`relative flex w-full gap-3 rounded-xl border p-3 text-left transition ${state === "active" ? "border-[#3d336b] bg-[#1c1a2e] shadow-sm" : "border-transparent hover:border-[#222636] hover:bg-[#141622]"}`}>
                    <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${state === "done" ? "bg-[#0c241c] text-[#34d399]" : state === "active" ? "bg-[#6366f1] text-white" : "border border-[#282d3e] bg-[#141622] text-[#9ca3af]"}`}>
                      {state === "done" ? <Check size={12} /> : index + 1}
                    </span>
                    {index < lesson.segments.length - 1 && <span className="absolute left-[26px] top-10 h-7 w-px bg-[#222636]" />}
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${state === "active" ? "text-[#c7d2fe]" : "text-[#d1d5db]"}`}>{step.title}</span>
                      <span className="mt-1 block truncate text-xs text-[#6b7280]">{step.action} · {step.targetIds.length} visual targets</span>
                    </span>
                  </button>
                )})}
              </div>

              <div className="mt-4 rounded-2xl border border-[#1f2333] bg-[#12141e] p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium text-[#d1d5db]"><span className="grid h-6 w-6 place-items-center rounded-lg bg-[#fb923c]/15 text-[#fb923c]"><Focus size={13} /></span>Laser sync</span>
                  <span className="rounded-full border border-[#183d2f] bg-[#0c241c] px-2 py-0.5 text-xs text-[#34d399]">Audio clock</span>
                </div>
                <p className="text-xs leading-5 text-[#6b7280]">The pointer and camera follow semantic objects while the current mechanism or relationship is explained.</p>
              </div>
            </div>

            <div className="border-t border-[#1f2333] bg-[#0c0d14]/80 p-3">
              <button disabled={!hasLesson} onClick={() => setOverviewOpen(true)} className="flex w-full items-center justify-between rounded-xl border border-[#222636] bg-[#141620] px-3 py-2.5 text-sm font-medium text-[#d1d5db] transition hover:bg-[#1a1d2b] hover:text-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-35">
                <span className="flex items-center gap-2"><Layers3 size={14} className="text-[#9c8cff]" /> Open overview map</span>
                <span className="text-[#6b7280]">⌘K</span>
              </button>
            </div>
            </div>
          </aside>
        </div>
      </div>

      {overviewOpen && (
        <div className="fixed inset-0 z-[2147483000] grid place-items-center bg-[#000000]/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Lesson overview map">
          <div className="flex h-[min(760px,90vh)] w-[min(1180px,95vw)] flex-col overflow-hidden rounded-[24px] border border-[#222636] bg-[#0e1017] text-[#f3f4f6] shadow-2xl">
            <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[#1f2333] px-5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#201d36] text-[#818cf8]"><Layers3 size={17} /></span>
              <div><h2 className="text-sm font-semibold text-[#f3f4f6]">Complete visual model</h2><p className="mt-0.5 text-xs text-[#9ca3af]">Explore and edit the full scene</p></div>
              <button onClick={() => setOverviewOpen(false)} className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-[#222636] text-[#9ca3af] hover:bg-[#1a1d2b] hover:text-[#f3f4f6]" aria-label="Close overview"><X size={16} /></button>
            </div>
            <div className="relative m-4 flex-1 overflow-hidden rounded-2xl border border-[#1f2333] bg-[#0c0d12]">
              <ChalkCanvas lesson={lesson} activeSegment={null} activeStep={lesson.segments.length - 1} isPresenting={false} />
            </div>
          </div>
        </div>
      )}

      <VoiceSettingsDialog open={voiceSettingsOpen} onOpenChange={setVoiceSettingsOpen} />

      {toast && (
        <div role="status" className="fade-up fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#161824]/95 px-4 py-2.5 text-xs text-white shadow-2xl backdrop-blur-xl">
          <Sparkles size={14} className="text-[#9c8cff]" /> {toast}
          <button onClick={() => setToast(null)} aria-label="Dismiss"><X size={13} className="text-[#9ca3af]" /></button>
        </div>
      )}
    </main>
  );
}
