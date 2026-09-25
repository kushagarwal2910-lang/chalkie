import { createDemoLesson } from '../lib/demo-lesson.ts';

const tokamak = createDemoLesson('How does a Tokamak fusion reactor confine plasma');

// Let's test Step 4 of Tokamak
const seg = tokamak.segments[3];
console.log("Tokamak Step 4 narration:", seg.narration);
console.log("Target IDs:", seg.targetIds);
