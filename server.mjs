import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname: "localhost", port });

await app.prepare();

const handle = app.getRequestHandler();
const handleNextUpgrade = app.getUpgradeHandler();
const server = createServer((request, response) => handle(request, response));
const sockets = new WebSocketServer({ noServer: true });
const sessions = new Map();

function leave(socket) {
  const sessionId = sessions.get(socket);
  sessions.delete(socket);
  if (!sessionId) return;
  const peers = [...sessions.entries()].filter(([, joined]) => joined === sessionId);
  for (const [peer] of peers) {
    if (peer.readyState === WebSocket.OPEN) peer.send(JSON.stringify({ type: "presence", peers: peers.length }));
  }
}

sockets.on("connection", (socket) => {
  socket.on("message", (raw) => {
    let event;
    try { event = JSON.parse(raw.toString()); }
    catch { return; }

    if (event.type === "join" && typeof event.sessionId === "string") {
      sessions.set(socket, event.sessionId.slice(0, 120));
      socket.send(JSON.stringify({ type: "joined", transport: "websocket" }));
      return;
    }
    if (event.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
      return;
    }

    const sessionId = sessions.get(socket);
    if (!sessionId || !["timeline", "pointer", "interrupt", "voice_query", "generation"].includes(event.type)) return;
    for (const [peer, joined] of sessions.entries()) {
      if (peer !== socket && joined === sessionId && peer.readyState === WebSocket.OPEN) peer.send(JSON.stringify(event));
    }
  });
  socket.on("close", () => leave(socket));
  socket.on("error", () => leave(socket));
  // Attach every listener before advertising readiness so a fast client cannot
  // send its join frame into the small connection-setup window.
  socket.send(JSON.stringify({ type: "ready", transport: "websocket" }));
});

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
  if (pathname === "/api/ws") {
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
    return;
  }
  void handleNextUpgrade(request, socket, head).catch(() => socket.destroy());
});

server.listen(port, () => {
  console.log(`> Chalkie ready at http://localhost:${port} (${dev ? "development" : "production"}, WebSocket enabled)`);
});
