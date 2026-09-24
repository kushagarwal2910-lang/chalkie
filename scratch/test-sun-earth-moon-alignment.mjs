import { repairAndValidateLessonPlan, normalizeLessonLayout } from "../lib/lesson-layout.ts";
import { applyElkLayout } from "../lib/elk-spatial-layout.ts";

console.log("=================================================================");
console.log("TEST 1: SOLAR ECLIPSE PHYSICAL REALITY ALIGNMENT");
console.log("=================================================================");

// A typical LLM response where the speech introduces Sun first, then Earth, then Moon,
// and initially places Earth in the middle (Sun -> Earth -> Moon), which is physically WRONG for a solar eclipse!
const solarEclipsePlan = {
  id: "lesson-solar-eclipse",
  title: "Understanding Solar Eclipses",
  question: "Explain how a solar eclipse occurs with Sun, Earth, and Moon alignment",
  summary: "A solar eclipse occurs when the Moon passes directly between the Sun and Earth, blocking sunlight and casting a shadow on Earth.",
  diagramType: "mechanism",
  visualStrategy: "Show Sun illuminating Moon which casts shadow onto Earth.",
  sources: [],
  objects: [
    { id: "sun", role: "container", shapeType: "custom", label: "Sun", x: 100, y: 150, width: 160, height: 160, parts: [] },
    // Notice Earth placed at x=450 and Moon at x=750 (physically backwards!)
    { id: "earth", role: "subject", shapeType: "custom", label: "Earth", x: 450, y: 150, width: 160, height: 160, parts: [] },
    { id: "moon", role: "component", shapeType: "custom", label: "Moon", x: 750, y: 160, width: 140, height: 140, parts: [] },
  ],
  connections: [
    { id: "c1", from: "sun", to: "earth", label: "sunlight", color: "yellow", route: "straight", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: 0 },
    { id: "c2", from: "earth", to: "moon", label: "shadow", color: "blue", route: "straight", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: 0 },
  ],
  segments: [
    { id: "s1", title: "The Sun", narration: "The Sun radiates powerful light across space.", targetIds: ["sun"], action: "reveal", durationMs: 5000 },
    // Speech introduces Earth second, Moon third
    { id: "s2", title: "Planet Earth", narration: "Here is Earth, where observers stand.", targetIds: ["earth"], action: "reveal", durationMs: 5000 },
    { id: "s3", title: "The Moon Moves In Between", narration: "The Moon passes directly between the Sun and Earth, casting a dark shadow.", targetIds: ["moon"], action: "trace", durationMs: 6000 },
  ],
};

const repairedSolar = repairAndValidateLessonPlan(solarEclipsePlan);
const normalizedSolar = normalizeLessonLayout(repairedSolar);

console.log("\nNormalized Solar Eclipse Objects:");
for (const obj of normalizedSolar.objects) {
  console.log(`- [${obj.id}] label="${obj.label}" x=${obj.x} y=${obj.y} w=${obj.width} h=${obj.height}`);
}

const solarSun = normalizedSolar.objects.find((o) => o.id === "sun");
const solarMoon = normalizedSolar.objects.find((o) => o.id === "moon");
const solarEarth = normalizedSolar.objects.find((o) => o.id === "earth");

if (!solarSun || !solarMoon || !solarEarth) {
  throw new Error("FAILED: Missing celestial bodies in solar eclipse plan!");
}

// 1. Verify Moon is physically between Sun and Earth!
console.log(`Positions: Sun.x=${solarSun.x}, Moon.x=${solarMoon.x}, Earth.x=${solarEarth.x}`);
if (!(solarSun.x < solarMoon.x && solarMoon.x < solarEarth.x)) {
  throw new Error(`FAILED: Physical order is wrong! Expected Sun < Moon < Earth, got Sun=${solarSun.x}, Moon=${solarMoon.x}, Earth=${solarEarth.x}`);
}
console.log("✓ Solar Eclipse: Moon is physically placed BETWEEN Sun and Earth (Sun -> Moon -> Earth)!");

// 2. Verify connections: Sun -> Moon (sunlight), Moon -> Earth (shadow)
console.log("\nSolar Eclipse Connections:");
for (const c of normalizedSolar.connections) {
  console.log(`- from=${c.from} to=${c.to} label="${c.label}" color=${c.color}`);
}

