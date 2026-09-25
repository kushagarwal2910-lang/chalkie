export type CanvasPlaybackState =
  | { status: "loading"; request: number }
  | { status: "ready"; request: number }
  | { status: "error"; request: number; message: string };

/** Wait for the exact scene requested by playback, including its first paint. */
export class CanvasPlaybackGate {
  private state: CanvasPlaybackState = { status: "loading", request: 0 };
  private listeners = new Set<() => void>();

  update(state: CanvasPlaybackState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  wait(request: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        this.listeners.delete(check);
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish(new DOMException("Playback cancelled", "AbortError"));
      const check = () => {
        if (signal.aborted) return abort();
        if (this.state.status === "error") return finish(new Error(this.state.message));
        if (this.state.status === "ready" && this.state.request === request) finish();
      };
      const timer = setTimeout(() => finish(new Error("The whiteboard is still loading. Please try Play again.")), 30_000);
      this.listeners.add(check);
      signal.addEventListener("abort", abort, { once: true });
      check();
    });
  }
}

export type NarrationCue = { charIndex: number; targetId: string };

export function targetAtCharacter(cues: NarrationCue[], charIndex: number): string | null {
  let target: string | null = null;
  for (const cue of cues) {
    if (cue.charIndex > charIndex) break;
    target = cue.targetId;
  }
  return target;
}

type NarrationCallbacks = {
  signal: AbortSignal;
  cues: NarrationCue[];
  onStart: () => void;
  onTarget: (targetId: string) => void;
  onEnd: () => void;
  onError: () => void;
};

/** Native word boundaries own the cursor once available; estimates never override them. */
export function playDeviceNarration(
  speech: SpeechSynthesis,
  utterance: SpeechSynthesisUtterance,
  options: NarrationCallbacks,
) {
  const { signal, cues, onStart, onTarget, onEnd, onError } = options;
  if (signal.aborted) return;
  let started = false;
  let finished = false;
  let timers: Array<ReturnType<typeof setTimeout>> = [];
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const cleanup = () => {
    finished = true;
    clearTimers();
    signal.removeEventListener("abort", abort);
    utterance.onstart = utterance.onboundary = utterance.onend = utterance.onerror = null;
  };
  const abort = () => { cleanup(); speech.cancel(); };
  utterance.onstart = () => {
    if (finished || signal.aborted || started) return;
    started = true;
    onStart();
    if (finished || signal.aborted) return;
    // Some device voices emit no boundaries. Start their fallback only when speech starts.
    const charsPerSecond = 13 * utterance.rate;
    timers = cues.map((cue) => setTimeout(() => {
      if (!finished && !signal.aborted) onTarget(cue.targetId);
    }, (cue.charIndex / charsPerSecond) * 1000));
  };
  utterance.onboundary = (event) => {
    if (finished || signal.aborted || !started) return;
    if (event.name !== "word" && event.name !== "sentence") return;
    clearTimers();
    const target = targetAtCharacter(cues, event.charIndex);
    if (target) onTarget(target);
  };
  utterance.onend = () => {
    if (finished || signal.aborted) return;
    cleanup();
    onEnd();
  };
  utterance.onerror = () => {
    if (finished || signal.aborted) return;
    cleanup();
    onError();
  };
  signal.addEventListener("abort", abort, { once: true });
  try { speech.speak(utterance); }
  catch { cleanup(); onError(); }
}

/** Use media time so buffering never makes the cursor run ahead of the audio. */
export function playRecordedNarration(
  audio: HTMLAudioElement,
  textLength: number,
  options: NarrationCallbacks,
) {
  const { signal, cues, onStart, onTarget, onEnd, onError } = options;
  if (signal.aborted) return;
  let started = false;
  let finished = false;
  const cleanup = () => {
    finished = true;
    signal.removeEventListener("abort", abort);
    audio.onplaying = audio.ontimeupdate = audio.onended = audio.onerror = null;
  };
  const abort = () => { cleanup(); audio.pause(); };
  const fail = () => {
    if (finished || signal.aborted) return;
    cleanup();
    audio.pause();
    onError();
  };
  audio.onplaying = () => {
    if (finished || signal.aborted || started) return;
    started = true;
    onStart();
  };
  audio.ontimeupdate = () => {
    if (finished || signal.aborted || !started || audio.paused || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    // The TTS API supplies no word timestamps; position cues proportionally on the actual track.
    const target = targetAtCharacter(cues, (audio.currentTime / audio.duration) * textLength);
    if (target) onTarget(target);
  };
  audio.onended = () => {
    if (finished || signal.aborted) return;
    cleanup();
    onEnd();
  };
  audio.onerror = fail;
  signal.addEventListener("abort", abort, { once: true });
  void audio.play().catch(fail);
}
