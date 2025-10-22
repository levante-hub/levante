# PRD: MCP Automatic Configuration

**Status**: Draft
**Version**: 1.0
**Date**: 2025-01-22
**Author**: Levante Team

---

## Overview

Simplify MCP configuration for non-technical users by adding an AI-powered "Automatic" mode that extracts configuration from unstructured text (URLs, documentation, installation instructions) and converts it into valid MCP JSON configuration.

---

## Problem Statement

Currently, users must manually write JSON configuration to add new MCP servers. This creates barriers for:
- **Non-technical users** who don't understand JSON syntax
- **New users** unfamiliar with MCP configuration structure
- **All users** who want to quickly add MCPs from documentation

Most MCP providers share configuration as:
- GitHub repository URLs
- Installation commands (`npx`, `pip install`, etc.)
- Documentation snippets (markdown, plain text)
- Example JSON in README files

Users should be able to paste any of these formats and have Levante automatically generate the correct configuration.

---

## Goals

### Primary Goals
1. **Reduce friction** for adding new MCPs from ~5 minutes to ~30 seconds
2. **Lower technical barrier** - no JSON knowledge required
3. **Maintain security** - warn users about sensitive data (tokens, passwords)
4. **Preserve power user workflow** - keep existing "Custom" mode unchanged

### Non-Goals (Phase 2)
- Auto-discovery of MCPs from registries
- Validation of MCP availability before adding
- Automatic installation of dependencies (npm, pip)
- Templates or MCP marketplace

---

## User Stories

### Story 1: Quick Setup from Documentation
**As a** non-technical user
**I want to** paste a URL or text from MCP documentation
**So that** I can add the MCP without understanding JSON syntax

**Acceptance Criteria**:
- User can paste GitHub URL, npm command, or documentation text
- AI extracts: name, description, command, args
- Configuration is added without manual JSON editing
- Process completes in < 30 seconds

### Story 2: Security-Conscious Configuration
**As a** privacy-focused user
**I want to** be warned about sensitive data before sending to AI
**So that** I don't accidentally expose API keys or passwords

**Acceptance Criteria**:
- System detects potential sensitive data (tokens, keys, passwords)
- Shows warning before processing
- Extracts config with placeholder values for secrets
- Notifies user to add real values after extraction

### Story 3: Advanced User Workflow
**As a** power user
**I want to** continue using direct JSON editing
**So that** I can maintain full control over configuration

**Acceptance Criteria**:
- "Custom" tab preserves current JSON editor
- No changes to existing workflow
- Can switch between Automatic and Custom modes

---

## Solution Design

### Architecture

```
User Input (textarea)
    ↓
Text Processing & Security Check
    ↓
AI Provider Check (structured output support?)
    ↓
LLM Extraction (object structure output)
    ↓
Configuration Preview (optional, collapsed)
    ↓
Add to MCP Config
```

### Component Structure

#### 1. Tabs Component
**Location**: `src/renderer/components/mcp/config/AddMCPPanel.tsx` (new)

```
┌─────────────────────────────────────┐
│  [ Automatic ]  [ Custom ]          │
├─────────────────────────────────────┤
│  {Tab Content}                      │
└─────────────────────────────────────┤
```

#### 2. Automatic Tab
```
┌─────────────────────────────────────┐
│ Paste MCP configuration:            │
│ • GitHub URL                        │
│ • Installation command              │
│ • Documentation text                │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ [Textarea - 8 rows min]         │ │
│ │                                 │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ⚠️  Do not paste API keys, tokens,  │
│    or passwords. AI will extract   │
│    configuration only.             │
│                                     │
│ [ Extract Configuration ]           │
│                                     │
│ {Spinner + "Processing..."}         │
│                                     │
│ ▸ Preview Configuration (optional)  │
│   └─ {Collapsed JSON preview}      │
│                                     │
│ [ Add MCP Server ]                  │
└─────────────────────────────────────┘
```

#### 3. Custom Tab
- **Current implementation** - no changes
- Full JSON editor with syntax highlighting
- Manual configuration for advanced users

---

## Technical Implementation

### Phase 1: Core Functionality

#### 1.1 Model Whitelist for Structured Output

**Supported Models** (with object structure output):
```typescript
const STRUCTURED_OUTPUT_MODELS = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
  ],
  google: [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
};
```

**Provider Check Flow**:
1. Check user's active provider and model
2. If model supports structured output → proceed
3. If not → show error: "This feature requires a model with structured output support. Please configure OpenAI GPT-4, Anthropic Claude 3.5, or Google Gemini 1.5."

#### 1.2 AI Extraction Service

**File**: `src/main/services/mcpExtractionService.ts`

```typescript
interface MCPExtractionInput {
  text: string;
  userModel: string;
  userProvider: string;
}

interface MCPExtractionOutput {
  name: string;
  description: string;
  command: string;
  args: string[];
  env?: Record<string, string>; // Placeholders only
}

async function extractMCPConfig(input: MCPExtractionInput): Promise<MCPExtractionOutput>
```

