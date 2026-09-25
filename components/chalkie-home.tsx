"use client";

import { ArrowRight, BookOpen, Check, ChevronDown, Clock3, Cloud, HardDriveUpload, Layers3, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { clearAllClientStorage, deleteLesson, loadCurrentLesson, loadRecentLessons, saveCurrentLesson } from "@/lib/client-storage";
import { repairAndValidateLessonPlan } from "@/lib/lesson-layout";
import type { LessonPlan } from "@/lib/lesson-schema";
import { ProviderControl } from "@/components/provider-control";
import { ChalkieIcon } from "@/components/chalkie-icon";

const startingPoints = [
  { category: "Everyday engineering", title: "A small push. A bigger force.", question: "How does a hydraulic system multiply force?" },
  { category: "Inside intelligence", title: "How a neural network learns", question: "Show how a neural network learns" },
  { category: "Our changing planet", title: "The ocean is always moving", question: "Why do ocean currents circulate?" },
];
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c4b5fd]";

function validLessons(value: unknown[]): LessonPlan[] {
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    try {
      const repaired = repairAndValidateLessonPlan(item as LessonPlan);
      return repaired.objects?.length ? [repaired] : [];
    } catch { return []; }
  });
}

/** Small original cover marks, rather than thumbnails that imply a saved diagram. */
function NotebookMark({ variant = 0, className = "" }: { variant?: number; className?: string }) {
  return (
    <svg viewBox="0 0 240 130" fill="none" aria-hidden="true" className={className}>
      {variant % 3 === 0 ? <g stroke="currentColor" strokeWidth="1.5">
        <rect x="66" y="24" width="64" height="78" rx="3" transform="rotate(-10 66 24)" opacity=".35" />
        <rect x="102" y="25" width="64" height="78" rx="3" transform="rotate(8 102 25)" />
        <path d="m119 50 23 3m-25 10 32 5m-34 9 17 3" strokeLinecap="round" opacity=".7" />
        <circle cx="70" cy="81" r="8" fill="currentColor" stroke="none" opacity=".4" />
      </g> : variant % 3 === 1 ? <g stroke="currentColor" strokeWidth="1.5">
        <path d="m77 65 39-29 42 29-42 29Z" opacity=".4" /><path d="m77 65 39 0m0-29v58m0-29h42" opacity=".55" />
        <circle cx="77" cy="65" r="11" /><circle cx="116" cy="36" r="8" /><circle cx="116" cy="65" r="8" fill="currentColor" opacity=".25" />
        <circle cx="116" cy="94" r="8" /><circle cx="158" cy="65" r="11" />
      </g> : <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="120" cy="65" r="35" opacity=".35" /><ellipse cx="120" cy="65" rx="17" ry="35" opacity=".55" />
        <path d="M72 61c19-20 32 20 51 0s32 20 49 0M72 76c19-20 32 20 51 0s32 20 49 0" />
        <circle cx="154" cy="37" r="5" fill="currentColor" stroke="none" />
      </g>}
    </svg>
  );
}

