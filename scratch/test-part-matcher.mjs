import { createDemoLesson } from '../lib/demo-lesson.ts';

// Test new target position matching logic with part-level topics
function testTargetMatchingLogic() {
  const lessons = [
    createDemoLesson('How does a Tokamak fusion reactor confine plasma'),
    createDemoLesson('How do neural networks learn?'),
    createDemoLesson('How do hydraulic brakes work?'),
  ];

  for (const lesson of lessons) {
    console.log(`\n==============================================`);
    console.log(`LESSON: ${lesson.title}`);
    console.log(`==============================================`);

    for (const seg of lesson.segments) {
      console.log(`\n--- STEP: ${seg.title} (targetIds: ${JSON.stringify(seg.targetIds)}) ---`);
      console.log(`Narration: "${seg.narration}"`);

      // Let's inspect objects and parts that could match
      const matched = [];
      const text = seg.narration.toLowerCase();

      for (const obj of lesson.objects) {
        const isPrimary = seg.targetIds.includes(obj.id);
        
        // 1. Check object label
        const cleanObjLabel = (obj.label || '').replace(/[^a-z0-9]/gi, ' ').toLowerCase().trim();
        const objTokens = cleanObjLabel.split(/\s+/).filter(w => w.length >= 3 && !['the','and','for','with'].includes(w));
        
        for (const token of [cleanObjLabel, ...objTokens]) {
          if (token.length < 3) continue;
          let idx = text.indexOf(token);
          if (idx !== -1) {
            matched.push({
              charIndex: idx,
              targetId: obj.id,
              baseTargetId: obj.id,
              partIndex: -1,
              partLabel: obj.label,
              token,
              isPrimary
            });
          }
        }

        // 2. Check each part
        if (Array.isArray(obj.parts)) {
          obj.parts.forEach((p, pIdx) => {
            if (!p.text || p.text.length < 2) return;
            const cleanPart = p.text.replace(/[^a-z0-9]/gi, ' ').toLowerCase().trim();
            const partTokens = cleanPart.split(/\s+/).filter(w => w.length >= 3 && !['the','and','for','with','line','part'].includes(w));
            
            for (const token of [cleanPart, ...partTokens]) {
              if (token.length < 3) continue;
              let idx = text.indexOf(token);
              if (idx !== -1) {
                matched.push({
                  charIndex: idx,
                  targetId: `${obj.id}#${pIdx}`,
                  baseTargetId: obj.id,
                  partIndex: pIdx,
                  partLabel: p.text,
                  token,
                  isPrimary
                });
              }
            }
          });
        }
      }

      // Sort by charIndex, prefer longer tokens, prefer primary targets
      matched.sort((a, b) => a.charIndex - b.charIndex || b.token.length - a.token.length || (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

      // Filter overlapping ranges & adjacent duplicate targets
      const filtered = [];
      let lastChar = -1;
      let lastTarget = '';

      for (const m of matched) {
        if (m.charIndex < lastChar) continue; // overlaps previous token
        if (m.targetId === lastTarget) continue; // same target again
        filtered.push(m);
        lastChar = m.charIndex + m.token.length;
        lastTarget = m.targetId;
      }

      console.log('Filtered Topics Tracked:');
      for (const f of filtered) {
        console.log(`  [@char ${f.charIndex}] -> ${f.targetId} ("${f.partLabel}") via token "${f.token}"`);
      }
    }
  }
}

testTargetMatchingLogic();
