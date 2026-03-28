import { createHmac } from "crypto";
import type { BotProvider, DispatchContext, DispatchResult, ProviderConfigField } from "./types.ts";

interface HttpConfig {
  webhookUrl: string;
  secret?: string;
}

export const httpProvider: BotProvider = {
  name: "http",
  label: "HTTP Webhook",

  configFields: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      placeholder: "https://your-bot-server.com/webhook",
    },
    {
      key: "secret",
      label: "Signing Secret (optional)",
      type: "password",
      required: false,
      placeholder: "Used to verify requests via X-TW-Signature header",
    },
  ] satisfies ProviderConfigField[],

  validateConfig(config: unknown): string | null {
    if (!config || typeof config !== "object") return "Config must be an object";
    const c = config as Record<string, unknown>;
    if (!c.webhookUrl || typeof c.webhookUrl !== "string") return "webhookUrl is required";
    try {
      new URL(c.webhookUrl as string);
    } catch {
      return "webhookUrl must be a valid URL";
    }
    return null;
  },

  async dispatch(ctx: DispatchContext): Promise<DispatchResult> {
    const config = ctx.bot.providerConfig as HttpConfig;

    if (!config.webhookUrl) {
      return { ok: false, error: "webhookUrl not configured" };
    }

    const body = JSON.stringify(ctx);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-TW-Bot-Id": ctx.bot.id,
      "X-TW-Room-Id": ctx.room.id,
      "X-TW-Message-Id": ctx.message.id,
    };

    if (config.secret) {
      const sig = createHmac("sha256", config.secret).update(body).digest("hex");
      headers["X-TW-Signature"] = `sha256=${sig}`;
    }

    try {
      const res = await fetch(config.webhookUrl, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { ok: false, error: `Webhook returned ${res.status}` };
      }

      // If the webhook returns a JSON body with a reply field, treat it as an inline reply
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => null);
        if (data?.reply && typeof data.reply === "string") {
          return { ok: true, replyBody: data.reply };
        }
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Fetch failed" };
    }
  },
};
