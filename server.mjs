import { createServer } from "node:http";
import next from "next";
import { attachRealtimeServer } from "./lib/realtime-server.mjs";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const app = next({ dev, hostname, port });

await app.prepare();

const handle = app.getRequestHandler();
const handleNextUpgrade = app.getUpgradeHandler();
const server = createServer((request, response) => handle(request, response));
attachRealtimeServer(server, handleNextUpgrade);

server.listen(port, "0.0.0.0", () => {
  console.log(`> Chalkie ready on port ${port} (${dev ? "development" : "production"}, WebSocket enabled)`);
});