export function ChalkieHome() {
  const router = useRouter();
  const questionRef = useRef<HTMLInputElement>(null);
  const driveDialogRef = useRef<HTMLDialogElement>(null);
  const [question, setQuestion] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [recent, setRecent] = useState<LessonPlan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [googleSyncOpen, setGoogleSyncOpen] = useState(false);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);
  const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadRecentLessons(), loadCurrentLesson()]).then(([saved, current]) => {
      if (cancelled) return;
      const lessons = validLessons(current ? [current, ...saved] : saved);
      setRecent(lessons.filter((lesson, index) => lessons.findIndex((item) => item.id === lesson.id) === index).slice(0, 18));
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoaded(true); });
    void fetch("/api/health").then((res) => res.json()).then((data) => {
      if (!cancelled && data?.services) setDriveConfigured(Boolean(data.services.googleDrive));
    }).catch(() => undefined);

    const params = new URLSearchParams(window.location.search);
    const driveState = params.get("drive");
    const callbackNotice = driveState === "connected" ? "Google Drive is connected. You can save lessons from the studio."
      : driveState === "unavailable" ? "Google Drive sync isn’t available right now. Your notebooks are still saved in this browser."
        : driveState === "error" ? "Google Drive couldn’t connect. Please try again." : undefined;
    const noticeTimer = driveState ? window.setTimeout(() => {
      if (cancelled) return;
      if (callbackNotice) setDriveNotice(callbackNotice);
      params.delete("drive");
      const query = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }, 0) : undefined;
    return () => { cancelled = true; if (noticeTimer !== undefined) window.clearTimeout(noticeTimer); };
  }, []);

  useEffect(() => {
    const dialog = driveDialogRef.current;
    if (!dialog) return;
    if (googleSyncOpen && !dialog.open) dialog.showModal();
    else if (!googleSyncOpen && dialog.open) dialog.close();
  }, [googleSyncOpen]);

  const filteredLessons = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const result = recent.filter(lesson => `${lesson.title} ${lesson.question}`.toLocaleLowerCase().includes(term));
    return sort === "title" ? result.sort((a, b) => a.title.localeCompare(b.title)) : result;
  }, [recent, search, sort]);

  function focusQuestion() {
    questionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    questionRef.current?.focus({ preventScroll: true });
  }

  async function clearAllData() {
    if (!confirm("Reset this workspace? This removes saved notebooks, personal API keys, and cached research. Provider waiting periods are unchanged.")) return;
    setClearing(true);
    try {
      const response = await fetch("/api/reset", { method: "POST" });
      if (!response.ok) throw new Error("The workspace couldn’t be reset. Please try again.");
      await clearAllClientStorage();
      setRecent([]);
      window.location.reload();
    } catch (error) {
      setDriveNotice(error instanceof Error ? error.message : "The workspace couldn’t be reset.");
    } finally { setClearing(false); }
  }

  function begin(questionText: string) {
    const value = questionText.trim();
    if (value.length >= 3) router.push(`/studio?q=${encodeURIComponent(value)}`);
  }
  function submit(event: FormEvent) { event.preventDefault(); begin(question); }
  async function openLesson(lesson: LessonPlan) {
    if (openingId) return;
    setOpeningId(lesson.id);
    try {
      await saveCurrentLesson(lesson);
      router.push(`/studio?id=${encodeURIComponent(lesson.id)}`);
    } catch { setDriveNotice("This notebook couldn’t open. Please try again."); }
    finally { setOpeningId(null); }
  }
  async function handleDeleteLesson(lesson: LessonPlan) {
    if (!confirm(`Delete “${lesson.title || "Untitled notebook"}” from this browser?`)) return;
    try { await deleteLesson(lesson.id); setRecent(prev => prev.filter(item => item.id !== lesson.id)); }
    catch { setDriveNotice("This notebook couldn’t be deleted. Please try again."); }
  }

  return (
    <main className="h-dvh overflow-y-auto overflow-x-hidden bg-[#17191c] text-[#f3f3ee] selection:bg-[#c4b5fd]/25">
      <header className="border-b border-[#363a40] bg-[#17191c]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-7 lg:px-12">
          <Link href="/" aria-label="Chalkie home" className={`flex shrink-0 items-center gap-2.5 rounded-lg ${focusRing}`}>
            <ChalkieIcon size={34} alt="" />
            <span className="text-[22px] font-semibold tracking-[-.045em]">Chalkie<span className="text-[#c4b5fd]">.</span></span>
          </Link>
          <span className="ml-5 hidden text-sm text-[#a9adb6] lg:block">A place for curious minds</span>
          <div className="order-3 flex w-full min-w-0 items-center justify-between gap-2 border-t border-[#363a40] pt-3 sm:order-none sm:ml-auto sm:w-auto sm:justify-end sm:border-0 sm:pt-0">
            <ProviderControl />
            <button type="button" onClick={() => setGoogleSyncOpen(true)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-medium text-[#a9adb6] transition-colors hover:bg-[#282c31] hover:text-[#f3f3ee] ${focusRing}`} aria-label="Google Drive sync">
              <Cloud size={17} /><span className="hidden min-[390px]:inline">Drive sync</span>
            </button>
          </div>
          <Link href="/studio" className={`ml-auto inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-[#45414e] bg-[#28262f] px-4 text-xs font-medium text-[#d7ccfa] transition-colors hover:bg-[#35303f] sm:ml-0 ${focusRing}`}>
            Open studio <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-9 sm:px-7 sm:pt-12 lg:px-12 lg:pt-14">
        <section aria-labelledby="welcome-heading">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.16em] text-[#a9c9b0]"><span className="h-1.5 w-1.5 rounded-full bg-[#a9c9b0]" />Your learning space</p>
          <h1 id="welcome-heading" className="max-w-3xl text-balance text-[34px] font-medium leading-[1.15] tracking-[-.045em] sm:text-[44px] lg:text-[48px]">Your ideas, made visible.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#a9adb6] sm:text-[15px]">Start with a question. Follow the explanation. Keep a notebook you can come back to.</p>

          <form onSubmit={submit} className="mt-7 rounded-[20px] border border-[#3f414b] bg-[#202327] p-4 sm:mt-8 sm:p-5 lg:flex lg:items-center lg:gap-8">
            <div className="mb-3 flex items-center gap-3 lg:mb-0 lg:w-[245px] lg:shrink-0">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#c4b5fd]/10 text-[#c4b5fd]"><Plus size={21} strokeWidth={1.5} /></span>
              <div><label htmlFor="new-question" className="text-sm font-medium">What are we exploring?</label><p className="mt-0.5 text-xs text-[#a9adb6]">One question. A fresh perspective.</p></div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3 min-[480px]:flex-row min-[480px]:items-center">
              <input id="new-question" ref={questionRef} value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} placeholder="e.g. How does a neural network learn?" aria-label="Start a new visual lesson" className="h-12 min-w-0 flex-1 rounded-xl border border-[#363a40] bg-[#17191c] px-4 text-base text-[#f3f3ee] outline-none placeholder:text-[#9297a1] focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#c4b5fd]/15 sm:text-sm" />
              <button type="submit" disabled={question.trim().length < 3} className={`inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#c4b5fd] px-5 text-sm font-semibold text-[#25202e] transition-colors hover:bg-[#d2c7fc] disabled:cursor-not-allowed disabled:bg-[#403b4b] disabled:text-[#a9a1b8] ${focusRing}`}>Create notebook <ArrowRight size={16} /></button>
            </div>
          </form>
          <p className="mt-3 text-xs leading-5 text-[#9297a1]">A visual lesson, an interactive whiteboard, and an explanation you can hear.</p>
        </section>

        <section className="mt-11 sm:mt-14" aria-labelledby="notebooks-heading">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3"><h2 id="notebooks-heading" className="text-[22px] font-medium tracking-[-.035em]">Your notebooks</h2><span className="rounded-full border border-[#363a40] px-2 py-0.5 text-xs text-[#a9adb6]">{recent.length}</span></div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none"><Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-[#a9adb6]" /><input value={search} onChange={event => setSearch(event.target.value)} aria-label="Search your notebooks" placeholder="Search notebooks" className="h-11 w-full min-w-0 rounded-full border border-[#363a40] bg-transparent pl-10 pr-9 text-base outline-none sm:text-xs placeholder:text-[#a9adb6] focus:border-[#c4b5fd]" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear notebook search" className={`absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full text-[#a9adb6] hover:text-[#f3f3ee] ${focusRing}`}><X size={14} /></button>}</div>
              <div className="relative"><select aria-label="Sort notebooks" value={sort} onChange={event => setSort(event.target.value as "recent" | "title")} className={`h-11 appearance-none rounded-full border border-[#363a40] bg-[#17191c] pl-3.5 pr-9 text-xs text-[#c8cbd1] ${focusRing}`}><option value="recent">Most recent</option><option value="title">Title: A–Z</option></select><ChevronDown size={13} aria-hidden="true" className="pointer-events-none absolute right-3.5 top-4 text-[#a9adb6]" /></div>
            </div>
          </div>
          <p className="mt-3 break-words text-xs text-[#9297a1]" aria-live="polite">{search ? `${filteredLessons.length} ${filteredLessons.length === 1 ? "notebook" : "notebooks"} matching “${search}”` : "Saved in this browser. Ready whenever you are."}</p>

          <div className="mt-5 grid grid-cols-1 gap-4 min-[580px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {!search && <button type="button" onClick={focusQuestion} className={`group flex min-h-[264px] flex-col items-start justify-between rounded-[18px] border border-dashed border-[#51515c] bg-[#202327]/50 p-5 text-left transition-colors hover:border-[#c4b5fd] hover:bg-[#24252c] ${focusRing}`}>
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[#c4b5fd]/10 text-[#c4b5fd]"><Plus size={25} strokeWidth={1.5} /></span>
              <div><h3 className="text-lg font-medium tracking-[-.025em]">Create a notebook</h3><p className="mt-2 max-w-[220px] text-xs leading-5 text-[#a9adb6]">Make a little space for something you want to understand.</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-[#d7ccfa]">Start with a question <ArrowRight size={14} /></span></div>
            </button>}
            {filteredLessons.map((lesson) => {
              const cover = Array.from(lesson.id).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 3;
              const accent = ["text-[#c4b5fd] bg-[#302d3b]", "text-[#a9c9b0] bg-[#29342f]", "text-[#d7b99a] bg-[#373129]"][cover];
              return <article key={lesson.id} className="group relative flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-[#363a40] bg-[#202327] transition-colors hover:border-[#575962]">
                <button type="button" onClick={() => void openLesson(lesson)} disabled={Boolean(openingId)} aria-label={`Open ${lesson.title || "Untitled notebook"}`} className={`flex h-full w-full min-w-0 flex-col text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c4b5fd] disabled:opacity-60 ${focusRing}`}>
                  <div className={`relative flex h-[116px] w-full items-center justify-center ${accent}`}><NotebookMark variant={cover} className="h-[116px] w-[215px] max-w-full" /><span className="absolute bottom-3 left-4 text-[10px] font-medium uppercase tracking-[.13em] opacity-75">{lesson.diagramType}</span></div>
                  <div className="flex w-full min-w-0 flex-1 flex-col p-4 pb-5"><h3 className="line-clamp-2 min-h-12 break-words pr-5 text-[17px] font-medium leading-6 tracking-[-.025em]">{openingId === lesson.id ? "Opening notebook…" : lesson.title || "Untitled notebook"}</h3><p className="mt-1.5 line-clamp-2 break-words text-xs leading-5 text-[#a9adb6]">{lesson.question}</p><div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#a9adb6]"><span className="inline-flex items-center gap-1.5"><Layers3 size={12} />{lesson.sources.length} sources</span><span className="inline-flex items-center gap-1.5"><Clock3 size={12} />{lesson.segments.length} steps</span></div></div>
                </button>
                <button type="button" onClick={() => void handleDeleteLesson(lesson)} aria-label={`Delete ${lesson.title || "Untitled notebook"}`} title="Delete notebook" className={`absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-[#17191c]/70 text-[#d1d3d8] transition-colors hover:bg-[#493336] hover:text-[#f1b7b4] ${focusRing}`}><Trash2 size={14} /></button>
              </article>;
            })}
            {loaded && !filteredLessons.length && <div className={`flex min-h-[264px] flex-col items-center justify-center rounded-[18px] border border-[#363a40] px-6 py-8 text-center ${search ? "min-[580px]:col-span-2 lg:col-span-3 xl:col-span-4" : "lg:col-span-2 xl:col-span-3"}`}>
              <BookOpen size={29} strokeWidth={1.2} className="text-[#a9adb6]" /><h3 className="mt-4 text-base font-medium">{search ? "No notebooks found" : "A fresh page for your curiosity"}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[#a9adb6]">{search ? "Try another title or a word from your question." : "Your lessons will live here. Create your first notebook above, or explore a question below."}</p>{search && <button type="button" onClick={() => setSearch("")} className={`mt-4 rounded-full px-3 py-2 text-xs font-medium text-[#d7ccfa] ${focusRing}`}>Clear search</button>}
            </div>}
            {!loaded && <div role="status" className="flex min-h-[264px] items-center justify-center rounded-[18px] border border-[#363a40] text-sm text-[#a9adb6] lg:col-span-2 xl:col-span-3">Opening your library…</div>}
          </div>
        </section>

        <section className="mt-12 border-t border-[#363a40] pt-7 sm:mt-14" aria-labelledby="inspiration-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="inspiration-heading" className="text-base font-medium tracking-[-.02em]">Follow a little curiosity</h2><p className="text-xs text-[#9297a1]">A few questions to get you started</p></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{startingPoints.map((item, index) => <button type="button" key={item.question} onClick={() => begin(item.question)} className={`group flex min-w-0 items-center gap-3 rounded-[16px] border border-[#363a40] bg-[#202327] p-4 text-left transition-colors hover:border-[#5e586c] hover:bg-[#282c31] ${focusRing}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${index === 0 ? "bg-[#302d3b] text-[#c4b5fd]" : index === 1 ? "bg-[#29342f] text-[#a9c9b0]" : "bg-[#373129] text-[#d7b99a]"}`}><BookOpen size={17} strokeWidth={1.5} /></span><div className="min-w-0 flex-1"><p className="text-[10px] text-[#a9adb6]">{item.category}</p><h3 className="mt-1 break-words text-xs font-medium leading-5">{item.title}</h3></div><ArrowRight size={14} className="shrink-0 text-[#a9adb6] transition-transform group-hover:translate-x-0.5" /></button>)}</div>
        </section>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#9297a1]"><span>Made for the joy of understanding.</span><button type="button" disabled={clearing} onClick={() => void clearAllData()} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 transition-colors hover:text-[#f1b7b4] disabled:opacity-50 ${focusRing}`}><RotateCcw size={12} />{clearing ? "Resetting…" : "Reset workspace"}</button></footer>
      </div>

      {driveNotice && <div role="status" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-[#4b5058] bg-[#282c31] p-4 text-sm shadow-lg"><Cloud size={18} className="mt-0.5 shrink-0 text-[#a9c9b0]" /><span className="min-w-0 flex-1 break-words leading-5">{driveNotice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setDriveNotice(null)} className={`-m-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#a9adb6] hover:text-[#f3f3ee] ${focusRing}`}><X size={15} /></button></div>}
      <dialog ref={driveDialogRef} onClose={() => setGoogleSyncOpen(false)} aria-labelledby="drive-dialog-heading" aria-describedby="drive-dialog-description" className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-[24px] border border-[#45494f] bg-[#202327] p-5 text-[#f3f3ee] shadow-2xl backdrop:bg-black/65 sm:p-7" onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setGoogleSyncOpen(false); } }}>
        <div className="flex items-start justify-between gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#a9c9b0]/10 text-[#a9c9b0]"><Cloud size={23} strokeWidth={1.5} /></span><button type="button" onClick={() => setGoogleSyncOpen(false)} aria-label="Close Google Drive settings" className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#a9adb6] hover:bg-[#363a40] ${focusRing}`}><X size={18} /></button></div>
        <h2 id="drive-dialog-heading" className="mt-5 text-2xl font-medium tracking-[-.035em]">A home beyond this browser</h2><p id="drive-dialog-description" className="mt-2 text-sm leading-6 text-[#a9adb6]">Connect Google Drive to save copies of your lessons from the studio.</p>
        <ul className="my-6 space-y-4 text-sm text-[#c8cbd1]"><li className="flex gap-3"><Check size={17} className="mt-0.5 shrink-0 text-[#a9c9b0]" /><span>Your notebooks stay available in this browser.</span></li><li className="flex gap-3"><Check size={17} className="mt-0.5 shrink-0 text-[#a9c9b0]" /><span>Choose when to save a lesson to your Drive.</span></li><li className="flex gap-3"><Check size={17} className="mt-0.5 shrink-0 text-[#a9c9b0]" /><span>Chalkie can access the files you create with it.</span></li></ul>
        {driveConfigured === false ? <p className="mb-5 rounded-xl border border-[#554b3d] bg-[#322e26] p-3 text-xs leading-5 text-[#ddc6a5]">Drive sync isn’t available on this workspace yet. You can keep learning and saving notebooks in this browser.</p> : <a href="/api/auth/google/start" className={`flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#c4b5fd] px-4 text-sm font-semibold text-[#25202e] hover:bg-[#d2c7fc] ${focusRing}`}><HardDriveUpload size={17} />Connect Google Drive</a>}
        <button type="button" onClick={() => setGoogleSyncOpen(false)} className={`mt-3 flex min-h-11 w-full items-center justify-center rounded-full text-sm text-[#a9adb6] hover:bg-[#282c31] ${focusRing}`}>Back to my notebooks</button>
      </dialog>
    </main>
  );
}
