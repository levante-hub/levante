# MCP Deep Link Security System

This document describes the multi-layered security system implemented for MCP server installation via deep links.

## Overview

When a user clicks on a deep link like `levante://mcp/add?...`, instead of immediately installing the server, Levante now opens a comprehensive security confirmation modal that validates the server configuration and helps users make informed decisions.

## Security Architecture

### 1. Multi-Level Validation

#### Level 1: Structural Validation (Immediate)
**Location**: `useServerValidation` hook

Validates:
- Required fields presence (`transport`, `command`/`url`)
- Transport type is valid (`stdio`, `http`, `sse`)
- URL format for HTTP/SSE transports
- Dangerous commands detection (`rm`, `sudo`, `curl`, etc.)
- Shell operator injection patterns (`&&`, `||`, `;`, `|`)

**Output**: Errors and warnings list

#### Level 2: Package Verification (2-3 seconds)
**Location**: `usePackageVerification` hook

Validates:
- Package existence on npm registry
- Official MCP package recognition
- Package name patterns

**Output**: `exists`, `isOfficial` flags

#### Level 3: AI Security Analysis (5-10 seconds, optional)
**Location**: `MCPDeepLinkModal` component

Uses the configured AI model to analyze:
- Command legitimacy
- Suspicious argument patterns
- Command injection attempts
- Similarity to known official servers

**Output**: Risk level (low/medium/high) and analysis text

### 2. Trust Level System

**Verified Official** 🟢
- Package is in `OFFICIAL_MCP_PACKAGES` list
- Enabled by default after validation
- Fast approval process

**Community Package** 🟡
- Package follows MCP naming conventions
- Not in official list
- Requires extra caution

**Unknown Source** 🔴
- Unknown package or custom command
- Strong warnings displayed
- AI analysis recommended

### 3. Official MCP Packages List

Located in: `src/renderer/constants/mcpSecurity.ts`

Currently includes:
- `@modelcontextprotocol/server-memory`
- `@modelcontextprotocol/server-filesystem`
- `@modelcontextprotocol/server-sqlite`
- `@modelcontextprotocol/server-postgres`
- `@modelcontextprotocol/server-brave-search`
- `@modelcontextprotocol/server-fetch`
- `@modelcontextprotocol/server-github`
- `@modelcontextprotocol/server-google-maps`
- `@modelcontextprotocol/server-puppeteer`
- `@modelcontextprotocol/server-slack`
- `@modelcontextprotocol/server-everything`

**Note**: This list should be updated as new official packages are released.

### 4. Trusted Sources

Located in: `src/renderer/constants/mcpSecurity.ts`

Currently includes:
- `modelcontextprotocol.io`
- `github.com/modelcontextprotocol`
- `anthropic.com`
- `docs.anthropic.com`

Deep links from these domains could receive preferential treatment in future versions.

## User Interface

### Modal Components

**MCPDeepLinkModal** (Main)
- Orchestrates the entire validation flow
- Manages AI analysis
- Handles server addition

**TrustBadge**
- Visual indicator of trust level
- Color-coded (green/yellow/red)

**ServerInfoPanel**
- Displays human-readable server information
- Shows command/URL clearly

**JSONPreview**
- Raw JSON configuration
- Copy to clipboard functionality

**ValidationPanel**
- Real-time validation results
- Errors displayed in red
- Warnings in yellow
- Success checks in green

**AISecurityPanel**
- AI analysis results
- Risk level assessment
- Recommendations list

**SecurityWarnings**
- Standard security reminders
- Best practices

### User Flow

```
1. User clicks deep link
   ↓
2. App opens modal with loading state
   ↓
3. Structural validation (instant)
   ↓
4. Package verification starts (2-3s)
   ↓
5. AI security analysis starts (5-10s)
   ↓
6. Results displayed with trust badge
   ↓
7. User reviews:
   - Server info
   - JSON config
   - Validation results
   - AI analysis
   - Security warnings
   ↓
8. User chooses:
   - Cancel → Close modal
   - Add as disabled → Safe testing
   - Validate & Add → Enable immediately
   ↓
9. Server added, toast notification
   ↓
10. User can manage in Store page
```

## Security Features

### 1. Command Injection Prevention
- Detects shell operators in arguments
- Warns about suspicious patterns
- Validates command format

