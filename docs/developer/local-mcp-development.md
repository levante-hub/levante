# Local MCP Server Development Guide

This guide covers best practices for developing and testing MCP (Model Context Protocol) servers locally with Levante.

## Table of Contents

- [Overview](#overview)
- [Development Options](#development-options)
- [Quick Start](#quick-start)
- [Configuration Examples](#configuration-examples)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Overview

Levante supports multiple approaches for running local MCP servers during development. Each method has different trade-offs between isolation, convenience, and hot-reload capabilities.

### Supported Execution Methods

| Method | Best For | Isolation | Hot Reload | Setup Speed |
|--------|----------|-----------|------------|-------------|
| `uvx` with wheel | Testing stable builds | ✅ Automatic | ❌ No | ⚡ Fast |
| `uvx --from` path | Quick testing | ✅ Automatic | ❌ No | ⚡ Fast |
| `uv run` | Active development | ✅ Automatic | ✅ Yes | ⚡ Fast |
| `python -m` with venv | Manual control | ⚠️ Manual | ✅ Yes | 🐌 Slow |

## Development Options

### Option 1: uvx with Local Wheel (Recommended for Testing)

**When to use:** Testing a specific build before publishing to PyPI.

**Configuration:**
```json
{
  "type": "stdio",
  "command": "uvx",
  "args": [
    "/Users/yourname/mcps/my-mcp-server/dist/my_mcp_server-0.1.0-py3-none-any.whl"
  ],
  "env": {
    "API_TOKEN": "your-token-here"
  }
}
```

**Build workflow:**
```bash
cd /Users/yourname/mcps/my-mcp-server
uv build  # Generates wheel in dist/

# Levante will execute the wheel in an isolated temporary environment
```

**Advantages:**
- ✅ Complete isolation (no system contamination)
- ✅ Fast execution (uv is optimized for speed)
- ✅ Reproducible (specific wheel version)
- ✅ Automatic dependency management
- ✅ Clean teardown (temporary environments)

**Disadvantages:**
- ❌ Requires rebuild for every code change
- ❌ No hot-reload during development

---

### Option 2: uvx with --from Local Path

**When to use:** Quick testing without building a wheel.

**Configuration:**
```json
{
  "type": "stdio",
  "command": "uvx",
  "args": [
    "--from",
    "/Users/yourname/mcps/my-mcp-server",
    "my-mcp-server"
  ],
  "env": {
    "API_TOKEN": "your-token-here"
  }
}
```

**Requirements:**
- Your project must have a valid `pyproject.toml`
- Entry point must be defined in `[project.scripts]`

**Example pyproject.toml:**
```toml
[project]
name = "my-mcp-server"
version = "0.1.0"

[project.scripts]
my-mcp-server = "my_mcp_server.main:main"
```

**Advantages:**
- ✅ No build step required
- ✅ Reads directly from source
- ✅ Automatic isolated environment
- ✅ Respects pyproject.toml configuration

**Disadvantages:**
- ❌ No hot-reload
- ⚠️ Requires proper package structure

---

### Option 3: uv run (Best for Active Development)

**When to use:** Developing and making frequent code changes.

**Configuration:**
```json
{
  "type": "stdio",
  "command": "uv",
  "args": [
    "run",
    "--directory",
    "/Users/yourname/mcps/my-mcp-server",
    "-m",
    "my_mcp_server"
  ],
  "env": {
    "API_TOKEN": "your-token-here"
  }
}
```

**Advantages:**
- ✅ **Hot-reload**: Code changes reflected immediately
- ✅ Uses project's `pyproject.toml` and dependencies
- ✅ Automatic dependency resolution
- ✅ Perfect for TDD (Test-Driven Development)
- ✅ Isolated project environment

**Disadvantages:**
- ⚠️ Slightly slower startup (creates/syncs venv)

---

### Option 4: python -m with Virtual Environment

**When to use:** Maximum control over environment or compatibility with existing workflows.

**Configuration:**
```json
{
  "type": "stdio",
  "command": "/Users/yourname/mcps/my-mcp-server/.venv/bin/python",
  "args": [
    "-m",
    "my_mcp_server"
  ],
  "env": {
    "API_TOKEN": "your-token-here"
  }
}
```

**Setup workflow:**
```bash
cd /Users/yourname/mcps/my-mcp-server
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e .
```

**Advantages:**
- ✅ Hot-reload with editable install (`pip install -e .`)
- ✅ Full control over environment
- ✅ Compatible with traditional Python workflows
- ✅ Works with any Python version

**Disadvantages:**
- 🐌 Manual venv management
- 📦 Persistent environment (not cleaned automatically)
- 📝 Manual dependency updates

---

## Quick Start

### For New MCP Server Projects

**1. Create project with uv:**
```bash
# Create new Python project
uv init my-mcp-server
cd my-mcp-server

# Add dependencies
uv add mcp

# Create entry point
mkdir -p src/my_mcp_server
cat > src/my_mcp_server/__init__.py << 'EOF'
from mcp.server import Server

def main():
    server = Server("my-mcp-server")
    # Your MCP server logic here
    server.run()

if __name__ == "__main__":
    main()
EOF

# Configure entry point in pyproject.toml
cat >> pyproject.toml << 'EOF'

[project.scripts]
my-mcp-server = "my_mcp_server:main"
EOF
```

**2. Add to Levante:**

Go to **Store → MCPs Activos → Añadir Integración Personalizada**:

```json
{
  "name": "My MCP Server",
  "type": "stdio",
  "command": "uv",
  "args": [
    "run",
    "--directory",
    "/full/path/to/my-mcp-server",
    "-m",
    "my_mcp_server"
  ]
}
```

**3. Develop and test:**
- Make changes to your code
- Restart the MCP server in Levante (toggle off/on)
- Changes are reflected immediately

---

### For Existing MCP Server Projects

**If using requirements.txt:**
```bash
cd /path/to/existing-mcp-server

# Convert to pyproject.toml (optional but recommended)
uv init --python-version 3.11

# Install dependencies
uv sync
```

**Configure in Levante:**
```json
{
  "name": "Existing MCP Server",
  "type": "stdio",
  "command": "uv",
  "args": [
    "run",
    "--directory",
    "/path/to/existing-mcp-server",
    "python",
    "-m",
    "module_name"
  ]
}
```

---

## Configuration Examples

### Example 1: MCP Server with Custom Python Version

```json
{
  "name": "My MCP (Python 3.12)",
  "type": "stdio",
  "command": "uvx",
  "args": [
    "--python",
    "3.12",
    "--from",
    "/Users/dev/my-mcp",
    "my-mcp-server"
  ]
}
```

### Example 2: MCP Server with Additional Dependencies

```json
{
  "name": "MCP with Extra Packages",
  "type": "stdio",
  "command": "uvx",
  "args": [
    "--with",
    "requests",
    "--with",
    "pandas",
    "--from",
    "/Users/dev/my-mcp",
    "my-mcp-server"
  ]
}
```

### Example 3: Development with Hot Reload

```json
{
  "name": "My MCP (Dev Mode)",
  "type": "stdio",
  "command": "uv",
  "args": [
    "run",
    "--directory",
    "/Users/dev/my-mcp",
    "-m",
    "my_mcp_server"
  ],
  "env": {
    "DEBUG": "true",
    "LOG_LEVEL": "debug"
  }
}
```

### Example 4: Testing Built Wheel

```json
{
  "name": "My MCP (Wheel Test)",
  "type": "stdio",
  "command": "uvx",
  "args": [
    "/Users/dev/my-mcp/dist/my_mcp_server-1.0.0-py3-none-any.whl"
  ]
}
```

---

## Security Considerations

### What Levante Allows

Levante's security validation permits the following for **manually configured** MCP servers:

#### ✅ Permitted Patterns

- **Module execution**: `python -m module_name`
- **Script execution**: `python script.py`
- **UV/UVX commands**: `uvx`, `uv run`
- **Local paths**: Any absolute path to Python or wheel files
- **Custom modules**: Any module name (no whitelist for manual config)

#### ❌ Blocked Patterns

- **Arbitrary code execution**: `python -c "malicious code"`
- **Package installation**: `python -m pip install package`
- **Environment manipulation**: `python -m venv`, `python -m site`
- **Dynamic imports**: Arguments containing `eval()`, `exec()`, `__import__()`
- **Dangerous system commands**: `bash`, `sh`, `curl`, `wget`, `rm`, `sudo`

### Deep Links vs Manual Configuration

| Validation Type | Deep Links | Manual UI Config |
|-----------------|------------|------------------|
| Package whitelist | ✅ Enforced | ❌ Not enforced |
| Dangerous patterns | ✅ Blocked | ✅ Blocked |
| Custom packages | ❌ Rejected | ✅ Allowed |
| Local paths | ❌ Rejected | ✅ Allowed |

**Why this difference?**
- **Deep links** can come from untrusted sources (websites, emails) → Strict whitelist
- **Manual config** requires user action in the app → User is explicitly trusting the package

### Best Practices

1. **Use `uv`/`uvx` for isolation**: Automatic temporary environments are safer
2. **Avoid system Python**: Use project-specific virtual environments
3. **Review dependencies**: Check `pyproject.toml` for suspicious packages
4. **Use version control**: Keep MCP server code in git
5. **Test in development**: Use `uv run` before building wheels

---

## Troubleshooting

### Issue: "Python command requires arguments"

**Cause:** Empty `args` array in configuration.

**Solution:**
```json
{
  "command": "python",
  "args": ["-m", "my_module"]  // Must specify module or script
}
```

---

### Issue: "Python module 'pip' is blocked for security reasons"

**Cause:** Trying to use `python -m pip` in configuration.

**Solution:** Install dependencies before running:
```bash
cd /path/to/project
uv sync  # or pip install -r requirements.txt
```

Then use:
```json
{
  "command": "uv",
  "args": ["run", "--directory", "/path/to/project", "-m", "module_name"]
}
```

---

### Issue: "uvx command not found"

**Cause:** `uv` is not installed or not in PATH.

**Solution:**
```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Verify installation
uvx --version
```

---

### Issue: Changes not reflected after code edits

**Cause:** Using `uvx` with wheel or `--from` path (no hot reload).

**Solution:** Switch to `uv run`:
```json
{
  "command": "uv",
  "args": ["run", "--directory", "/path/to/project", "-m", "module_name"]
}
```

Or restart the MCP server in Levante after each change.

---

### Issue: "Module not found" with uv run

**Cause:** Module not properly configured in `pyproject.toml`.

**Solution:**

**Option A - Run as module:**
```toml
# pyproject.toml
[project]
name = "my-mcp-server"
```

```json
{
  "command": "uv",
  "args": ["run", "-m", "my_mcp_server"]
}
```

**Option B - Run as script:**
```toml
# pyproject.toml
[project.scripts]
my-mcp-server = "my_mcp_server.main:main"
```

```json
{
  "command": "uv",
  "args": ["run", "my-mcp-server"]
}
```

---

### Issue: "Permission denied" when running Python from venv

**Cause:** Python binary doesn't have execute permissions.

**Solution:**
```bash
chmod +x /path/to/.venv/bin/python
```

Or use `uv run` instead to avoid permission issues.

---

## Additional Resources

- [uv Documentation](https://docs.astral.sh/uv/)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Levante MCP Security](../MCP_DEEP_LINK_SECURITY.md)
- [Python Packaging Guide](https://packaging.python.org/)

---

## Summary: Which Method Should I Use?

**Quick Decision Tree:**

```
Are you actively developing (making frequent changes)?
├─ YES → Use `uv run` (hot reload)
└─ NO
   ├─ Do you have a wheel built?
   │  ├─ YES → Use `uvx wheel_file.whl` (fastest)
   │  └─ NO → Use `uvx --from /path/to/project` (convenient)
   └─ Need maximum control?
      └─ YES → Use `python -m` with venv (traditional)
```

**Most common workflow:**

1. **Development**: `uv run` for hot-reload
2. **Pre-release testing**: `uvx --from /path/to/project`
3. **Final testing**: `uvx built_wheel.whl`
4. **Production**: Install from PyPI with `uvx package-name`
