# UV/UVX Security Validation

This document describes the security validation implemented for `uv` and `uvx` commands in Levante's MCP server execution.

## Overview

`uv` is a modern Python package manager that provides fast, isolated environment management. `uvx` is an alias for `uv tool run` and executes tools in temporary isolated environments.

## Security Model

### Design Principles

1. **Isolation First**: `uvx` is inherently safe as it runs tools in temporary, isolated environments
2. **Allowlist Safe Operations**: Only `uv run` and `uv tool run` are explicitly allowed
3. **Blocklist Dangerous Operations**: Package installation and system modification commands are blocked
4. **Pattern Validation**: Dangerous Python patterns (`-c`, `eval()`, etc.) are blocked in arguments

### Validation Layers

| Layer | What It Validates |
|-------|-------------------|
| Command Resolution | Resolves `uv`/`uvx` from PATH |
| Runtime Security | Blocks dangerous subcommands and patterns |
| Deep Link Security | Enforces whitelist for deep link installations |

## Allowed Commands

### ✅ uvx (Temporary Tool Execution)

**Safe by Design** - Runs tools in temporary isolated environments that are cleaned up after execution.

```json
{
  "command": "uvx",
  "args": ["mcp-server-git"]
}
```

```json
{
  "command": "uvx",
  "args": [
    "--from",
    "/path/to/local/project",
    "my-mcp-server"
  ]
}
```

```json
{
  "command": "uvx",
  "args": [
    "/path/to/project/dist/my_package-1.0.0-py3-none-any.whl"
  ]
}
```

```json
{
  "command": "uvx",
  "args": [
    "--python",
    "3.12",
    "--with",
    "requests",
    "my-mcp-server"
  ]
}
```

**Supported Safe Flags:**
- `--python`, `-p` - Select Python version
- `--from` - Specify source (local path, git, URL)
- `--with` - Add additional dependencies
- `--index-url` - Custom PyPI index
- `--extra-index-url` - Additional PyPI index
- `-y`, `--yes` - Auto-confirm
- `-q`, `--quiet` - Quiet mode
- `-v`, `--verbose` - Verbose mode

**Why Safe:**
- Creates temporary virtual environment
- Installs package only for duration of execution
- Environment destroyed after process exits
- No persistent system changes
- Flags are validated and skipped when extracting package name

---

### ✅ uv run (Project Execution)

**Isolated Project Execution** - Runs code within project's virtual environment.

```json
{
  "command": "uv",
  "args": [
    "run",
    "--directory",
    "/path/to/project",
    "-m",
    "my_mcp_server"
  ]
}
```

```json
{
  "command": "uv",
  "args": [
    "run",
    "python",
    "-m",
    "my_module"
  ]
}
```

```json
{
  "command": "uv",
  "args": [
    "run",
    "--directory",
    "/path/to/project",
    "my-script"
  ]
}
```

**Why Safe:**
- Uses project's isolated virtual environment
- No system-wide modifications
- Dependencies managed by project's `pyproject.toml`
- Perfect for local development

---

### ✅ uv tool run (Explicit Tool Execution)

```json
{
  "command": "uv",
  "args": [
    "tool",
    "run",
    "mcp-server-git"
  ]
}
```

**Why Safe:**
- Same as `uvx` (alias)
- Temporary isolated execution

---

## Blocked Commands

### ❌ Package Installation

**BLOCKED** - Can install malicious packages or modify system.

```json
{
  "command": "uv",
  "args": ["pip", "install", "malicious-package"]
}
```

```json
{
  "command": "uv",
  "args": ["tool", "install", "package"]
}
```

**Why Blocked:**
- Persistent system modification
- Can install backdoors
- Could override legitimate packages

---

### ❌ Package Uninstallation

**BLOCKED** - Can break system or remove security tools.

```json
{
  "command": "uv",
  "args": ["pip", "uninstall", "important-package"]
}
```

