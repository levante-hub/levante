# Levante Agent Mode - Architecture Diagrams

## High-Level Overview

```
                                    ┌─────────────────┐
                                    │      USER       │
                                    └────────┬────────┘
                                             │
                                             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              LEVANTE APP                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                           CHAT UI                                     │  │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │  │
│  │   │ Agent Mode  │    │Confirmation │    │    Action Preview       │  │  │
│  │   │   Toggle    │    │   Dialogs   │    │    & Results            │  │  │
│  │   └─────────────┘    └─────────────┘    └─────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        GUARDIAN LAYER                                 │  │
│  │                                                                       │  │
│  │   ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────┐   │  │
│  │   │     Intent      │   │   Capability    │   │     Action       │   │  │
│  │   │   Classifier    │──▶│    Checker      │──▶│   Authorizer     │   │  │
│  │   │                 │   │                 │   │                  │   │  │
│  │   │ "What does the  │   │ "Is this        │   │ "Allow, deny,    │   │  │
│  │   │  agent want?"   │   │  permitted?"    │   │  or confirm?"    │   │  │
│  │   └─────────────────┘   └─────────────────┘   └──────────────────┘   │  │
│  │                                                         │             │  │
│  │                              ┌──────────────────────────┘             │  │
│  │                              ▼                                        │  │
│  │                    ┌─────────────────┐                                │  │
│  │                    │   AUDIT LOG     │                                │  │
│  │                    │  (immutable)    │                                │  │
│  │                    └─────────────────┘                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                         ┌──────────┴──────────┐                            │
│                         │   If APPROVED       │                            │
│                         └──────────┬──────────┘                            │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         AGENT ENGINE                                  │  │
│  │                                                                       │  │
│  │   ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────┐   │  │
│  │   │  Task Planner   │   │  Step Executor  │   │  Result Handler  │   │  │
│  │   │                 │──▶│                 │──▶│                  │   │  │
│  │   │ Break down      │   │ Execute via     │   │ Format & return  │   │  │
│  │   │ complex tasks   │   │ MCP calls       │   │ to user          │   │  │
│  │   └─────────────────┘   └─────────────────┘   └──────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      MCP CAPABILITY LAYER                             │  │
│  │                                                                       │  │
│  │   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────────┐    │  │
│  │   │ Calendar  │ │   Files   │ │   Notes   │ │  Custom MCPs      │    │  │
│  │   │    MCP    │ │    MCP    │ │    MCP    │ │  (from store)     │    │  │
│  │   │           │ │           │ │           │ │                   │    │  │
│  │   │ • read    │ │ • read    │ │ • read    │ │ • web.search      │    │  │
│  │   │ • write   │ │ • write   │ │ • write   │ │ • web.fetch       │    │  │
│  │   │ • delete  │ │ • list    │ │ • search  │ │ • notifications   │    │  │
│  │   └───────────┘ └───────────┘ └───────────┘ └───────────────────┘    │  │
│  │                                                                       │  │
│  │   Each MCP runs in isolated sandbox with scoped permissions           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Request Flow (Happy Path)

```
User: "Schedule a meeting tomorrow at 3pm"
           │
           ▼
    ┌──────────────┐
    │   CHAT UI    │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐     ┌─────────────────────────────────────┐
    │   GUARDIAN   │────▶│ Analysis:                           │
    │    LAYER     │     │ • Intent: calendar.write            │
    └──────┬───────┘     │ • Capability granted: ✅            │
           │             │ • Requires confirmation: YES         │
           │             │ • Risk level: MEDIUM                 │
           │             └─────────────────────────────────────┘
           ▼
    ┌──────────────┐
    │ CONFIRMATION │ ◄──── "Create event 'Meeting' tomorrow 3pm?"
    │    DIALOG    │
    └──────┬───────┘
           │ User clicks "Allow"
           ▼
    ┌──────────────┐
    │    AGENT     │
    │    ENGINE    │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  CALENDAR    │────▶ Event created
    │     MCP      │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  AUDIT LOG   │────▶ Entry: calendar.write, confirmed, success
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │   CHAT UI    │────▶ "Done! Created 'Meeting' for tomorrow at 3pm"
    └──────────────┘
```

## Request Flow (Blocked)

```
User: "Read my SSH private key"
           │
           ▼
    ┌──────────────┐
    │   GUARDIAN   │
    │    LAYER     │
    └──────┬───────┘
           │
           ▼
    ┌─────────────────────────────────────┐
    │ Analysis:                           │
    │ • Intent: files.read                │
    │ • Path: ~/.ssh/id_rsa               │
    │ • Capability granted: files.read ✅ │
    │ • Within scope: ❌ NO               │
    │ • Risk: HIGH (private key)          │
    │                                     │
    │ DECISION: DENY                      │
    └──────┬──────────────────────────────┘
           │
           ▼
    ┌──────────────┐
    │  AUDIT LOG   │────▶ Entry: files.read, DENIED, out of scope
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │   CHAT UI    │────▶ "I can't access that location. 
    └──────────────┘       File access is limited to: ~/Documents"
