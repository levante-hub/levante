/**
 * Widget Protocol Types
 *
 * Defines types and detection logic for different widget protocols:
 * - MCP Apps (SEP-1865): Uses window.mcpApp API with JSON-RPC 2.0
 * - OpenAI Apps SDK: Uses window.openai API with custom postMessage
 * - MCP-UI: Inline ui:// resources (handled by @mcp-ui/client)
 *
 * Detection priority (following MCPJam Inspector):
 * 1. MCP Apps: ui/resourceUri in tool metadata
 * 2. OpenAI Apps SDK: openai/outputTemplate in tool metadata
 * 3. MCP-UI: Inline ui:// resource in tool result
 */

/**
 * Supported widget protocols
 */
export type WidgetProtocol = 'mcp-apps' | 'openai-sdk' | 'mcp-ui' | 'none';

/**
 * Widget metadata extracted from tool result
 */
export interface WidgetMetadata {
  protocol: WidgetProtocol;
  /** Resource URI for fetching widget HTML (MCP Apps) */
  resourceUri?: string;
  /** Output template URI (OpenAI Apps SDK) */
  outputTemplate?: string;
  /** Inline HTML content */
  html?: string;
  /** Base URL for resolving relative paths */
  baseUrl?: string;
  /** Whether this is an Apps SDK widget (legacy flag) */
  isAppsSdk?: boolean;
}

/**
 * Tool behavior annotations (OpenAI Apps SDK)
 * Used to communicate tool characteristics to widgets
 */
export interface ToolAnnotations {
  /** Whether the tool only reads data without making changes */
  readOnlyHint?: boolean;
  /** Whether the tool may perform destructive updates */
  destructiveHint?: boolean;
  /** Whether the tool can be called multiple times with same result */
  idempotentHint?: boolean;
  /** Whether the tool operates on an open world (external systems) */
  openWorldHint?: boolean;
}

/**
 * User location hint (OpenAI Apps SDK)
 * Provides geographic context to widgets
 */
export interface UserLocationHint {
  /** City name */
  city?: string;
  /** Country code (ISO 3166-1 alpha-2) */
  country?: string;
  /** Region/state/province */
  region?: string;
  /** Timezone (IANA format, e.g., 'America/New_York') */
  timezone?: string;
}

/**
 * Common options for widget bridge injection
 */
export interface WidgetBridgeOptions {
  /** Unique widget identifier */
  widgetId: string;
  /** Widget session ID - stable across widget lifecycle (OpenAI Apps SDK) */
  widgetSessionId?: string;
  /** Tool input arguments */
  toolInput: Record<string, unknown>;
  /** Tool output/result */
  toolOutput: Record<string, unknown>;
  /** Response metadata */
  responseMetadata?: Record<string, unknown>;
  /** User locale */
  locale?: string;
  /** UI theme */
  theme?: 'light' | 'dark' | 'system';
  /** Server ID for tool calls */
  serverId?: string;
  /** Whether widget prefers a border (OpenAI Apps SDK) */
  widgetPrefersBorder?: boolean;
  /** Tool invocation status text (OpenAI Apps SDK) */
  invocationStatusText?: {
    invoking?: string;
    invoked?: string;
  };
  /** Tool behavior annotations (OpenAI Apps SDK) */
  annotations?: ToolAnnotations;
  /** User location hint (OpenAI Apps SDK) */
  userLocation?: UserLocationHint;
}

/**
 * Host context sent to widgets
 */
export interface WidgetHostContext {
  theme: 'light' | 'dark';
  locale: string;
  displayMode: 'inline' | 'pip' | 'fullscreen';
  maxHeight?: number;
  safeArea?: {
    insets: { top: number; bottom: number; left: number; right: number };
  };
  userAgent?: {
    device: { type: string };
    capabilities: { hover: boolean; touch: boolean };
  };
}

/**
 * Detect which widget protocol to use based on tool metadata
 *
 * Priority order:
 * 1. MCP Apps (SEP-1865): Has ui/resourceUri
 * 2. OpenAI Apps SDK: Has openai/outputTemplate
 * 3. MCP-UI: Has embedded ui:// resource
 *
 * @param toolMeta - Tool metadata (_meta field)
 * @param toolResult - Tool execution result
 * @returns Detected protocol type
 */
export function detectWidgetProtocol(
  toolMeta?: Record<string, unknown>,
  toolResult?: { content?: Array<{ type: string; resource?: { uri?: string; mimeType?: string } }> }
): WidgetProtocol {
  // 1. Check for MCP Apps (SEP-1865)
  // Support both nested format (_meta.ui.resourceUri — official spec/FastMCP)
  // and flat key format (_meta["ui/resourceUri"] — legacy)
  if (toolMeta?.['ui/resourceUri'] || (toolMeta?.ui as Record<string, unknown>)?.resourceUri) {
    return 'mcp-apps';
  }

  // 2. Check for OpenAI Apps SDK
  if (toolMeta?.['openai/outputTemplate']) {
    return 'openai-sdk';
  }

  // Also check legacy flags
  if (toolMeta?.isAppsSdk || toolMeta?.isSkybridge) {
    return 'openai-sdk';
  }

  // 3. Check for MCP-UI embedded resources
  if (toolResult?.content) {
    const hasUIResource = toolResult.content.some((item) => {
      if (item.type === 'resource') {
        const uri = item.resource?.uri || '';
        const mimeType = item.resource?.mimeType || '';
        return (
          uri.startsWith('ui://') ||
          mimeType === 'text/html' ||
          mimeType.startsWith('text/html+')
        );
      }
      return false;
    });
    if (hasUIResource) {
      return 'mcp-ui';
    }
  }

  return 'none';
}

/**
 * Extract widget metadata from tool result
 */
export function extractWidgetMetadata(
  toolMeta?: Record<string, unknown>,
  toolResult?: {
    content?: Array<{
      type: string;
      resource?: { uri?: string; mimeType?: string; text?: string };
    }>;
  }
): WidgetMetadata {
  const protocol = detectWidgetProtocol(toolMeta, toolResult);

  const metadata: WidgetMetadata = { protocol };

  switch (protocol) {
    case 'mcp-apps':
      metadata.resourceUri = (toolMeta?.['ui/resourceUri'] ||
        (toolMeta?.ui as Record<string, unknown>)?.resourceUri) as string;
      break;

    case 'openai-sdk':
      metadata.outputTemplate = toolMeta?.['openai/outputTemplate'] as string;
      metadata.isAppsSdk = true;
      break;

    case 'mcp-ui':
      // Extract HTML from embedded resource
      if (toolResult?.content) {
        const htmlResource = toolResult.content.find((item) => {
          if (item.type === 'resource') {
            const mimeType = item.resource?.mimeType || '';
            return (
              mimeType === 'text/html' ||
              mimeType.startsWith('text/html+')
            );
          }
          return false;
        });
        if (htmlResource?.resource) {
          metadata.html = htmlResource.resource.text;
          // Extract base URL from resource URI
          if (htmlResource.resource.uri) {
            try {
              const url = new URL(htmlResource.resource.uri);
              metadata.baseUrl = `${url.protocol}//${url.host}`;
            } catch {
              // Invalid URI
            }
          }
        }
      }
      break;
  }

  return metadata;
}
