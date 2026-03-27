# Levante Origins - Telegram Integration

## Overview

Levante Origins is an extensible system for connecting external messaging channels to Levante's AI pipeline. The first supported origin is **Telegram**, allowing the app owner to chat with Levante's AI from Telegram while the desktop app is running.

## Architecture

```
Telegram User
    ↓ (message via Bot API)
Telegraf (long-polling)
    ↓
TelegramService (main process)
    ↓ (reuses existing pipeline)
AIService.streamChat()
    ↓
AI Provider (OpenAI, Anthropic, Google, etc.)
    ↓ (response)
TelegramService → formatForTelegram()
    ↓
Telegram User
```

### Key Design Decisions

- **One session per channel**: Telegram has its own permanent chat session, separate from desktop sessions. Origin sessions are filtered from the sidebar.
- **Single owner**: Password-based authentication. The first Telegram user to send the correct password becomes the owner.
- **Transport-agnostic AI**: Reuses `AIService.streamChat()` directly — no new AI logic needed.
- **Desktop-only (MVP)**: The bot runs while the Electron app is open. A future headless server package is planned.

## Features (MVP)

- Text messages with AI responses
- Image/photo support (sent from Telegram to AI vision models)
- Document/file support (text extraction)
- Code blocks formatted with MarkdownV2 (fallback to HTML, then plain text)
- Bot commands: `/model`, `/provider`, `/status`
- Configurable model per origin
- Custom system prompt
- Auto-start with app
- Encrypted bot token and owner password (safeStorage)

## Configuration

Stored in `~/levante/ui-preferences.json` under the `origins` key:

```json
{
  "origins": {
    "telegram": {
      "botToken": "ENCRYPTED:...",
      "ownerPassword": "ENCRYPTED:...",
      "ownerChatId": 123456789,
      "model": "anthropic/claude-sonnet-4-20250514",
      "systemPrompt": "You are a helpful AI assistant...",
      "enabled": true,
      "sessionId": "uuid-of-permanent-session"
    }
  }
}
```

Sensitive fields (`botToken`, `ownerPassword`) are encrypted using Electron's `safeStorage` API via `encryptValue()`/`decryptValue()`.

## Setup Flow

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Go to **Settings > Levante Origins**
3. Paste the bot token and click **Test** to validate
4. Set an owner password
5. Select a model from the dropdown (defaults to last used model)
6. Toggle the bot on
7. Send the password to your bot on Telegram to link as owner
8. Start chatting

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and instructions |
| `/model` | Show current model or change it (`/model openai/gpt-4o`) |
| `/provider` | List configured providers |
| `/status` | Show bot status, model, message count |

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `src/types/origins.ts` | Type definitions and defaults |
| `src/main/services/telegramService.ts` | Bot lifecycle, auth, AI pipeline, formatting |
| `src/main/ipc/originsHandlers.ts` | IPC endpoints (start, stop, status, validate, unlink) |
| `src/preload/api/origins.ts` | Renderer-to-main bridge |
| `src/renderer/hooks/useOrigins.ts` | State management hook |
| `src/renderer/components/settings/OriginsSection.tsx` | Settings UI |

### Modified Files
| File | Change |
|------|--------|
| `src/types/preferences.ts` | Added `origins?: OriginsPreferences` |
| `src/types/database.ts` | Added `'origin-telegram'` to `SessionType` |
| `src/main/services/preferencesService.ts` | Added origins JSON schema |
| `src/main/services/chatService.ts` | Filter origin sessions from sidebar |
| `src/main/lifecycle/initialization.ts` | IPC registration + auto-start |
| `src/main/lifecycle/shutdown.ts` | Graceful bot stop |
| `src/main/types/logger.ts` | Added `'telegram'` log category |
| `src/main/services/logging/logger.ts` | Added telegram CategoryLogger |
| `src/main/services/logging/config.ts` | Added telegram to default config |
| `src/preload/preload.ts` | Added origins API to LevanteAPI |
| `src/renderer/pages/SettingsPage.tsx` | Added OriginsSection |
| `src/renderer/components/settings/index.ts` | Export OriginsSection |
| `vite.main.config.ts` | Telegraf marked as external |
| `forge.config.js` | Telegraf copied to build |

## Bundling

Telegraf is marked as **external** in `vite.main.config.ts` because its internal `undici`/`node-fetch` conflicts with Electron's native `AbortSignal` when bundled. The `forge.config.js` `packageAfterCopy` hook copies telegraf and its dependencies to the packaged app's `node_modules`.

## Authentication Flow

```
1. Owner configures password in Settings
2. Owner starts bot
3. Any Telegram user sends message to bot
4. If no owner linked (ownerChatId === null):
   - Message matches password → Link user as owner
   - Message doesn't match → "Send the owner password"
5. If owner linked:
   - Message from owner → Process with AI
   - Message from anyone else → "This bot is private"
```

## Message Formatting

Telegram has strict MarkdownV2 rules and a 4096-character message limit. The formatting pipeline:

1. Extract code blocks and inline code (preserve as-is)
2. Escape MarkdownV2 special characters in remaining text
3. Restore code blocks
4. Split at paragraph boundaries if > 4096 chars
5. Send with `parse_mode: 'MarkdownV2'`
6. On failure, fallback to HTML → plain text

## Future Plans

- **Headless server package**: Extract core services to run without Electron on Linux servers
- **Additional origins**: Discord, WhatsApp, REST API
- **CLI commands**: Remote configuration via bot commands
- **Multi-user**: Role-based access beyond single owner
