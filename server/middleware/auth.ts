import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string; email: string; displayName: string; role: string; type: string; botId?: string };
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
