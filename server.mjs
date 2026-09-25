import next from "next";
import { attachRealtimeServer, RealtimeHttpServer } from "./lib/realtime-server.mjs";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const server = new RealtimeHttpServer();
const app = next({ dev, hostname, port, httpServer: server });

await app.prepare();

const handle = app.getRequestHandler();
server.on("request", (request, response) => handle(request, response));
attachRealtimeServer(server);

server.listen(port, "0.0.0.0", () => {
  console.log(`> Chalkie ready on port ${port} (${dev ? "development" : "production"}, WebSocket enabled)`);
});
