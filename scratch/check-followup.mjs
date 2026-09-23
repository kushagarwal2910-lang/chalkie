import http from "http";
import { createDemoLesson } from "../lib/demo-lesson.ts";

const currentLesson = createDemoLesson();
const postData = JSON.stringify({
  question: "What is backpropagation?",
  sessionId: "test-session-followup",
  currentLesson,
});

const req = http.request(
  {
    hostname: "localhost",
    port: 3000,
    path: "/api/follow-up",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  },
  (res) => {
    let full = "";
    res.on("data", (chunk) => (full += chunk.toString()));
    res.on("end", () => {
      console.log("Follow-up response status:", res.statusCode);
      const lines = full.split("\n").filter((l) => l.startsWith("data: "));
      console.log("Event types received:", lines.map((l) => {
        try { return Object.keys(JSON.parse(l.slice(6))); } catch { return l; }
      }));
    });
  }
);

req.write(postData);
req.end();
