import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { bots } from "../db/schema/index.js";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  botId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Path 1: Hash-based API key via X-TW-Bot-Key header
  const rawKey = req.headers["x-tw-bot-key"] as string | undefined;
  if (rawKey) {
    const hash = createHash("sha256").update(rawKey).digest("hex");
    const [bot] = await db.select({ id: bots.id, status: bots.status })
      .from(bots)
      .where(eq(bots.apiKeyHash, hash))
      .limit(1);

    if (bot && bot.status === "active") {
      req.botId = bot.id;
      next();
      return;
    }
    res.status(401).json({ error: "Invalid bot API key" });
    return;
  }

  // Path 2: JWT (human user or bot JWT)
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      sub: string;
      email: string;
      displayName: string;
      role: string;
      type: string;
      botId?: string;
    };
    if (payload.type === "bot") {
      req.botId = payload.botId;
    } else {
      req.user = { id: payload.sub, email: payload.email, displayName: payload.displayName, role: payload.role };
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireHuman(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(403).json({ error: "Human users only" });
    return;
  }
  next();
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|; )tw_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]!);
  }
  return null;
}
