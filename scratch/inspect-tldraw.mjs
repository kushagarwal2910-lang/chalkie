import * as tldraw from 'tldraw';
import fs from 'fs';

console.log("=== TLDRAW SDK INSPECTION ===");
console.log("Version:", tldraw.version || "unknown");

// Check shape utilities
console.log("\nDefault Shape Utils:");
for (const util of tldraw.defaultShapeUtils) {
  console.log(`- ${util.type}`);
}

// Check Editor methods on prototype
const editorProto = tldraw.Editor.prototype;
const methods = Object.getOwnPropertyNames(editorProto);
console.log("\nTotal Editor methods:", methods.length);

const interesting = [
  'camera', 'zoom', 'animate', 'laser', 'cursor', 'pointer', 'follow',
  'peer', 'presence', 'binding', 'arrow', 'shape', 'group', 'frame', 'highlight'
];

for (const keyword of interesting) {
  const matching = methods.filter(m => m.toLowerCase().includes(keyword));
  console.log(`Methods matching '${keyword}':`, matching.slice(0, 8));
}