**AI Prompt** (system):
```
You are an MCP (Model Context Protocol) configuration expert.
Extract MCP server configuration from the provided text.

The text may contain:
- GitHub repository URL
- npm/pip installation commands
- Documentation snippets
- Example JSON configuration

Extract the following fields:
- name: MCP server name (string)
- description: Brief description (string, 1-2 sentences)
- command: Executable command (e.g., "npx", "node", "python")
- args: Array of command arguments
- env: Environment variables (use PLACEHOLDER for sensitive values)

Security rules:
- NEVER extract actual API keys, tokens, or passwords
- Replace sensitive values with "YOUR_API_KEY_HERE" or similar
- If text contains sensitive data, include it in env with placeholder

Examples of valid configurations:
[Include 3-4 examples of different MCP types]
```

**AI Prompt** (user message):
```
Extract MCP configuration from:

{user_input}
```

#### 1.3 Security Checks

**Pre-processing**:
```typescript
function detectSensitiveData(text: string): boolean {
  const sensitivePatterns = [
    /api[_-]?key/i,
    /token/i,
    /password/i,
    /secret/i,
    /bearer\s+[a-zA-Z0-9]/i,
    /sk-[a-zA-Z0-9]{32,}/i, // OpenAI-style keys
  ];

  return sensitivePatterns.some(pattern => pattern.test(text));
}
```

**Warning UI**:
```
⚠️  Warning: Potential sensitive data detected
The text you pasted may contain API keys or tokens.
These will be replaced with placeholders for security.
You'll need to add real values after extraction.

[ Continue ]  [ Cancel ]
```

#### 1.4 UI Components

**New Files**:
- `src/renderer/components/mcp/config/AddMCPTabs.tsx` - Tab container
- `src/renderer/components/mcp/config/AutomaticMCPConfig.tsx` - Automatic mode
- `src/renderer/components/mcp/config/CustomMCPConfig.tsx` - Current JSON editor (refactored)

**Updated Files**:
- `src/renderer/components/mcp/config/json-editor-panel.tsx` - Add tabs integration

**State Management**:
```typescript
interface AutomaticConfigState {
  inputText: string;
  isProcessing: boolean;
  extractedConfig: MCPConfig | null;
  showPreview: boolean;
  error: string | null;
}
```

#### 1.5 IPC Handlers

**New handlers**:
```typescript
// Check if user's model supports structured output
ipcMain.handle('levante/mcp/check-structured-output-support', async () => {
  // Return { supported: boolean, model: string, provider: string }
});

// Extract MCP config from text
ipcMain.handle('levante/mcp/extract-config', async (event, text: string) => {
  // Return { success: boolean, config?: MCPConfig, error?: string }
});
```

---

## User Flow

### Happy Path: Automatic Configuration

1. **User opens "Edit MCP Configuration"**
   - Sees tabs: [ Automatic ] [ Custom ]
   - "Automatic" is selected by default for new users

2. **User pastes text into textarea**
   - Example: `https://github.com/modelcontextprotocol/server-filesystem`
   - Or: Installation docs from MCP provider

3. **User clicks "Extract Configuration"**
   - System checks for sensitive data
   - If detected → shows warning dialog
   - User confirms → continues

4. **Processing phase**
   - Checks if active model supports structured output
   - If not → shows error + list of compatible models
   - If yes → sends to AI for extraction
   - Shows spinner + "Processing..."

5. **Configuration extracted**
   - Shows collapsed preview: "▸ Preview Configuration"
   - User can optionally expand to review JSON
   - "Add MCP Server" button becomes enabled

6. **User adds MCP**
   - Config is added to MCP configuration
   - Shows success notification
   - Returns to MCP list view

### Error Flows

#### Error 1: Model Not Supported
```
❌ Model Not Supported
The active model "gpt-3.5-turbo" doesn't support structured output.

Please switch to one of these models:
• OpenAI: GPT-4o, GPT-4 Turbo
• Anthropic: Claude 3.5 Sonnet/Haiku
• Google: Gemini 1.5 Pro/Flash

Or use the "Custom" tab for manual configuration.

[ Switch Model ]  [ Use Custom Tab ]
```

#### Error 2: Extraction Failed
```
❌ Could not extract configuration
The AI couldn't understand the provided text.

Try:
• Providing more context (full README section)
• Pasting the GitHub repository URL
• Using the "Custom" tab for manual configuration

[ Edit Input ]  [ Use Custom Tab ]
```

#### Error 3: Sensitive Data Warning
```
⚠️  Security Warning
Potential API keys or tokens detected in your input.

We'll replace these with placeholders like "YOUR_API_KEY_HERE".
You'll need to add real values manually after extraction.

Never paste actual credentials into this field.

[ Continue with Placeholders ]  [ Cancel ]
```

---

## Data Structures

### Input Formats Supported

#### Format 1: GitHub URL
```
https://github.com/modelcontextprotocol/server-filesystem
```

#### Format 2: Installation Command
```
npm install @modelcontextprotocol/server-filesystem
npx -y @modelcontextprotocol/server-filesystem /path/to/directory
```

#### Format 3: Documentation Snippet
```
# Filesystem MCP Server

Provides access to local filesystem operations.

## Installation
npm install @modelcontextprotocol/server-filesystem

## Configuration
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"]
    }
  }
}
```

