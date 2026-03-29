import { db } from "../db/client.js";
import { padis } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import type { BotProvider, DispatchContext, DispatchResult } from "./types.ts";

interface PadiLlmConfig {
  padiId: string;
  systemPrompt?: string;
}

interface LlmEnvironment {
  type: "api_key" | "oauth";
  config: {
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    model?: string;
    systemPrompt?: string;
  };
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
): Promise<DispatchResult> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      return { ok: false, error: (err as { error?: { message?: string } })?.error?.message ?? `API returned ${res.status}` };
    }

    const data = await res.json() as { content?: Array<{ text?: string }> };
    const replyBody = data.content?.[0]?.text ?? "";
    if (!replyBody) return { ok: false, error: "Empty response from Claude" };
    return { ok: true, replyBody };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "API call failed" };
  }
}

export const padiLlmProvider: BotProvider = {
  name: "padi_lm",
  label: "Padi LLM (inherits padi environment)",

  // No user-facing config fields — configuration is on the padi itself
  configFields: [],

  validateConfig(config: unknown): string | null {
    if (!config || typeof config !== "object") return "Config must be an object";
    const c = config as Record<string, unknown>;
    if (!c.padiId || typeof c.padiId !== "string") return "padiId is required";
    return null;
  },

  async dispatch(ctx: DispatchContext): Promise<DispatchResult> {
    const config = ctx.bot.providerConfig as unknown as PadiLlmConfig;

    const [padi] = await db
      .select({ llmEnvironment: padis.llmEnvironment })
      .from(padis)
      .where(eq(padis.id, config.padiId))
      .limit(1);

    if (!padi) return { ok: false, error: "Padi not found" };

    const llmEnv = padi.llmEnvironment as LlmEnvironment | null;
    if (!llmEnv) {
      return { ok: false, error: "No LLM environment configured for this padi. Set one in the padi's LLM tab." };
    }

    const model = llmEnv.config.model ?? DEFAULT_MODEL;
    const systemPrompt =
      config.systemPrompt ??
      llmEnv.config.systemPrompt ??
      `You are ${ctx.bot.displayName}, a worker bot in the "${ctx.room.name}" workspace. ` +
      `Be concise and action-oriented. Use the available APIs to complete tasks autonomously.`;

    const userContent =
      `[Message from ${ctx.message.authorDisplayName} (${ctx.message.authorType})]\n${ctx.message.body}`;

    if (llmEnv.type === "api_key") {
      if (!llmEnv.config.apiKey) return { ok: false, error: "LLM environment is missing apiKey" };
      return callClaude(llmEnv.config.apiKey, model, systemPrompt, userContent);
    }

    if (llmEnv.type === "oauth") {
      if (!llmEnv.config.accessToken) return { ok: false, error: "LLM environment OAuth tokens not set" };
      // OAuth uses Bearer token instead of x-api-key
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${llmEnv.config.accessToken}`,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: "user", content: userContent }],
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
          return { ok: false, error: (err as { error?: { message?: string } })?.error?.message ?? `API returned ${res.status}` };
        }

        const data = await res.json() as { content?: Array<{ text?: string }> };
        const replyBody = data.content?.[0]?.text ?? "";
        if (!replyBody) return { ok: false, error: "Empty response from Claude (OAuth)" };
        return { ok: true, replyBody };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "OAuth API call failed" };
      }
    }

    return { ok: false, error: `Unknown LLM environment type: ${(llmEnv as { type?: string }).type}` };
  },
};
