// Origins types - external messaging channel integrations

export type OriginType = "telegram";

export type OriginStatus = "stopped" | "starting" | "running" | "error";

export interface TelegramOriginConfig {
  /** Bot token from @BotFather (encrypted at rest) */
  botToken: string;
  /** Password for owner authentication (encrypted at rest) */
  ownerPassword: string;
  /** Telegram chat ID of the linked owner (null = not yet linked) */
  ownerChatId: number | null;
  /** Model ID for AI responses (e.g., 'anthropic/claude-sonnet-4-20250514') */
  model: string;
  /** System prompt for Telegram responses */
  systemPrompt: string;
  /** Auto-start bot when app launches */
  enabled: boolean;
  /** Permanent chat session ID in database */
  sessionId: string | null;
}

export interface OriginsPreferences {
  telegram?: TelegramOriginConfig;
}

/** Status event sent from main to renderer */
export interface OriginStatusEvent {
  origin: OriginType;
  status: OriginStatus;
  error?: string;
  botUsername?: string;
}

export const DEFAULT_TELEGRAM_CONFIG: TelegramOriginConfig = {
  botToken: "",
  ownerPassword: "",
  ownerChatId: null,
  model: "",
  systemPrompt:
    "You are a helpful AI assistant responding via Telegram. Be concise and clear. Format code blocks with triple backticks.",
  enabled: false,
  sessionId: null,
};

export const DEFAULT_ORIGINS_PREFERENCES: OriginsPreferences = {};