#### Format 4: Mixed Content
```
Check out this MCP server for GitHub integration:
https://github.com/modelcontextprotocol/server-github

Run it with:
npx -y @modelcontextprotocol/server-github

You'll need a GITHUB_TOKEN environment variable.
```

### Output Structure

```typescript
interface ExtractedMCPConfig {
  name: string;                    // "filesystem"
  description: string;             // "Provides access to local filesystem"
  command: string;                 // "npx"
  args: string[];                  // ["-y", "@modelcontextprotocol/server-filesystem"]
  env?: Record<string, string>;    // { "GITHUB_TOKEN": "YOUR_TOKEN_HERE" }
}
```

---

## UI/UX Specifications

### Textarea Specifications
- **Min height**: 8 rows (~200px)
- **Max height**: 20 rows (~500px) with scroll
- **Placeholder**:
  ```
  Paste MCP configuration from:
  • GitHub URL (e.g., https://github.com/org/mcp-server)
  • Installation command (e.g., npx @org/mcp-server)
  • Documentation text or README section
  ```
- **Auto-resize**: Yes, grows with content up to max height

### Button States
- **"Extract Configuration"**:
  - Disabled: textarea empty or processing
  - Enabled: text entered and not processing
  - Processing: shows spinner + disabled

- **"Add MCP Server"**:
  - Disabled: no extracted config
  - Enabled: config extracted successfully

### Preview Component
- **Collapsed by default**: `▸ Preview Configuration`
- **Expanded**: `▾ Preview Configuration`
- **Content**: Read-only JSON with syntax highlighting
- **Actions**: [ Copy ] button in top-right

### Notifications

**Success**:
```
✅ MCP Server Added
"filesystem" has been configured successfully.
```

**Processing**:
```
⏳ Extracting configuration...
This may take a few seconds.
```

**Error** (with retry):
```
❌ Extraction failed
[Error message]

[ Try Again ]  [ Use Custom Tab ]
```

---

## Translation Keys

### New i18n keys (English)

**File**: `src/renderer/locales/en/mcp.json`

```json
{
  "config": {
    "add_tabs": {
      "automatic": "Automatic",
      "custom": "Custom",
      "automatic_description": "AI-powered configuration from text or URL",
      "custom_description": "Manual JSON editing for advanced users"
    },
    "automatic": {
      "title": "Automatic MCP Configuration",
      "textarea_label": "Paste MCP configuration:",
      "textarea_placeholder": "Paste MCP configuration from:\n• GitHub URL (e.g., https://github.com/org/mcp-server)\n• Installation command (e.g., npx @org/mcp-server)\n• Documentation text or README section",
      "security_warning": "⚠️  Do not paste API keys, tokens, or passwords. AI will extract configuration only.",
      "extract_button": "Extract Configuration",
      "extracting": "Extracting configuration...",
      "preview_title": "Preview Configuration",
      "preview_collapsed": "▸ Preview Configuration",
      "preview_expanded": "▾ Preview Configuration",
      "add_button": "Add MCP Server",
      "success": "MCP Server Added",
      "success_detail": "\"{name}\" has been configured successfully."
    },
    "errors": {
      "model_not_supported": "Model Not Supported",
      "model_not_supported_detail": "The active model \"{model}\" doesn't support structured output.\n\nPlease switch to one of these models:\n• OpenAI: GPT-4o, GPT-4 Turbo\n• Anthropic: Claude 3.5 Sonnet/Haiku\n• Google: Gemini 1.5 Pro/Flash\n\nOr use the \"Custom\" tab for manual configuration.",
      "extraction_failed": "Could not extract configuration",
      "extraction_failed_detail": "The AI couldn't understand the provided text.\n\nTry:\n• Providing more context (full README section)\n• Pasting the GitHub repository URL\n• Using the \"Custom\" tab for manual configuration",
      "sensitive_data_warning": "Security Warning",
      "sensitive_data_detail": "Potential API keys or tokens detected in your input.\n\nWe'll replace these with placeholders like \"YOUR_API_KEY_HERE\".\nYou'll need to add real values manually after extraction.\n\nNever paste actual credentials into this field.",
      "switch_model": "Switch Model",
      "use_custom_tab": "Use Custom Tab",
      "edit_input": "Edit Input",
      "continue_with_placeholders": "Continue with Placeholders",
      "cancel": "Cancel"
    }
  }
}
```

**File**: `src/renderer/locales/es/mcp.json` (Spanish translations)

---

## Testing Strategy

### Unit Tests
- `mcpExtractionService.test.ts`: Test AI extraction logic
- `sensitiveDataDetector.test.ts`: Test security pattern matching
- `structuredOutputCheck.test.ts`: Test model whitelist

### Integration Tests
- Full extraction flow with mock AI responses
- Tab switching behavior
- Error handling and recovery

### Manual Testing Scenarios

#### Scenario 1: GitHub URL
**Input**: `https://github.com/modelcontextprotocol/server-filesystem`
**Expected**: Extracts name, description, command, args correctly

#### Scenario 2: Installation Command
**Input**: `npx -y @modelcontextprotocol/server-github`
**Expected**: Extracts command="npx", args correctly

