# Deep Linking in Levante

Levante supports deep linking using the custom protocol `levante://`, allowing external applications, websites, and scripts to trigger actions within the application.

## Protocol

**Protocol Name**: `levante://`

The application automatically registers this protocol with the operating system:
- **macOS**: Via `open-url` event handler
- **Windows/Linux**: Via command-line argument parsing

## Supported Deep Link Actions

### 1. Add MCP Server

Add a Model Context Protocol server to Levante's configuration.

**URL Format**:
```
levante://mcp/add?name=<server-name>&type=<server-type>&<config-params>
```

**Parameters**:
- `name` (required): Display name for the MCP server
- `type` (required): Server type - one of: `stdio`, `http`, `sse`

**For `stdio` type**:
- `command` (required): Command to execute (e.g., `npx`, `node`)
- `args` (optional): Comma-separated list of arguments (e.g., `@modelcontextprotocol/server-memory`)

**For `http` or `sse` types**:
- `url` (required): Base URL of the server
- `headers` (optional): JSON-encoded headers object

**Examples**:

```bash
# Add stdio MCP server
levante://mcp/add?name=Memory%20Server&type=stdio&command=npx&args=@modelcontextprotocol/server-memory

# Add HTTP MCP server
levante://mcp/add?name=Custom%20Server&type=http&url=http://localhost:3000

# Add SSE MCP server with headers
levante://mcp/add?name=Secure%20Server&type=sse&url=https://api.example.com&headers=%7B%22Authorization%22%3A%22Bearer%20token%22%7D
```

**Behavior**:
1. Opens Levante and focuses the window
2. Navigates to the Store page
3. Attempts to add the MCP server to configuration
4. Logs success or error to the application logs

---

### 2. Create New Chat with Auto-Send

Create a new chat session and optionally send a message automatically.

**URL Format**:
```
levante://chat/new?prompt=<message>&autoSend=<true|false>
```

**Parameters**:
- `prompt` (required): The message text to send (URL-encoded)
- `autoSend` (optional): Whether to send the message automatically (default: `false`)

**Examples**:

```bash
# Create new chat with pre-filled prompt (user must send manually)
levante://chat/new?prompt=Explain%20quantum%20computing

# Create new chat and send message automatically
levante://chat/new?prompt=What%27s%20the%20weather%20today%3F&autoSend=true

# With complex message
levante://chat/new?prompt=Write%20a%20function%20to%20calculate%20fibonacci%20numbers&autoSend=true
```

**Behavior**:
1. Opens Levante and focuses the window
2. Navigates to the Chat page
3. Creates a new chat session
4. If `autoSend=true`:
   - Selects the first available model
   - Sends the message automatically
   - Streams the AI response
5. If `autoSend=false` or omitted:
   - Pre-fills the input field with the prompt
   - User must click Send manually

---

## Implementation Architecture

### Main Process (`src/main/`)

**DeepLinkService** (`services/deepLinkService.ts`):
- Parses deep link URLs
- Validates parameters
- Converts URLs to `DeepLinkAction` objects
- Sends actions to renderer via IPC

**main.ts**:
- Registers the `levante://` protocol
- Handles `open-url` events (macOS)
- Handles command-line arguments (Windows/Linux)
- Delegates to DeepLinkService

### Preload Script (`src/preload/preload.ts`)

Exposes `window.levante.onDeepLink()` API:
```typescript
window.levante.onDeepLink((action: DeepLinkAction) => {
  // Handle deep link action
});
```

### Renderer Process (`src/renderer/`)

**App.tsx**:
- Listens for deep link events
- Executes appropriate actions:
  - For `mcp-add`: Navigates to Store and adds MCP server
  - For `chat-new`: Creates chat and optionally sends message

---

## Testing Deep Links

### macOS/Linux

```bash
# Test from terminal
open "levante://chat/new?prompt=Hello%20World&autoSend=true"

# Or use xdg-open on Linux
xdg-open "levante://chat/new?prompt=Hello%20World&autoSend=true"
```

### Windows

```powershell
# PowerShell
Start-Process "levante://chat/new?prompt=Hello%20World&autoSend=true"

# Command Prompt
start levante://chat/new?prompt=Hello%20World&autoSend=true
```

### HTML Links

```html
<a href="levante://chat/new?prompt=Explain%20AI&autoSend=true">
  Ask Levante about AI
</a>

<a href="levante://mcp/add?name=Memory&type=stdio&command=npx&args=@modelcontextprotocol/server-memory">
  Install Memory MCP Server
</a>
```

---

## URL Encoding

Always URL-encode special characters in parameters:
- Space: `%20`
- Question mark: `%3F`
- Ampersand: `%26`
- Equals: `%3D`
- Quotes: `%22`

**JavaScript Example**:
```javascript
const prompt = "What's the meaning of life?";
const encodedPrompt = encodeURIComponent(prompt);
const deepLink = `levante://chat/new?prompt=${encodedPrompt}&autoSend=true`;
```

---

## Security Considerations

1. **Protocol Registration**: The protocol is registered only for the current user
2. **Input Validation**: All deep link parameters are validated in DeepLinkService
3. **MCP Server Safety**: User should verify MCP servers from untrusted sources
4. **Auto-Send Limitation**: Auto-send only works with default model and basic settings
5. **Logging**: All deep link actions are logged for security auditing

---

## Use Cases

### Documentation Links
Embed deep links in documentation to:
- Install recommended MCP servers
- Open example conversations
- Pre-fill support requests

### Browser Extensions
Create browser extensions that:
- Send selected text to Levante
- Add MCP servers from web pages
- Create chats from web content

### Command-Line Tools
Scripts that:
- Automate chat creation
- Install MCP servers programmatically
- Integrate with development workflows

### Marketing & Onboarding
- "Try this feature" links in emails
- Quick-start guides with one-click actions
- Pre-configured demo experiences

---

## Troubleshooting

### Deep Link Not Working

**macOS**:
1. Check if protocol is registered:
   ```bash
   /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -dump | grep levante
   ```
2. Re-install the application

**Windows**:
1. Check registry:
   ```
   HKEY_CURRENT_USER\Software\Classes\levante
   ```
2. Re-install the application

**Linux**:
1. Check `.desktop` file includes protocol handler
2. Update desktop database:
   ```bash
   update-desktop-database ~/.local/share/applications
   ```

### Logs

Deep link events are logged with the `core` category:
```
logger.core.info('Received deep link URL', { url });
logger.core.info('Parsed deep link action', { type, data });
```

Enable core logging in `.env.local`:
```bash
DEBUG_CORE=true
LOG_LEVEL=debug
```

---

## Future Enhancements

Potential additional deep link actions:
- `levante://settings` - Open specific settings page
- `levante://chat/session/<id>` - Load specific chat session
- `levante://mcp/enable/<server-id>` - Enable/disable MCP server
- `levante://model/select/<model-id>` - Switch to specific model

---

## API Reference

### DeepLinkAction Type

```typescript
interface DeepLinkAction {
  type: 'mcp-add' | 'chat-new';
  data: Record<string, unknown>;
}
```

### MCP Add Action Data

```typescript
{
  type: 'mcp-add',
  data: {
    name: string;
    config: MCPServerConfig;
  }
}
```

### Chat New Action Data

```typescript
{
  type: 'chat-new',
  data: {
    prompt: string;
    autoSend: boolean;
  }
}
```
