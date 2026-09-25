import { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const REALTIME_UPGRADE_EVENT = "chalkie:upgrade";

/**
 * The HTTP server owns upgrade dispatch. Next registers its own upgrade listener
 * lazily on the first HTTP request, so two ordinary listeners cannot safely share
 * /api/ws: Next sees a matching app route and closes the already upgraded socket.
 * Use the public Node EventEmitter boundary to deliver our endpoint exclusively;
 * every other event/path continues through Node's normal listener dispatch.
 */
export class RealtimeHttpServer extends Server {
  constructor(...args) {
    super(...args);
    // Node only emits an upgrade when an ordinary listener exists. Keep the
    // protocol enabled even before Next handles its first HTTP request.
    this.on("upgrade", (_request, socket) => {
      if (this.listenerCount("upgrade") === 1) socket.destroy();
    });
  }
  emit(event, ...args) {
    if (event === "upgrade") {
      const [request, socket] = args;
      let pathname;
      try { pathname = new URL(request.url || "/", "http://localhost").pathname; }
      catch { socket.destroy(); return true; }
      if (pathname === "/api/ws") return super.emit(REALTIME_UPGRADE_EVENT, ...args);
    }
    return super.emit(event, ...args);
  }
}

// This socket carries Chalkie's playback/status events. Provider API keys stay
// on the server and are never included in messages relayed to another client.
export function attachRealtimeServer(server, { heartbeatMs = 30000 } = {}) {
  if (!(server instanceof RealtimeHttpServer)) throw new TypeError("Realtime requires a RealtimeHttpServer for exclusive upgrade routing");
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  const sessions = new Map();
  const alive = new WeakSet();

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
    alive.add(socket);
    socket.on("pong", () => alive.add(socket));
    socket.on("message", (raw) => {
      let event;
      try { event = JSON.parse(raw.toString()); }
      catch { return; }
      if (!event || typeof event !== "object" || Array.isArray(event)) return;
      if (event.type === "join" && typeof event.sessionId === "string" && event.sessionId.trim()) {
        leave(socket);
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
      const payload = { type: event.type, sessionId };
      for (const field of ["segmentId", "action", "question", "stage", "message"]) {
        if (typeof event[field] === "string") payload[field] = event[field].slice(0, 4000);
      }
      if (Array.isArray(event.targetIds)) payload.targetIds = event.targetIds.filter((id) => typeof id === "string").slice(0, 200).map((id) => id.slice(0, 120));
      for (const [peer, joined] of sessions) {
        if (peer !== socket && joined === sessionId && peer.readyState === WebSocket.OPEN) peer.send(JSON.stringify(payload));
      }
    });
    socket.on("close", () => leave(socket));
    socket.on("error", () => leave(socket));
    // Listen before advertising readiness so an immediate join cannot be lost.
    socket.send(JSON.stringify({ type: "ready", transport: "websocket" }));
  });

  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!alive.has(socket)) { socket.terminate(); continue; }
      alive.delete(socket);
      socket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();
  sockets.on("close", () => clearInterval(heartbeat));
  server.on("close", () => {
    clearInterval(heartbeat);
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
  });
  server.on(REALTIME_UPGRADE_EVENT, (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
  });
  return sockets;
}