#### Scenario 3: Full Documentation
**Input**: Complete README section with examples
**Expected**: Extracts all fields including env vars with placeholders

#### Scenario 4: Sensitive Data
**Input**: Text containing "OPENAI_API_KEY=sk-abc123..."
**Expected**: Shows warning, replaces with placeholder

#### Scenario 5: Unsupported Model
**Input**: Valid text, but GPT-3.5-turbo active
**Expected**: Shows model compatibility error

#### Scenario 6: Invalid Input
**Input**: Random unrelated text
**Expected**: Shows extraction failed error, allows retry

---

## Security Considerations

### 1. Sensitive Data Protection
- **Never send** actual API keys, tokens, or passwords to AI
- **Pattern detection** before processing
- **Placeholder replacement** in extracted config
- **User warnings** when sensitive patterns detected

### 2. AI Provider Privacy
- Users must consent to sending configuration text to AI
- No personal data included in prompts (just MCP config text)
- Logs should not include user input text

### 3. Validation
- **Post-extraction validation**: Ensure extracted JSON is valid MCP config
- **Command safety**: Warn if command is unusual (not npx, node, python, etc.)
- **Path safety**: Don't auto-fill absolute paths that might expose user info

---

## Performance Requirements

- **Extraction time**: < 10 seconds (p95)
- **UI responsiveness**: No blocking during AI processing
- **Error recovery**: < 2 seconds to show error message
- **Model check**: < 100ms (cached in memory)

---

## Success Metrics

### Adoption Metrics
- **% of MCPs added via Automatic mode** vs Custom (target: >60%)
- **Time to add MCP**: Automatic vs Custom (target: 3x faster)
- **Error rate**: % of extractions that fail (target: <15%)

### User Satisfaction
- **Feature usage**: Daily/weekly active users of Automatic mode
- **Completion rate**: % users who complete extraction vs abandon
- **Retry rate**: % users who retry after first failure

---

## Common Pitfalls & Solutions

### User Input Issues

**Problem 1: Incomplete Text**
- **Symptom**: User pastes only package name "server-filesystem"
- **Solution**: Smart defaults kick in - detect package pattern and suggest command
- **Fallback**: Show error with example "Try pasting: npx -y @org/package"

**Problem 2: Relative Paths in Arguments**
- **Symptom**: User pastes `npx server-filesystem ./documents`
- **Solution**: Detect relative paths and warn user to use absolute paths
- **Validation**: Check if path starts with `.` or `..` and flag it

**Problem 3: URL Requires Authentication**
- **Symptom**: GitHub private repo URL that AI can't access
- **Solution**: Detect 404/403 errors and suggest "Copy the installation instructions instead of the URL"
- **Alternative**: Allow paste of README content directly

**Problem 4: Mixed Language Documentation**
- **Symptom**: Docs in Spanish/French/etc with English commands
- **Solution**: AI should extract commands regardless of surrounding language
- **Validation**: Commands should always be in English (npx, node, python, etc.)

**Problem 5: Multiple Installation Methods**
- **Symptom**: Docs show npm, yarn, and pnpm alternatives
- **Solution**: AI picks first valid method, prioritize: npx > uvx > node > python
- **Preview**: Show detected method in preview with note "Other methods available"

### AI Extraction Edge Cases

**Edge Case 1: Package Name Variations**
```
@modelcontextprotocol/server-filesystem  → name: "filesystem"
@upstash/context7-mcp                    → name: "context7"
mcp-server-time                          → name: "time"
server-github                            → name: "github"
```

**Edge Case 2: Environment Variable Patterns**
```
GITHUB_TOKEN=xxx          → Extract with placeholder
export API_KEY="abc"      → Extract with placeholder
TOKEN: your-token-here    → Extract with placeholder
api-key (required)        → Extract with placeholder
```

**Edge Case 3: Command Variations**
```
npx -y @org/pkg           → Normalize to ["npx", ["-y", "@org/pkg"]]
npm exec @org/pkg         → Convert to npx equivalent
node dist/index.js        → Preserve as-is
python -m mcpserver       → Preserve as-is
```

## Enhanced Security: Sensitive Data Detection

### Improved Detection Patterns

**Whitelist (NOT sensitive)**:
- Words in common context: "tokenize", "authentication", "password-hash"
- Documentation keywords: "token_type", "api_key_name"
- MCP-specific: "server-token" (package name part)

**Blacklist (Sensitive - with confidence score)**:

```typescript
const sensitivePatterns = [
  // High confidence (99%)
  { pattern: /sk-[a-zA-Z0-9]{32,}/i, type: 'OpenAI API Key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/i, type: 'GitHub Token' },
  { pattern: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/i, type: 'Slack Token' },

  // Medium confidence (70%)
  { pattern: /api[_-]?key\s*[=:]\s*["']?[a-zA-Z0-9]{16,}/i, type: 'Generic API Key' },
  { pattern: /token\s*[=:]\s*["']?[a-zA-Z0-9]{16,}/i, type: 'Generic Token' },
  { pattern: /password\s*[=:]\s*["']?.+["']?/i, type: 'Password' },

  // Low confidence (40%) - Ask user
  { pattern: /secret/i, type: 'Possible Secret' },
  { pattern: /bearer\s+[a-zA-Z0-9]/i, type: 'Possible Bearer Token' },
];
```

