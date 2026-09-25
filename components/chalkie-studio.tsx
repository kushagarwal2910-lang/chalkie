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
  MoreHorizontal,
  ArrowUpRight,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { followUpPlanSchema, lessonPlanSchema, type LessonPlan, type LessonSegment } from "@/lib/lesson-schema";
import { useRealtime } from "@/hooks/use-realtime";
import { clearAllClientStorage, loadCurrentLesson, loadLessonById, saveCurrentLesson } from "@/lib/client-storage";
import { repairAndValidateLessonPlan } from "@/lib/lesson-layout";
import { mergeFollowUpLesson } from "@/lib/follow-up";
import { PROVIDER_CONFIGURATION_EVENT, PROVIDER_STATUS_EVENT, ProviderControl, publishProviderStatus, type ProviderQuota } from "@/components/provider-control";
import { newestProviderQuota, parseProviderFailure, providerFailureError, providerKeysetIdentity, providerRetryReducer, providerRetryView, quotaMatchesConfiguration, sanitizeProviderQuota, type ProviderRetryState } from "@/lib/provider-retry";
import { readProviderEventStream } from "@/lib/provider-event-stream";
import { ChalkieIcon } from "@/components/chalkie-icon";
import { VoiceSettingsDialog } from "@/components/voice-settings-dialog";
import { StudioWorkspace } from "@/components/studio-workspace";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatNarrationForSpeech } from "@/lib/speech-formatter";
import { computeTargetPositions } from "@/lib/target-matcher";
import { getProgressiveVisibleObjects } from "@/lib/progressive-scene";
import { CanvasPlaybackGate, playDeviceNarration, playRecordedNarration, type CanvasPlaybackState } from "@/lib/playback-sync";
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

type RetryOperation =
  | { kind: "lesson"; question: string }
  | { kind: "followup"; question: string; currentLesson: LessonPlan }
  | { kind: "transcribe"; audio: Blob }
  | { kind: "speech"; lessonId: string; stepIndex: number };