### 2. Package Verification
- Checks npm registry in real-time
- Identifies official packages
- Warns about non-existent packages

### 3. AI-Powered Analysis
- Analyzes configuration semantically
- Detects obfuscation attempts
- Provides natural language assessment

### 4. Test Mode
- "Add as disabled" checkbox
- Allows users to add servers without enabling
- Safe testing before activation

### 5. Audit Trail
- All deep link actions logged
- Includes trust level and user decision
- Timestamped for security review

## Implementation Files

### Core Components
```
src/renderer/
├── constants/
│   └── mcpSecurity.ts              # Trust levels, official packages
├── hooks/
│   ├── useServerValidation.ts      # Level 1 validation
│   └── usePackageVerification.ts   # Level 2 validation
└── components/mcp/deep-link/
    ├── MCPDeepLinkModal.tsx        # Main modal
    ├── TrustBadge.tsx              # Trust indicator
    ├── ServerInfoPanel.tsx         # Server details
    ├── JSONPreview.tsx             # Config preview
    ├── ValidationPanel.tsx         # Validation results
    ├── AISecurityPanel.tsx         # AI analysis
    └── SecurityWarnings.tsx        # Security reminders
```

### Integration Points
- `src/renderer/App.tsx`: Deep link handler
- `src/main/services/deepLinkService.ts`: URL parsing
- `docs/DEEP_LINKING.md`: User documentation

## Future Enhancements

### Potential Improvements

1. **URL Signature Verification**
   - Support for signed deep links
   - Trusted source verification
   - Certificate-based validation

2. **Rate Limiting**
   - Prevent deep link spam
   - Daily/hourly limits
   - CAPTCHA for suspicious activity

3. **Community Reputation System**
   - User ratings for packages
   - Community trust scores
   - Installation statistics

4. **Pre-flight Checks**
   - Verify command availability
   - Test package download
   - Show version information

5. **Diff View**
   - Compare with existing servers
   - Highlight changes
   - Update warnings

6. **Security Settings**
   - User-configurable security levels
   - Auto-approve official packages option
   - Block all deep links option

7. **Audit Dashboard**
   - View deep link history
   - Security incidents log
   - Trust level statistics

## Testing Recommendations

### Test Cases

1. **Official Package**
   ```bash
   open "levante://mcp/add?name=Memory&transport=stdio&command=npx&args=@modelcontextprotocol/server-memory"
   ```
   - Should show green trust badge
   - AI analysis should rate as low risk
   - Package verification should succeed

2. **Unknown Package**
   ```bash
   open "levante://mcp/add?name=Custom&transport=stdio&command=node&args=my-custom-server.js"
   ```
   - Should show red trust badge
   - Warnings displayed
   - AI analysis recommends caution

3. **Malicious Pattern**
   ```bash
   open "levante://mcp/add?name=Bad&transport=stdio&command=rm&args=-rf,/"
   ```
   - Should detect dangerous command
   - Validation errors displayed
   - Add button disabled

4. **HTTP Server**
   ```bash
   open "levante://mcp/add?name=API&transport=http&url=http://localhost:3000"
   ```
   - URL format validated
   - No package verification needed
   - Trust level: unknown

## Security Best Practices for Users

1. **Always Review**: Never blindly click "Add" on deep links
2. **Verify Source**: Check where the link came from
3. **Test Mode**: Use "Add as disabled" for unknown packages
4. **Official First**: Prefer official MCP packages
5. **Check Docs**: Verify package names against official documentation
6. **Report Issues**: Flag suspicious deep links

## Maintenance

### Updating Official Packages

When new official MCP packages are released:

1. Update `src/renderer/constants/mcpSecurity.ts`
2. Add to `OFFICIAL_MCP_PACKAGES` array
3. Test with deep link
4. Update documentation

### Updating Trusted Sources

When adding trusted domains:

1. Verify domain ownership
2. Add to `TRUSTED_SOURCES` array
3. Document reason for trust
4. Review periodically

## Conclusion

The MCP Deep Link Security System provides defense-in-depth against malicious server installations while maintaining usability for legitimate use cases. The multi-level validation, combined with AI analysis and user-friendly UI, helps users make informed security decisions.