**User Confirmation Flow**:
```
🔐 Sensitive data detected (Medium confidence)
Found: API_KEY=abc123...

Options:
[ ] This is a real key - replace with placeholder
[ ] This is just an example - keep as-is
[?] What's the difference?
```

### Sanitization Rules

1. **Always replace** high-confidence patterns (>90%)
2. **Ask user** for medium-confidence (50-90%)
3. **Highlight** low-confidence (<50%) in preview for user review
4. **Log sanitization** actions for debugging (no actual values logged)

## Visual Feedback: Processing Phases

### Phase Indicators

Instead of generic "Processing...", show specific phases:

```typescript
type ExtractionPhase =
  | 'analyzing'      // 0-20%: Parsing input text
  | 'security'       // 20-40%: Checking for sensitive data
  | 'extracting'     // 40-80%: AI extraction
  | 'validating'     // 80-95%: Post-extraction validation
  | 'complete';      // 100%: Ready to preview

interface PhaseDisplay {
  icon: string;
  message: string;
  estimatedDuration: number; // ms
}
```

**UI Implementation**:
```
┌─────────────────────────────────────┐
│ 🔍 Analizando texto...              │
│ ▓▓▓▓░░░░░░░░░░░░░░░░ 20%           │
│                                     │
│ Detectando tipo de entrada...      │
└─────────────────────────────────────┘

↓ (transitions to)

┌─────────────────────────────────────┐
│ 🤖 Extrayendo configuración con IA...│
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ 60%           │
│                                     │
│ Usando modelo: claude-3.5-sonnet   │
└─────────────────────────────────────┘

↓ (transitions to)

┌─────────────────────────────────────┐
│ ✅ Configuración extraída            │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 100%          │
│                                     │
│ ▸ Revisar configuración             │
└─────────────────────────────────────┘
```

### Error State with Context

When extraction fails, show what was detected:

```
❌ No se pudo extraer la configuración completa

✓ Detectado: Nombre del paquete
✓ Detectado: Comando (npx)
✗ Falta: Argumentos del comando

Sugerencia: Incluye el comando de instalación completo
Ejemplo: npx -y @modelcontextprotocol/server-filesystem

[ Editar Entrada ]  [ Completar Manualmente ]
```

## Post-Extraction Validation

### Validation Rules

**1. Command Existence Check**
```typescript
const commonCommands = {
  'npx': { available: true, installer: 'npm install -g npm' },
  'uvx': { available: checkCommand('uvx'), installer: 'pip install uv' },
  'node': { available: checkCommand('node'), installer: 'Install Node.js' },
  'python': { available: checkCommand('python'), installer: 'Install Python' },
};

if (!commonCommands[extractedCommand]?.available) {
  warning.push({
    level: 'error',
    message: `Command "${extractedCommand}" not found on your system`,
    action: `Install it: ${commonCommands[extractedCommand]?.installer}`
  });
}
```

**2. Argument Safety Validation**
```typescript
const suspiciousPatterns = [
  /https?:\/\/[^\s]+/,     // External URLs
  /;\s*rm\s+-rf/,          // Shell injection
  /&&|\|\|/,               // Command chaining
  /\$\(.*\)/,              // Command substitution
  /`.*`/,                  // Backtick execution
];

for (const arg of extractedArgs) {
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(arg)) {
      warnings.push({
        level: 'warning',
        message: `Suspicious argument detected: "${arg}"`,
        suggestion: 'Review this carefully before adding'
      });
    }
  }
}
```

**3. Environment Variable Validation**
```typescript
const validEnvVarName = /^[A-Z_][A-Z0-9_]*$/;

for (const [key, value] of Object.entries(extractedEnv)) {
  // Check name format
  if (!validEnvVarName.test(key)) {
    errors.push({
      level: 'error',
      field: 'env',
      message: `Invalid env var name: "${key}"`,
      suggestion: 'Use uppercase letters, numbers, and underscores only'
    });
  }

  // Check if placeholder is used
  if (!value.includes('YOUR_') && !value.includes('PLACEHOLDER')) {
    warnings.push({
      level: 'warning',
      field: 'env',
      message: `"${key}" may contain a real value`,
      suggestion: 'Replace with placeholder for security'
    });
  }
}
```

**4. Package Name Validation**
```typescript
// Check if package looks valid
const validNpmPackage = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const validPypiPackage = /^[a-z0-9-_]+$/;

const packageInArgs = extractedArgs.find(arg =>
  arg.startsWith('@') || arg.includes('/')
);

if (packageInArgs && extractedCommand === 'npx') {
  if (!validNpmPackage.test(packageInArgs)) {
    warnings.push({
      level: 'warning',
      message: `"${packageInArgs}" doesn't look like a valid npm package`,
      suggestion: 'Double-check the package name'
    });
  }
}
```

### Validation UI

Show validation results in preview:

```
┌─────────────────────────────────────┐
│ ▾ Configuración Extraída            │
├─────────────────────────────────────┤
│ ✅ Nombre: filesystem                │
│ ✅ Comando: npx (disponible)         │
│ ✅ Argumentos: válidos               │
│ ⚠️  Variables: 1 placeholder         │
│                                     │
│ ⚠️  1 advertencia:                  │
│ • GITHUB_TOKEN necesita valor real  │
│   después de añadir                 │
└─────────────────────────────────────┘
```

## Smart Defaults Based on Context

### Pattern Recognition

**Pattern 1: Official MCP Server**
```
Input: "@modelcontextprotocol/server-*"
Defaults:
  - command: "npx"
  - args: ["-y", "<package-name>"]
  - type: "stdio"
