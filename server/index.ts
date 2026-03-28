import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app.js";
import { setupWebSocketServer } from "./realtime/ws.js";

const PORT = Number(process.env.PORT) || 3200;

const app = createApp();
const server = createServer(app);
setupWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`Three Worlds server running on http://localhost:${PORT}`);
});