```json
{
  "command": "uv",
  "args": ["tool", "uninstall", "package"]
}
```

**Why Blocked:**
- Can break dependencies
- Could remove security monitoring
- System stability risk

---

### ❌ Cache Manipulation

**BLOCKED** - Potential DoS vector.

```json
{
  "command": "uv",
  "args": ["cache", "clear"]
}
```

**Why Blocked:**
- Could be used for DoS (repeatedly clearing cache)
- Performance degradation
- Disk space manipulation

---

### ❌ Self-Update

**BLOCKED** - Could install compromised version.

```json
{
  "command": "uv",
  "args": ["self", "update"]
}
```

**Why Blocked:**
- Could replace uv with malicious version
- Privilege escalation risk
- System integrity compromise

---

### ❌ Arbitrary Code Execution

**BLOCKED** - Direct Python code execution.

```json
{
  "command": "uvx",
  "args": ["-c", "import os; os.system('rm -rf /')"]
}
```

```json
{
  "command": "uv",
  "args": ["run", "-c", "malicious_code()"]
}
```

**Why Blocked:**
- Can execute any code
- Bypasses all security
- System compromise

---

## Validation Matrix

| Command | Subcommand | Deep Links | Manual Config | Reason |
|---------|-----------|------------|---------------|--------|
| `uvx` | package-name | ✅ (whitelist) | ✅ Allowed | Temporary isolated execution |
| `uvx` | local wheel | ❌ Rejected | ✅ Allowed | Deep links can't access local files |
| `uvx --from` | local path | ❌ Rejected | ✅ Allowed | Deep links can't access local files |
| `uv run` | any | ❌ Rejected | ✅ Allowed | Project execution (local only) |
| `uv pip install` | any | ❌ Blocked | ❌ Blocked | Persistent installation risk |
| `uv tool install` | any | ❌ Blocked | ❌ Blocked | Persistent installation risk |
| `uv tool run` | package | ✅ (whitelist) | ✅ Allowed | Same as uvx |
| `uv cache clear` | - | ❌ Blocked | ❌ Blocked | DoS potential |
| `uv self update` | - | ❌ Blocked | ❌ Blocked | System modification |

---

## Code Structure

### Constants (packageValidator.ts)

```typescript
// Blocked dangerous subcommands
export const BLOCKED_UV_SUBCOMMANDS = [
  'pip install',
  'pip uninstall',
  'tool install',
  'tool uninstall',
  'cache clear',
  'self update',
] as const;

// Safe subcommands
export const SAFE_UV_SUBCOMMANDS = [
  'run',
  'tool run',
] as const;
```

### Validation Function

```typescript
function validateUvExecution(command: string, args: string[]): void {
  // uvx: Only validate Python patterns
  if (command === 'uvx') {
    // Check for -c, eval(), exec(), etc.
    return;
  }

  // uv: Validate subcommand
  const subcommand = args[0];

  // Block dangerous subcommands
  for (const blocked of BLOCKED_UV_SUBCOMMANDS) {
    if (fullSubcommand.startsWith(blocked)) {
      throw new Error(`Blocked: ${blocked}`);
    }
  }

  // Allow safe subcommands
  if (SAFE_UV_SUBCOMMANDS.includes(subcommand)) {
    return;
  }

  // Warn on unknown but allow with caution
}
```

---

## Integration Points

### 1. Command Resolution (commandResolver.ts)

```typescript
// Resolves uv/uvx from PATH
if (command === 'uv' || command === 'uvx') {
  const resolvedPath = await which(command);
  return { command: resolvedPath, args };
}
```

### 2. Runtime Security (validateRuntimeSecurity)

```typescript
// Validates all MCP server executions
if (baseCommand === 'uv' || baseCommand === 'uvx') {
  validateUvExecution(baseCommand, args);
  return;
}
```

### 3. Deep Link Security (validateMCPCommand)