```

**Pattern 2: Community npm Package**
```
Input: "@org/mcp-*" or "@org/*-mcp"
Defaults:
  - command: "npx"
  - args: ["-y", "<package-name>"]
  - type: "stdio"
```

**Pattern 3: Python Package**
```
Input: "mcp-server-*" (without @)
Defaults:
  - command: "uvx"
  - args: ["<package-name>"]
  - type: "stdio"
```

**Pattern 4: GitHub URL**
```
Input: "https://github.com/org/repo"
Action: Auto-fetch README.md from repo
Fallback: Extract from URL pattern
Defaults:
  - name: Derived from repo name
  - command: Detect from README or default to "npx"
```

### Auto-Complete Strategy

```typescript
interface ExtractedConfig {
  name?: string;
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  confidence: number; // 0-100
}

function applySmartDefaults(partial: ExtractedConfig): ExtractedConfig {
  const result = { ...partial };

  // If command missing but have package name
  if (!result.command && result.args?.[0]) {
    const pkg = result.args[0];
    if (pkg.startsWith('@')) {
      result.command = 'npx';
      result.args = ['-y', ...result.args];
    } else if (pkg.startsWith('mcp-server-')) {
      result.command = 'uvx';
    }
  }

  // If name missing but have package
  if (!result.name && result.args) {
    const pkg = result.args.find(arg => arg.includes('mcp') || arg.includes('server'));
    if (pkg) {
      result.name = pkg
        .replace('@modelcontextprotocol/server-', '')
        .replace('@', '')
        .replace(/\/.*/, '')
        .replace('mcp-server-', '')
        .replace('-mcp', '');
    }
  }

  // Default type
  if (!result.type) {
    result.type = 'stdio';
  }

  // Default env
  if (!result.env) {
    result.env = {};
  }

  return result;
}
```

## Improved Error Handling with AI

### Error Classification

```typescript
type ExtractionError =
  | 'no_command'           // Couldn't detect command
  | 'no_package'           // Couldn't detect package name
  | 'invalid_format'       // Input format not recognized
  | 'ambiguous'            // Multiple valid interpretations
  | 'insufficient_context' // Need more information
  | 'ai_error';            // AI service error