const sunToMoonConn = normalizedSolar.connections.find((c) => c.from === "sun" && c.to === "moon");
const moonToEarthConn = normalizedSolar.connections.find((c) => c.from === "moon" && c.to === "earth");
const earthToMoonConn = normalizedSolar.connections.find((c) => c.from === "earth" && c.to === "moon");

if (!sunToMoonConn) {
  throw new Error("FAILED: Missing sunlight connection from Sun to Moon!");
}
if (!moonToEarthConn) {
  throw new Error("FAILED: Missing shadow connection from Moon to Earth!");
}
if (earthToMoonConn) {
  throw new Error("FAILED: Unphysical connection Earth -> Moon persists in solar eclipse!");
}
console.log("✓ Solar Eclipse: Connections correctly reflect reality: Sun -> Moon (sunlight) and Moon -> Earth (shadow)!");

// 3. Verify celestial SVG gradient data tags
if (!solarSun.parts.some((p) => p.data === "sun")) {
  throw new Error("FAILED: Sun does not have data='sun' for realistic SVG gradient rendering!");
}
if (!solarMoon.parts.some((p) => p.data === "moon")) {
  throw new Error("FAILED: Moon does not have data='moon' for realistic SVG gradient rendering!");
}
if (!solarEarth.parts.some((p) => p.data === "earth")) {
  throw new Error("FAILED: Earth does not have data='earth' for realistic SVG gradient rendering!");
}
console.log("✓ All celestial bodies have authentic SVG gradient tags (sun, moon, earth)!");

console.log("\n=================================================================");
console.log("TEST 2: LUNAR ECLIPSE PHYSICAL REALITY ALIGNMENT");
console.log("=================================================================");

const lunarEclipsePlan = {
  id: "lesson-lunar-eclipse",
  title: "Understanding Lunar Eclipses",
  question: "Explain what happens during a lunar eclipse",
  summary: "During a lunar eclipse, Earth passes between the Sun and Moon, casting Earth's shadow across the lunar surface.",
  diagramType: "mechanism",
  visualStrategy: "Show Sun illuminating Earth, with Earth casting shadow on Moon.",
  sources: [],
  objects: [
    { id: "sun", role: "subject", shapeType: "custom", label: "Sun", x: 100, y: 150, width: 160, height: 160, parts: [] },
    // If LLM mistakenly placed Moon in middle:
    { id: "moon", role: "component", shapeType: "custom", label: "Moon", x: 450, y: 160, width: 140, height: 140, parts: [] },
    { id: "earth", role: "subject", shapeType: "custom", label: "Earth", x: 750, y: 150, width: 160, height: 160, parts: [] },
  ],
  connections: [
    { id: "c1", from: "sun", to: "earth", label: "sunlight", color: "yellow", route: "straight", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: 0 },
    { id: "c2", from: "earth", to: "moon", label: "shadow", color: "blue", route: "straight", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: 0 },
  ],
  segments: [
    { id: "s1", title: "The Sun", narration: "The Sun is the central light source.", targetIds: ["sun"], action: "reveal", durationMs: 5000 },
    { id: "s2", title: "Earth in the Center", narration: "Earth moves directly between Sun and Moon during a lunar eclipse.", targetIds: ["earth"], action: "reveal", durationMs: 5000 },
    { id: "s3", title: "The Moon in Shadow", narration: "The Moon enters Earth's umbral shadow.", targetIds: ["moon"], action: "trace", durationMs: 6000 },
  ],
};

const repairedLunar = repairAndValidateLessonPlan(lunarEclipsePlan);
const normalizedLunar = normalizeLessonLayout(repairedLunar);

const lunarSun = normalizedLunar.objects.find((o) => o.id === "sun");
const lunarEarth = normalizedLunar.objects.find((o) => o.id === "earth");
const lunarMoon = normalizedLunar.objects.find((o) => o.id === "moon");

console.log(`Lunar positions: Sun.x=${lunarSun.x}, Earth.x=${lunarEarth.x}, Moon.x=${lunarMoon.x}`);
if (!(lunarSun.x < lunarEarth.x && lunarEarth.x < lunarMoon.x)) {
  throw new Error(`FAILED: Lunar Eclipse physical order wrong! Expected Sun < Earth < Moon, got Sun=${lunarSun.x}, Earth=${lunarEarth.x}, Moon=${lunarMoon.x}`);
}
console.log("✓ Lunar Eclipse: Earth is physically placed BETWEEN Sun and Moon (Sun -> Earth -> Moon)!");