```typescript
// Enforces whitelist for deep links
if (baseCommand === 'uvx') {
  validateUvxPackage(packageName, args); // Checks whitelist
  return;
}
```

---

## Security Test Cases

### Test 1: uvx with Official Package
```typescript
// Input
{ command: "uvx", args: ["mcp-server-git"] }

// Expected: ✅ Pass
// Reason: Official MCP package in whitelist
```

### Test 2: uvx with Local Wheel (Manual Config)
```typescript
// Input
{ command: "uvx", args: ["/path/to/wheel.whl"] }

// Expected: ✅ Pass (manual), ❌ Fail (deep link)
// Reason: Local paths allowed for manual, blocked for deep links
```

### Test 3: uv run with Module
```typescript
// Input
{ command: "uv", args: ["run", "-m", "my_mcp"] }

// Expected: ✅ Pass
// Reason: Safe execution in project environment
```

### Test 4: uv pip install
```typescript
// Input
{ command: "uv", args: ["pip", "install", "package"] }

// Expected: ❌ Fail
// Reason: Persistent installation blocked
```

### Test 5: uvx with -c flag
```typescript
// Input
{ command: "uvx", args: ["-c", "import os; os.system('ls')"] }

// Expected: ❌ Fail
// Reason: Arbitrary code execution blocked
```

### Test 6: uv tool install
```typescript
// Input
{ command: "uv", args: ["tool", "install", "package"] }

// Expected: ❌ Fail
// Reason: Persistent tool installation blocked
```

### Test 7: Unknown uv subcommand
```typescript
// Input
{ command: "uv", args: ["unknown", "subcommand"] }

// Expected: ⚠️ Warning + Allow
// Reason: Future compatibility, logged for review
```

### Test 8: uv run with dangerous pattern
```typescript
// Input
{ command: "uv", args: ["run", "-c", "malicious"] }

// Expected: ❌ Fail
// Reason: -c pattern blocked in arguments
```

### Test 9: uvx with --python flag
```typescript
// Input
{ command: "uvx", args: ["--python", "3.13", "google-news-trends-mcp@latest"] }

// Expected: ✅ Pass
// Reason: Flags are skipped, package "google-news-trends-mcp@latest" extracted correctly
```

### Test 10: uvx with multiple flags
```typescript
// Input
{ command: "uvx", args: ["--python", "3.12", "--with", "requests", "--with", "pandas", "my-mcp-server"] }

// Expected: ✅ Pass
// Reason: All flags skipped, package "my-mcp-server" validated
```

---

## Comparison with Traditional Methods

| Aspect | venv + python | uvx | uv run |
|--------|---------------|-----|--------|
| Isolation | Manual | ✅ Auto | ✅ Auto |
| Persistence | Permanent | Temporary | Project |
| Cleanup | Manual | ✅ Auto | ✅ Auto |
| Speed | Slow | ⚡ Fast | ⚡ Fast |
| Security | Depends | ✅ High | ✅ High |
| Use Case | Control | One-off | Development |

---

## Future Considerations

### Potential Additions

1. **Rate Limiting**: Limit number of `uvx` executions per minute (DoS prevention)
2. **Checksum Validation**: Verify wheel file checksums for local installations
3. **Allowlist Expansion**: Add more official MCP packages as they're verified
4. **Monitoring**: Track which packages are most used via telemetry

### Known Limitations

1. **Local Path Trust**: Manual configurations with local paths are trusted implicitly
2. **Unknown Subcommands**: Future `uv` subcommands allowed by default (with warning)
3. **No Network Validation**: Doesn't validate download sources (relies on uv's integrity)

---

## References

- [uv Documentation](https://docs.astral.sh/uv/)
- [Levante MCP Security](../MCP_DEEP_LINK_SECURITY.md)
- [Local MCP Development Guide](../developer/local-mcp-development.md)
- [Package Validator Source](../../src/main/services/mcp/packageValidator.ts)
