import { experimental_upgradeWebSocket, type WebSocketData } from "@vercel/functions";
import { joinSession, pong, registerSocket, relayEvent, unregisterSocket } from "@/lib/realtime-hub";

export const runtime = "nodejs";
export const maxDuration = 300;

type ClientEvent =
  | { type: "join"; sessionId: string; clientId: string }
  | { type: "timeline" | "pointer" | "interrupt" | "voice_query" | "generation"; segmentId?: string; targetIds?: string[]; action?: string; question?: string; stage?: string; message?: string }
  | { type: "ping" };

export function GET() {
  return experimental_upgradeWebSocket((ws) => {
    // Keep registration and listener attachment synchronous so an immediate join is never lost.
    registerSocket(ws);

    ws.on("message", (data: WebSocketData) => {
      let payload: ClientEvent;
      try { payload = JSON.parse(data.toString()) as ClientEvent; }
      catch { return; }

      if (payload.type === "join") {
        if (typeof payload.sessionId === "string" && typeof payload.clientId === "string") joinSession(ws, payload.sessionId, payload.clientId);
        return;
      }
      if (payload.type === "ping") { pong(ws); return; }
      if (["timeline", "pointer", "interrupt", "voice_query", "generation"].includes(payload.type)) relayEvent(ws, payload);
    });

    const close = () => unregisterSocket(ws);
    ws.on("close", close);
    ws.on("error", close);
  });
}
