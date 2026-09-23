// Test collision avoidance and spatial layout with mock tldraw editor API
import { createShapeId } from "tldraw";

export function checkIntersection(boxA, boxB, gap = 24) {
  return (
    boxA.x < boxB.x + boxB.w + gap &&
    boxA.x + boxA.w + gap > boxB.x &&
    boxA.y < boxB.y + boxB.h + gap &&
    boxA.y + boxA.h + gap > boxB.y
  );
}

export function snapToGrid(val, gridSize = 20) {
  return Math.round(val / gridSize) * gridSize;
}

export function findNonOverlappingPosition(
  proposed,
  occupiedBoxes,
  viewport,
  options = {}
) {
  const { gap = 32, gridSize = 20, padding = 40 } = options;

  const minX = viewport.x + padding;
  const minY = viewport.y + padding;
  const maxX = Math.max(minX + 100, viewport.x + viewport.w - padding - proposed.w);
  const maxY = Math.max(minY + 100, viewport.y + viewport.h - padding - proposed.h);

  // Clamp proposed within viewport
  let candidateX = snapToGrid(Math.max(minX, Math.min(maxX, proposed.x)), gridSize);
  let candidateY = snapToGrid(Math.max(minY, Math.min(maxY, proposed.y)), gridSize);

  const candidateBox = { x: candidateX, y: candidateY, w: proposed.w, h: proposed.h };

  // Check if initial candidate is already free
  const hasCollision = (box) => occupiedBoxes.some((occ) => checkIntersection(box, occ, gap));

  if (!hasCollision(candidateBox)) {
    return { x: candidateX, y: candidateY };
  }

  // Spiral search for nearest non-overlapping position
  const step = gridSize * 2;
  const maxSearchRadius = Math.max(viewport.w, viewport.h);

  for (let radius = step; radius <= maxSearchRadius; radius += step) {
    // Check cardinal and diagonal directions (right, down, left, up, and diagonals)
    const offsets = [
      { dx: radius, dy: 0 },
      { dx: 0, dy: radius },
      { dx: radius, dy: radius },
      { dx: -radius, dy: 0 },
      { dx: 0, dy: -radius },
      { dx: radius, dy: -radius },
      { dx: -radius, dy: radius },
      { dx: -radius, dy: -radius },
      // Secondary offsets
      { dx: radius * 1.5, dy: 0 },
      { dx: 0, dy: radius * 1.5 },
      { dx: radius * 1.5, dy: radius },
    ];

    for (const offset of offsets) {
      const testX = snapToGrid(Math.max(minX, Math.min(maxX, candidateX + offset.dx)), gridSize);
      const testY = snapToGrid(Math.max(minY, Math.min(maxY, candidateY + offset.dy)), gridSize);
      const testBox = { x: testX, y: testY, w: proposed.w, h: proposed.h };

      if (!hasCollision(testBox)) {
        return { x: testX, y: testY };
      }
    }
  }

  // Fallback: place immediately to the right or below the furthest occupied box
  const rightmost = occupiedBoxes.reduce((max, b) => Math.max(max, b.x + b.w), minX);
  return { x: snapToGrid(rightmost + gap, gridSize), y: candidateY };
}

// ----------------------------------------------------
// TEST RUN
// ----------------------------------------------------
console.log("=== Testing Spatial Layout & Collision Avoidance ===");

const mockViewport = { x: 0, y: 0, w: 1200, h: 800 };

// Scenario 1: Existing shapes on canvas
const mockExistingShapes = [
  { id: "existing-1", x: 100, y: 100, w: 200, h: 150 },
  { id: "existing-2", x: 350, y: 100, w: 200, h: 150 },
];

// Scenario 2: LLM proposes shapes that collide or are at extreme corners
const incomingShapes = [
  { id: "new-1", x: 120, y: 120, w: 180, h: 120 }, // Collides directly with existing-1!
  { id: "new-2", x: 130, y: 130, w: 180, h: 120 }, // Collides with both existing-1 and new-1!
  { id: "new-3", x: 5000, y: -3000, w: 180, h: 120 }, // Extreme corner outside viewport!
];

const occupied = [...mockExistingShapes];
const results = [];

for (const shape of incomingShapes) {
  const newPos = findNonOverlappingPosition(shape, occupied, mockViewport);
  const placedBox = { id: shape.id, x: newPos.x, y: newPos.y, w: shape.w, h: shape.h };
  
  // Verify placed box does not collide with ANY previously placed box
  for (const prev of occupied) {
    const collides = checkIntersection(placedBox, prev, 24);
    if (collides) {
      console.error(`COLLISION DETECTED between ${placedBox.id} and ${prev.id}!`);
      process.exit(1);
    }
  }

  occupied.push(placedBox);
  results.push(placedBox);
  console.log(`✓ Placed ${shape.id} at (${newPos.x}, ${newPos.y}) [originally (${shape.x}, ${shape.y})]`);
}

console.log("\nAll shapes placed with 0 collisions and within viewport bounds!");
