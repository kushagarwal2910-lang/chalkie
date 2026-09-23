"use client";

import { ArrowRight, BookOpen, Clock3, Layers3, Plus, RotateCcw, Search, Sparkles, Trash2, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { clearAllClientStorage, loadCurrentLesson, loadRecentLessons, saveCurrentLesson } from "@/lib/client-storage";
import { lessonPlanSchema, type LessonPlan } from "@/lib/lesson-schema";
import { ProviderControl } from "@/components/provider-control";

const startingPoints = [
  "How does a hydraulic system multiply force?",
  "Show how a neural network learns",
  "Why do ocean currents circulate?",
];

function validLessons(value: unknown[]) {
  return value.flatMap((item) => {
    const parsed = lessonPlanSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function ChalkieHome() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [recent, setRecent] = useState<LessonPlan[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadRecentLessons(), loadCurrentLesson()]).then(([saved, current]) => {
      if (cancelled) return;
      const candidates = current ? [current, ...saved] : saved;
      const lessons = validLessons(candidates);
      setRecent(lessons.filter((lesson, index) => lessons.findIndex((item) => item.id === lesson.id) === index).slice(0, 6));
    }).catch(() => undefined);
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
      router.push("/studio");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <main className="h-dvh overflow-y-auto bg-[#f6f7fb] text-[#202124]">
      <header className="sticky top-0 z-20 border-b border-[#e2e5eb] bg-white/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6d55d8]">
            <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-gradient-to-br from-[#7157df] to-[#4d7cea] text-white shadow-[0_8px_22px_#6258d52d]"><WandSparkles size={20} strokeWidth={2.4} /></span>
            <span className="text-lg font-semibold tracking-[-.035em]">Chalkie</span>
          </Link>
          <span className="ml-4 hidden h-6 w-px bg-[#e0e3e8] sm:block" />
          <button
            type="button"
            disabled={clearing}
            onClick={() => void clearAllData()}
            className="ml-auto mr-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-[#dfe3e8] bg-white px-3 text-xs font-medium text-[#777d86] shadow-sm transition hover:border-[#d2d6df] hover:bg-[#fff5f5] hover:text-[#c4384b] disabled:opacity-40"
            title="Clear all local caches, recent lessons, and reset workspace"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Reset workspace</span>
          </button>
          <ProviderControl />
          <Link href="/studio" className="ml-2 inline-flex h-10 items-center gap-2 rounded-full border border-[#d9dde4] bg-white px-4 text-sm font-semibold text-[#4e535b] shadow-sm transition hover:border-[#c8cdd5] hover:bg-[#f6f7fa]">
            Open studio <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1240px] px-5 pb-14 pt-10 sm:px-8 sm:pt-14">
        <section className="relative overflow-hidden rounded-[28px] border border-[#dedfea] bg-[#eeebff] px-5 py-9 shadow-[0_24px_70px_#44388d12] sm:px-10 sm:py-12">
          <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[#8a74f2]/18 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-36 left-12 h-72 w-72 rounded-full bg-[#73c8bb]/15 blur-3xl" />
          <div className="relative mx-auto max-w-[790px] text-center">
            <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-[#cfc8f1] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#6556aa] shadow-sm">
              <Sparkles size={13} /> Research · draw · explain aloud
            </div>
            <h1 className="text-balance text-[32px] font-semibold leading-[1.12] tracking-[-.05em] text-[#272633] sm:text-[42px]">What do you want to understand?</h1>
            <p className="mx-auto mt-3 max-w-[620px] text-sm leading-6 text-[#676775] sm:text-base">Start a new topic. Chalkie will research it, build the right visual model, and teach it step by step on an interactive whiteboard.</p>

            <form onSubmit={submit} className="mx-auto mt-7 flex max-w-[720px] items-center gap-2 rounded-[20px] border border-[#d4d0e8] bg-white p-2.5 text-left shadow-[0_14px_34px_#3f356d18] focus-within:border-[#806bd9] focus-within:ring-4 focus-within:ring-[#7864d8]/10">
              <span className="ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f0edff] text-[#6c55d4]"><Search size={18} /></span>
              <input
                autoFocus
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about a system, process, machine, theory, or phenomenon…"
                aria-label="Start a new visual lesson"
                className="min-w-0 flex-1 bg-transparent px-1 py-3 text-base text-[#292a31] outline-none placeholder:text-[#9498a1]"
              />
              <button type="submit" disabled={question.trim().length < 3} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[14px] bg-[#684fd1] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_#684fd12e] transition hover:-translate-y-0.5 hover:bg-[#5942c0] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0">
                <span className="hidden sm:inline">Create lesson</span><ArrowRight size={17} />
              </button>
            </form>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {startingPoints.map((item) => <button key={item} onClick={() => begin(item)} className="rounded-full border border-[#d6d2e8] bg-white/70 px-3.5 py-2 text-xs font-medium text-[#62616e] shadow-sm transition hover:border-[#9d8de0] hover:bg-white hover:text-[#5542bd]">{item}</button>)}
            </div>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="recent-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#7f758f]">Your workspace</p>
              <h2 id="recent-heading" className="mt-1 text-xl font-semibold tracking-[-.03em]">Recent visual lessons</h2>
            </div>
            <div className="flex items-center gap-2">
              {recent.length > 0 && (
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => void clearAllData()}
                  className="hidden items-center gap-1.5 rounded-full border border-[#e4cbd0] bg-white px-3.5 py-2 text-xs font-semibold text-[#a53a4c] shadow-sm transition hover:bg-[#fff5f6] sm:flex disabled:opacity-40"
                  title="Clear all stored lessons and server caches"
                >
                  <Trash2 size={13} /> {clearing ? "Clearing…" : "Clear workspace cache"}
                </button>
              )}
              <button onClick={() => document.querySelector<HTMLInputElement>("input[aria-label='Start a new visual lesson']")?.focus()} className="hidden items-center gap-2 rounded-full border border-[#d9dde4] bg-white px-4 py-2 text-sm font-semibold text-[#555b64] shadow-sm transition hover:bg-[#f1f2f6] sm:flex"><Plus size={15} /> New topic</button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button onClick={() => document.querySelector<HTMLInputElement>("input[aria-label='Start a new visual lesson']")?.focus()} className="group min-h-[190px] rounded-[22px] border border-dashed border-[#cfd3dd] bg-white/55 p-5 text-left transition hover:-translate-y-0.5 hover:border-[#8975dc] hover:bg-white hover:shadow-[0_14px_34px_#2526380e]">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#eeeafd] text-[#684fd1] transition group-hover:scale-105"><Plus size={20} /></span>
              <h3 className="mt-7 font-semibold tracking-[-.02em]">Start a new topic</h3>
              <p className="mt-1 text-sm leading-5 text-[#7b8088]">Ask anything and build a fresh researched lesson.</p>
            </button>

            {recent.map((lesson, index) => (
              <button key={lesson.id} onClick={() => void openLesson(lesson)} disabled={openingId !== null} className="group relative min-h-[190px] overflow-hidden rounded-[22px] border border-[#dfe2e9] bg-white p-5 text-left shadow-[0_8px_24px_#262d3b08] transition hover:-translate-y-0.5 hover:border-[#cfc8ed] hover:shadow-[0_16px_36px_#25263812] disabled:opacity-60">
                <div className={`absolute inset-x-0 top-0 h-1 ${index % 3 === 0 ? "bg-[#735cdf]" : index % 3 === 1 ? "bg-[#45a887]" : "bg-[#df8b45]"}`} />
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#f1effb] text-[#6957bb]"><BookOpen size={18} /></span>
                  <span className="rounded-full bg-[#f1f2f6] px-2.5 py-1 text-[11px] font-semibold capitalize text-[#777d85]">{lesson.diagramType}</span>
                </div>
                <h3 className="mt-5 line-clamp-2 text-base font-semibold leading-5 tracking-[-.02em] text-[#303139]">{lesson.title}</h3>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#7d828b]">{lesson.question}</p>
                <div className="mt-4 flex items-center gap-4 text-[11px] font-medium text-[#858a92]">
                  <span className="flex items-center gap-1.5"><Layers3 size={12} /> {lesson.sources.length} sources</span>
                  <span className="flex items-center gap-1.5"><Clock3 size={12} /> {lesson.segments.length} steps</span>
                  <ArrowRight size={14} className="ml-auto text-[#6c55d4] transition group-hover:translate-x-0.5" />
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