console.log("\n=================================================================");
console.log("TEST 3: VERTICAL SYSTEMS PRESERVATION (Atmospheric Layers)");
console.log("=================================================================");

const atmosphericLayersPlan = {
  id: "lesson-atmosphere",
  title: "Earth's Atmospheric Layers",
  question: "Explain the layers of the atmosphere from troposphere to exosphere",
  summary: "The atmosphere consists of distinct vertical layers: Troposphere, Stratosphere, Mesosphere, Thermosphere, and Exosphere.",
  diagramType: "layers",
  visualStrategy: "Stack atmospheric layers vertically.",
  sources: [],
  objects: [
    { id: "exosphere", role: "component", shapeType: "custom", label: "Exosphere (Top)", x: 200, y: 80, width: 300, height: 80, parts: [] },
    { id: "thermosphere", role: "component", shapeType: "custom", label: "Thermosphere", x: 200, y: 180, width: 300, height: 80, parts: [] },
    { id: "mesosphere", role: "component", shapeType: "custom", label: "Mesosphere", x: 200, y: 280, width: 300, height: 80, parts: [] },
    { id: "stratosphere", role: "component", shapeType: "custom", label: "Stratosphere", x: 200, y: 380, width: 300, height: 80, parts: [] },
    { id: "troposphere", role: "component", shapeType: "custom", label: "Troposphere (Ground)", x: 200, y: 480, width: 300, height: 80, parts: [] },
  ],
  connections: [
    { id: "c1", from: "troposphere", to: "stratosphere", label: "upwards", color: "cyan", route: "straight", fromAnchor: "top", toAnchor: "bottom", arrowhead: "arrow", bend: 0 },
    { id: "c2", from: "stratosphere", to: "mesosphere", label: "upwards", color: "cyan", route: "straight", fromAnchor: "top", toAnchor: "bottom", arrowhead: "arrow", bend: 0 },
    { id: "c3", from: "mesosphere", to: "thermosphere", label: "upwards", color: "cyan", route: "straight", fromAnchor: "top", toAnchor: "bottom", arrowhead: "arrow", bend: 0 },
    { id: "c4", from: "thermosphere", to: "exosphere", label: "upwards", color: "cyan", route: "straight", fromAnchor: "top", toAnchor: "bottom", arrowhead: "arrow", bend: 0 },
  ],
  segments: [
    { id: "s1", title: "Troposphere", narration: "Troposphere is at ground level.", targetIds: ["troposphere"], action: "reveal", durationMs: 5000 },
    { id: "s2", title: "Upper Layers", narration: "Above it are stratosphere, mesosphere, thermosphere, and exosphere.", targetIds: ["exosphere"], action: "reveal", durationMs: 5000 },
  ],
};

const repairedAtm = repairAndValidateLessonPlan(atmosphericLayersPlan);
const normalizedAtm = normalizeLessonLayout(repairedAtm);

console.log("\nNormalized Atmospheric Layers Objects:");
for (const obj of normalizedAtm.objects) {
  console.log(`- [${obj.id}] x=${obj.x} y=${obj.y} w=${obj.width} h=${obj.height}`);
}

const exo = normalizedAtm.objects.find((o) => o.id === "exosphere");
const thermo = normalizedAtm.objects.find((o) => o.id === "thermosphere");
const meso = normalizedAtm.objects.find((o) => o.id === "mesosphere");
const strato = normalizedAtm.objects.find((o) => o.id === "stratosphere");
const tropo = normalizedAtm.objects.find((o) => o.id === "troposphere");

if (!(exo.y < thermo.y && thermo.y < meso.y && meso.y < strato.y && strato.y < tropo.y)) {
  throw new Error("FAILED: Atmospheric layers were flattened horizontally instead of stacked vertically along Y axis!");
}
console.log("✓ Atmospheric layers successfully maintain true vertical stacking (Exosphere at top, Troposphere at bottom)!");

console.log("\n=================================================================");
console.log("ALL REALITY-FIRST ALIGNMENT & SPATIAL TESTS PASSED 100%!");
console.log("=================================================================");