interface ErrorResponse {
  error: ExtractionError;
  detected: Partial<ExtractedConfig>; // What WAS extracted
  missing: string[];                   // What's missing
  suggestion: string;                  // Specific guidance
  examples: string[];                  // 2-3 relevant examples
  canEdit: boolean;                    // Can user edit and retry?
}
```

### Error UI with Partial Success

```
┌─────────────────────────────────────┐
│ ⚠️  Configuración Incompleta         │
├─────────────────────────────────────┤
│ Pude extraer:                       │
│ ✓ Nombre: github                    │
│ ✓ Comando: npx                      │
│                                     │
│ Falta:                              │
│ ✗ Argumentos del comando            │
│                                     │
│ Sugerencia:                         │
│ Incluye el comando completo con el  │
│ nombre del paquete, por ejemplo:    │
│                                     │
│ npx -y @modelcontextprotocol/...   │
│                                     │
│ [ Editar y Completar Manualmente ]  │
│ [ Ver Ejemplo Similar ]             │
└─────────────────────────────────────┘
```

### Contextual Examples

Show examples similar to what user pasted:

```typescript
function getSimilarExamples(input: string): Example[] {
  if (input.includes('github.com')) {
    return [
      {
        title: 'Desde URL de GitHub',
        input: 'https://github.com/modelcontextprotocol/server-filesystem',
        expected: 'Extrae el nombre del repo y genera configuración base'
      }
    ];
  }

  if (input.includes('npm install')) {
    return [
      {
        title: 'Desde comando npm',
        input: 'npm install -g @modelcontextprotocol/server-github',
        expected: 'Convierte a formato npx con argumentos correctos'
      }
    ];
  }

  // Default examples
  return defaultExamples;
}
```

### Edit and Complete Flow

When clicking "Editar y Completar Manualmente":

1. **Switch to Custom tab** with partial config pre-filled:
```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "???"  // ← Highlighted for user to complete
      ],
      "env": {}
    }
  }
}
```

2. **Highlight missing fields** in JSON editor
3. **Show inline hints** next to incomplete fields
4. **Validate on-the-fly** as user types

## Enhanced Preview Component

### Readable Format (Not Raw JSON)

Instead of collapsed JSON, show field-by-field:

```
┌─────────────────────────────────────┐
│ ▾ Configuración Extraída            │
├─────────────────────────────────────┤
│                                     │
│ Servidor                            │
│ ┌─────────────────────────────────┐ │
│ │ filesystem                      │ │ [Editar]
│ └─────────────────────────────────┘ │
│                                     │
│ Comando                             │
│ ┌─────────────────────────────────┐ │
│ │ npx -y @modelcontextprotocol/  │ │ [Editar]
│ │ server-filesystem               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Variables de Entorno                │
│ ┌─────────────────────────────────┐ │
│ │ (ninguna)                       │ │ [Añadir]
│ └─────────────────────────────────┘ │
│                                     │
│ ⚠️  Nota: Añade las rutas permitidas│
│    como argumento adicional         │
│    Ejemplo: /Users/you/Documents    │
│                                     │
│ [ Ver JSON Completo ]               │
│ [ Añadir Servidor ]                 │
└─────────────────────────────────────┘
```

### Inline Editing

Allow quick edits without switching tabs:

```typescript
interface PreviewField {
  key: string;
  value: string | string[];
  editable: boolean;
  validator?: (value: any) => ValidationResult;
  hint?: string;
}
```

**Edit interaction**:
- Click "Editar" → field becomes editable
- Type changes → validate in real-time
- Press Enter → save changes
- Press Esc → cancel editing

### Smart Hints Based on Configuration

```typescript
function getConfigHints(config: ExtractedConfig): Hint[] {
  const hints: Hint[] = [];

  // Filesystem server hint
  if (config.name === 'filesystem' && config.args.length === 2) {
    hints.push({
      type: 'info',
      message: 'Añade las rutas de directorios permitidos como argumentos adicionales',
      example: '/Users/you/Documents'
    });
  }

  // GitHub server hint
  if (config.name === 'github' && !config.env?.GITHUB_TOKEN) {
    hints.push({
      type: 'warning',
      message: 'Este servidor requiere un GITHUB_TOKEN',
      action: 'Añade tu token después de crear la configuración'
    });
  }

  // Time server hint
  if (config.name === 'time' && !config.args.includes('--local-timezone')) {
    hints.push({
      type: 'info',
      message: 'Puedes especificar tu zona horaria',
      example: '--local-timezone Europe/Madrid'
    });
  }

  return hints;
}
```

### JSON View (Optional)

Toggle to see raw JSON:

```
┌─────────────────────────────────────┐
│ ▾ JSON Completo                     │
├─────────────────────────────────────┤
│ {                                   │
│   "filesystem": {                   │
│     "type": "stdio",                │
│     "command": "npx",               │
│     "args": [                       │
│       "-y",                         │
│       "@modelcontextprotocol/..."  │
│     ],                              │
│     "env": {}                       │
│   }                                 │
│ }                                   │
│                                     │
│ [ Copiar JSON ]  [ Editar en Custom]│
└─────────────────────────────────────┘
```

## Open Questions

1. **Context limits**: What's max textarea length? (Suggestion: 10,000 chars)
2. **Rate limiting**: How many extractions per minute? (Suggestion: 10/min)
3. **Caching**: Should we cache extracted configs by input hash? (Suggestion: Yes, 1 hour)
4. **Telemetry**: Track extraction success/failure rates? (Privacy-conscious, no input text logged)
5. **GitHub API**: Use GitHub API to auto-fetch README? (Requires no auth for public repos)
6. **Command validation**: Run actual command checks on user's system? (May be slow)

---

## Implementation Phases

### Phase 1: MVP (This PRD)
- ✅ Tabs UI (Automatic / Custom)
- ✅ Model whitelist and compatibility check
- ✅ AI extraction service with structured output
- ✅ Sensitive data detection and warnings
- ✅ Basic error handling
- ✅ Preview and add functionality

**Estimated effort**: 3-4 days

### Phase 2: Enhancements (Future)
- Auto-fetch content from GitHub URLs
- Smart suggestions based on common MCPs
- Extraction history (last 5 configs)
- Improved error messages with specific fixes
- Support for more model providers (local models with grammar-based extraction)

**Estimated effort**: 2-3 days

### Phase 3: Advanced (Future)
- MCP marketplace integration
- Auto-discovery from npm registry
- Dependency installation automation
- Configuration templates library

**Estimated effort**: 5+ days

---

## Dependencies

### Required
- Active AI provider with structured output support
- Existing MCP configuration system
- shadcn/ui Tabs component

### Optional
- GitHub API (for Phase 2: auto-fetch)
- npm registry API (for Phase 3: auto-discovery)

---

## Rollout Plan

1. **Development**: Implement Phase 1 on feature branch
2. **Internal testing**: Test with 10+ different MCP configurations
3. **Beta release**: Ship to beta users (v1.2.x-beta)
4. **Feedback collection**: Monitor error rates and user feedback (1 week)
5. **Stable release**: Include in v1.3.0

---

## Appendix

### Example AI Prompts

#### System Prompt
```
You are an MCP (Model Context Protocol) configuration expert.
Extract MCP server configuration from user-provided text and return ONLY valid JSON.

