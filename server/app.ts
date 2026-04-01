import express from "express";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/auth.js";
import roomRoutes from "./routes/rooms.js";
import messageRoutes from "./routes/messages.js";
import transitionRoutes from "./routes/transitions.js";
import botRoutes from "./routes/bots.js";
import padiRoutes from "./routes/padis.js";
import ticketRoutes from "./routes/tickets.js";
import inviteRoutes from "./routes/invites.js";

export function createApp() {
  const app = express();

  app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? "http://localhost:5173",
    credentials: true,
  }));

  app.use(morgan("dev"));
  app.use(express.json());

  app.use("/api/auth", authRoutes);
  app.use("/api/rooms", roomRoutes);
  app.use("/api/rooms/:roomId/messages", messageRoutes);
  app.use("/api/transitions", transitionRoutes);
  app.use("/api/bots", botRoutes);
  app.use("/api/padis", padiRoutes);
  app.use("/api/rooms/:roomId/tickets", ticketRoutes);
  app.use("/api/invites", inviteRoutes);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  return app;
}
