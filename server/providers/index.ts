import { httpProvider } from "./http.ts";
import { openclawProvider } from "./openclaw_gateway.ts";
import { claudeApiProvider } from "./claude_api.ts";
import { claudeLocalProvider } from "./claude_local.ts";
import { padiLlmProvider } from "./padi_lm.ts";
import { websocketProvider } from "./websocket.ts";
import type { BotProvider } from "./types.ts";

export type { BotProvider, DispatchContext, DispatchResult, ProviderConfigField } from "./types.ts";

export const PROVIDER_NAMES = ["http", "openclaw_gateway", "claude_api", "claude_local", "padi_lm", "websocket"] as const;
export type ProviderName = typeof PROVIDER_NAMES[number];

const registry = new Map<string, BotProvider>([
  [httpProvider.name, httpProvider],
  [openclawProvider.name, openclawProvider],
  [claudeApiProvider.name, claudeApiProvider],
  [claudeLocalProvider.name, claudeLocalProvider],
  [padiLlmProvider.name, padiLlmProvider],
  [websocketProvider.name, websocketProvider],
]);

export function getProvider(name: string): BotProvider | null {
  return registry.get(name) ?? null;
}

export function listProviders() {
  return Array.from(registry.values()).map((p) => ({
    name: p.name,
    label: p.label,
    configFields: p.configFields,
  }));
}
