# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
pnpm install                # Install dependencies
pnpm dev                   # Run app in development mode
pnpm build                 # Production build (includes typecheck)
pnpm typecheck             # Type checking only
pnpm lint                  # ESLint checking
pnpm lint:fix              # Auto-fix ESLint issues
pnpm test                  # Run Vitest unit tests
pnpm test:ui               # Run Vitest with UI
pnpm test:e2e              # Run Playwright E2E tests
pnpm package               # Create installers per OS platform
```

## Architecture Overview

Levante is an Electron-based desktop AI chat application with multi-provider support. The architecture follows **Hexagonal Architecture** principles with clear separation between layers:

### Core Structure
- **Main Process** (`src/main/`): Node.js backend with services and IPC handlers
- **Preload** (`src/preload/`): Secure bridge between main and renderer processes
- **Renderer** (`src/renderer/`): React frontend with TypeScript

### Key Technologies
- **Platform**: Electron with secure IPC using `levante/*` namespace
- **Frontend**: React + TypeScript with shadcn/ui components and Tailwind CSS
- **State Management**: Zustand for global state (chat, models, preferences)
- **AI Integration**: Vercel AI SDK with multi-provider support
- **Database**: SQLite with schema migrations
- **Storage**: electron-store for encrypted preferences at `~/levante/`

### Multi-Provider AI System

The application supports multiple AI providers through a unified architecture:

**Supported Providers:**
- **OpenRouter**: Public model listing (API key optional), supports 500+ models
- **Vercel AI Gateway**: Custom gateway with model filtering
- **Local**: Ollama-compatible endpoints
- **Cloud**: Direct provider APIs (OpenAI, Anthropic, Google)

**Provider Architecture:**
```
ModelStore (Zustand) → ModelService → ModelFetchService → IPC → Main Process → External APIs
```

**Endpoint Handling:**
- OpenRouter: `/api/v1/models` for listing, `/api/v1` for inference
- Vercel Gateway: `/v1/models` for listing, `/v1/ai` for inference
- API keys stored securely in electron-store with encryption

## Database Schema

SQLite database with migrations in `database/migrations/`:
- `chat_sessions`: Session management with model tracking
- `messages`: Message storage with streaming support
- Schema version tracking for migrations

## Configuration Storage

All configuration is stored in `~/levante/` directory with **automatic encryption**:

**Files:**
- `ui-preferences.json` - UI settings, providers (with encrypted API keys), theme, language
- `user-profile.json` - User profile, wizard status, personalization
- `.encryption-key` - Encrypted encryption key (managed by Electron's safeStorage)
- `.config-version` - Migration version tracker

**Key Features:**
- **Encryption:** All config files encrypted using electron-store + safeStorage API
- **Migrations:** Automatic schema migrations with semantic versioning
- **Type-safe:** Full TypeScript support with JSON schema validation
- **Services:** `PreferencesService` and `UserProfileService` manage access

**Storage Architecture:**
```
~/levante/
├── ui-preferences.json      (encrypted) → theme, language, providers, ai config
├── user-profile.json        (encrypted) → wizard, personalization
├── .encryption-key          (OS-protected) → AES-256 key
└── .config-version          (plaintext) → "1.1.0"
```

**Migration System:**
- Version-controlled schema updates in `ConfigMigrationService`
- Runs automatically on app start before service initialization
- Example: Migration 1.0 → 1.1 moved theme/language between files

**For detailed information:** See [Configuration Storage Guide](docs/guides/configuration-storage.md)

## IPC Communication

All IPC uses the `levante/*` namespace with structured responses:

**Chat:**
- `levante/chat/stream` → Streaming chat responses
- `levante/chat/send` → Single message requests

**Models:**
- `levante/models/openrouter` → Fetch OpenRouter models
- `levante/models/gateway` → Fetch Gateway models
- `levante/models/local` → Discover local models

**Preferences:**
- `levante/preferences/get|set|getAll` → Settings management

**Logging:**
- `levante/logger/log` → Send log messages from renderer to main
- `levante/logger/isEnabled` → Check if category/level is enabled
- `levante/logger/configure` → Update logger configuration

## State Management with Zustand

**ChatStore** (`src/renderer/stores/chatStore.ts`):
- Current chat state, streaming messages, session management
- Database message handling with pagination

**ModelStore** (`src/renderer/stores/modelStore.ts`):
- Provider configuration, model synchronization
- Bulk and individual model selection
- Real-time updates across UI components

## Component Architecture

**Pages:**
- `ChatPage`: Main chat interface with model selection
- `ModelPage`: Provider configuration and model management
- `SettingsPage`: Application preferences

**AI Components** (`src/renderer/components/ai-elements/`):
- `prompt-input`: Chat input with model selector
- `message`: Message display with streaming support
- `code-block`: Syntax highlighted code blocks

## Security & CSP

Content Security Policy configured in `src/renderer/index.html`:
```html
script-src 'self' 'unsafe-inline' blob:; worker-src 'self' blob:;
```

This allows Vite workers in development while maintaining security.

## Model Management System

**Configuration Storage:**
- Preferences saved to `ui-preferences.json` with encryption
- Model lists cached locally for offline access
- API keys stored securely per provider

**Dynamic vs User-Defined Models:**
- **Dynamic**: Fetched from provider APIs (OpenRouter, Gateway)
- **User-Defined**: Manually configured (Local, Cloud providers)

**Model Selection Flow:**
1. Select Active Provider
2. Configure API keys/endpoints
3. Sync models from provider
4. Select which models appear in chat
5. Models available across all chat sessions

## Development Patterns

**Renderer Alias:**
Use `@` alias for imports within `src/renderer`:
```typescript
import { modelService } from '@/services/modelService';
import { Button } from '@/components/ui/button';
```

**Error Handling:**
- IPC responses use `{ success: boolean; data?: T; error?: string }` pattern
- Zustand stores handle async operations with loading/error states
- UI displays errors using shadcn/ui Alert components

**State Updates:**
- Use Zustand actions for state modifications
- Avoid direct state mutation
- UI components subscribe to specific store slices for performance

## Environment Configuration

Environment variables loaded from:
1. `.env.local` (highest priority, git-ignored)
2. `.env` (committed defaults)

**API Keys:**
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`

**Logging Configuration:**
- `DEBUG_ENABLED` → Master switch for all debug logging
- `DEBUG_AI_SDK` → AI service operations and streaming
- `DEBUG_MCP` → MCP server management and tools  
- `DEBUG_DATABASE` → Database operations and migrations
- `DEBUG_IPC` → Inter-process communication
- `DEBUG_PREFERENCES` → Settings and configuration
- `DEBUG_CORE` → Application lifecycle and errors
- `LOG_LEVEL` → Minimum log level (debug|info|warn|error)

## Testing Strategy

- **Unit/Integration**: Vitest for services and utilities
- **E2E**: Playwright for complete user flows
- **Manual Testing**: Development mode with DevTools enabled

## Build System

- **Bundler**: electron-vite with Vite for renderer, esbuild for main/preload
- **TypeScript**: Strict mode with separate configs for main and preload processes
- **Assets**: Icons and resources in `resources/` directory
- **Output**: Built files in `out/` directory for development, `dist-electron/` for distribution
- no realices comprobaciones con pnpm dev, se realizaran manualmente

## Logging System

Levante uses a centralized logging system for better development experience and debugging:

### Usage

```typescript
// Main Process
import { getLogger } from './services/logging';
const logger = getLogger();

// Renderer Process  
import { logger } from '@/services/logger';

// Usage examples
logger.aiSdk.debug('Model provider loaded', { provider: 'openai' });
logger.mcp.info('Server started', { serverId: 'filesystem' });
logger.database.error('Migration failed', { error: error.message });
logger.core.info('Application initialized');
```

### Categories

- **ai-sdk**: AI service operations, model interactions, streaming
- **mcp**: MCP server management, tool execution, health monitoring  
- **database**: Database operations and migrations
- **ipc**: Inter-process communication
- **preferences**: Settings and configuration management
- **core**: General application lifecycle and errors

### Configuration

Control logging via `.env.local`:

```bash
DEBUG_ENABLED=true
DEBUG_AI_SDK=true
DEBUG_MCP=true
DEBUG_DATABASE=false
DEBUG_IPC=false
DEBUG_PREFERENCES=false
DEBUG_CORE=true
LOG_LEVEL=debug
```

See [docs/LOGGING.md](docs/LOGGING.md) for complete documentation.
- No utilices pnpm dev