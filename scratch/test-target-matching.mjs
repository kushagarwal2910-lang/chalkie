import { createDemoLesson } from '../lib/demo-lesson.ts';
import { computeTargetPositions } from '../lib/target-matcher.ts';
import { formatNarrationForSpeech } from '../lib/speech-formatter.ts';

const topics = [
  "Why do ocean currents circulate?",
  "How does an airplane fly?",
  "How does a car engine work?",
  "How does CRISPR-Cas9 edit DNA?",
  "How does a hydraulic braking system work?",
  "What causes a solar eclipse?",
  "How does quantum superposition work in computing?",
  "How do plant cells convert sunlight into energy?",
  "How does a Tokamak fusion reactor confine plasma?",
];

console.log("=== Testing Voiceover & Target Matching Across All Topics ===\n");

for (const topic of topics) {
  const lesson = createDemoLesson(topic);
  console.log(`Topic: "${topic}" -> Lesson Title: "${lesson.title}" (${lesson.objects.length} objects, ${lesson.segments.length} steps)`);

  lesson.segments.forEach((seg, i) => {
    const spoken = formatNarrationForSpeech(seg.narration);
    const targets = computeTargetPositions(spoken, seg.targetIds, lesson.objects);
    const validTargetIds = seg.targetIds.filter(id => lesson.objects.some(o => o.id === id));
    const missingTargets = seg.targetIds.filter(id => !lesson.objects.some(o => o.id === id));

    console.log(`  Step ${i + 1}: "${seg.title}" [Action: ${seg.action}]`);
    console.log(`    Target IDs: ${JSON.stringify(seg.targetIds)} (Valid: ${validTargetIds.length}, Missing: ${missingTargets.length})`);
    if (missingTargets.length > 0) {
      console.error(`    ❌ CRITICAL: Missing target IDs not in lesson.objects: ${JSON.stringify(missingTargets)}`);
    }
    console.log(`    Matched positions: ${targets.length} ->`, targets.map(t => `${t.targetId} ("${t.matchedToken}" at char ${t.charIndex})`).join(', '));
  });
  console.log("\n------------------------------------------------------------\n");
}