```

## Capability Configuration UI

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚙️  Agent Capabilities                                     [?]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📅 CALENDAR                                          ──────○───── │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │ ○ Disabled   ◉ Read only   ○ Read & Write               │    │
│     │                                                         │    │
│     │ ☑ Ask before creating/modifying events                  │    │
│     └─────────────────────────────────────────────────────────┘    │
│                                                                     │
│  📁 FILES                                             ──────○───── │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │ ◉ Disabled   ○ Read only   ○ Read & Write               │    │
│     │                                                         │    │
│     │ Allowed folders:                                        │    │
│     │ ┌─────────────────────────────────────────────────────┐ │    │
│     │ │ (none configured)                      [+ Add]      │ │    │
│     │ └─────────────────────────────────────────────────────┘ │    │
│     └─────────────────────────────────────────────────────────┘    │
│                                                                     │
│  📝 NOTES                                             ───────●──── │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │ ○ Disabled   ○ Read only   ◉ Read & Write               │    │
│     │                                                         │    │
│     │ ☐ Ask before creating/modifying notes                   │    │
│     └─────────────────────────────────────────────────────────┘    │
│                                                                     │
│  🌐 WEB ACCESS                                        ──────○───── │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │ ○ Disabled   ◉ Search only   ○ Search & Fetch           │    │
│     │                                                         │    │
│     │ ☑ Ask before fetching external URLs                     │    │
│     └─────────────────────────────────────────────────────────┘    │
│                                                                     │
│  🔔 NOTIFICATIONS                                     ───────●──── │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │ ◉ Enabled    ○ Disabled                                 │    │
│     └─────────────────────────────────────────────────────────┘    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🔒 Security Summary                                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Active capabilities: 3                                     │   │
│  │  Requires confirmation: Calendar write, Web fetch           │   │
│  │  Risk level: LOW                                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Reset to Defaults]                              [Save Changes]   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Audit Log UI

```
┌─────────────────────────────────────────────────────────────────────┐
│  📋 Agent Activity                              🔍 Filter  [Export] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  TODAY                                                      │   │
│  │                                                             │   │
│  │  11:45  ✅  Read calendar events                            │   │
│  │         capability: calendar.read                           │   │
│  │         result: 3 events returned                           │   │
│  │                                                             │   │
│  │  11:47  ✅  Created calendar event                          │   │
│  │         capability: calendar.write                          │   │
│  │         ⚠️ User confirmed action                            │   │
│  │         event: "Team meeting" @ 2026-01-29 15:00            │   │
│  │                                                             │   │
│  │  11:52  ❌  File access DENIED                              │   │
│  │         capability: files.read                              │   │
│  │         reason: Path outside allowed scope                  │   │
│  │         attempted: ~/.ssh/id_rsa                            │   │
│  │                                                             │   │
│  │  12:03  ✅  Web search                                      │   │
│  │         capability: web.search                              │   │
│  │         query: "weather tomorrow"                           │   │
│  │                                                             │   │
│  │  12:15  ⏸️  Action cancelled by user                        │   │
│  │         capability: web.fetch                               │   │
│  │         url: https://example.com/api                        │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  YESTERDAY                                                  │   │
│  │  ... 12 actions (8 approved, 3 confirmed, 1 denied)         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load more]                                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Interaction Sequence

```
┌──────┐     ┌────────┐     ┌──────────┐     ┌───────┐     ┌─────┐
│ User │     │ Chat   │     │ Guardian │     │ Agent │     │ MCP │
└──┬───┘     └───┬────┘     └────┬─────┘     └───┬───┘     └──┬──┘
   │             │               │               │            │
   │ "Do X"      │               │               │            │
   │────────────▶│               │               │            │
   │             │               │               │            │
   │             │ Analyze(X)    │               │            │
   │             │──────────────▶│               │            │
   │             │               │               │            │
   │             │    Decision   │               │            │
   │             │◀──────────────│               │            │
   │             │               │               │            │
   │             │               │    Log        │            │
   │             │               │───────────────│            │
   │             │               │               │            │
   │ (if needs   │               │               │            │
   │ confirm)    │               │               │            │
   │◀────────────│               │               │            │
   │             │               │               │            │
   │ "Yes"       │               │               │            │
   │────────────▶│               │               │            │
   │             │               │               │            │
   │             │ Execute(X)    │               │            │
   │             │───────────────────────────────▶            │
   │             │               │               │            │
   │             │               │               │ Call tool  │
   │             │               │               │───────────▶│
   │             │               │               │            │
   │             │               │               │   Result   │
   │             │               │               │◀───────────│
   │             │               │               │            │
   │             │     Result    │               │            │
   │             │◀──────────────────────────────│            │
   │             │               │               │            │
   │  Response   │               │               │            │
   │◀────────────│               │               │            │
   │             │               │               │            │
```

## Tech Stack Recommendation

```
┌─────────────────────────────────────────────────────────────────┐
│                         LEVANTE STACK                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FRONTEND (Existing)                                             │
│  ├── Electron / Tauri                                            │
│  ├── React / Vue                                                 │
│  └── Existing Levante UI components                              │
│                                                                  │
│  GUARDIAN LAYER (New)                                            │
│  ├── TypeScript module                                           │
│  ├── LLM-based intent classification                             │
│  ├── Rule-based capability checking                              │
│  └── SQLite for audit log (encrypted)                            │
│                                                                  │
│  AGENT ENGINE (New)                                              │
│  ├── TypeScript module                                           │
│  ├── Vercel AI SDK for LLM orchestration                         │
│  └── Task state machine                                          │
│                                                                  │
│  MCP LAYER (Existing + Extended)                                 │
│  ├── Existing Levante MCP infrastructure                         │
│  ├── New built-in MCPs: calendar, files, notes                   │
│  └── Sandbox: Node.js worker_threads or separate processes       │
│                                                                  │
│  STORAGE                                                         │
│  ├── Existing: Chat history, settings                            │
│  ├── New: Capability config (JSON)                               │
│  ├── New: Audit log (SQLite, encrypted)                          │
│  └── New: Agent task state (in-memory + persist)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
