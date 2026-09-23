"use client";

import { ArrowRight, BookOpen, Clock3, Cloud, HardDriveUpload, Layers3, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { clearAllClientStorage, deleteLesson, loadCurrentLesson, loadRecentLessons, saveCurrentLesson } from "@/lib/client-storage";
import { repairAndValidateLessonPlan } from "@/lib/lesson-layout";
import type { LessonPlan } from "@/lib/lesson-schema";
import { ProviderControl } from "@/components/provider-control";
import { ChalkieIcon } from "@/components/chalkie-icon";

const startingPoints = [
  "How does a hydraulic system multiply force?",
  "Show how a neural network learns",
  "Why do ocean currents circulate?",
];

function validLessons(value: unknown[]): LessonPlan[] {
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    try {
      const repaired = repairAndValidateLessonPlan(item as any);
      return repaired.objects?.length ? [repaired] : [];
    } catch {
      return [];
    }
  });
}

export function ChalkieHome() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [recent, setRecent] = useState<LessonPlan[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [googleSyncOpen, setGoogleSyncOpen] = useState(false);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);
  const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadRecentLessons(), loadCurrentLesson()]).then(([saved, current]) => {
      if (cancelled) return;
      const candidates = current ? [current, ...saved] : saved;
      const lessons = validLessons(candidates);
      setRecent(lessons.filter((lesson, index) => lessons.findIndex((item) => item.id === lesson.id) === index).slice(0, 18));
    }).catch(() => undefined);

    // Check server Google Drive configuration status
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.services) {
          setDriveConfigured(Boolean(data.services.googleDrive));
        }
      })
      .catch(() => undefined);

    // Check drive callback query params
    const params = new URLSearchParams(window.location.search);
    const driveState = params.get("drive");
    if (driveState === "connected") setDriveNotice("Google Drive connected successfully!");
    if (driveState === "unavailable") setDriveNotice("Google Drive sync requires GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in .env.");
    if (driveState === "error") setDriveNotice("Google Drive connection encountered an error.");
    if (driveState) {
      window.history.replaceState({}, "", window.location.pathname);
      const timer = setTimeout(() => setDriveNotice(null), 6000);
      return () => { clearTimeout(timer); cancelled = true; };
    }

    return () => { cancelled = true; };
  }, []);

  async function clearAllData() {
    if (!confirm("Clear all cached lessons, reset server research index, and restart fresh?")) return;
    setClearing(true);
    try {
      await clearAllClientStorage();
      await fetch("/api/reset", { method: "POST" });
      setRecent([]);
    } finally {
      setClearing(false);
    }
  }

  function begin(questionText: string) {
    const value = questionText.trim();
    if (value.length < 3) return;
    router.push(`/studio?q=${encodeURIComponent(value)}`);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    begin(question);
  }

  async function openLesson(lesson: LessonPlan) {
    setOpeningId(lesson.id);
    try {
      await saveCurrentLesson(lesson);
      router.push(`/studio?id=${encodeURIComponent(lesson.id)}`);
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDeleteLesson(e: React.MouseEvent, lessonId: string, lessonTitle: string) {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm(`Delete "${lessonTitle}" from recent lessons?`)) return;
    try {
      await deleteLesson(lessonId);
      setRecent((prev) => prev.filter((item) => item.id !== lessonId));
    } catch (err) {
      console.error("Failed to delete lesson", err);
    }
  }

  return (
    <main className="h-dvh overflow-y-auto bg-[#090a0f] text-[#f3f4f6]">
      {/* Toast Notification */}
      {driveNotice && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-[#2c324a] bg-[#141624] px-4 py-3 text-sm text-[#f3f4f6] shadow-[0_16px_40px_rgba(0,0,0,0.8)]">
          <Cloud size={17} className="text-[#38bdf8]" />
          <span>{driveNotice}</span>
          <button type="button" onClick={() => setDriveNotice(null)} className="ml-2 text-[#9ca3af] hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Google Drive Sync Modal */}
      {googleSyncOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-[24px] border border-[#282d42] bg-[#11131e] p-6 text-[#f3f4f6] shadow-[0_24px_60px_rgba(0,0,0,0.85)]">
            <button
              type="button"
              onClick={() => setGoogleSyncOpen(false)}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-[#9ca3af] transition hover:bg-[#1c2030] hover:text-white"
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#38bdf8]/15 text-[#38bdf8] ring-1 ring-[#38bdf8]/30">
                <Cloud size={24} />
              </span>
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.02em]">Google Drive Cloud Sync</h3>
                <p className="text-xs text-[#9ca3af]">Backup & synchronize your whiteboard lessons</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-xl border border-[#202538] bg-[#161826] p-4 text-xs leading-5 text-[#cbd5e1]">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-[#38bdf8]">✓</span>
                <span><strong>Automatic Cloud Backup:</strong> Sync your interactive notebooks directly to your private Google Drive folder.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-[#34d399]">✓</span>
                <span><strong>Local Cache Active:</strong> All notebooks are automatically cached in your browser&apos;s IndexedDB and localStorage even without Google Drive.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-[#818cf8]">✓</span>
                <span><strong>Secure & Private:</strong> Uses Google&apos;s official restricted <code>drive.file</code> scope; Chalkie only accesses lessons it creates.</span>
              </div>
            </div>

            {driveConfigured === false && (
              <div className="mt-4 rounded-xl border border-[#4a2e1d] bg-[#221711] p-3 text-xs text-[#fdba74]">
                <p className="font-semibold">Server Setup Notice</p>
                <p className="mt-1 text-[#ea580c]">
                  <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> are not configured in your server <code>.env</code>. You can configure them or use local browser cache.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2.5">
              <a
                href="/api/auth/google/start"
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0284c7] px-4 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(2,132,199,0.35)] transition hover:bg-[#0369a1]"
              >
                <HardDriveUpload size={16} />
                <span>Connect Google Drive</span>
              </a>
              <button
                type="button"
                onClick={() => setGoogleSyncOpen(false)}
                className="flex h-10 items-center justify-center rounded-xl border border-[#262c3e] bg-[#141624] text-xs font-medium text-[#9ca3af] transition hover:bg-[#1a1d2e] hover:text-[#f3f4f6]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-[#1f2333] bg-[#0e1017]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#818cf8]">
            <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#141624] p-1 ring-1 ring-[#282d40] shadow-[0_8px_22px_rgba(0,0,0,0.5)]">
              <ChalkieIcon size={32} alt="Chalkie logo" />
            </span>
            <span className="text-lg font-semibold tracking-[-.035em] text-[#f3f4f6]">Chalkie</span>
          </Link>
          <span className="ml-4 hidden h-6 w-px bg-[#1f2333] sm:block" />

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGoogleSyncOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#262a38] bg-[#141620] px-3.5 text-xs font-medium text-[#9ca3af] shadow-sm transition hover:border-[#38bdf8]/40 hover:bg-[#15202e] hover:text-[#38bdf8]"
              title="Google Drive Cloud Sync"
            >
              <Cloud size={13} className="text-[#38bdf8]" />
              <span className="hidden sm:inline">Google Sync</span>
            </button>

            <button
              type="button"
              disabled={clearing}
              onClick={() => void clearAllData()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#262a38] bg-[#141620] px-3 text-xs font-medium text-[#9ca3af] shadow-sm transition hover:border-[#522129] hover:bg-[#281116] hover:text-[#f87171] disabled:opacity-40"
              title="Clear all local caches, recent lessons, and reset workspace"
            >
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Reset workspace</span>
            </button>
            <ProviderControl />
            <Link href="/studio" className="ml-1 inline-flex h-10 items-center gap-2 rounded-full border border-[#262a38] bg-[#141620] px-4 text-sm font-semibold text-[#d1d5db] shadow-sm transition hover:border-[#33394c] hover:bg-[#1a1d2b]">
              Open studio <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1240px] px-5 pb-14 pt-10 sm:px-8 sm:pt-14">
        <section className="relative overflow-hidden rounded-[28px] border border-[#232738] bg-gradient-to-br from-[#131522] via-[#0f111a] to-[#090a10] px-5 py-9 shadow-[0_24px_70px_rgba(0,0,0,0.6)] sm:px-10 sm:py-12">
          <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[#8a74f2]/12 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-36 left-12 h-72 w-72 rounded-full bg-[#73c8bb]/10 blur-3xl" />
          <div className="relative mx-auto max-w-[790px] text-center">
            <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-[#2f354c] bg-[#1a1e2e]/80 px-3 py-1.5 text-xs font-semibold text-[#a5b4fc] shadow-sm">
              <ChalkieIcon size={16} /> Research · draw · explain aloud
            </div>
            <h1 className="text-balance text-[32px] font-semibold leading-[1.12] tracking-[-.05em] text-[#f3f4f6] sm:text-[42px]">What do you want to understand?</h1>
            <p className="mx-auto mt-3 max-w-[620px] text-sm leading-6 text-[#9ca3af] sm:text-base">Start a new topic. Chalkie will research it, build the right visual model, and teach it step by step on an interactive whiteboard.</p>

            <form onSubmit={submit} className="mx-auto mt-7 flex max-w-[720px] items-center gap-2 rounded-[20px] border border-[#282d40] bg-[#141622] p-2.5 text-left shadow-[0_14px_34px_rgba(0,0,0,0.6)] focus-within:border-[#818cf8] focus-within:ring-4 focus-within:ring-[#818cf8]/15">
              <span className="ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#201d36] text-[#818cf8]"><Search size={18} /></span>
              <input
                autoFocus
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about a system, process, machine, theory, or phenomenon…"
                aria-label="Start a new visual lesson"
                className="min-w-0 flex-1 bg-transparent px-1 py-3 text-base text-[#f3f4f6] outline-none placeholder:text-[#6b7280]"
              />
              <button type="submit" disabled={question.trim().length < 3} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[14px] bg-[#6366f1] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_#6366f133] transition hover:-translate-y-0.5 hover:bg-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0">
                <span className="hidden sm:inline">Create lesson</span><ArrowRight size={17} />
              </button>
            </form>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {startingPoints.map((item) => <button key={item} onClick={() => begin(item)} className="rounded-full border border-[#222738] bg-[#131520]/80 px-3.5 py-2 text-xs font-medium text-[#9ca3af] shadow-sm transition hover:border-[#818cf8]/50 hover:bg-[#1a1d2e] hover:text-[#c7d2fe]">{item}</button>)}
            </div>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="recent-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#6b7280]">Your workspace</p>
              <h2 id="recent-heading" className="mt-1 text-xl font-semibold tracking-[-.03em] text-[#f3f4f6]">Recent visual lessons</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setGoogleSyncOpen(true)}
                className="hidden items-center gap-1.5 rounded-full border border-[#262a38] bg-[#141620] px-3.5 py-2 text-xs font-semibold text-[#38bdf8] shadow-sm transition hover:bg-[#162333] sm:flex"
                title="Google Drive cloud sync options"
              >
                <Cloud size={13} /> Google Sync
              </button>
              {recent.length > 0 && (
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => void clearAllData()}
                  className="hidden items-center gap-1.5 rounded-full border border-[#3e1e24] bg-[#241216] px-3.5 py-2 text-xs font-semibold text-[#f87171] shadow-sm transition hover:bg-[#33171d] sm:flex disabled:opacity-40"
                  title="Clear all stored lessons and server caches"
                >
                  <Trash2 size={13} /> {clearing ? "Clearing…" : "Clear workspace cache"}
                </button>
              )}
              <button onClick={() => document.querySelector<HTMLInputElement>("input[aria-label='Start a new visual lesson']")?.focus()} className="hidden items-center gap-2 rounded-full border border-[#262a38] bg-[#141620] px-4 py-2 text-sm font-semibold text-[#d1d5db] shadow-sm transition hover:bg-[#1a1d2b] sm:flex"><Plus size={15} /> New topic</button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button onClick={() => document.querySelector<HTMLInputElement>("input[aria-label='Start a new visual lesson']")?.focus()} className="group min-h-[190px] rounded-[22px] border border-dashed border-[#282d3e] bg-[#12141e]/70 p-5 text-left transition hover:-translate-y-0.5 hover:border-[#818cf8]/50 hover:bg-[#161926] hover:shadow-[0_14px_34px_rgba(0,0,0,0.5)]">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#201d36] text-[#818cf8] transition group-hover:scale-105"><Plus size={20} /></span>
              <h3 className="mt-7 font-semibold tracking-[-.02em] text-[#f3f4f6]">Start a new topic</h3>
              <p className="mt-1 text-sm leading-5 text-[#9ca3af]">Ask anything and build a fresh researched lesson.</p>
            </button>

            {recent.map((lesson, index) => (
              <div
                key={lesson.id}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void openLesson(lesson);
                  }
                }}
                onClick={() => void openLesson(lesson)}
                className={`group relative flex min-h-[190px] cursor-pointer flex-col justify-between overflow-hidden rounded-[22px] border border-[#1f2333] bg-[#12141e] p-5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition hover:-translate-y-0.5 hover:border-[#333a52] hover:bg-[#161926] hover:shadow-[0_16px_36px_rgba(0,0,0,0.6)] ${
                  openingId === lesson.id ? "opacity-60" : ""
                }`}
              >
                <div className={`absolute inset-x-0 top-0 h-1 ${index % 3 === 0 ? "bg-[#735cdf]" : index % 3 === 1 ? "bg-[#45a887]" : "bg-[#df8b45]"}`} />

                <div>
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#1c1f2e] text-[#818cf8]"><BookOpen size={18} /></span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-[#1a1d2b] px-2.5 py-1 text-[11px] font-semibold capitalize text-[#9ca3af]">{lesson.diagramType}</span>
                      <button
                        type="button"
                        onClick={(e) => void handleDeleteLesson(e, lesson.id, lesson.title)}
                        className="grid h-7 w-7 place-items-center rounded-lg text-[#9ca3af] transition hover:bg-[#33171d] hover:text-[#f87171]"
                        title="Delete notebook"
                        aria-label={`Delete ${lesson.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <h3 className="mt-5 line-clamp-2 text-base font-semibold leading-5 tracking-[-.02em] text-[#f3f4f6]">{lesson.title}</h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#9ca3af]">{lesson.question}</p>
                </div>

                <div className="mt-4 flex items-center gap-4 text-[11px] font-medium text-[#6b7280]">
                  <span className="flex items-center gap-1.5"><Layers3 size={12} /> {lesson.sources.length} sources</span>
                  <span className="flex items-center gap-1.5"><Clock3 size={12} /> {lesson.segments.length} steps</span>
                  <ArrowRight size={14} className="ml-auto text-[#818cf8] transition group-hover:translate-x-0.5" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