const initialRetryState: ProviderRetryState<RetryOperation> = { requestId: 0, status: "idle", operation: null, failure: null };

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
  // null shows the completed board; -1 stages the first scene without revealing it.
  const [revealedStep, setRevealedStep] = useState<number | null>(null);
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
  const overviewRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = overviewRef.current;
    if (overviewOpen && !dialog?.open) dialog?.showModal();
    else if (!overviewOpen && dialog?.open) dialog.close();
  }, [overviewOpen]);
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
  const [providerQuota, setProviderQuota] = useState<ProviderQuota | null>(null);
  const [retryState, dispatchRetry] = useReducer(providerRetryReducer<RetryOperation>, initialRetryState);
  const providerRequestIdRef = useRef(0);
  const configuredKeysetRef = useRef<string | null>(null);
  const [retryNow, setRetryNow] = useState(() => Date.now());
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
  const audioUrlRef = useRef<string | null>(null);
  const playbackAbortRef = useRef<AbortController | null>(null);
  const [canvasGate] = useState(() => new CanvasPlaybackGate());
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [playbackRequest, setPlaybackRequest] = useState(0);
  const playbackRequestRef = useRef(0);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackRunRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pendingAutoplayRef = useRef<number | null>(null);
  const startupHandledRef = useRef(false);
  const voiceMonitorRef = useRef<number | null>(null);
  const voiceContextRef = useRef<AudioContext | null>(null);
  const { status: connectionStatus, send: sendRealtime } = useRealtime(sessionId, (event) => {
    if (event.type === "interrupt") stopPlayback(false);
  });
  const displaySources = lesson.sources.filter((source) => `${source.title} ${source.publisher}`.toLowerCase().includes(sourceQuery.toLowerCase()));
  const hasLesson = lesson.segments.length > 0;
  const isBusy = isGenerating || isFollowUpGenerating || voiceState === "transcribing";
  const canSubmitPrompt = prompt.trim().length >= (hasLesson && promptMode !== "new" ? 2 : 3) && !isBusy;
  const retryView = providerRetryView(retryState.failure, providerQuota, retryNow);
  const showProviderBanner = retryState.status === "failed" || providerQuota?.allUnavailable;
  const totalDuration = Math.round(lesson.segments.reduce((total, segment) => total + segment.durationMs, 0) / 1000);
  const handleCanvasPlaybackState = useCallback((state: CanvasPlaybackState) => {
    canvasGate.update(state);
    if (state.status === "error") setCanvasError(state.message);
    else if (state.status === "ready") setCanvasError(null);
  }, [canvasGate]);

  useEffect(() => {
    if (canvasError) stopPlayback(false);
    // Stop an already running voice if the SDK removes the editor after mounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasError]);

  useEffect(() => {
    const configure = (event: Event) => {
      const quota = sanitizeProviderQuota((event as CustomEvent).detail);
      if (!quota) return;
      configuredKeysetRef.current = providerKeysetIdentity(quota);
      setProviderQuota(current => newestProviderQuota(current, quota));
    };
    const handle = (event: Event) => {
      const quota = sanitizeProviderQuota((event as CustomEvent).detail);
      if (quota && quotaMatchesConfiguration(configuredKeysetRef.current, quota)) setProviderQuota(current => newestProviderQuota(current, quota));
    };
    window.addEventListener(PROVIDER_CONFIGURATION_EVENT, configure);
    window.addEventListener(PROVIDER_STATUS_EVENT, handle);
    return () => {
      window.removeEventListener(PROVIDER_CONFIGURATION_EVENT, configure);
      window.removeEventListener(PROVIDER_STATUS_EVENT, handle);
    };
  }, []);

  useEffect(() => {
    if (!showProviderBanner) return;
    const timer = window.setInterval(() => setRetryNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [showProviderBanner]);

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
    // The URL question/restoration is consumed once on mount; changing the
    // request callback during playback must not generate the initial topic again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get("id")?.trim() ?? "";
      if (targetId && targetId !== lesson.id) {
        void loadLessonById(targetId).then((stored) => {
          if (stored) {
            clearPendingProviderRequest();
            stopPlayback(false);
            setRevealedStep(null);
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
    // Playback/request cancellation uses refs. Rebind only when the displayed
    // lesson identity changes, rather than on each narration render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    playbackAbortRef.current?.abort();
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
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
    const quota = sanitizeProviderQuota(value);
    if (!quota || !quotaMatchesConfiguration(configuredKeysetRef.current, quota)) return;
    setProviderQuota(current => newestProviderQuota(current, quota));
    publishProviderStatus(quota);
  }

  function beginProviderRequest(operation: RetryOperation) {
    const requestId = ++providerRequestIdRef.current;
    dispatchRetry({ type: "begin", requestId, operation });
    setRetryNow(Date.now());
    return requestId;
  }

  function clearPendingProviderRequest() {
    abortRef.current?.abort();
    dispatchRetry({ type: "clear", requestId: ++providerRequestIdRef.current });
    setIsGenerating(false);
    setIsFollowUpGenerating(false);
  }

  function failProviderRequest(requestId: number, error: unknown, fallback: string) {
    if (requestId !== providerRequestIdRef.current) return;
    stopPlayback(false);
    const failure = parseProviderFailure(error, fallback);
    if (failure.quota) handleProviderStatus(failure.quota);
    dispatchRetry({ type: "fail", requestId, failure });
    setGenerationStage("Request paused");
    setRetryNow(Date.now());
  }

  async function retryFailedRequest() {
    const operation = retryState.operation;
    if (!operation || retryState.status !== "failed" || isBusy || !retryView.canRetry) return;
    if (operation.kind === "lesson") await generateLesson(operation.question);
    else if (operation.kind === "followup") await askFollowUp(operation.question, operation.currentLesson);
    else if (operation.kind === "transcribe") await transcribeQuestion(operation.audio);
    else if (operation.lessonId === lesson.id) {
      const run = ++playbackRunRef.current;
      await playStep(operation.stepIndex, run);
    }
  }

  function submitQuestion(event: FormEvent) {
    event.preventDefault();
    const question = prompt.trim();
    if (!canSubmitPrompt) return;
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
    const requestId = beginProviderRequest({ kind: "lesson", question });
    const current = () => abortRef.current === controller && !controller.signal.aborted;
    setIsGenerating(true);
    setIsFollowUpGenerating(false);
    setVoiceState("thinking");
    setLastHeard(question);
    setGenerationStage("Understanding the question");
    notify(`Preparing a visual lesson for “${question.slice(0, 34)}${question.length > 34 ? "…" : ""}”`);

    try {
      const response = await fetch("/api/lesson", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId, useWeb: true }),
      });
      if (!response.ok) throw providerFailureError(await response.json().catch(() => ({})), "The lesson connection could not be established");
      if (!response.body) throw new Error("The lesson connection could not be established");
      let generated: LessonPlan | undefined;
      await readProviderEventStream(response, (type, data) => {
        if (!current()) return;
        if (type === "status") setGenerationStage(String(data.message ?? "Working"));
        if (type === "provider_status") handleProviderStatus(data);
        if (type === "sources" && Array.isArray(data.sources)) {
          const indexedSources = data.sources as LessonPlan["sources"];
          setGenerationStage(`Indexed ${indexedSources.length} sources for this lesson`);
        }
        if (type === "lesson" && data.lesson) {
          if (data.mode === "demo") throw providerFailureError({ code: "PROVIDER_UNAVAILABLE", message: "A live lesson could not be generated. Check your provider keys and retry." });
          generated = lessonPlanSchema.parse(data.lesson);
        }
        if (type === "error") {
          throw providerFailureError(data, "Lesson generation failed");
        }
        if (type === "done" && data.ok === false) throw new Error("The lesson could not be completed. Retry your request.");
      });
      if (!current()) return;
      if (!generated) throw new Error("The lesson connection ended before a lesson was received.");
      dispatchRetry({ type: "complete", requestId });
      pendingAutoplayRef.current = 0;
      setIsPlaying(true);
      setRevealedStep(-1);
      setLesson({ ...generated, id: `${generated.id.slice(0, 56)}-${Date.now()}` });
      setActiveStep(0);
      setLastAnswer("");
      setGenerationStage("Lesson ready");
      notify("Your visual lesson is ready");
    } catch (error) {
      if (current() && (error as Error).name !== "AbortError") failProviderRequest(requestId, error, "Lesson generation failed");
    } finally {
      if (abortRef.current === controller) {
        setIsGenerating(false);
        if (pendingAutoplayRef.current === null && !playbackAbortRef.current) setVoiceState("idle");
      }
    }
  }

  async function askFollowUp(question: string, currentLesson: LessonPlan = lesson) {
    stopPlayback(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = beginProviderRequest({ kind: "followup", question, currentLesson });
    const current = () => abortRef.current === controller && !controller.signal.aborted;
    setIsFollowUpGenerating(true);
    setIsGenerating(false);
    setVoiceState("thinking");
    setLastHeard(question);
    setGenerationStage("Understanding your doubt");
    sendRealtime({ type: "voice_query", question });

    try {
      const response = await fetch("/api/follow-up", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId, currentLesson }),
      });
      if (!response.ok) throw providerFailureError(await response.json().catch(() => ({})), "The follow-up connection could not be established");
      if (!response.body) throw new Error("The follow-up connection could not be established");
      let generated: ReturnType<typeof followUpPlanSchema.parse> | undefined;
      await readProviderEventStream(response, (type, data) => {
        if (!current()) return;
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
          if (data.mode === "demo") throw providerFailureError({ code: "PROVIDER_UNAVAILABLE", message: "A live answer could not be generated. Check your provider keys and retry." });
          generated = followUpPlanSchema.parse(data.plan);
        }
        if (type === "error") {
          throw providerFailureError(data, "Follow-up failed");
        }
        if (type === "done" && data.ok === false) throw new Error("The answer could not be completed. Retry your request.");
      });
      if (!current()) return;
      if (!generated) throw new Error("The connection ended before an answer was received.");
      const merged = mergeFollowUpLesson(currentLesson, generated);
      dispatchRetry({ type: "complete", requestId });
      pendingAutoplayRef.current = merged.startIndex;
      setLastAnswer(generated.answer);
      setActiveStep(merged.startIndex);
      setRevealedStep(merged.startIndex - 1);
      setIsPlaying(true);
      setVoiceState("thinking");
      setLesson(merged.lesson);
      setGenerationStage(generated.coverage === "append" ? "Teaching the new connected visual" : "Pointing through the answer");
      notify(generated.coverage === "append" ? "New explanation added beside the lesson" : "Answering from the current board");
    } catch (error) {
      if (current() && (error as Error).name !== "AbortError") failProviderRequest(requestId, error, "Follow-up failed");
    } finally {
      if (abortRef.current === controller) setIsFollowUpGenerating(false);
    }
  }

  function stopPlayback(broadcast: boolean) {
    playbackRunRef.current += 1;
    pendingAutoplayRef.current = null;
    playbackAbortRef.current?.abort();
    playbackAbortRef.current = null;
    setIsPlaying(false);
    setVisualSegment(null);
    setActiveTargetId(null);
    setVoiceState("idle");
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    window.speechSynthesis?.cancel();
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    if (broadcast) sendRealtime({ type: "interrupt" });
  }

  async function playStep(index: number, run: number) {
    if (run !== playbackRunRef.current) return;
    const segment = lesson.segments[index];
    if (!segment) { stopPlayback(false); return; }
    playbackAbortRef.current?.abort();
    const controller = new AbortController();
    playbackAbortRef.current = controller;
    const { signal } = controller;
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    window.speechSynthesis?.cancel();
    setIsPlaying(true);
    setRevealedStep((current) => current === null || current >= index ? index - 1 : current);
    setVoiceState("thinking");
    setVisualSegment(null);
    setActiveTargetId(null);

    const spokenNarration = formatNarrationForSpeech(segment.narration);
    const targetPositions = computeTargetPositions(spokenNarration, segment.targetIds, getProgressiveVisibleObjects(lesson, index, true));
    const initialTargetId = segment.targetIds[0] ?? targetPositions[0]?.targetId ?? null;
    const isCurrent = () => !signal.aborted && run === playbackRunRef.current;
    const beginVisualTeaching = () => {
      if (!isCurrent()) return;
      setRevealedStep(index);
      setVisualSegment({ ...segment });
      setActiveTargetId(initialTargetId);
      setVoiceState("speaking");
      sendRealtime({ type: "timeline", segmentId: segment.id, targetIds: segment.targetIds, action: segment.action });
      sendRealtime({ type: "pointer", segmentId: segment.id, targetIds: segment.targetIds, action: segment.action });
    };
    const advance = () => {
      if (!isCurrent()) return;
      if (index + 1 < lesson.segments.length) void playStep(index + 1, run);
      else { setRevealedStep(null); stopPlayback(false); }
    };
    const callbacks = {
      signal,
      cues: targetPositions,
      onStart: beginVisualTeaching,
      onTarget: (targetId: string) => { if (isCurrent()) setActiveTargetId(targetId); },
      onEnd: advance,
      onError: () => {
        if (!isCurrent()) return;
        stopPlayback(false);
        notify("Voice playback could not start. Press Play to retry this step.");
      },
    };

    try {
      let recording: Blob | null = null;
      if (process.env.NEXT_PUBLIC_USE_GROQ_TTS === "true") {
        const requestId = beginProviderRequest({ kind: "speech", lessonId: lesson.id, stepIndex: index });
        try {
          const response = await fetch("/api/speech", {
            method: "POST", signal, headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: spokenNarration, sessionId }),
          });
          if (!isCurrent()) return;
          const providerHeader = response.headers.get("x-chalkie-provider-status");
          if (providerHeader) {
            try { handleProviderStatus(JSON.parse(decodeURIComponent(providerHeader))); }
            catch { /* ignore malformed optional status */ }
          }
          if (!response.ok) throw providerFailureError(await response.json().catch(() => ({})), "Voice generation failed");
          recording = await response.blob();
          if (!isCurrent()) return;
          dispatchRetry({ type: "complete", requestId });
        } catch (error) {
          if (!isCurrent()) return;
          failProviderRequest(requestId, error, "Voice generation failed");
          return;
        }
      }
      if (!isCurrent()) return;

      // Request this exact step only after its audio has buffered. Wait for ELK,
      // the editor, and the scene's first paint before starting either voice path.
      const request = ++playbackRequestRef.current;
      setActiveStep(index);
      setPlaybackRequest(request);
      await canvasGate.wait(request, signal);
      if (!isCurrent()) return;

      if (recording) {
        const url = URL.createObjectURL(recording);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        playRecordedNarration(audio, spokenNarration.length, callbacks);
        return;
      }
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(spokenNarration);
        const voices = window.speechSynthesis.getVoices();
        const preferredUri = window.localStorage.getItem(PREFERRED_VOICE_KEY);
        utterance.voice = getBestAvailableVoice(voices, preferredUri);
        const storedRate = window.localStorage.getItem(SPEECH_RATE_KEY);
        const rate = storedRate ? parseFloat(storedRate) : DEFAULT_SPEECH_RATE;
        utterance.rate = Number.isFinite(rate) && rate >= 0.7 && rate <= 1.3 ? rate : DEFAULT_SPEECH_RATE;
        utterance.pitch = DEFAULT_SPEECH_PITCH;
        playDeviceNarration(window.speechSynthesis, utterance, callbacks);
      } else {
        beginVisualTeaching();
        stepTimerRef.current = setTimeout(advance, segment.durationMs || 4500);
      }
    } catch (error) {
      if (!isCurrent()) return;
      stopPlayback(false);
      notify(error instanceof Error ? error.message : "The whiteboard is not ready yet.");
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

  async function transcribeQuestion(audio: Blob) {
    stopPlayback(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const current = () => abortRef.current === controller && !controller.signal.aborted;
    const requestId = beginProviderRequest({ kind: "transcribe", audio });
    const form = new FormData();
    form.set("audio", audio, "question.webm");
    form.set("sessionId", sessionId);
    setVoiceState("transcribing");
    setGenerationStage("Transcribing your question");
    try {
      const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: controller.signal });
      const data = await response.json() as { text?: string; error?: string; code?: string; providerStatus?: ProviderQuota };
      if (!current()) return;
      if (data.providerStatus) handleProviderStatus(data.providerStatus);
      if (!response.ok) throw providerFailureError(data, "Transcription failed");
      const transcript = data.text?.trim() || "";
      if (!transcript) throw new Error("No question was detected in the recording. Try again or type your question.");
      dispatchRetry({ type: "complete", requestId });
      setPrompt("");
      setLastHeard(transcript);
      await askQuestion(transcript);
    } catch (error) {
      if (current() && (error as Error).name !== "AbortError") failProviderRequest(requestId, error, "Transcription failed");
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
        await transcribeQuestion(new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
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
    <main className="studio-shell">
      <header className="studio-header">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Back to Chalkie home">
            <ChalkieIcon size={32} alt="" />
            <span className="text-lg font-semibold tracking-[-.04em]">Chalkie<span className="text-[#c4b5fd]">.</span></span>
          </Link>
          <span className="hidden h-5 w-px bg-[#363a40] sm:block" />
          <p className="hidden min-w-0 truncate text-sm text-[#a9adb6] sm:block" title={lesson.title}>{hasLesson ? lesson.title : "Untitled lesson"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span className="studio-desktop-only items-center gap-2 px-2 text-xs text-[#a9c9b0]" title={connectionStatus === "realtime" ? "Realtime connected" : "Connecting to realtime updates; lessons remain available"}>
            <span className={`h-1.5 w-1.5 rounded-full ${connectionStatus === "realtime" ? "bg-[#a9c9b0]" : "bg-[#e9bd92]"}`} />
            {connectionStatus === "realtime" ? "Connected" : connectionStatus === "connecting" ? "Connecting" : "Reconnecting"}
          </span>
          <ProviderControl />
          <Link href="/" className="studio-primary h-10 gap-1.5 px-3" aria-label="Start a new lesson"><Plus size={16} /><span className="hidden sm:inline">New lesson</span></Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="studio-icon-button" aria-label="Lesson actions"><MoreHorizontal size={20} /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[2000] w-60 rounded-xl border-[#363a40] bg-[#282c31] p-1.5 text-[#f3f3ee]">
              <DropdownMenuItem onSelect={() => void syncToDrive()} className="min-h-11 gap-3 rounded-lg focus:bg-[#363a40]"><Cloud size={16} /> Back up lesson</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void shareLesson()} className="min-h-11 gap-3 rounded-lg focus:bg-[#363a40]"><Share2 size={16} /> Copy lesson link</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => notify("Ask a question to begin. Use Sources to explore research and Guide to replay any step. Drag the whiteboard to explore, or choose a drawing tool to edit.")} className="min-h-11 gap-3 rounded-lg focus:bg-[#363a40]"><CircleHelp size={16} /> How to use Chalkie</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#363a40]" />
              <DropdownMenuItem onSelect={async () => {
                if (!confirm("Clear this lesson, reset server research cache, and start fresh?")) return;
                clearPendingProviderRequest();
                stopPlayback(true);
                await clearAllClientStorage();
                try { await fetch("/api/reset", { method: "POST" }); } catch { /* Keep local reset available offline. */ }
                setLesson(emptyLesson);
                setRevealedStep(null);
                notify("Workspace cleared");
              }} className="min-h-11 gap-3 rounded-lg text-[#f0aca9] focus:bg-[#493134] focus:text-[#ffd3d0]"><Trash2 size={16} /> Clear workspace</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {showProviderBanner && (
        <div role="alert" className="studio-provider-banner">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#e9bd92]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#f1cba7]">{retryView.title}</p>
            <p className="mt-1 text-xs leading-5 text-[#dbc2ab]">{retryView.detail}</p>
            {retryState.status === "failed" && retryState.operation && "question" in retryState.operation && <p className="mt-1 truncate text-xs text-[#dbc2ab]">Pending {retryState.operation.kind === "followup" ? "follow-up" : "lesson"}: {retryState.operation.question}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {retryState.status === "failed" && <button type="button" onClick={() => void retryFailedRequest()} disabled={isBusy || !retryView.canRetry} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#e9bd92] px-3 text-xs font-semibold text-[#30251e] disabled:cursor-not-allowed disabled:opacity-45"><RotateCcw size={13} /> Retry request</button>}
            <button type="button" onClick={() => document.querySelector<HTMLButtonElement>("[title='Provider keys and live rate limits']")?.click()} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#75553a] px-3 text-xs font-semibold text-[#f1cba7]"><KeyRound size={13} /> Manage keys</button>
          </div>
        </div>
      )}

      <nav className="studio-mobile-tabs" aria-label="Workspace panels">
        {(["sources", "canvas", "studio"] as const).map((panel) => (
          <button key={panel} type="button" onClick={() => setActiveMobilePanel(panel)} aria-pressed={activeMobilePanel === panel} aria-controls={`workspace-${panel}`}>
            {panel === "sources" ? <Layers3 size={16} /> : panel === "canvas" ? <Focus size={16} /> : <BookOpen size={16} />}
            {panel === "studio" ? "Guide" : panel === "sources" ? "Sources" : "Canvas"}
          </button>
        ))}
      </nav>

      <div className="studio-workspace">
        <StudioWorkspace activePanel={activeMobilePanel} sourcesOpen={leftPanelOpen} guideOpen={rightPanelOpen}
          sources={
            <aside className="studio-panel" aria-label="Lesson sources">
              <div className="studio-panel-heading"><h2><Layers3 size={17} /> Sources <span className="studio-count">{lesson.sources.length}</span></h2><button type="button" onClick={toggleLeftPanel} className="studio-icon-button studio-desktop-only" aria-label="Collapse Sources sidebar"><PanelLeftClose size={17} /></button></div>
              <div className="px-4 pb-4">
                <label className="studio-search"><Search size={15} /><input value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Find a source" aria-label="Search lesson sources" /></label>
              </div>
              <div className="studio-panel-scroll px-3">
                {!displaySources.length && <div className="studio-empty-card"><FileText size={25} /><h3>{lesson.sources.length ? "No matching sources" : "A little context goes a long way"}</h3><p>{lesson.sources.length ? "Try a different title or publisher." : "Ask a question and the research behind your lesson will appear here."}</p></div>}
                <div className="space-y-1">
                  {displaySources.map((source, index) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="studio-source" title={source.title}>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#2d3037] ${sourceColors[index % sourceColors.length]}`}>{source.url.includes("youtube") ? <Play size={15} /> : <FileText size={15} />}</span>
                    <span className="min-w-0 flex-1"><span className="line-clamp-2 break-words text-sm font-medium leading-5 text-[#e5e6e1]">{source.title}</span><span className="mt-1 block truncate text-xs text-[#a9adb6]">{source.publisher}</span></span><ArrowUpRight size={14} className="mt-1 shrink-0 text-[#838994]" />
                  </a>)}
                </div>
                {hasLesson && <button disabled={!lesson.question || isBusy} onClick={() => void generateLesson(lesson.question)} className="studio-secondary my-4 w-full gap-2 text-xs"><RotateCcw size={14} /> Refresh research</button>}
              </div>
              <div className="studio-panel-footer">
                <p className="mb-3 flex items-center gap-2 text-xs text-[#a9adb6]"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isBusy ? "animate-pulse bg-[#e9bd92]" : "bg-[#a9c9b0]"}`} /><span className="truncate">{isBusy ? generationStage : lesson.sources.length ? `${lesson.sources.length} sources for this lesson` : "Ready for your first question"}</span></p>
                <button onClick={syncToDrive} className="studio-secondary w-full gap-2 text-xs"><HardDriveUpload size={14} /> Back up lesson</button>
              </div>
            </aside>
          }
          canvas={
            <section className="studio-canvas-panel" aria-label="Canvas workspace">
              <div className="studio-canvas-heading">
                <div className="flex min-w-0 items-center gap-2">
                  {!leftPanelOpen && <button type="button" onClick={toggleLeftPanel} className="studio-icon-button studio-desktop-only" aria-label="Expand Sources sidebar"><PanelLeftOpen size={17} /></button>}
                  <span className="text-sm font-medium">Whiteboard</span>
                  {hasLesson && <span className="hidden truncate text-xs text-[#a9adb6] sm:inline">{isPlaying ? `Step ${activeStep + 1} of ${lesson.segments.length}` : `${lesson.segments.length} steps`}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {hasLesson && <button type="button" disabled={!!canvasError} onClick={togglePlayback} className="studio-secondary min-h-9 gap-1.5 px-3 text-xs" aria-label={isPlaying ? "Pause narration" : "Play narration"}>{isPlaying ? <Pause size={13} /> : <Play size={13} />}{isPlaying ? "Pause" : "Listen"}</button>}
                  {!rightPanelOpen && <button type="button" onClick={toggleRightPanel} className="studio-icon-button studio-desktop-only" aria-label="Expand Lesson Guide sidebar"><PanelRightOpen size={17} /></button>}
                </div>
              </div>
              <div className="studio-board" aria-busy={isGenerating}>
                <ChalkCanvas lesson={lesson} activeSegment={isPlaying ? visualSegment : null} activeStep={activeStep} revealedStep={revealedStep} isPresenting={isPlaying} isSpeaking={voiceState === "speaking"} activeTargetId={activeTargetId} playbackRequest={playbackRequest} onPlaybackState={handleCanvasPlaybackState} />
                {!hasLesson && !isGenerating && <div className="studio-board-empty"><div className="m-auto w-full max-w-[480px] py-6 text-center">
                  <div className="studio-sketch" aria-hidden="true"><span /><span /><span /><svg viewBox="0 0 220 100"><path d="M55 50H85M135 50H165M110 32V16H190V50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" /></svg></div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.18em] text-[#a9c9b0]">Make room for a new idea</p>
                  <h1 className="text-balance text-2xl font-medium tracking-[-.035em] sm:text-3xl">See how it all connects.</h1>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#a9adb6]">One question becomes a visual lesson.<br className="hidden sm:block" /> Listen, explore, and make it your own.</p>
                  <button type="button" onClick={toggleRecording} className="studio-primary mx-auto mt-5 gap-2 px-5"><Mic size={16} /> Talk to Chalkie</button>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {["Why do tides change?", "How does a camera focus?", "Explain supply and demand"].map((example) => <button key={example} onClick={() => void generateLesson(example)} className="studio-suggestion">{example}<ArrowUpRight size={12} /></button>)}
                  </div>
                </div></div>}
                {isGenerating && <div className="studio-board-loading" role="status"><div className="m-auto max-w-sm p-6 text-center"><Waves className="mx-auto animate-pulse text-[#c4b5fd]" size={32} /><h2 className="mt-5 text-xl font-medium tracking-[-.03em]">Connecting the dots</h2><p className="mt-2 text-sm leading-6 text-[#a9adb6]">{generationStage}</p>{lastHeard && <p className="mt-4 line-clamp-2 text-xs italic text-[#a9adb6]">“{lastHeard}”</p>}</div></div>}
                {isFollowUpGenerating && <div className="studio-followup" role="status"><Waves size={18} className="shrink-0 animate-pulse text-[#c4b5fd]" /><span className="min-w-0 truncate text-sm">{generationStage}</span></div>}
              </div>
              <div className="studio-composer">
                {hasLesson && <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Question mode">{(["auto", "doubt", "new"] as const).map((mode) => <button type="button" key={mode} onClick={() => setPromptMode(mode)} aria-pressed={promptMode === mode} className="studio-mode">{mode === "auto" ? <Sparkles size={12} /> : mode === "doubt" ? <MessageSquare size={12} /> : <Plus size={12} />}{mode === "auto" ? "Auto" : mode === "doubt" ? "Follow-up" : "New topic"}</button>)}</div>}
                <form onSubmit={submitQuestion} className="studio-prompt-form">
                  <textarea maxLength={1000} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} aria-label="Your question" placeholder={promptMode === "new" ? "What would you like to learn next?" : promptMode === "doubt" ? "Ask about this whiteboard…" : hasLesson ? "Ask a follow-up, or explore a new idea…" : "What would you like to understand?"} />
                  <button type="button" onClick={toggleRecording} aria-label={isRecording ? "Stop recording" : "Ask with your voice"} title={isRecording ? "Stop recording" : "Ask with your voice"} className={`studio-icon-button ${isRecording ? "voice-ring bg-[#493134] text-[#f0aca9]" : "text-[#c4b5fd]"}`}><Mic size={18} /></button>
                  <button type="submit" aria-label="Send question" title="Send question" className="studio-send" disabled={!canSubmitPrompt}>{isBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#292333]/30 border-t-[#292333]" /> : <Send size={17} />}</button>
                </form>
                <p className="studio-composer-hint" role="status">{isRecording ? "Listening — pause when you finish" : voiceState === "transcribing" ? "Turning your voice into a question…" : voiceState === "thinking" ? generationStage : voiceState === "speaking" ? "Chalkie is teaching · ask a question to interrupt" : "Made for curiosity. Always check important facts."}</p>
              </div>
            </section>
          }
          guide={
            <aside className="studio-panel" aria-label="Lesson guide">
              <div className="studio-panel-heading"><h2><BookOpen size={17} /> Lesson guide</h2><button type="button" onClick={toggleRightPanel} className="studio-icon-button studio-desktop-only" aria-label="Collapse Lesson Guide sidebar"><PanelRightClose size={17} /></button></div>
              <div className="studio-panel-scroll px-4">
                <div className="studio-voice-card">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-medium text-[#d4c8f2]"><Headphones size={15} /> Listen & learn</span><button type="button" onClick={() => setVoiceSettingsOpen(true)} className="studio-icon-button h-8 min-h-8 w-8 text-[#d4c8f2]" aria-label="Voice settings" title="Voice settings"><SlidersHorizontal size={16} /></button></div>
                  <h3 className="mt-4 break-words text-lg font-medium leading-6 tracking-[-.02em]">{hasLesson ? lesson.title : "A lesson, at your pace"}</h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#b8b3c3]">{lastAnswer || (hasLesson ? lesson.visualStrategy : "Follow along as your ideas take shape on the whiteboard.")}</p>
                  <div className="mt-5 flex items-center gap-3">
                    <button disabled={!hasLesson || !!canvasError} onClick={togglePlayback} aria-label={isPlaying ? "Pause lesson" : "Play lesson"} className="studio-send h-11 w-11">{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
                    <div className="min-w-0 flex-1"><div className="flex h-6 items-center gap-[3px]" aria-hidden="true">{[7, 13, 9, 17, 12, 6, 15, 22, 10, 14, 8, 17, 12, 7, 14, 10, 5, 12, 16, 8].map((height, index) => <span key={index} className={`min-w-0 flex-1 rounded-full ${isPlaying ? "animate-pulse bg-[#c4b5fd]" : "bg-[#71677f]"}`} style={{ height, animationDelay: `${index * .08}s` }} />)}</div><div className="mt-2 flex justify-between text-[11px] text-[#b8b3c3]"><span>{isPlaying ? `Step ${activeStep + 1}` : hasLesson ? "Ready when you are" : "Waiting for a question"}</span><span>{Math.floor(totalDuration / 60)}:{String(totalDuration % 60).padStart(2, "0")}</span></div></div>
                  </div>
                </div>
                <div className="mb-3 mt-6 flex items-center justify-between gap-2"><h3 className="text-xs font-medium uppercase tracking-[.1em] text-[#a9adb6]">Step by step</h3><span className="flex items-center gap-1 text-xs text-[#a9adb6]"><Clock3 size={12} /> {lesson.segments.length}</span></div>
                {!hasLesson && <div className="studio-empty-card"><Waves size={25} /><h3>Your path to understanding</h3><p>Each lesson is broken into steps you can revisit anytime.</p></div>}
                <div className="space-y-2 pb-5">{lesson.segments.map((step, index) => {
                  const state = index < activeStep ? "done" : index === activeStep ? "active" : "next";
                  return <button key={step.id} disabled={!!canvasError} onClick={() => { const run = playbackRunRef.current + 1; playbackRunRef.current = run; setActiveStep(index); void playStep(index, run); }} aria-label={`Teach ${step.title}`} aria-current={state === "active" ? "step" : undefined} className="studio-step">
                    <span className={`studio-step-number ${state === "done" ? "bg-[#303d36] text-[#a9c9b0]" : state === "active" ? "bg-[#c4b5fd] text-[#292333]" : "bg-[#30343a] text-[#a9adb6]"}`}>{state === "done" ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0"><span className="block break-words text-sm font-medium leading-5">{step.title}</span><span className="mt-1.5 line-clamp-2 break-words text-xs leading-5 text-[#a9adb6]">{step.narration}</span></span>
                  </button>;
                })}</div>
              </div>
              <div className="studio-panel-footer"><button disabled={!hasLesson} onClick={() => setOverviewOpen(true)} className="studio-secondary w-full justify-between px-4 text-xs"><span className="flex items-center gap-2"><Focus size={15} /> Explore full whiteboard</span><ArrowUpRight size={15} /></button></div>
            </aside>
          }
        />
      </div>

      <dialog ref={overviewRef} onCancel={() => setOverviewOpen(false)} onClose={() => setOverviewOpen(false)} aria-labelledby="overview-title" className="studio-overview">
        <div className="flex h-full min-h-0 flex-col"><div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-[#363a40] px-4 sm:px-5"><div className="min-w-0"><h2 id="overview-title" className="text-sm font-medium">The complete picture</h2><p className="mt-1 text-xs text-[#a9adb6]">Explore and edit your full whiteboard.</p></div><button onClick={() => setOverviewOpen(false)} className="studio-icon-button" aria-label="Close overview"><X size={18} /></button></div><div className="relative m-2 min-h-0 flex-1 overflow-hidden rounded-xl sm:m-4">{overviewOpen && <ChalkCanvas lesson={lesson} activeSegment={null} activeStep={lesson.segments.length - 1} isPresenting={false} />}</div></div>
      </dialog>
      <VoiceSettingsDialog open={voiceSettingsOpen} onOpenChange={setVoiceSettingsOpen} />
      {toast && <div role="status" className="studio-toast"><Sparkles size={16} className="shrink-0 text-[#c4b5fd]" /><span className="min-w-0 flex-1 break-words">{toast}</span><button onClick={() => setToast(null)} className="studio-icon-button h-8 min-h-8 w-8" aria-label="Dismiss notification"><X size={15} /></button></div>}
    </main>
  );
}
