import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { db } from "../db/client.js";
import { users, padis } from "../db/schema/index.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password, displayName } = parsed.data;

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, displayName }).returning();
  const token = signToken(user!);
  setTokenCookie(res, token);
  res.status(201).json({ user: safeUser(user!), token });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken(user);
  setTokenCookie(res, token);
  res.json({ user: safeUser(user), token });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("tw_token", { path: "/" });
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: safeUser(user) });
});

router.patch("/me", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const schema = z.object({
    displayName: z.string().min(2).optional(),
    bio: z.string().optional(),
    avatarUrl: z.string().url().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [updated] = await db.update(users).set({ ...parsed.data, updatedAt: new Date() }).where(eq(users.id, req.user.id)).returning();
  res.json({ user: safeUser(updated!) });
});

// ─── Anthropic OAuth ──────────────────────────────────────────────────────────
// Stores PKCE verifier keyed by state to survive the redirect round-trip
const pendingOAuth = new Map<string, { padiId: string; codeVerifier: string }>();

router.get("/anthropic", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const padiId = req.query.padiId as string | undefined;
  if (!padiId) { res.status(400).json({ error: "padiId is required" }); return; }

  const clientId = process.env.ANTHROPIC_OAUTH_CLIENT_ID;
  if (!clientId) {
    res.status(501).json({ error: "Anthropic OAuth not configured. Set ANTHROPIC_OAUTH_CLIENT_ID and ANTHROPIC_OAUTH_CLIENT_SECRET." });
    return;
  }

  // PKCE
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const state = randomBytes(16).toString("hex");

  pendingOAuth.set(state, { padiId, codeVerifier });
  // Auto-expire after 10 minutes
  setTimeout(() => pendingOAuth.delete(state), 10 * 60 * 1000);

  const redirectUri = `${process.env.API_BASE_URL ?? "http://localhost:3200"}/api/auth/anthropic/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "org:read api:inference",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  res.redirect(`https://claude.ai/oauth/authorize?${params.toString()}`);
});

router.get("/anthropic/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  const frontendBase = process.env.FRONTEND_URL ?? "http://localhost:5173";

  if (error) {
    res.redirect(`${frontendBase}/?oauth_error=${encodeURIComponent(error)}`);
    return;
  }
  if (!code || !state) {
    res.redirect(`${frontendBase}/?oauth_error=missing_params`);
    return;
  }

  const pending = pendingOAuth.get(state);
  if (!pending) {
    res.redirect(`${frontendBase}/?oauth_error=invalid_state`);
    return;
  }
  pendingOAuth.delete(state);

  const clientId = process.env.ANTHROPIC_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.ANTHROPIC_OAUTH_CLIENT_SECRET!;
  const redirectUri = `${process.env.API_BASE_URL ?? "http://localhost:3200"}/api/auth/anthropic/callback`;

  try {
    const tokenRes = await fetch("https://api.anthropic.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: pending.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Anthropic token exchange failed:", err);
      res.redirect(`${frontendBase}/?oauth_error=token_exchange_failed`);
      return;
    }

    const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number };

    // Store tokens in padi's llmEnvironment
    await db.update(padis).set({
      llmEnvironment: {
        type: "oauth",
        config: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
        },
      },
      updatedAt: new Date(),
    }).where(eq(padis.id, pending.padiId));

    res.redirect(`${frontendBase}/worlds/higher?oauth_success=1&padiId=${pending.padiId}`);
  } catch (err) {
    console.error("Anthropic OAuth callback error:", err);
    res.redirect(`${frontendBase}/?oauth_error=server_error`);
  }
});

function signToken(user: typeof users.$inferSelect) {
  return jwt.sign({ sub: user.id, email: user.email, displayName: user.displayName, role: user.role, type: "user" }, process.env.JWT_SECRET!, { expiresIn: "7d" });
}

function setTokenCookie(res: import("express").Response, token: string) {
  res.cookie("tw_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function safeUser(user: typeof users.$inferSelect) {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

export default router;
