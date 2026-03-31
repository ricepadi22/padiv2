import type { BotProvider, DispatchContext, DispatchResult } from "./types.ts";

// Poll provider: bot pulls messages via REST on its own schedule.
// The server does not dispatch — returning ok:true means "bot will pick this up".
export const pollProvider: BotProvider = {
  name: "poll",
  label: "HTTP Polling (bot pulls)",
  configFields: [],

  validateConfig(_config: unknown): string | null {
    return null;
  },

  async dispatch(_ctx: DispatchContext): Promise<DispatchResult> {
    // Bot is responsible for polling — nothing to push
    return { ok: true };
  },
};