The user may provide:
- GitHub repository URLs (e.g., https://github.com/modelcontextprotocol/server-filesystem)
- npm/pip installation commands (e.g., npx -y @modelcontextprotocol/server-filesystem)
- Documentation snippets or README files
- Partial or complete JSON configuration examples

OUTPUT SCHEMA:
You must return a JSON object with this exact structure:

{
  "name": "string",        // Short identifier (e.g., "filesystem", "github", "time")
  "type": "stdio",         // Transport type: "stdio", "http", or "sse" (default: "stdio")
  "command": "string",     // Executable: "npx", "uvx", "node", "python", etc.
  "args": ["string"],      // Array of command arguments
  "env": {}                // Object with environment variables (use placeholders for secrets)
}

SECURITY RULES:
1. NEVER include actual API keys, tokens, or passwords
2. Replace sensitive values with uppercase placeholders:
   - API keys: "YOUR_API_KEY_HERE"
   - Tokens: "YOUR_TOKEN_HERE"
   - Passwords: "YOUR_PASSWORD_HERE"
3. If env variables are mentioned but no value given, use appropriate placeholder

EXTRACTION RULES:
1. Name: Derive from package name (remove @org/ prefix, remove "server-" or "mcp-" prefix)
2. Type: Always "stdio" unless HTTP/SSE is explicitly mentioned
3. Command: Common values: "npx" (Node.js), "uvx" (Python), "node", "python"
4. Args: Include package name with flags (e.g., ["-y", "@org/package"])
5. Env: Only include if explicitly mentioned in the text

REAL-WORLD EXAMPLES:

Example 1 - NPM Package (stdio):
{
  "name": "filesystem",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"],
  "env": {}
}

Example 2 - Python Package (stdio):
{
  "name": "time",
  "type": "stdio",
  "command": "uvx",
  "args": ["mcp-server-time", "--local-timezone", "Europe/Madrid"],
  "env": {}
}

Example 3 - With Environment Variables:
{
  "name": "github",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_TOKEN": "YOUR_GITHUB_TOKEN_HERE"
  }
}

Example 4 - With API Key:
{
  "name": "context7",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@upstash/context7-mcp"],
  "env": {
    "CONTEXT7_API_KEY": "YOUR_API_KEY_HERE"
  }
}

ERROR HANDLING:
If you cannot extract valid configuration, return:
{
  "error": "Brief explanation of what went wrong",
  "suggestion": "Specific guidance for the user (e.g., 'Please provide the GitHub repository URL or installation command')"
}

Return ONLY the JSON object, no markdown formatting, no explanation text.
```

#### Example User Messages

**Example 1**: GitHub URL Only
```
https://github.com/modelcontextprotocol/server-filesystem
```

**Expected Response**:
```json
{
  "name": "filesystem",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"],
  "env": {}
}
```

**Example 2**: Installation Command
```
npx -y @modelcontextprotocol/server-filesystem /Users/john/Documents
```

**Expected Response**:
```json
{
  "name": "filesystem",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/john/Documents"],
  "env": {}
}
```

**Example 3**: Python Package with Arguments
```
Install the time MCP server:

uvx mcp-server-time --local-timezone Europe/Madrid
```

**Expected Response**:
```json
{
  "name": "time",
  "type": "stdio",
  "command": "uvx",
  "args": ["mcp-server-time", "--local-timezone", "Europe/Madrid"],
  "env": {}
}
```

**Example 4**: Full Documentation with Env Vars
```
# GitHub MCP Server

Provides access to GitHub repositories, issues, and pull requests.

## Setup
npm install -g @modelcontextprotocol/server-github

## Usage
You'll need a GitHub personal access token with repo permissions.
Set your GITHUB_TOKEN environment variable.

npx @modelcontextprotocol/server-github
```

**Expected Response**:
```json
{
  "name": "github",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_TOKEN": "YOUR_GITHUB_TOKEN_HERE"
  }
}
```

**Example 5**: Already Valid JSON
```
{
  "mcpServers": {
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "env": {
        "CONTEXT7_API_KEY": "ctx7_abc123def456"
      }
    }
  }
}
```

**Expected Response** (extract and sanitize):
```json
{
  "name": "context7",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@upstash/context7-mcp"],
  "env": {
    "CONTEXT7_API_KEY": "YOUR_API_KEY_HERE"
  }
}
```

### Reference: Current MCP Config Structure

Based on Levante's implementation (`src/main/types/mcp.ts`):

```typescript
interface MCPServerConfig {
  id: string;
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  baseUrl?: string;
  headers?: Record<string, string>;
  transport: 'stdio' | 'http' | 'sse';
  enabled?: boolean;
}

interface MCPConfiguration {
  mcpServers: Record<string, Omit<MCPServerConfig, 'id'>>;
  disabled?: Record<string, Omit<MCPServerConfig, 'id'>>;
}
```

**Actual `.mcp.json` format** (stored in user profile):

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {}
    }
  },
  "disabled": {}
}
```

**Note**: The JSON file uses `type` field instead of `transport` for legacy compatibility.

### Reference: Existing Import/Export UI

Current location: `src/renderer/components/mcp/config/import-export.tsx`

This component will be extended with the new tabs functionality, keeping the existing export/import buttons accessible in both tabs.

---

## Sign-off

**Product**: [ ]
**Engineering**: [ ]
**Design**: [ ]
**Security**: [ ]

---

**Document Version History**:
- v1.0 (2025-01-22): Initial draft
