# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

The project uses pnpm as the package manager. Based on the README and build documentation:

```bash
pnpm install                # Install dependencies
pnpm dev                   # Run app in development mode
pnpm build                 # Production build
pnpm package              # Create installers per OS platform
```

Note: No actual package.json was found yet - this is an early-stage project with mostly documentation.

## Testing

From docs/TESTING.md, the project will use:
- **Unit/Integration Tests**: Vitest/Jest + ts-node/tsx for DB, AI, and MCP services with mocks
- **E2E Tests**: Playwright on dev packaging for complete user flows
- **Performance Tests**: Node scripts for cold start and response times
- **Security Tests**: Focus on keychain, encryption, and MCP permissions

## Architecture Overview

Levante follows **Hexagonal Architecture** (Ports & Adapters pattern) as defined in ADR 0005:

### Core Layers
- **Domain**: Core business entities (Session, Message, MCPServer, MCPTool, Provider, Model) and policies
- **Application**: Use cases and ports (`ChatPort`, `MCPPort`, `SearchPort`, `SettingsPort`) 
- **Adapters**: Infrastructure adapters (DB, AI SDK, MCP, Keychain) and UI (React + Electron)

### Key Technologies
- **Platform**: Electron (Main/Preload/Renderer) with secure IPC
- **Frontend**: React + TypeScript with context isolation
- **AI**: AI SDK for multi-provider support (OpenAI, Anthropic, OpenRouter, Google, etc.)
- **Database**: SQLite with Turso compatibility for local storage
- **MCP**: Model Context Protocol for tool invocation with consent + audit
- **Security**: Keychain integration, encrypted secrets, sandboxed renderer

### Data Flow
React UI → Preload API (validated) → Application port → Infrastructure adapter → External service (AI/MCP/DB) → back through port → UI render

## Database Schema

The SQLite database (see docs/DB/MIGRATIONS/0001_init.sql) includes:
- `chat_sessions`: Chat session management with model and folder organization
- `messages`: Message storage with role, content, and tool invocation tracking  
- `providers` & `models`: AI provider and model configuration
- `mcp_servers` & `mcp_tools`: MCP server registration and tool definitions
- `settings`: Application settings key-value store

## IPC Contracts

Electron IPC uses `levante/*` namespace:
- `levante/chat/send` → streams `{ delta?, done?, error? }`
- `levante/mcp/invoke` → returns `{ output }`
- `levante/db/searchText` → returns `{ items: Array<{id, snippet, score}> }`

## MCP Integration

Model Context Protocol integration focuses on:
- **Server Registration**: Add by URL/manifest, local discovery, or profile import
- **Consent & Permissions**: Per-server/tool consent with risk descriptions and audit trails
- **Execution**: Isolated processes with timeouts, limits, and robust error handling
- **UX**: Non-technical friendly interface with tool suggestions and invocation traces

## Project Status

This is an early-stage project (post-initial commit) focused on building a cross-platform desktop AI application. The codebase currently contains comprehensive documentation and architecture decisions, but implementation is just beginning.

## Key Design Principles

- **Privacy by default**: All data stored locally, only AI provider calls leave device
- **Security first**: Context isolation, sandboxed renderer, strict IPC schemas, keychain secrets
- **User consent**: Explicit one-click consent for all MCP tool invocations
- **Multi-provider**: Flexible AI provider switching through unified AI SDK interface
- **Testability**: Hexagonal architecture enables easy mocking and testing of all components
- utiliza el alias "@" cuando estamos dentro de ./src/renderer