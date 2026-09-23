import type { LessonPlan } from "@/lib/lesson-schema";

const DB_NAME = "chalkie-studio";
const STORE_NAME = "sessions";
const CURRENT_KEY = "current-lesson";
const RECENT_KEY = "recent-lessons";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(CURRENT_KEY);
    request.onsuccess = () => resolve((request.result as LessonPlan | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function saveCurrentLesson(lesson: LessonPlan): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(lesson, CURRENT_KEY);
    const recentRequest = store.get(RECENT_KEY);
    recentRequest.onsuccess = () => {
      const recent = Array.isArray(recentRequest.result) ? recentRequest.result as LessonPlan[] : [];
      const next = [lesson, ...recent.filter((item) => item.id !== lesson.id && item.question !== lesson.question)].slice(0, 6);
      store.put(next, RECENT_KEY);
    };
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadRecentLessons(): Promise<LessonPlan[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(RECENT_KEY);
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as LessonPlan[] : []);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
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
    window.localStorage.removeItem("chalkie:provider-quota");
    window.localStorage.removeItem("chalkie:groq-active");
    window.localStorage.removeItem("chalkie:byok-saved");
    window.localStorage.removeItem("chalkie:session");
  }
}
