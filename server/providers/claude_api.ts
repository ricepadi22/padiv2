import type { BotProvider, DispatchContext, DispatchResult, ProviderConfigField } from "./types.ts";

interface ClaudeConfig {
  apiKey: string;
  model?: string;
  systemPrompt?: string;
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export const claudeApiProvider: BotProvider = {
  name: "claude_api",
  label: "Claude API",

  configFields: [
    {
      key: "apiKey",
      label: "Anthropic API Key",
      type: "password",
      required: true,
      placeholder: "sk-ant-...",
    },
    {
      key: "model",
      label: "Model",
      type: "select",
      required: false,
      options: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"],
    },
    {
      key: "systemPrompt",
      label: "System Prompt",
      type: "textarea",
      required: false,
      placeholder: "You are a helpful assistant in the Three Worlds collaboration space...",
    },
  ] satisfies ProviderConfigField[],

  validateConfig(config: unknown): string | null {
    if (!config || typeof config !== "object") return "Config must be an object";
    const c = config as Record<string, unknown>;
    if (!c.apiKey || typeof c.apiKey !== "string") return "apiKey is required";
    if (!c.apiKey.startsWith("sk-ant-")) return "apiKey must be a valid Anthropic API key (sk-ant-...)";
    return null;
  },

  async dispatch(ctx: DispatchContext): Promise<DispatchResult> {
    const config = ctx.bot.providerConfig as ClaudeConfig;
    const model = config.model ?? DEFAULT_MODEL;

    const systemPrompt = config.systemPrompt ??
      `You are ${ctx.bot.displayName}, an AI agent in the ${ctx.room.world} world of a collaboration space called Three Worlds. ` +
      `You are in room "${ctx.room.name}". Respond concisely and helpfully.`;

    const userContent =
      `[Message from ${ctx.message.authorDisplayName} (${ctx.message.authorType})]\n${ctx.message.body}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
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
        return { ok: false, error: err?.error?.message ?? `API returned ${res.status}` };
      }

      const data = await res.json();
      const replyBody: string = data.content?.[0]?.text ?? "";
      if (!replyBody) return { ok: false, error: "Empty response from Claude API" };

      return { ok: true, replyBody };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "API call failed" };
    }
  },
};
