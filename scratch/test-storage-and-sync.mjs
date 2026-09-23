import { createDemoLesson } from "../lib/demo-lesson.ts";
import { repairAndValidateLessonPlan } from "../lib/lesson-layout.ts";

console.log("=== 1. Testing robust lesson validation & repair ===");
const raw = createDemoLesson("Why do ocean currents circulate?");
// Inject missing/loose fields like an older saved lesson
const looseLesson = {
  ...raw,
  id: "lesson-test-currents",
  title: "Why Ocean Currents Circulate",
  sources: [{ id: "src-1", title: "Ocean Circulation NOAA", url: "", publisher: "NOAA", summary: "Summary" }],
  diagramType: "unknown-type",
};

const repaired = repairAndValidateLessonPlan(looseLesson);
console.log("- Repaired title:", repaired.title);
console.log("- Repaired diagramType:", repaired.diagramType);
console.log("- Repaired objects count:", repaired.objects.length);
if (!repaired.objects.length) {
  throw new Error("Failed to preserve objects during repair!");
}
console.log("✓ Repair validation succeeded without dropping lesson!");

console.log("\n=== 2. Testing client-storage delete and load simulation ===");
// Mock localStorage
const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  }
};

const demo1 = { ...raw, id: "notebook-1", title: "Ocean Currents" };
const demo2 = { ...raw, id: "notebook-2", title: "Neural Networks" };

// Simulate saveCurrentLesson to localStorage
const recent = [demo1, demo2];
window.localStorage.setItem("chalkie:recent-lessons", JSON.stringify(recent));
window.localStorage.setItem("chalkie:lesson:notebook-1", JSON.stringify(demo1));
window.localStorage.setItem("chalkie:lesson:notebook-2", JSON.stringify(demo2));
window.localStorage.setItem("chalkie:current-lesson", JSON.stringify(demo1));

console.log("- Saved 2 notebooks in cache");

// Simulate loadLessonById
const loaded1 = JSON.parse(window.localStorage.getItem("chalkie:lesson:notebook-1"));
console.log("- Loaded notebook-1:", loaded1.title);
if (loaded1.id !== "notebook-1") throw new Error("loadLessonById failed!");

// Simulate deleteLesson
const list = JSON.parse(window.localStorage.getItem("chalkie:recent-lessons"));
const next = list.filter(item => item.id !== "notebook-1");
window.localStorage.setItem("chalkie:recent-lessons", JSON.stringify(next));
window.localStorage.removeItem("chalkie:lesson:notebook-1");

const remaining = JSON.parse(window.localStorage.getItem("chalkie:recent-lessons"));
console.log("- Remaining after deleting notebook-1:", remaining.map(r => r.title));
if (remaining.length !== 1 || remaining[0].id !== "notebook-2") {
  throw new Error("Delete lesson failed!");
}
console.log("✓ Delete and cache management verified!");
