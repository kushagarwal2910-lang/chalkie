import http from "http";

const postData = JSON.stringify({
  question: "Show how a neural network learns",
  sessionId: "test-session-shape-check",
  useWeb: false,
});

const req = http.request(
  {
    hostname: "localhost",
    port: 3000,
    path: "/api/lesson",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  },
  (res) => {
    let full = "";
    res.on("data", (chunk) => (full += chunk.toString()));
    res.on("end", () => {
      const match = full.split("\n").find((l) => l.startsWith('data: {"lesson":'));
      if (match) {
        const payload = JSON.parse(match.slice(6));
        console.log("Lesson Title:", payload.lesson.title);
        console.log("Objects count:", payload.lesson.objects.length);
        console.log(
          "Objects shapeTypes:",
          payload.lesson.objects.map((o) => `${o.id}: ${o.shapeType}`)
        );
        console.log(
          "Connections:",
          payload.lesson.connections.map((c) => `${c.id} -> ${c.arrowhead}`)
        );
        console.log(
          "Segments actions:",
          payload.lesson.segments.map((s) => `${s.id}: ${s.action} on [${s.targetIds.join(", ")}]`)
        );
      } else {
        console.log("No lesson event found in stream:", full.slice(0, 300));
      }
    });
  }
);

req.write(postData);
req.end();
