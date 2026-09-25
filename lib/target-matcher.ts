import type { VisualObject } from "./lesson-schema";

export interface TargetPosition {
  charIndex: number;
  targetId: string;       // e.g. "central-solenoid#2" or "central-solenoid"
  baseTargetId: string;   // e.g. "central-solenoid"
  partIndex: number;      // -1 for whole object, >= 0 for specific internal part
  partLabel: string;      // specific label of the topic/part being discussed
  matchedToken: string;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "with",
  "by", "from", "up", "about", "into", "over", "after", "is", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
  "this", "that", "these", "those", "each", "all", "both", "half", "some",
  "any", "most", "layer", "stage", "component", "card", "overview", "system",
  "structure", "model", "diagram", "where", "which", "then", "also", "here",
  "part", "high", "low", "shaped", "side", "type", "unit", "form", "item",
]);

interface CandidateTerm {
  term: string;
  targetId: string;
  baseTargetId: string;
  partIndex: number;
  partLabel: string;
  priority: number;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * High-precision linguistic target matcher:
 * Maps spoken teacher narration words to visual blackboard objects AND internal parts in real time.
 * When a specific part or concept is discussed (e.g. "Pulsed Current", "Loss Function", "D-T Ions"),
 * the laser pointer glides directly to that part and displays a synchronized badge.
 */
export function computeTargetPositions(
  spokenNarration: string,
  targetIds: string[],
  objects: VisualObject[]
): TargetPosition[] {
  if (!objects || objects.length === 0) return [];
  const text = spokenNarration.toLowerCase();
  const primaryIdSet = new Set(targetIds || []);

  const candidates: CandidateTerm[] = [];

  // Register terms from all objects (with higher priority for active segment targets)
  for (const obj of objects) {
    const isPrimary = primaryIdSet.has(obj.id);
    const priority = isPrimary ? 2 : 1;

    // 1. Full cleaned object label
    const cleanLabel = (obj.label || "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[{}\[\]<>]/g, " ")
      .replace(/[:\-_—+*\\/]/g, " ")
      .trim()
      .toLowerCase();

    if (cleanLabel.length >= 3 && !STOP_WORDS.has(cleanLabel)) {
      candidates.push({
        term: cleanLabel,
        targetId: obj.id,
        baseTargetId: obj.id,
        partIndex: -1,
        partLabel: obj.label,
        priority: priority + 0.5,
      });
    }

    // 2. Multi-word phrases inside label
    const labelWords = cleanLabel.split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
    if (labelWords.length >= 2) {
      for (let i = 0; i < labelWords.length - 1; i++) {
        const bigram = `${labelWords[i]} ${labelWords[i + 1]}`;
        candidates.push({
          term: bigram,
          targetId: obj.id,
          baseTargetId: obj.id,
          partIndex: -1,
          partLabel: obj.label,
          priority: isPrimary ? priority + 0.3 : priority,
        });
      }
    }
    // Single words inside object label: only for primary target objects, or distinctive terms >= 7 chars
    for (const w of labelWords) {
      if (isPrimary || w.length >= 7) {
        candidates.push({
          term: w,
          targetId: obj.id,
          baseTargetId: obj.id,
          partIndex: -1,
          partLabel: obj.label,
          priority: isPrimary ? priority : priority - 0.5,
        });
      }
    }

    // 3. Object ID tokens (e.g. "central-solenoid" -> "solenoid")
    const idTokens = obj.id
      .replace(/[^a-z0-9]/gi, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
    for (const token of idTokens) {
      if (isPrimary || token.length >= 7) {
        candidates.push({
          term: token,
          targetId: obj.id,
          baseTargetId: obj.id,
          partIndex: -1,
          partLabel: obj.label,
          priority: isPrimary ? priority : priority - 0.5,
        });
      }
    }

    // 4. Meaningful part labels & data inside the object
    if (Array.isArray(obj.parts)) {
      obj.parts.forEach((p, pIdx) => {
        const partTargetId = `${obj.id}#${pIdx}`;

        if (p.text && p.text.length >= 2 && p.text.length <= 48) {
          const ptClean = p.text
            .replace(/\([^)]*\)/g, " ")
            .replace(/[{}\[\]<>:=+*\\/]/g, " ")
            .toLowerCase()
            .trim();

          if (ptClean && ptClean.length >= 3 && !STOP_WORDS.has(ptClean)) {
            candidates.push({
              term: ptClean,
              targetId: partTargetId,
              baseTargetId: obj.id,
              partIndex: pIdx,
              partLabel: p.text,
              priority: priority + 0.6,
            });

            const ptWords = ptClean.split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
            if (ptWords.length >= 2) {
              for (let i = 0; i < ptWords.length - 1; i++) {
                candidates.push({
                  term: `${ptWords[i]} ${ptWords[i + 1]}`,
                  targetId: partTargetId,
                  baseTargetId: obj.id,
                  partIndex: pIdx,
                  partLabel: p.text,
                  priority: priority + 0.4,
                });
              }
            }
            // Single part words: only for primary target objects or distinctive terms >= 7 chars
            for (const pw of ptWords) {
              if (isPrimary || pw.length >= 7) {
                candidates.push({
                  term: pw,
                  targetId: partTargetId,
                  baseTargetId: obj.id,
                  partIndex: pIdx,
                  partLabel: p.text,
                  priority: isPrimary ? priority : priority - 0.5,
                });
              }
            }
          }
        }

        // Part data keywords (e.g. "pushrod", "effort", "ions", "gradient")
        if (
          p.data &&
          typeof p.data === "string" &&
          p.data.length >= 3 &&
          p.data.length <= 24 &&
          !p.data.includes("|") &&
          !p.data.includes(":") &&
          !p.data.startsWith("M ") &&
          !/[0-9, ]{6,}/.test(p.data)
        ) {
          const pData = p.data.toLowerCase().trim();
          if (pData && !STOP_WORDS.has(pData) && (isPrimary || pData.length >= 7)) {
            candidates.push({
              term: pData,
              targetId: partTargetId,
              baseTargetId: obj.id,
              partIndex: pIdx,
              partLabel: p.text || obj.label,
              priority: isPrimary ? priority : priority - 0.5,
            });
          }
        }
      });
    }
  }

  // De-duplicate candidate terms per target
  const uniqueCandidates: CandidateTerm[] = [];
  const seenTermTarget = new Set<string>();
  for (const c of candidates) {
    const key = `${c.term}|${c.targetId}`;
    if (!seenTermTarget.has(key)) {
      seenTermTarget.add(key);
      uniqueCandidates.push(c);
    }
  }

  // Search for matches in spoken narration with strict word-boundary matching
  interface RawMatch extends TargetPosition {
    length: number;
    priority: number;
  }
  const rawMatches: RawMatch[] = [];

  for (const c of uniqueCandidates) {
    const escaped = escapeRegex(c.term);
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      rawMatches.push({
        charIndex: m.index,
        targetId: c.targetId,
        baseTargetId: c.baseTargetId,
        partIndex: c.partIndex,
        partLabel: c.partLabel,
        matchedToken: m[0],
        length: m[0].length,
        priority: c.priority,
      });
    }
  }

  // Sort matches:
  // 1. By charIndex ascending
  // 2. By length descending (longer, more specific phrases take precedence)
  // 3. By priority descending (active segment target preferred over other cards)
  rawMatches.sort((a, b) => a.charIndex - b.charIndex || b.length - a.length || b.priority - a.priority);

  // Filter overlapping spans (e.g. "central solenoid" vs "solenoid")
  const nonOverlapping: RawMatch[] = [];
  let lastEnd = -1;

  for (const m of rawMatches) {
    if (m.charIndex < lastEnd) continue;
    nonOverlapping.push(m);
    lastEnd = m.charIndex + m.length;
  }

  // Guaranteed fallback: If no terms matched in text, distribute segment targetIds proportionally
  if (nonOverlapping.length === 0 && targetIds.length > 0) {
    const textLen = Math.max(1, text.length);
    targetIds.forEach((tId, idx) => {
      const obj = objects.find((o) => o.id === tId);
      nonOverlapping.push({
        charIndex: Math.floor((idx / targetIds.length) * textLen),
        targetId: tId,
        baseTargetId: tId,
        partIndex: -1,
        partLabel: obj?.label || tId,
        matchedToken: "proportional-timing",
        length: 1,
        priority: 1,
      });
    });
  }

  // Remove adjacent duplicate targets so pointer moves intentionally between topics
  const filtered: TargetPosition[] = [];
  for (const pos of nonOverlapping) {
    if (!filtered.length || filtered[filtered.length - 1].targetId !== pos.targetId) {
      filtered.push({
        charIndex: pos.charIndex,
        targetId: pos.targetId,
        baseTargetId: pos.baseTargetId,
        partIndex: pos.partIndex,
        partLabel: pos.partLabel,
        matchedToken: pos.matchedToken,
      });
    }
  }

  return filtered;
}
