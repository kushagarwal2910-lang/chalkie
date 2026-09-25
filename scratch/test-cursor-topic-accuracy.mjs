import { createDemoLesson } from '../lib/demo-lesson.ts';
import { computeTargetPositions } from '../lib/target-matcher.ts';

const lessons = [
  createDemoLesson('How does a Tokamak fusion reactor confine plasma'),
  createDemoLesson('How do neural networks learn?'),
  createDemoLesson('How do hydraulic brakes work?'),
];

console.log("=== COMPREHENSIVE CURSOR TOPIC MATCHING & COORDINATE ACCURACY ===");

for (const lesson of lessons) {
  console.log(`\n======================================================`);
  console.log(`LESSON: ${lesson.title}`);
  console.log(`======================================================`);

  for (let sIdx = 0; sIdx < lesson.segments.length; sIdx++) {
    const seg = lesson.segments[sIdx];
    console.log(`\n[Step ${sIdx + 1}] ${seg.title} (Target IDs: ${JSON.stringify(seg.targetIds)})`);
    console.log(`Spoken: "${seg.narration.slice(0, 90)}..."`);

    const positions = computeTargetPositions(seg.narration, seg.targetIds, lesson.objects);
    console.log(`-> Discovered ${positions.length} voiceover-synchronized topic pointer moves:`);

    positions.forEach((pos, pIdx) => {
      const [baseId, partStr] = pos.targetId.split('#');
      const pIdxNum = partStr !== undefined ? parseInt(partStr, 10) : -1;
      const obj = lesson.objects.find(o => o.id === baseId);
      const part = pIdxNum >= 0 && obj?.parts ? obj.parts[pIdxNum] : null;

      let targetX = obj ? obj.x + obj.width / 2 : 0;
      let targetY = obj ? obj.y + obj.height / 2 : 0;
      let targetW = obj ? obj.width : 0;
      let targetH = obj ? obj.height : 0;

      if (part && obj) {
        targetX = obj.x + part.x + part.width / 2;
        targetY = obj.y + part.y + part.height / 2;
        targetW = part.width;
        targetH = part.height;
      }

      console.log(`   #${pIdx + 1} at char ${pos.charIndex.toString().padStart(3, ' ')} | Target: ${pos.targetId.padEnd(24, ' ')} | Badge: "${pos.partLabel}" | Coord: (${targetX.toFixed(1)}, ${targetY.toFixed(1)})`);
    });
  }
}
