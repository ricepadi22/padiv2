import type { BotProvider, DispatchContext, DispatchResult, ProviderConfigField } from "./types.ts";

interface OpenClawConfig {
  gatewayUrl: string;
  agentId: string;
  apiKey: string;
}

export const openclawProvider: BotProvider = {
  name: "openclaw_gateway",
  label: "OpenClaw Gateway",

  configFields: [
    {
      key: "gatewayUrl",
      label: "Gateway URL",
      type: "text",
      required: true,
      placeholder: "https://gateway.openclaw.io",
    },
    {
      key: "agentId",
      label: "Agent ID",
      type: "text",
      required: true,
      placeholder: "Your OpenClaw agent identifier",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "oc_...",
    },
  ] satisfies ProviderConfigField[],

  validateConfig(config: unknown): string | null {
    if (!config || typeof config !== "object") return "Config must be an object";
    const c = config as Record<string, unknown>;
    if (!c.gatewayUrl || typeof c.gatewayUrl !== "string") return "gatewayUrl is required";
    if (!c.agentId || typeof c.agentId !== "string") return "agentId is required";
    if (!c.apiKey || typeof c.apiKey !== "string") return "apiKey is required";
    try {
      new URL(c.gatewayUrl as string);
    } catch {
      return "gatewayUrl must be a valid URL";
    }
    return null;
  },

  async dispatch(ctx: DispatchContext): Promise<DispatchResult> {
    const config = ctx.bot.providerConfig as OpenClawConfig;

    const payload = {
      event: "message",
      agentId: config.agentId,
      context: {
        roomId: ctx.room.id,
        roomName: ctx.room.name,
        world: ctx.room.world,
        messageId: ctx.message.id,
        messageBody: ctx.message.body,
        authorType: ctx.message.authorType,
        authorDisplayName: ctx.message.authorDisplayName,
        createdAt: ctx.message.createdAt,
      },
      botConfig: ctx.bot.config,
    };

    try {
      const res = await fetch(`${config.gatewayUrl}/dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
          "X-TW-Bot-Id": ctx.bot.id,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: `Gateway returned ${res.status}: ${text}` };
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => null);
        if (data?.reply && typeof data.reply === "string") {
          return { ok: true, replyBody: data.reply };
        }
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Gateway unreachable" };
    }
  },
};
