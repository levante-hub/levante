## PRD — Desktop Chat + MCP (Levante)

### Executive Summary
Levante is a friendly, private desktop chat app that brings AI tools closer to everyone, not just technical users. It emphasizes clarity and safety: a guided experience, simple language, transparent permissions for tools, and local‑first storage so your conversations stay on your device. It runs on Windows, macOS, and Linux and lets you choose among different AI providers. RAG is out of scope for the MVP.

Reference for local DB: [Turso — The next evolution of SQLite](https://turso.tech/).

### Key Features
- Local and cloud provider model: choose between on‑device/local models (when available) and cloud providers; switch easily per session.
- Model Context Protocol Store (MCP Store): browse, add, and manage tool servers in a built‑in catalog; invoke tools with clear, one‑click consent.
- Privacy by default: all data (sessions, messages, settings) is stored locally; only calls to cloud AI providers leave your device.

### Goals
- Simple, guided chat experience for non‑technical users.
- MCP integration with explicit consent and audit trail.
- Multi‑provider/model support via AI SDK; easy switching.
- Local storage of history and settings; privacy by default.

### Users
- End users (non‑technical), power users/admins, product/dev team.

### Scope v1 (MVP)
- Unified chat (text) with streaming responses.
- Provider/model registration and selection from UI.
- Basic MCP: register MCP servers, list tools, invoke with consent.
- Local persistence: sessions, messages, settings.
- Text search in history (no RAG).
- API keys stored in OS keychain.
- Installers for Win/macOS/Linux; auto‑update.

### Out of Scope (MVP)
- Voice (TTS/STT), real‑time meetings.
- Cloud sync/collaboration.
- Fine‑tuning.
- RAG: document indexing/embeddings and semantic similarity.

### Functional Requirements
- Onboarding and Settings
  - First‑run wizard: language, theme, provider setup, API key storage, MCP server registration.
  - Settings: providers, models, usage/cost limits, privacy.

- Chat
  - Roles user/assistant, Markdown rendering with code and citations.
  - Streaming, retry/regenerate, edit‑and‑resend.
  - Change model per session or per message.

- MCP
  - Register/discover MCP servers, list tools/scopes.
  - Consent per tool/server; audit invocations.
  - Execute tools with visible IO and error handling.

- AI Models (AI SDK)
  - Multiple providers (OpenAI, Anthropic, OpenRouter, Google, etc.).
  - Session system prompts configurable.

- History
  - Session list, folders/tags (optional).
  - Text search across messages.

- Import/Export
  - Export sessions (JSON/Markdown) and settings.

### Non‑Functional Requirements
- UX simplicity, performance (cold start < 3s typical hardware), secure by default.
- Privacy: local‑first; no cloud unless calling AI providers.
- Secrets in OS keychain; optional field‑level encryption for sensitive data.
- Telemetry opt‑in and fully disableable.
- Accessibility (keyboard, contrast, scalable fonts).
- i18n: EN/ES initial, architecture ready for more.

### High‑Level Architecture (Hexagonal)
- Electron Main (Application + Infrastructure)
  - Window manager, updates, IPC, adapters for DB/AI/MCP/Keychain.
- Preload (Adapters)
  - `contextBridge` exposing minimal, validated APIs.
- React Renderer (UI)
  - Presenters/views consuming application ports over IPC.
- Persistence: SQLite (Turso compatible).
- Updates: `electron-updater` (stable/beta channels).

### Data Model (initial)
- See `docs/DB/MIGRATIONS/0001_init.sql` for schema. MVP will use sessions/messages/settings only; future RAG migrations will be introduced separately.

### Main Flows
- Onboarding → first session creation.
- Chat send/stream/save → optional MCP invocation with consent.

### Integrations
- AI SDK for providers, MCP for tools, SQLite local with Turso ref: [Turso](https://turso.tech/).

### Success Metrics (MVP)
- Activation time to first message < 5 minutes.
- Weekly retention ≥ 30%.
- MCP invocation success ≥ 90%.
- Median response latency (excluding provider) < 2s.

### Roadmap
- Milestone 1: Foundations (Electron + React, local DB, sessions/messages).
- Milestone 2: Multi‑model + streaming.
- Milestone 3: MCP basic (consent + audit).
- Milestone 4 (Post‑MVP): RAG.
- Milestone 5: Packaging + auto‑update.

### Risks & Mitigations
- Cross‑platform build complexity → CI matrices and supported targets.
- Provider API changes → abstraction via AI SDK and versioned mappings.
- Privacy/security → keychain, field encryption optional, telemetry opt‑in.

### Acceptance Criteria
- Installers for Win/macOS/Linux signed/verifiable.
- Onboarding stores secrets in keychain.
- Stable chat with streaming and model switching.
- MCP: list and invoke at least one server with consent + audit.
- Local DB with sessions/messages; text search works.

### Test Plan (high‑level)
- Unit: DB services, AI clients, MCP layer.
- Integration: chat flow, MCP invocation, migrations.
- E2E: onboarding → first chat → invoke MCP.
- Performance: cold start, response latency.
- Security: keychain storage, optional field encryption.


