import type { LessonPlan } from "@/lib/lesson-schema";

const DB_NAME = "chalkie-studio";
const STORE_NAME = "sessions";
const CURRENT_KEY = "current-lesson";
const RECENT_KEY = "recent-lessons";
const MAX_RECENT = 18;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadCurrentLesson(): Promise<LessonPlan | null> {
  try {
    const database = await openDatabase();
    const stored = await new Promise<LessonPlan | null>((resolve) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_KEY);
      request.onsuccess = () => resolve((request.result as LessonPlan | undefined) ?? null);
      request.onerror = () => resolve(null);
      transaction.oncomplete = () => database.close();
    });
    if (stored) return stored;
  } catch {
    // IDB error, fallback to localStorage below
  }

  if (typeof window !== "undefined") {
    try {
      const current = window.localStorage.getItem("chalkie:current-lesson");
      if (current) return JSON.parse(current) as LessonPlan;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function loadLessonById(id: string): Promise<LessonPlan | null> {
  if (!id) return null;
  try {
    const database = await openDatabase();
    const stored = await new Promise<LessonPlan | null>((resolve) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(`lesson:${id}`);
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result as LessonPlan);
          return;
        }
        // Fallback: check recent list in store
        const recentReq = store.get(RECENT_KEY);
        recentReq.onsuccess = () => {
          const list = Array.isArray(recentReq.result) ? (recentReq.result as LessonPlan[]) : [];
          const found = list.find((item) => item.id === id);
          resolve(found ?? null);
        };
        recentReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
      transaction.oncomplete = () => database.close();
    });
    if (stored) return stored;
  } catch {
    // IDB error, fallback to localStorage below
  }

  if (typeof window !== "undefined") {
    try {
      const direct = window.localStorage.getItem(`chalkie:lesson:${id}`);
      if (direct) return JSON.parse(direct) as LessonPlan;
      const recent = window.localStorage.getItem("chalkie:recent-lessons");
      if (recent) {
        const list = JSON.parse(recent) as LessonPlan[];
        const found = list.find((l) => l.id === id);
        if (found) return found;
      }
      const current = window.localStorage.getItem("chalkie:current-lesson");
      if (current) {
        const parsed = JSON.parse(current) as LessonPlan;
        if (parsed.id === id) return parsed;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export async function saveCurrentLesson(lesson: LessonPlan): Promise<void> {
  if (!lesson || !lesson.id) return;

  // 1. Synchronously mirror into localStorage for zero-latency retrieval
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem("chalkie:current-lesson", JSON.stringify(lesson));
      window.localStorage.setItem(`chalkie:lesson:${lesson.id}`, JSON.stringify(lesson));
      const rawRecent = window.localStorage.getItem("chalkie:recent-lessons");
      const localRecent: LessonPlan[] = rawRecent ? (JSON.parse(rawRecent) as LessonPlan[]) : [];
      const updated = [lesson, ...localRecent.filter((item) => item.id !== lesson.id && item.question !== lesson.question)].slice(0, MAX_RECENT);
      window.localStorage.setItem("chalkie:recent-lessons", JSON.stringify(updated));
    } catch {
      // localStorage quota or private browsing fallback
    }
  }

  // 2. Persist in IndexedDB
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put(lesson, CURRENT_KEY);
      store.put(lesson, `lesson:${lesson.id}`);
      const recentRequest = store.get(RECENT_KEY);
      recentRequest.onsuccess = () => {
        const recent = Array.isArray(recentRequest.result) ? (recentRequest.result as LessonPlan[]) : [];
        const next = [lesson, ...recent.filter((item) => item.id !== lesson.id && item.question !== lesson.question)].slice(0, MAX_RECENT);
        store.put(next, RECENT_KEY);
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // If IDB fails, localStorage already holds the data
  }
}

export async function loadRecentLessons(): Promise<LessonPlan[]> {
  let lessons: LessonPlan[] = [];
  try {
    const database = await openDatabase();
    lessons = await new Promise<LessonPlan[]>((resolve) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(RECENT_KEY);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? (request.result as LessonPlan[]) : []);
      request.onerror = () => resolve([]);
      transaction.oncomplete = () => database.close();
    });
  } catch {
    // IDB error, fallback to localStorage
  }

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("chalkie:recent-lessons");
      if (raw) {
        const localList = JSON.parse(raw) as LessonPlan[];
        if (Array.isArray(localList) && localList.length > 0) {
          const seen = new Set(lessons.map((l) => l.id));
          for (const item of localList) {
            if (!seen.has(item.id)) {
              lessons.push(item);
              seen.add(item.id);
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return lessons;
}

export async function deleteLesson(id: string): Promise<void> {
  if (!id) return;

  // 1. Remove from localStorage
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(`chalkie:lesson:${id}`);
      const raw = window.localStorage.getItem("chalkie:recent-lessons");
      if (raw) {
        const list = JSON.parse(raw) as LessonPlan[];
        const next = list.filter((item) => item.id !== id);
        window.localStorage.setItem("chalkie:recent-lessons", JSON.stringify(next));
      }
      const rawCur = window.localStorage.getItem("chalkie:current-lesson");
      if (rawCur) {
        const current = JSON.parse(rawCur) as LessonPlan;
        if (current.id === id) {
          window.localStorage.removeItem("chalkie:current-lesson");
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Remove from IndexedDB
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.delete(`lesson:${id}`);
      const recentReq = store.get(RECENT_KEY);
      recentReq.onsuccess = () => {
        const recent = Array.isArray(recentReq.result) ? (recentReq.result as LessonPlan[]) : [];
        const next = recent.filter((item) => item.id !== id);
        store.put(next, RECENT_KEY);
      };
      const curReq = store.get(CURRENT_KEY);
      curReq.onsuccess = () => {
        const current = curReq.result as LessonPlan | undefined;
        if (current && current.id === id) {
          store.delete(CURRENT_KEY);
        }
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // ignore
  }
}

export async function clearAllClientStorage(): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      transaction.oncomplete = () => database.close();
    });
  } catch {
    // If IDB clear fails, continue to localStorage
  }
  if (typeof window !== "undefined") {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("chalkie:")) keysToRemove.push(k);
      }
      for (const k of keysToRemove) window.localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}
