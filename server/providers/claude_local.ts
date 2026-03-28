import { spawn } from "child_process";
import type { BotProvider, DispatchContext, DispatchResult, ProviderConfigField } from "./types.ts";

interface ClaudeLocalConfig {
  model?: string;
  systemPrompt?: string;
}

export const claudeLocalProvider: BotProvider = {
  name: "claude_local",
  label: "Claude (OAuth)",

  configFields: [
    {
      key: "model",
      label: "Model",
      type: "select",
      required: false,
      options: ["sonnet", "opus", "haiku"],
    },
    {
      key: "systemPrompt",
      label: "System Prompt",
      type: "textarea",
      required: false,
      placeholder: "You are a helpful assistant in the Three Worlds collaboration space...",
    },
  ] satisfies ProviderConfigField[],

  validateConfig(_config: unknown): string | null {
    return null;
  },

  async dispatch(ctx: DispatchContext): Promise<DispatchResult> {
    const config = ctx.bot.providerConfig as ClaudeLocalConfig;

    const systemPrompt =
      config.systemPrompt ??
      `You are ${ctx.bot.displayName}, an AI agent in the ${ctx.room.world} world of a collaboration space called Three Worlds. ` +
        `You are in room "${ctx.room.name}". Respond concisely and helpfully.`;

    const userMessage = `[Message from ${ctx.message.authorDisplayName} (${ctx.message.authorType})]\n${ctx.message.body}`;

    const args = [
      "-p", userMessage,
      "--system-prompt", systemPrompt,
      "--output-format", "text",
      "--no-session-persistence",
      "--tools", "",
    ];
    if (config.model) args.push("--model", config.model);

    return new Promise<DispatchResult>((resolve) => {
      let output = "";
      let errOutput = "";
      let settled = false;

      const proc = spawn("claude", args, { env: process.env, stdio: "pipe" });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill();
        resolve({ ok: false, error: "claude_local timed out after 60s" });
      }, 60_000);

      proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { errOutput += chunk.toString(); });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        if (code !== 0) {
          resolve({ ok: false, error: errOutput.trim() || `claude exited with code ${code}` });
        } else {
          const reply = output.trim();
          if (!reply) resolve({ ok: false, error: "Empty response from claude" });
          else resolve({ ok: true, replyBody: reply });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: err.message });
      });
    });
  },
};
