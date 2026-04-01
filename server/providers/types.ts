export interface DispatchContext {
  bot: {
    id: string;
    displayName: string;
    providerConfig: Record<string, unknown>;
    config: Record<string, unknown>;
  };
  room: {
    id: string;
    name: string;
    world: string;
  };
  message: {
    id: string;
    body: string;
    authorType: string;
    authorDisplayName: string;
    authorBotId?: string;
    createdAt: string;
    mentionedBotIds: string[];
  };
}

export interface DispatchResult {
  ok: boolean;
  error?: string;
  // If the provider generates a reply inline (e.g. claude_api), include it here
  replyBody?: string;
}

export interface ProviderConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "textarea" | "select";
  required: boolean;
  placeholder?: string;
  options?: string[]; // for select type
}

export interface BotProvider {
  name: string;
  label: string;
  configFields: ProviderConfigField[];
  validateConfig(config: unknown): string | null;
  dispatch(ctx: DispatchContext): Promise<DispatchResult>;
}
