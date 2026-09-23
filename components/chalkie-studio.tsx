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
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { followUpPlanSchema, lessonPlanSchema, type LessonPlan, type LessonSegment } from "@/lib/lesson-schema";
import { useRealtime } from "@/hooks/use-realtime";
import { clearAllClientStorage, loadCurrentLesson, saveCurrentLesson } from "@/lib/client-storage";
import { mergeFollowUpLesson } from "@/lib/follow-up";
import { preferredGroqKeyId, ProviderControl, publishProviderStatus, type ProviderQuota } from "@/components/provider-control";

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
    <div className="soft-grid absolute inset-0 grid place-items-center bg-[#f4f0e7] text-[#32343a]">
      <div className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm shadow-lg">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#7164ff]" />
        Warming up the whiteboard…
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
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#dfe3e8] bg-white text-[#5f6368] transition hover:border-[#c7cbd1] hover:bg-[#f3f5f8] hover:text-[#202124] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55d8] ${className}`}
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

export function ChalkieStudio() {
  const [lesson, setLesson] = useState<LessonPlan>(emptyLesson);
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
  const [activeMobilePanel, setActiveMobilePanel] = useState<"sources" | "canvas" | "studio">("canvas");
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
    if (startupHandledRef.current) return;
    startupHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const initialQuestion = params.get("q")?.trim() ?? "";
    if (initialQuestion.length >= 3) {
      params.delete("q");
      const suffix = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}`);
      // Defer until after React's development mount check so the request is not aborted by its test cleanup.
      window.setTimeout(() => void generateLesson(initialQuestion), 0);
      return;
    }
    let cancelled = false;
    void loadCurrentLesson().then((stored) => {
      const parsed = lessonPlanSchema.safeParse(stored);
      if (!cancelled && parsed.success) {
        setLesson(parsed.data);
        setGenerationStage("Lesson restored");
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
    // Initial navigation intentionally starts exactly one lesson from the home query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const driveState = new URLSearchParams(window.location.search).get("drive");
    if (driveState === "connected") notify("Google Drive connected");
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
    if (hasLesson) await askFollowUp(question);
    else await generateLesson(question);
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

    // Precalculate target mention positions in the spoken narration
    const targetPositions: Array<{ charIndex: number; targetId: string }> = [];
    for (const tId of segment.targetIds) {
      const obj = lesson.objects.find((o) => o.id === tId);
      const label = obj?.label?.toLowerCase().trim();
      if (label && label.length >= 3) {
        const idx = segment.narration.toLowerCase().indexOf(label);
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
        const response = await fetch("/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: segment.narration, sessionId, preferredGroqKeyId: preferredGroqKeyRef.current }) });
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
      const utterance = new SpeechSynthesisUtterance(segment.narration);
      const voices = window.speechSynthesis.getVoices();
      utterance.voice = voices.find((voice) => /Google US English|Microsoft Aria|Samantha/i.test(voice.name))
        ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en"))
        ?? null;
      utterance.rate = 0.96;
      utterance.pitch = 1.02;

      // Real-time word boundary synchronization:
      // When the teacher voice speaks the name of a component, the laser pointer instantly glides to it!
      utterance.onboundary = (event) => {
        if (event.name === "word") {
          const match = [...targetPositions].reverse().find((tp) => event.charIndex >= tp.charIndex - 8);
          if (match) {
            setActiveTargetId(match.targetId);
          } else if (segment.targetIds.length > 1) {
            const ratio = event.charIndex / Math.max(1, segment.narration.length);
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
      if (!response.ok) throw new Error(data.error || "Drive sync failed");
      notify("Lesson backed up to Google Drive");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Drive sync failed");
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
    <main className="h-dvh min-h-[680px] bg-[#edf0f5] text-[#202124]">
      <div className="flex h-full flex-col overflow-hidden bg-white">
        {degradation?.active && (
          <div className="flex shrink-0 items-center gap-3 border-b border-[#f0c5aa] bg-gradient-to-r from-[#fff6f0] to-[#fff1e8] px-4 py-2.5 sm:px-5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fde2d0] text-[#c4590e]">
              <AlertTriangle size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#8b4513]">{degradation.message}</p>
              <p className="mt-0.5 text-xs text-[#a0713e]">
                {degradationCountdown ? `Next key available in ${degradationCountdown}` : degradation.nextRetryAt ? `Recovery expected at ${new Date(degradation.nextRetryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Add another Groq key or wait for a reset"}
              </p>
            </div>
            <button type="button" onClick={() => { const btn = document.querySelector<HTMLButtonElement>("[title='Provider keys and live rate limits']"); btn?.click(); }} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e8c5a0] bg-white px-3 text-xs font-semibold text-[#8b4513] shadow-sm transition hover:bg-[#fff8f2]">
              <KeyRound size={13} /> Manage keys
            </button>
          </div>
        )}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#e1e5ea] bg-white px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5 px-1.5 py-1">
            <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55d8]" aria-label="Back to Chalkie home">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#6d55d8] to-[#4f7be8] text-white shadow-[0_6px_18px_#6258d52b]">
                <WandSparkles size={18} strokeWidth={2.4} />
              </span>
              <span className="hidden text-[15px] font-semibold tracking-[-.02em] sm:inline">Chalkie</span>
            </Link>
            <span className="hidden h-5 w-px bg-[#dfe3e8] sm:inline" />
            <span className="max-w-[260px] truncate text-sm text-[#5f6368]">{hasLesson ? lesson.title : "New visual lesson"}</span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/" className="hidden h-9 items-center gap-2 rounded-full border border-[#dfe3e8] bg-white px-3.5 text-sm font-medium text-[#555b64] transition hover:bg-[#f4f6f9] md:flex"><Plus size={15} /> New topic</Link>
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Clear this lesson, reset server research cache, and start fresh?")) return;
                await clearAllClientStorage();
                try { await fetch("/api/reset", { method: "POST" }); } catch { /* ignore */ }
                setLesson(emptyLesson);
                notify("Workspace cleared");
              }}
              className="hidden h-9 items-center gap-1.5 rounded-full border border-[#dfe3e8] bg-white px-3 text-xs font-medium text-[#777d86] transition hover:bg-[#fff5f5] hover:text-[#c4384b] sm:flex"
              title="Clear current lesson and reset cache"
            >
              <Trash2 size={13} /> Clear
            </button>
            <ProviderControl className="hidden sm:inline-flex" />
            <div className="mr-1 hidden items-center gap-2 rounded-full border border-[#b8dfd3] bg-[#edf8f4] px-3 py-1.5 text-xs font-medium text-[#247858] lg:flex">
              <span className="live-pulse h-1.5 w-1.5 rounded-full bg-[#2b9b70]" />
              {connectionStatus === "realtime" ? "Realtime ready" : connectionStatus === "connecting" ? "Connecting…" : "Live session"}
            </div>
            <IconButton label="How to use Chalkie" className="hidden sm:grid" onClick={() => notify("Type a question or tap the microphone. Chalkie researches, draws, and teaches automatically.")}><CircleHelp size={17} /></IconButton>
            <button onClick={() => void shareLesson()} className="hidden h-9 items-center gap-2 rounded-full border border-[#dfe3e8] bg-white px-4 text-sm font-medium transition hover:bg-[#f4f6f9] sm:flex">
              <Share2 size={15} /> Share
            </button>
          </div>
        </header>

        <nav className="grid h-11 shrink-0 grid-cols-3 border-b border-[#e1e5ea] bg-white lg:hidden" aria-label="Workspace panels">
          {(["sources", "canvas", "studio"] as const).map((panel) => (
            <button
              key={panel}
              onClick={() => setActiveMobilePanel(panel)}
              className={`text-xs font-semibold capitalize transition ${activeMobilePanel === panel ? "border-b-2 border-[#6d55d8] text-[#312b55]" : "text-[#777d86]"}`}
            >
              {panel}
            </button>
          ))}
        </nav>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[288px_minmax(460px,1fr)_332px]">
          <aside className={`${activeMobilePanel === "sources" ? "flex" : "hidden"} min-h-0 flex-col border-r border-[#e1e5ea] bg-[#f8f9fc] lg:flex`}>
            <div className="flex h-14 shrink-0 items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <Layers3 size={16} className="text-[#9c8cff]" />
                <h2 className="text-sm font-semibold">Sources</h2>
                <span className="rounded-full bg-[#e9e5fb] px-2 py-0.5 text-xs font-medium text-[#6454ad]">{lesson.sources.length} / 20</span>
              </div>
            </div>

            <div className="px-3 pb-3">
              <label className="flex h-10 items-center gap-2 rounded-xl border border-[#dfe3e8] bg-white px-3 text-[#7a8089] shadow-sm focus-within:border-[#7560d8] focus-within:ring-2 focus-within:ring-[#7560d8]/10">
                <Search size={14} />
                <input value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-[#25272b] outline-none placeholder:text-[#969ba3]" placeholder="Search sources" aria-label="Search lesson sources" />
              </label>
            </div>

            <div className="scrollbar-none flex-1 overflow-y-auto px-3 pb-3">
              <button disabled={!lesson.question || isBusy} onClick={() => void generateLesson(lesson.question)} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#cdd2da] bg-white/70 py-3 text-sm font-medium text-[#60666f] transition hover:border-[#7560d8]/50 hover:bg-[#f2efff] disabled:cursor-not-allowed disabled:opacity-40">
                <Sparkles size={14} className="text-[#9c8cff]" /> Refresh research
              </button>

              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[.12em] text-[#858b94]">Ranked for this lesson</p>
              <div className="space-y-1.5">
                {!displaySources.length && (
                  <div className="rounded-2xl border border-dashed border-[#d5d9e0] bg-white/65 px-4 py-7 text-center">
                    <Search className="mx-auto mb-2 text-[#6f737c]" size={18} />
                    <p className="text-sm font-medium text-[#4d5259]">{lesson.sources.length ? "No matching sources" : "Sources appear after you ask"}</p>
                    <p className="mt-1 text-xs leading-5 text-[#858b94]">{lesson.sources.length ? "Try another title or publisher." : "Research is ranked around your exact question."}</p>
                  </div>
                )}
                {displaySources.map((source, index) => (
                  <button key={source.id} onClick={() => window.open(source.url, "_blank", "noopener,noreferrer")} className="group flex w-full items-start gap-3 rounded-xl border border-transparent p-2.5 text-left transition hover:border-[#dde1e7] hover:bg-white hover:shadow-sm">
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eef0f5] ${sourceColors[index % sourceColors.length]}`}>
                      {source.url.includes("youtube") ? <Play size={13} /> : <FileText size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#30343a]">{source.title}</span>
                      <span className="mt-1 block truncate text-xs text-[#858b94]">{source.publisher}</span>
                    </span>
                    <span className="mt-1 grid h-4 w-4 place-items-center rounded border border-[#9c8cff]/50 bg-[#9c8cff]/15 text-[#bdb4ff]"><Check size={10} /></span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-[#e1e5ea] bg-white/60 p-3">
              <div className="rounded-xl border border-[#e1e5ea] bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-[#8d919a]"><Cloud size={12} /> Research index</span>
                  <span className={isBusy ? "max-w-[140px] truncate text-[#ffb36b]" : "max-w-[140px] truncate text-[#61d8b3]"}>{lesson.sources.length ? `${lesson.sources.length} sources indexed` : generationStage}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#eceff3]"><div className={`h-full rounded-full bg-gradient-to-r from-[#6d55d8] to-[#42a985] transition-all duration-500 ${isBusy ? "w-2/3 animate-pulse" : lesson.sources.length ? "w-full" : "w-0"}`} /></div>
                <p className="mt-2 text-xs leading-4 text-[#7b818a]">Semantic + lexical + question-aware ranking</p>
              </div>
              <button onClick={syncToDrive} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[#dfe3e8] bg-white py-2.5 text-xs font-medium text-[#626870] transition hover:bg-[#f3f5f8]">
                <HardDriveUpload size={13} /> Back up to Google Drive
              </button>
            </div>
          </aside>

          <section className={`${activeMobilePanel === "canvas" ? "flex" : "hidden"} relative min-h-0 flex-col bg-[#e9edf3] lg:flex`}>
            <div className="relative m-2 mb-0 min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#d9dde4] bg-[#fbfaf7] shadow-[0_8px_28px_#2330470c]">
              <ChalkCanvas
                lesson={lesson}
                activeSegment={isPlaying ? visualSegment : null}
                activeStep={activeStep}
                isPresenting={isPlaying}
                isSpeaking={voiceState === "speaking"}
                activeTargetId={activeTargetId}
              />

              {!hasLesson && !isGenerating && (
                <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center bg-[radial-gradient(circle_at_center,#fffffffa_0%,#fbfaf7ef_55%,#f5f3eecc_100%)] px-6 text-[#25262b]">
                  <div className="pointer-events-auto w-full max-w-[560px] text-center">
                    <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[#eeeafd] text-[#684fd1] shadow-[0_12px_32px_#6551c71c] ring-1 ring-[#d9d0fb]">
                      <WandSparkles size={25} />
                    </div>
                    <h1 className="text-balance text-3xl font-semibold tracking-[-.045em]">Learn it by seeing it</h1>
                    <p className="mx-auto mt-3 max-w-md text-base leading-6 text-[#6b7078]">Ask about a mechanism, system, process, place, or idea. Chalkie researches it and builds the right visual model.</p>
                    <button
                      type="button"
                      onClick={toggleRecording}
                      className="mx-auto mt-6 flex h-13 items-center gap-3 rounded-full bg-[#674fd1] px-6 text-sm font-semibold text-white shadow-[0_12px_28px_#6650cf38] transition hover:-translate-y-0.5 hover:bg-[#5741bf]"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15"><Mic size={17} /></span>
                      Talk to Chalkie
                    </button>
                    <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
                      {["Show me how a camera focuses light", "Why do tides change?", "Teach me supply and demand"].map((example) => (
                        <button key={example} onClick={() => void generateLesson(example)} className="rounded-full border border-[#d9dde4] bg-white px-3.5 py-2 text-[#555b64] shadow-sm transition hover:border-[#7560d8]/45 hover:bg-[#f5f2ff] hover:text-[#5146c7]">{example}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {isGenerating && (
                <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center bg-[#fbfaf7]/90 text-[#292a30] backdrop-blur-[3px]">
                  <div className="w-[min(420px,82vw)] rounded-[24px] border border-black/8 bg-white/92 p-6 text-center shadow-[0_22px_60px_#2d2d351e]">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7164ff]/10 text-[#6255ed]"><Waves className="animate-pulse" size={23} /></div>
                    <p className="mt-4 text-lg font-semibold tracking-[-.025em]">Building your visual explanation</p>
                    <p className="mt-2 text-sm text-[#707178]">{generationStage}</p>
                    {lastHeard && <p className="mt-4 line-clamp-2 rounded-xl bg-[#f4f2ed] px-3 py-2 text-xs italic text-[#66676e]">“{lastHeard}”</p>}
                  </div>
                </div>
              )}

              {isFollowUpGenerating && (
                <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex w-[min(520px,86%)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#d7d0f4] bg-white/94 px-4 py-3 text-[#33353b] shadow-[0_16px_38px_#39306424] backdrop-blur-md">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eeeafd] text-[#674fd1]"><Waves className="animate-pulse" size={17} /></span>
                  <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-[.11em] text-[#7566bd]">Live follow-up</span><span className="mt-0.5 block truncate text-sm">{generationStage}</span></span>
                </div>
              )}

              <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#d8dce3] bg-white/92 px-3 py-1.5 text-xs font-medium text-[#555b64] shadow-[0_8px_24px_#26324714] backdrop-blur-md">
                <Focus size={13} className="text-[#9c8cff]" />
                <span>Live canvas</span>
                <span className="h-3 w-px bg-[#d5d9e0]" />
                <span className="text-[#8b9098]">{hasLesson ? lesson.diagramType : "scene graph"}</span>
              </div>
            </div>

            <div className="shrink-0 bg-[#e9edf3] p-3 sm:p-4">
              <form onSubmit={submitQuestion} className="mx-auto flex max-w-4xl items-end gap-2 rounded-[20px] border border-[#d5d9e0] bg-white p-2 shadow-[0_10px_30px_#26324713] focus-within:border-[#7560d8] focus-within:ring-3 focus-within:ring-[#7560d8]/10">
                <button
                  type="button"
                  onClick={toggleRecording}
                  aria-label={isRecording ? "Stop recording" : "Ask with your voice"}
                  title={isRecording ? "Stop recording" : "Ask with your voice"}
                  className={`mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${isRecording ? "voice-ring border-[#d84f68]/45 bg-[#fff0f3] text-[#c83e59]" : "border-[#d9d0fb] bg-[#f0ecff] text-[#674fd1] hover:bg-[#e7e0ff]"}`}
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
                  placeholder={hasLesson ? "Ask a follow-up about this canvas…" : "Ask Chalkie to explain anything visually…"}
                  className="max-h-24 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-5 text-[#25272b] outline-none placeholder:text-[#969ba3]"
                />
                <button type="submit" aria-label="Send question" title="Send question" className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#674fd1] text-white transition hover:scale-[1.04] hover:bg-[#5741bf] disabled:opacity-35" disabled={!prompt.trim() || isBusy || degradation?.active}>
                  {isBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Send size={16} />}
                </button>
              </form>
              <p className="mt-2 text-center text-xs text-[#7e848d]">{isRecording ? "Listening — pause when you finish" : voiceState === "transcribing" ? "Turning your voice into a question…" : voiceState === "thinking" ? generationStage : voiceState === "speaking" ? "Chalkie is teaching — tap the microphone to interrupt" : hasLesson ? "Ask a doubt—Chalkie will reuse the indexed lesson sources" : "Type or speak naturally · important facts should still be verified"}</p>
            </div>
          </section>

          <aside className={`${activeMobilePanel === "studio" ? "flex" : "hidden"} min-h-0 flex-col border-l border-[#e1e5ea] bg-[#f8f9fc] lg:flex`}>
              <div className="flex h-14 shrink-0 items-center px-4">
                <div className="flex items-center gap-2"><BookOpen size={16} className="text-[#d8792f]" /><h2 className="text-sm font-semibold">Lesson guide</h2></div>
              </div>

            <div className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
              <div className="mb-4 overflow-hidden rounded-2xl border border-[#d8d2ef] bg-gradient-to-br from-[#27233a] to-[#171924] text-white shadow-[0_10px_28px_#392e6d18]">
                <div className="relative min-h-28 overflow-hidden border-b border-white/8 p-4">
                  <div className="absolute -right-5 -top-12 h-28 w-28 rounded-full bg-[#9c8cff]/20 blur-2xl" />
                  <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-[#bcb2ee]"><Headphones size={13} /> Voice lesson</div>
                  <h3 className="relative mt-2 truncate text-base font-semibold tracking-[-.01em]">{hasLesson ? lesson.title : "Your lesson will speak here"}</h3>
                  <p className="relative mt-1 line-clamp-3 text-xs leading-5 text-[#a9abb6]">{lastAnswer || (hasLesson ? lesson.visualStrategy : "Ask with your voice or the message box")}</p>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-3">
                    <button disabled={!hasLesson} onClick={togglePlayback} aria-label={isPlaying ? "Pause lesson" : "Play lesson"} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#9c8cff] text-[#111216] shadow-[0_6px_18px_#9c8cff33] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100">
                      {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex h-5 items-end gap-[3px]">
                        {[7, 13, 9, 17, 12, 6, 15, 19, 10, 14, 8, 17, 12, 7, 14, 10, 5, 12].map((height, index) => (
                          <span key={index} className={`w-full rounded-full ${index < 5 ? "bg-[#9c8cff]" : "bg-white/14"}`} style={{ height }} />
                        ))}
                      </div>
                      <div className="mt-1.5 flex justify-between text-xs text-[#898d98]"><span>{isPlaying ? `Step ${activeStep + 1}` : "Ready"}</span><span>{Math.floor(totalDuration / 60)}:{String(totalDuration % 60).padStart(2, "0")}</span></div>
                    </div>
                    <Volume2 size={15} className="text-[#777b84]" />
                  </div>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-[.13em] text-[#777e87]">Teaching sequence</p>
                <span className="flex items-center gap-1 text-xs text-[#777e87]"><Clock3 size={12} /> {lesson.segments.length} steps</span>
              </div>

              <div className="space-y-1">
                {!hasLesson && (
                  <div className="rounded-2xl border border-dashed border-[#d5d9e0] bg-white/65 p-6 text-center">
                    <Waves className="mx-auto text-[#77718f]" size={20} />
                    <p className="mt-2 text-sm font-medium text-[#4d5259]">Built for your question</p>
                    <p className="mt-1 text-xs leading-5 text-[#858b94]">The visual strategy and sequence are generated together.</p>
                  </div>
                )}
                {lesson.segments.map((step, index) => {
                  const state = index < activeStep ? "done" : index === activeStep ? "active" : "next";
                  return (
                  <button onClick={() => { stopPlayback(false); setActiveStep(index); }} key={step.id} className={`relative flex w-full gap-3 rounded-xl border p-3 text-left transition ${state === "active" ? "border-[#cfc5f5] bg-[#f1edff] shadow-sm" : "border-transparent hover:border-[#e0e3e8] hover:bg-white"}`}>
                    <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${state === "done" ? "bg-[#dff3eb] text-[#2a8b67]" : state === "active" ? "bg-[#6d55d8] text-white" : "border border-[#d3d7de] bg-white text-[#747a83]"}`}>
                      {state === "done" ? <Check size={12} /> : index + 1}
                    </span>
                    {index < lesson.segments.length - 1 && <span className="absolute left-[26px] top-10 h-7 w-px bg-[#dfe3e8]" />}
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${state === "active" ? "text-[#3f356f]" : "text-[#41464d]"}`}>{step.title}</span>
                      <span className="mt-1 block truncate text-xs text-[#858b94]">{step.action} · {step.targetIds.length} visual targets</span>
                    </span>
                  </button>
                )})}
              </div>

              <div className="mt-4 rounded-2xl border border-[#dde1e7] bg-white p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium"><span className="grid h-6 w-6 place-items-center rounded-lg bg-[#ffb36b]/12 text-[#ffb36b]"><Focus size={13} /></span>Laser sync</span>
                  <span className="rounded-full bg-[#e5f4ee] px-2 py-0.5 text-xs text-[#247858]">Audio clock</span>
                </div>
                <p className="text-xs leading-5 text-[#777e87]">The pointer and camera follow semantic objects while the current mechanism or relationship is explained.</p>
              </div>
            </div>

            <div className="border-t border-[#e1e5ea] bg-white/60 p-3">
              <button disabled={!hasLesson} onClick={() => setOverviewOpen(true)} className="flex w-full items-center justify-between rounded-xl border border-[#dfe3e8] bg-white px-3 py-2.5 text-sm font-medium text-[#545a63] transition hover:bg-[#f3f5f8] disabled:cursor-not-allowed disabled:opacity-35">
                <span className="flex items-center gap-2"><Layers3 size={14} className="text-[#9c8cff]" /> Open overview map</span>
                <span className="text-[#656972]">⌘K</span>
              </button>
            </div>
          </aside>
        </div>
      </div>

      {overviewOpen && (
        <div className="fixed inset-0 z-[2147483000] grid place-items-center bg-[#11131a]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Lesson overview map">
          <div className="flex h-[min(760px,90vh)] w-[min(1180px,95vw)] flex-col overflow-hidden rounded-[24px] border border-[#d9dde4] bg-white shadow-2xl">
            <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[#e1e5ea] px-5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eeeafd] text-[#684fd1]"><Layers3 size={17} /></span>
              <div><h2 className="text-sm font-semibold">Complete visual model</h2><p className="mt-0.5 text-xs text-[#777e87]">Explore and edit the full scene</p></div>
              <button onClick={() => setOverviewOpen(false)} className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-[#dfe3e8] text-[#727780] hover:bg-[#f3f5f8] hover:text-[#202124]" aria-label="Close overview"><X size={16} /></button>
            </div>
            <div className="relative m-4 flex-1 overflow-hidden rounded-2xl border border-[#d9dde4] bg-[#fbfaf7]">
              <ChalkCanvas lesson={lesson} activeSegment={null} activeStep={lesson.segments.length - 1} isPresenting={false} />
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fade-up fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/12 bg-[#1b1d22]/95 px-4 py-2.5 text-xs text-white shadow-2xl backdrop-blur-xl">
          <Sparkles size={14} className="text-[#9c8cff]" /> {toast}
          <button onClick={() => setToast(null)} aria-label="Dismiss"><X size={13} className="text-[#777b84]" /></button>
        </div>
      )}
    </main>
  );
}
