const res = await fetch("http://localhost:3000/api/lesson", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    question: "how does indus valley people used to live explain their city planning",
    sessionId: "inspect-session-1",
  }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let plan = null;

while (true) {
  const { done, value } = await reader.read();
  buffer += decoder.decode(value, { stream: !done });
  const lines = buffer.split("\n\n");
  buffer = lines.pop() ?? "";
  for (const block of lines) {
    if (block.includes("event: lesson") || block.includes("event: demo")) {
      const match = block.match(/data:\s*(.+)$/m);
      if (match) {
        const data = JSON.parse(match[1]);
        plan = data.lesson || data.plan;
      }
    }
  }
  if (done) break;
}

if (!plan) {
  console.log("No plan found in stream");
  process.exit(1);
}

console.log("\n--- Generated Lesson Structure ---");
console.log("Title:", plan.title);
console.log("Objects count:", plan.objects.length);
for (const obj of plan.objects) {
  console.log(`\nObject [${obj.id}] (role: ${obj.role}, shapeType: ${obj.shapeType}):`);
  console.log(`  coords: x=${obj.x}, y=${obj.y}, w=${obj.width}, h=${obj.height}`);
  console.log(`  label: "${obj.label}"`);
  console.log(`  parts (${obj.parts.length}):`);
  for (const p of obj.parts) {
    console.log(`    - ${p.type} x=${p.x} y=${p.y} w=${p.width} h=${p.height} fill=${p.fill} stroke=${p.stroke}`);
  }
}
