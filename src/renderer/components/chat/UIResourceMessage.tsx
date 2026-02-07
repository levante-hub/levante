/**
 * UIResourceMessage - Renders MCP UI Resources using @mcp-ui/client v6
 *
 * For MCP Apps (SEP-1865) widgets: Uses AppRenderer which handles the full
 * JSON-RPC 2.0 protocol, ui/initialize handshake, and AppBridge internally.
 *
 * For OpenAI Apps SDK widgets: Uses widget proxy with bridge injection.
 * For standard MCP-UI widgets: Uses UIResourceRenderer.
 */

import React, { useState, useCallback, Suspense, useMemo, useEffect, useRef } from 'react';
import {
  UIResourceRenderer,
  AppRenderer,
  basicComponentLibrary,
  type UIActionResult,
  type AppRendererHandle,
  type SandboxConfig,
} from '@mcp-ui/client';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { useThemeDetector } from '@/hooks/useThemeDetector';
import { useUIResourceActions } from '@/hooks/useUIResourceActions';
import type { UIResource, UIResourceDisplayMode } from '@/types/ui-resource';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Maximize2, PictureInPicture2, X } from 'lucide-react';
import { logger } from '@/services/logger';
import { FullscreenChatInput } from './FullscreenChatInput';
import type { UIMessage } from '@ai-sdk/react';

// Type for UIResourceRenderer's resource prop (using any to avoid SDK type conflicts)
type RendererResource = Parameters<typeof UIResourceRenderer>[0]['resource'];

interface UIResourceMessageProps {
  resource: UIResource;
  serverId?: string;
  className?: string;
  onPrompt?: (prompt: string) => void;
  onSendMessage?: (text: string) => void;
  onToolCall?: (toolName: string, params: Record<string, unknown>) => Promise<unknown>;
  chatMessages?: UIMessage[];
}

/**
 * Widget controls for display mode switching
 */
function WidgetControls({
  mode,
  onModeChange,
  onClose,
}: {
  mode: UIResourceDisplayMode;
  onModeChange: (mode: UIResourceDisplayMode) => void;
  onClose?: () => void;
}) {
  // In fullscreen mode, only show PiP button (X is in header bar)
  const showFullscreenButton = mode !== 'fullscreen';
  const showPipButton = mode !== 'pip';
  const showCloseButton = onClose && mode !== 'fullscreen';

  return (
    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-md p-1">
      {showFullscreenButton && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onModeChange('fullscreen')}
          title="Fullscreen"
        >
          <Maximize2 className="h-3 w-3" />
        </Button>
      )}
      {showPipButton && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onModeChange('pip')}
          title="Picture in Picture"
        >
          <PictureInPicture2 className="h-3 w-3" />
        </Button>
      )}
      {showCloseButton && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          title="Close"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

/**
 * Extract widget/tool name from resource for display in header
 */
function getWidgetName(resource: UIResource): string {
  // Try to extract from metadata
  const meta = resource.resource?._meta;
  if (meta?.toolName && typeof meta.toolName === 'string') {
    return meta.toolName;
  }

  // Fallback to URI - extract last segment
  const uri = resource.resource?.uri || '';
  if (uri) {
    // Handle "ui://server/tool" or similar patterns
    const parts = uri.replace(/^ui:\/\//, '').split('/');
    const lastPart = parts[parts.length - 1];
    if (lastPart) return lastPart;
  }

  return 'Widget';
}

/**
 * Loading fallback for UIResourceRenderer
 */
function UIResourceLoading() {
  return (
    <div className="flex items-center justify-center p-4 min-h-[100px] bg-muted/50 rounded-lg">
      <div className="animate-pulse text-muted-foreground text-sm">
        Loading widget...
      </div>
    </div>
  );
}

/**
 * Error Boundary for UIResourceRenderer to catch initialization errors
 */
class UIResourceErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.mcp.error('UIResourceRenderer error caught by boundary', {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });

    // Check if this is an MCP-UI initialization error
    const isMcpUiError =
      error.message?.includes('ui/initialize') ||
      error.message?.includes('Method not found') ||
      error.message?.includes('-32601');

    if (isMcpUiError) {
      const mcpUiError = new Error(
        'Server does not support MCP-UI protocol. Only standard MCP tools/resources/prompts are available.'
      );
      this.props.onError(mcpUiError);
    } else {
      this.props.onError(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return <UIResourceLoading />;
    }
    return this.props.children;
  }
}

/**
 * Error boundary fallback
 */
function UIResourceError({ error }: { error: Error }) {
  const isMcpUiError = error.message.includes('MCP-UI') || error.message.includes('ui/initialize');

  return (
    <div className="flex flex-col items-center justify-center p-4 min-h-[100px] bg-destructive/10 border border-destructive/20 rounded-lg">
      <p className="text-destructive text-sm font-medium">
        {isMcpUiError ? 'MCP-UI Not Supported' : 'Failed to load widget'}
      </p>
      <p className="text-muted-foreground text-xs mt-1 max-w-md text-center">
        {isMcpUiError ? (
          <>
            This MCP server does not support UI widgets. You can still use its tools, resources, and prompts through chat.
            <br />
            <span className="text-xs opacity-75 mt-1 inline-block">
              (Error: Method 'ui/initialize' not found)
            </span>
          </>
        ) : (
          error.message
        )}
      </p>
    </div>
  );
}

/**
 * Main UIResourceMessage component
 */
export function UIResourceMessage({
  resource,
  serverId,
  className,
  onPrompt,
  onSendMessage,
  onToolCall,
  chatMessages,
}: UIResourceMessageProps) {
  const theme = useThemeDetector();
  const [displayMode, setDisplayMode] = useState<UIResourceDisplayMode>('inline');
  const [error, setError] = useState<Error | null>(null);
  const [isClosed, setIsClosed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Direct iframe ref for proper focus control (MCP-UI recommended approach)
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Track if user manually closed fullscreen to prevent widget from reopening it
  const userClosedFullscreenRef = useRef(false);
  // Chat overlay expanded state (controlled from here for keyboard shortcut to work)
  const [chatExpanded, setChatExpanded] = useState(false);

  // Widget proxy state for HTML widgets that need CSP bypass
  // Uses HTTP localhost proxy instead of srcdoc to give widgets their own origin
  const [widgetProxyUrl, setWidgetProxyUrl] = useState<string | null>(null);
  const [widgetId, setWidgetId] = useState<string | null>(null);
  // Track which HTML content we've already stored to avoid duplicates
  const storedHtmlRef = useRef<string | null | undefined>(null);

  // Sandbox config for MCP Apps widgets (AppRenderer v6)
  const [sandboxConfig, setSandboxConfig] = useState<SandboxConfig | null>(null);
  const appRendererRef = useRef<AppRendererHandle>(null);

  // PiP dragging state
  const [pipPosition, setPipPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Modal state for requestModal API
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalRequest, setModalRequest] = useState<{
    id: number;
    modalId: string;
    url: string;
    title: string;
    width: number;
    height: number;
    eventSource: Window | null;
  } | null>(null);

  const { handleUIAction } = useUIResourceActions({
    serverId,
    onPrompt,
    onToolCall,
  });

  // Check if this is an OpenAI Apps SDK widget (check both isAppsSdk and legacy isSkybridge)
  const isAppsSdkWidget = useMemo(() => {
    const innerResource = resource.resource as { _meta?: { isAppsSdk?: boolean; isSkybridge?: boolean } };
    return !!innerResource?._meta?.isAppsSdk || !!innerResource?._meta?.isSkybridge;
  }, [resource]);

  // Extract widget protocol and bridge options from resource metadata
  const { widgetProtocol, bridgeOptions } = useMemo(() => {
    const innerResource = resource.resource as {
      _meta?: {
        widgetProtocol?: 'mcp-apps' | 'openai-sdk' | 'mcp-ui' | 'none';
        bridgeOptions?: {
          toolInput?: Record<string, unknown>;
          toolOutput?: Record<string, unknown>;
          responseMetadata?: Record<string, unknown>;
          serverId?: string;
        };
      };
    };
    return {
      widgetProtocol: innerResource?._meta?.widgetProtocol || (isAppsSdkWidget ? 'openai-sdk' : 'mcp-ui'),
      bridgeOptions: innerResource?._meta?.bridgeOptions,
    };
  }, [resource, isAppsSdkWidget]);

  // Convert our UIResource to the format expected by UIResourceRenderer
  // The library expects the inner resource object { uri, mimeType, text/blob }
  // NOT the wrapped EmbeddedResource format { type: "resource", resource: {...} }
  const rendererResource = useMemo<RendererResource>(() => {
    // Extract inner resource from EmbeddedResource wrapper
    return resource.resource as unknown as RendererResource;
  }, [resource]);

  // Extract widget data from _meta for passing to iframeRenderData
  // This allows the HTML template to access the data via window.__IFRAME_RENDER_DATA__
  const widgetData = useMemo(() => {
    const innerResource = resource.resource as { _meta?: { widgetData?: Record<string, unknown>; props?: Record<string, unknown> } };
    const data = innerResource?._meta?.widgetData || innerResource?._meta?.props || {};
    logger.mcp.debug('UIResourceMessage extracting widget data', {
      hasInnerResource: !!innerResource,
      hasMeta: !!innerResource?._meta,
      hasWidgetData: !!innerResource?._meta?.widgetData,
      hasProps: !!innerResource?._meta?.props,
      dataKeys: Object.keys(data),
    });
    return data;
  }, [resource]);

  // Convert UIMessage[] to simplified ChatMessage[] for fullscreen overlay
  // Only extract text content, no tool calls or widget renders
  const simplifiedMessages = useMemo(() => {
    if (!chatMessages) return [];
    return chatMessages
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => {
        // Extract text from parts
        const textParts = msg.parts
          ?.filter((part: any) => part?.type === 'text' && part?.text)
          .map((part: any) => part.text) || [];
        const content = textParts.join('\n').trim();
        return {
          role: msg.role as 'user' | 'assistant',
          content,
        };
      })
      .filter((msg) => msg.content); // Only include messages with content
  }, [chatMessages]);

  // Extract HTML content and base URL from resource (memoized to prevent unnecessary re-renders)
  const { widgetHtmlContent, widgetBaseUrl } = useMemo(() => {
    const inner = resource.resource as { mimeType?: string; text?: string; uri?: string };
    // Check for text/html mimeType - handles various formats:
    // - "text/html" (exact)
    // - "text/html+skybridge" (Apps SDK format)
    // - "text/html;profile=mcp-app" (MCP Apps format)
    // - "text/html; charset=utf-8" (with parameters)
    const mimeType = inner?.mimeType || '';
    const isHtml = mimeType === 'text/html' ||
                   mimeType.startsWith('text/html+') ||
                   mimeType.startsWith('text/html;');
    const htmlContent = isHtml ? inner?.text : null;

    // Extract base URL from resource URI for resolving relative paths
    // e.g., "https://example.com/widget/..." -> "https://example.com"
    let baseUrl: string | undefined;
    if (inner?.uri) {
      try {
        const url = new URL(inner.uri);
        baseUrl = `${url.protocol}//${url.host}`;
      } catch {
        // Invalid URI, skip base URL
      }
    }

    return { widgetHtmlContent: htmlContent, widgetBaseUrl: baseUrl };
  }, [resource]);

  // Fetch sandbox proxy URL for MCP Apps widgets using AppRenderer v6
  useEffect(() => {
    if (widgetProtocol !== 'mcp-apps') return;

    let mounted = true;
    async function fetchSandboxUrl() {
      try {
        const proxyInfo = await window.levante?.widget?.getProxyInfo();
        if (!mounted || !proxyInfo?.success || !proxyInfo.port) return;

        const sandboxUrl = new URL(`http://127.0.0.1:${proxyInfo.port}/sandbox-proxy`);
        setSandboxConfig({
          url: sandboxUrl,
          permissions: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation',
        });
        logger.mcp.debug('MCP Apps sandbox config ready', { port: proxyInfo.port });
      } catch (err) {
        logger.mcp.error('Failed to get sandbox proxy URL', { error: err });
      }
    }
    fetchSandboxUrl();
    return () => { mounted = false; };
  }, [widgetProtocol]);

  // Check if this is an HTML resource that needs the HTTP proxy
  // Only OpenAI SDK widgets need the proxy (for bridge injection + real origin)
  // MCP Apps widgets now use AppRenderer v6 which handles its own sandbox
  const needsWidgetProxy = useMemo(() => {
    // MCP Apps widgets use AppRenderer, not the proxy
    if (widgetProtocol === 'mcp-apps') return false;
    // Use HTTP proxy for OpenAI SDK widgets with HTML content
    return isAppsSdkWidget && !!widgetHtmlContent;
  }, [isAppsSdkWidget, widgetProtocol, widgetHtmlContent]);

  // Store HTML content via widget HTTP proxy for Apps SDK widgets
  // This gives the iframe a real origin with permissive CSP instead of null origin with inherited CSP
  // Using widgetHtmlContent in deps ensures we only re-store when HTML actually changes
  useEffect(() => {
    if (!needsWidgetProxy || !widgetHtmlContent) {
      setWidgetProxyUrl(null);
      setWidgetId(null);
      storedHtmlRef.current = null;
      return;
    }

    // Skip if we already stored this exact HTML content
    if (storedHtmlRef.current === widgetHtmlContent) {
      logger.mcp.debug('Widget HTML unchanged, reusing existing proxy URL');
      return;
    }

    let mounted = true;

    async function storeWidget() {
      try {
        // Build storage options with protocol and bridge options for proper bridge injection
        const storeOptions = {
          protocol: widgetProtocol,
          baseUrl: widgetBaseUrl,
          bridgeOptions: bridgeOptions ? {
            toolInput: bridgeOptions.toolInput || {},
            toolOutput: bridgeOptions.toolOutput || {},
            responseMetadata: bridgeOptions.responseMetadata || {},
            locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
            theme: theme as 'light' | 'dark' | 'system',
            serverId: bridgeOptions.serverId || serverId,
          } : undefined,
        };

        logger.mcp.debug('Storing widget with protocol options', {
          protocol: widgetProtocol,
          baseUrl: widgetBaseUrl,
          hasBridgeOptions: !!bridgeOptions,
        });

        const result = await window.levante?.widget?.store(widgetHtmlContent!, storeOptions);
        if (!mounted) return;

        if (result?.success && result.url) {
          storedHtmlRef.current = widgetHtmlContent;
          logger.mcp.info('Widget stored via proxy', {
            widgetId: result.widgetId,
            url: result.url,
            htmlSize: widgetHtmlContent!.length,
            protocol: widgetProtocol,
            baseUrl: widgetBaseUrl,
          });
          setWidgetProxyUrl(result.url);
          setWidgetId(result.widgetId ?? null);
        } else {
          logger.mcp.warn('Failed to store widget via proxy, falling back to UIResourceRenderer', {
            error: result?.error,
          });
        }
      } catch (err) {
        logger.mcp.error('Error storing widget via proxy', { error: err });
      }
    }

    storeWidget();

    // Cleanup: only set mounted to false to prevent state updates after unmount
    // Widget content cleanup is handled by the proxy server's TTL
    return () => {
      mounted = false;
    };
  }, [needsWidgetProxy, widgetHtmlContent, widgetBaseUrl, widgetProtocol, bridgeOptions, theme, serverId]);

  // Global keyboard shortcut for fullscreen chat toggle: Cmd+T (Mac) or Ctrl+T (Windows)
  // This listener is at the UIResourceMessage level so it works even when iframe has focus
  useEffect(() => {
    if (displayMode !== 'fullscreen') return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        e.stopPropagation();
        setChatExpanded((prev) => !prev);
      }
    };

    // Use capture phase to try to catch the event before iframe
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [displayMode]);

  // Set up bridge event listeners for OpenAI SDK widgets (and MCP Apps fallback when AppRenderer not ready)
  useEffect(() => {
    // Skip if neither Apps SDK nor MCP Apps
    if (!isAppsSdkWidget && widgetProtocol !== 'mcp-apps') return;
    // If MCP Apps has AppRenderer ready, skip manual JSON-RPC handling
    if (widgetProtocol === 'mcp-apps' && sandboxConfig) return;

    // Handle JSON-RPC 2.0 messages from MCP Apps (SEP-1865)
    const handleJsonRpcMessage = async (event: MessageEvent, data: any) => {
      const { id, method, params = {} } = data;

      logger.mcp.debug('UIResourceMessage handling JSON-RPC message', {
        method,
        hasId: id !== undefined,
        params: Object.keys(params),
      });

      // Helper to send JSON-RPC response
      const sendResponse = (result: any, error?: { code: number; message: string }) => {
        if (id === undefined) return; // Notification, no response needed
        const response: any = { jsonrpc: '2.0', id };
        if (error) {
          response.error = error;
        } else {
          response.result = result;
        }
        (event.source as Window)?.postMessage(response, '*');
      };

      try {
        switch (method) {
          case 'tools/call': {
            // Call another MCP tool
            const toolName = params.name;
            const toolArgs = params.arguments || {};
            logger.mcp.info('[MCP Apps] Widget calling tool', { toolName, args: toolArgs, serverId });

            if (serverId && window.levante?.mcp?.callTool) {
              const result = await window.levante.mcp.callTool(serverId, {
                name: toolName,
                arguments: toolArgs,
              });
              const resultData = (result?.data || result) as any;
              sendResponse({
                content: resultData?.content,
                structuredContent: resultData?.structuredContent,
                _meta: resultData?._meta,
              });
            } else {
              sendResponse(null, { code: -32603, message: 'MCP service not available' });
            }
            break;
          }

          case 'resources/read': {
            // Read an MCP resource
            const uri = params.uri;
            logger.mcp.info('[MCP Apps] Widget reading resource', { uri, serverId });

            if (serverId && window.levante?.mcp?.readResource) {
              const result = await window.levante.mcp.readResource(serverId, uri);
              sendResponse(result?.data || result);
            } else {
              sendResponse(null, { code: -32603, message: 'MCP service not available' });
            }
            break;
          }

          case 'ui/open-link': {
            // Open external link (notification, no response)
            const url = params.url;
            logger.mcp.info('[MCP Apps] Widget opening link', { url });
            if (url) {
              window.levante?.openExternal?.(url);
            }
            break;
          }

          case 'ui/message': {
            // Send message to chat (notification, no response)
            const text = params.text;
            logger.mcp.info('[MCP Apps] Widget sending message', { text });
            if (text && onPrompt) {
              onPrompt(text);
            }
            break;
          }

          case 'ui/size-change': {
            // Widget resize notification (no response)
            logger.mcp.debug('[MCP Apps] Widget resize', { width: params.width, height: params.height });
            break;
          }

          case 'ui/display-mode': {
            // Display mode change request
            const mode = params.mode;
            logger.mcp.info('[MCP Apps] Widget requesting display mode', { mode });
            if (mode === 'inline' || mode === 'pip' || mode === 'fullscreen') {
              setDisplayMode(mode);
            }
            break;
          }

          case 'ui/close': {
            // Widget close request
            logger.mcp.info('[MCP Apps] Widget requesting close');
            setIsClosed(true);
            break;
          }

          case 'ui/widget-state': {
            // Widget state update (notification)
            logger.mcp.debug('[MCP Apps] Widget setting state', { state: params.state });
            break;
          }

          case 'ui/initialize': {
            // MCP-UI initialization request - widget wants to establish UI protocol
            // Respond with host capabilities, info, and context
            logger.mcp.info('[MCP Apps] Widget requesting UI initialization', {
              appInfo: params.appInfo,
              protocolVersion: params.protocolVersion,
              appCapabilities: params.appCapabilities,
            });
            sendResponse({
              protocolVersion: params.protocolVersion || '2025-11-21',
              hostInfo: {
                name: 'Levante',
                version: '1.6.0',
              },
              hostCapabilities: {
                tools: true,
                resources: true,
              },
              hostContext: {
                theme: theme || 'light',
                locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
                displayMode: displayMode || 'inline',
                maxHeight: 600,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Levante/1.6.0',
              },
            });
            break;
          }

          case 'ui/notifications/initialized': {
            // Widget initialized notification
            logger.mcp.info('[MCP Apps] Widget initialized', { widgetId: params.widgetId });
            break;
          }

          case 'ui/notifications/size-changed': {
            // Widget size changed notification
            logger.mcp.debug('[MCP Apps] Widget size changed', { width: params.width, height: params.height });
            break;
          }

          case 'ui/notifications/log': {
            // Widget log notification
            logger.mcp.debug('[MCP Apps] Widget log', { level: params.level, message: params.message });
            break;
          }

          case 'ui/request-modal': {
            // Widget requesting to open a modal
            const { modalId, url, title, width, height } = params;
            logger.mcp.info('[MCP Apps] Widget requesting modal', { modalId, url, title, width, height });

            if (!url) {
              sendResponse(null, { code: -32602, message: 'Missing required parameter: url' });
              break;
            }

            // Store the pending modal request with the response callback
            setModalRequest({
              id,
              modalId,
              url,
              title: title || 'Widget Modal',
              width: width || 600,
              height: height || 400,
              eventSource: event.source as Window,
            });
            setIsModalOpen(true);
            // Response will be sent when modal is closed
            break;
          }

          default:
            logger.mcp.warn('[MCP Apps] Unknown JSON-RPC method', { method });
            if (id !== undefined) {
              sendResponse(null, { code: -32601, message: `Method not found: ${method}` });
            }
        }
      } catch (err) {
        logger.mcp.error('[MCP Apps] JSON-RPC error', { method, error: err });
        sendResponse(null, {
          code: -32603,
          message: err instanceof Error ? err.message : 'Internal error',
        });
      }
    };

    const handleMessage = async (event: MessageEvent) => {
      const data = event.data;

      // Only handle messages from child iframes
      if (event.source === window) return;

      // Log ALL messages for debugging (even ones without type)
      if (event.source !== window && data) {
        logger.mcp.info('UIResourceMessage received postMessage', {
          hasData: !!data,
          dataType: typeof data,
          type: data?.type,
          method: data?.method,
          jsonrpc: data?.jsonrpc,
          keys: data && typeof data === 'object' ? Object.keys(data) : [],
          origin: event.origin,
          dataPreview: JSON.stringify(data)?.substring(0, 500),
        });
      }

      if (!data) return;

      // Handle JSON-RPC 2.0 messages (MCP Apps SEP-1865)
      if (data.jsonrpc === '2.0' && data.method) {
        await handleJsonRpcMessage(event, data);
        return;
      }

      // Handle OpenAI SDK messages (require type field)
      if (!data.type) return;

      logger.mcp.debug('UIResourceMessage processing bridge message', {
        type: data.type,
        hasPayload: !!data.payload,
      });

      switch (data.type) {
        // Handle both legacy (openai-bridge-*) and standard (openai:*) formats
        case 'openai-bridge-call-tool':
        case 'openai:callTool': {
          // Handle tool call from widget
          // Standard format: { callId, toolName, args }
          // Legacy format: { payload: { id, toolName, args } }
          const id = data.callId || data.payload?.id;
          const toolName = data.toolName || data.payload?.toolName;
          const args = data.args || data.payload?.args;
          logger.mcp.info('Widget calling tool', { type: data.type, toolName, args, serverId });

          try {
            // Call MCP tool directly via IPC for Skybridge widgets
            if (serverId && window.levante?.mcp?.callTool) {
              const result = await window.levante.mcp.callTool(serverId, {
                name: toolName,
                arguments: args || {},
              });
              logger.mcp.info('Skybridge tool call result', { toolName, result });

              // Extract response data for widget
              // IPC result format: { success: boolean, data: { content, _meta, structuredContent } }
              const data = (result?.data || result) as any;
              const responseData = {
                structuredContent: data?.structuredContent,
                meta: data?._meta,
                content: data?.content,
              };

              logger.mcp.debug('Skybridge tool response to widget', { responseData });

              // Send response back to iframe (both Levante and OpenAI formats for compatibility)
              (event.source as Window)?.postMessage({
                type: 'openai-bridge-call-tool-response',
                payload: { id, result: responseData },
              }, '*');
              // Also send in OpenAI format
              (event.source as Window)?.postMessage({
                type: 'openai:callTool:response',
                callId: id,
                result: responseData,
              }, '*');
            } else if (onToolCall) {
              // Fallback to callback if provided
              const result = await onToolCall(toolName, args || {});
              (event.source as Window)?.postMessage({
                type: 'openai-bridge-call-tool-response',
                payload: { id, result },
              }, '*');
              // Also send in OpenAI format
              (event.source as Window)?.postMessage({
                type: 'openai:callTool:response',
                callId: id,
                result,
              }, '*');
            } else {
              throw new Error(`Cannot call tool: serverId=${serverId}, mcp available=${!!window.levante?.mcp}`);
            }
          } catch (err) {
            logger.mcp.error('Skybridge tool call error', { toolName, error: err });
            (event.source as Window)?.postMessage({
              type: 'openai-bridge-call-tool-response',
              payload: { id, error: err instanceof Error ? err.message : String(err) },
            }, '*');
          }
          break;
        }

        case 'openai-bridge-follow-up':
        case 'openai:sendFollowUpMessage': {
          // Handle follow-up message from widget
          const message = data.message || data.payload?.message;
          logger.mcp.info('Widget sending follow-up', { message });
          if (message && onPrompt) {
            onPrompt(message);
          }
          break;
        }

        case 'openai-bridge-display-mode':
        case 'openai:requestDisplayMode': {
          // Handle display mode change from widget
          const mode = data.mode || data.payload?.mode;
          logger.mcp.info('Widget requesting display mode', { mode });
          if (mode === 'inline' || mode === 'pip' || mode === 'fullscreen') {
            // If user manually closed fullscreen, ignore widget's fullscreen requests
            if (mode === 'fullscreen' && userClosedFullscreenRef.current) {
              logger.mcp.info('Ignoring fullscreen request - user manually closed it');
              // Still respond but with current mode
              (event.source as Window)?.postMessage({
                type: 'openai:set_globals',
                globals: { displayMode: displayMode },
              }, '*');
              break;
            }
            setDisplayMode(mode);
            // Respond with set_globals to confirm the mode change
            (event.source as Window)?.postMessage({
              type: 'openai:set_globals',
              globals: { displayMode: mode },
            }, '*');
          }
          break;
        }

        case 'openai-bridge-open-external':
        case 'openai:openExternal': {
          // Handle external link from widget
          const url = data.url || data.payload?.url;
          logger.mcp.info('Widget opening external URL', { url });
          if (url) {
            // Use Electron's shell.openExternal via IPC
            window.levante?.openExternal?.(url);
          }
          break;
        }

        case 'openai-bridge-close':
        case 'openai:requestClose': {
          // Handle widget close request
          logger.mcp.info('Widget requesting close');
          setIsClosed(true);
          break;
        }

        case 'openai-bridge-set-state':
        case 'openai:setWidgetState': {
          // Handle widget state update (currently just log it)
          const state = data.state || data.payload?.state;
          logger.mcp.debug('Widget setting state', { state });
          // Widget state persistence could be implemented here in the future
          break;
        }

        case 'openai:resize': {
          // Handle widget resize notification (just log for now, auto-resize handles this)
          const height = data.height;
          logger.mcp.debug('Widget resize notification', { height });
          break;
        }

        case 'openai:navigationStateChanged': {
          // Handle navigation state changes (for widgets with history navigation)
          logger.mcp.debug('Widget navigation state changed', {
            canGoBack: data.canGoBack,
            canGoForward: data.canGoForward,
          });
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isAppsSdkWidget, widgetProtocol, sandboxConfig, serverId, onToolCall, onPrompt]);

  // Build globals object for Apps SDK communication
  const buildGlobals = useCallback(() => ({
    theme,
    locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
    displayMode,
    // Safe area insets (for widgets that need to avoid system UI)
    safeArea: {
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
    },
    // User agent info (for responsive widgets)
    userAgent: {
      device: { type: 'desktop' },
      capabilities: {
        hover: true,
        touch: 'ontouchstart' in window,
      },
    },
    // Max height for inline widgets
    maxHeight: 600,
  }), [theme, displayMode]);

  // Send globals to iframe helper
  const sendGlobalsToIframe = useCallback((targetWindow: Window) => {
    const globals = buildGlobals();

    if (widgetProtocol === 'mcp-apps') {
      // MCP Apps (SEP-1865) uses JSON-RPC 2.0 notifications
      targetWindow.postMessage({
        jsonrpc: '2.0',
        method: 'ui/host-context-change',
        params: globals,
      }, '*');
    } else if (widgetProtocol === 'openai-sdk' || isAppsSdkWidget) {
      // OpenAI Apps SDK format
      targetWindow.postMessage({
        type: 'openai:set_globals',
        globals,
      }, '*');

      // Legacy format for older widgets
      targetWindow.postMessage({
        type: 'openai-bridge-set-globals',
        payload: globals,
      }, '*');
    } else {
      // Default: JSON-RPC 2.0 notification
      targetWindow.postMessage({
        jsonrpc: '2.0',
        method: 'ui/host-context-change',
        params: globals,
      }, '*');
    }
  }, [buildGlobals, widgetProtocol, isAppsSdkWidget]);

  // For Apps SDK widgets, send set_globals proactively after iframe loads
  // These widgets use external SDKs that don't send ui-lifecycle-iframe-ready
  useEffect(() => {
    if (!isAppsSdkWidget) return;

    const sendGlobalsOnLoad = () => {
      // Wait a bit for the widget's JavaScript to initialize
      setTimeout(() => {
        if (iframeRef.current?.contentWindow) {
          logger.mcp.debug('UIResourceMessage sending proactive set_globals to Apps SDK widget');
          sendGlobalsToIframe(iframeRef.current.contentWindow);

          // Auto-focus for interactive widgets
          iframeRef.current.focus();
        }
      }, 500);
    };

    // Set up load listener on iframe
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', sendGlobalsOnLoad);
      return () => iframe.removeEventListener('load', sendGlobalsOnLoad);
    }
  }, [isAppsSdkWidget, sendGlobalsToIframe]);

  // Send initial globals to iframe when it's ready (for widgets with our bridge)
  // This works for MCP-UI widgets and widgets that send ui-lifecycle-iframe-ready
  useEffect(() => {
    const handleReady = (event: MessageEvent) => {
      if (event.data?.type === 'ui-lifecycle-iframe-ready') {
        logger.mcp.debug('UIResourceMessage received iframe ready signal, sending globals', {
          theme,
          displayMode,
          isAppsSdkWidget,
        });

        if (event.source) {
          sendGlobalsToIframe(event.source as Window);
        }

        // Auto-focus the iframe for interactive widgets (games, etc.)
        // This ensures keyboard events are received immediately
        // Small delay to ensure iframe content is fully loaded
        setTimeout(() => {
          if (iframeRef.current) {
            iframeRef.current.focus();
            logger.mcp.debug('UIResourceMessage auto-focused iframe via ref for interactivity');
          } else if (containerRef.current) {
            // Fallback to querySelector if ref not available
            const iframe = containerRef.current.querySelector('iframe');
            if (iframe) {
              iframe.focus();
              logger.mcp.debug('UIResourceMessage auto-focused iframe via query for interactivity');
            }
          }
        }, 100);
      }
    };

    window.addEventListener('message', handleReady);
    return () => window.removeEventListener('message', handleReady);
  }, [theme, displayMode, isAppsSdkWidget, sendGlobalsToIframe]);

  const onUIAction = useCallback(
    async (action: UIActionResult) => {
      try {
        const result = await handleUIAction(action);
        return result;
      } catch (err: any) {
        const errorMessage = err?.message || String(err);

        // Detect if server doesn't support MCP-UI protocol
        // Error -32601 means "Method not found" in JSON-RPC
        if (
          errorMessage.includes('ui/initialize') ||
          (errorMessage.includes('Method not found') && errorMessage.includes('ui')) ||
          err?.code === -32601
        ) {
          logger.mcp.warn('MCP server does not support UI protocol', {
            serverId,
            error: errorMessage,
            errorCode: err?.code,
            note: 'This is expected for servers without MCP-UI capabilities',
          });
          setError(new Error('Server does not support MCP-UI protocol. Only standard MCP tools/resources/prompts are available.'));
          return { status: 'error', data: { error: 'MCP-UI not supported by server' } };
        }

        logger.mcp.error('UIResource action error', {
          error: errorMessage,
        });
        setError(err instanceof Error ? err : new Error(errorMessage));
        return { status: 'error' };
      }
    },
    [handleUIAction, serverId]
  );

  // --- AppRenderer v6 callbacks for MCP Apps widgets ---

  // Extract tool name from resource metadata for AppRenderer
  const toolName = useMemo(() => {
    const meta = resource.resource?._meta as Record<string, unknown> | undefined;
    return (meta?.toolName as string) || getWidgetName(resource);
  }, [resource]);

  // Build host context for AppRenderer
  const hostContext = useMemo(() => ({
    theme: (theme === 'dark' ? 'dark' : 'light') as 'dark' | 'light',
    locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
    displayMode: displayMode || 'inline',
    maxHeight: displayMode === 'fullscreen' ? undefined : 600,
  }), [theme, displayMode]);

  // Build toolResult for AppRenderer from bridge options
  const appToolResult = useMemo<CallToolResult | undefined>(() => {
    if (!bridgeOptions?.toolOutput) return undefined;
    const output = bridgeOptions.toolOutput;
    // If it already has a content array, use it directly
    if (Array.isArray(output.content)) {
      return output as CallToolResult;
    }
    // Wrap in standard CallToolResult format
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
    };
  }, [bridgeOptions]);

  // Handle tool calls from MCP Apps widget via IPC
  const handleAppCallTool = useCallback(async (params: { name: string; arguments?: Record<string, unknown> }) => {
    logger.mcp.info('[MCP Apps] AppRenderer tool call', { toolName: params.name, serverId });
    if (serverId && window.levante?.mcp?.callTool) {
      const result = await window.levante.mcp.callTool(serverId, {
        name: params.name,
        arguments: params.arguments || {},
      });
      const data = (result?.data || result) as any;
      return {
        content: data?.content || [],
        structuredContent: data?.structuredContent,
        _meta: data?._meta,
      } as CallToolResult;
    }
    throw new Error('MCP service not available');
  }, [serverId]);

  // Handle resource read from MCP Apps widget via IPC
  const handleAppReadResource = useCallback(async (params: { uri: string }) => {
    logger.mcp.info('[MCP Apps] AppRenderer read resource', { uri: params.uri, serverId });
    if (serverId && window.levante?.mcp?.readResource) {
      const result = await window.levante.mcp.readResource(serverId, params.uri);
      const data = (result?.data || result) as any;
      return { contents: data?.contents || [] };
    }
    throw new Error('MCP service not available');
  }, [serverId]);

  // Handle open link from MCP Apps widget
  const handleAppOpenLink = useCallback(async (params: { url: string }) => {
    logger.mcp.info('[MCP Apps] AppRenderer open link', { url: params.url });
    if (params.url) {
      window.levante?.openExternal?.(params.url);
    }
    return {};
  }, []);

  // Handle message from MCP Apps widget (chat prompt)
  // The v6 API sends { role: 'user', content: ContentBlock[] }
  const handleAppMessage = useCallback(async (params: { role: string; content: Array<{ type: string; text?: string }> }) => {
    const text = params.content
      ?.filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text)
      .join('\n');
    logger.mcp.info('[MCP Apps] AppRenderer message', { text, role: params.role });
    if (text && onPrompt) {
      onPrompt(text);
    }
    return {};
  }, [onPrompt]);

  // Handle size changes from MCP Apps widget
  const handleAppSizeChanged = useCallback((params: { width?: number; height?: number }) => {
    logger.mcp.debug('[MCP Apps] AppRenderer size changed', params);
  }, []);

  // Handle logging messages from MCP Apps widget
  const handleAppLoggingMessage = useCallback((params: { level?: string; data?: unknown }) => {
    logger.mcp.debug('[MCP Apps] Widget log', params);
  }, []);

  // Handle errors from AppRenderer
  const handleAppError = useCallback((err: Error) => {
    logger.mcp.error('[MCP Apps] AppRenderer error', { error: err.message });
    setError(err);
  }, []);

  // --- End AppRenderer v6 callbacks ---

  // Modal close handler - sends response back to widget
  const handleModalClose = useCallback((result?: unknown) => {
    if (modalRequest && modalRequest.eventSource) {
      const response = {
        jsonrpc: '2.0',
        id: modalRequest.id,
        result: result !== undefined ? result : { closed: true, modalId: modalRequest.modalId },
      };
      modalRequest.eventSource.postMessage(response, '*');
      logger.mcp.debug('Modal closed, sent response to widget', { modalId: modalRequest.modalId });
    }
    setIsModalOpen(false);
    setModalRequest(null);
  }, [modalRequest]);

  // PiP drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: pipPosition.x,
      posY: pipPosition.y,
    };
  }, [pipPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setPipPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Check if this is an MCP Apps widget that should use AppRenderer v6
  const useMcpAppsRenderer = widgetProtocol === 'mcp-apps' && !!widgetHtmlContent && !!sandboxConfig;
  const isMcpAppsLoading = widgetProtocol === 'mcp-apps' && !!widgetHtmlContent && !sandboxConfig;

  // Render function for MCP Apps widget content via AppRenderer v6
  const renderMcpAppsWidget = () => (
    <AppRenderer
      ref={appRendererRef}
      toolName={toolName}
      html={widgetHtmlContent!}
      sandbox={sandboxConfig!}
      toolInput={bridgeOptions?.toolInput}
      toolResult={appToolResult}
      hostContext={hostContext}
      onCallTool={handleAppCallTool}
      onReadResource={handleAppReadResource}
      onOpenLink={handleAppOpenLink}
      onMessage={handleAppMessage}
      onSizeChanged={handleAppSizeChanged}
      onLoggingMessage={handleAppLoggingMessage}
      onError={handleAppError}
    />
  );

  // Handle closed state
  if (isClosed) {
    return null;
  }

  // Handle errors
  if (error) {
    return <UIResourceError error={error} />;
  }

  // Inline mode
  if (displayMode === 'inline') {
    const isLoadingProxy = needsWidgetProxy && !widgetProxyUrl;

    return (
      <div
        ref={containerRef}
        className={cn(
          'relative group rounded-lg overflow-hidden bg-background',
          'min-h-[100px]',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          className
        )}
        tabIndex={0}
        onClick={() => {
          if (iframeRef.current) {
            iframeRef.current.focus();
          } else {
            const iframe = containerRef.current?.querySelector('iframe');
            if (iframe) iframe.focus();
          }
        }}
      >
        {/* MCP Apps widget via AppRenderer v6 */}
        {useMcpAppsRenderer ? (
          renderMcpAppsWidget()
        ) : isMcpAppsLoading ? (
          <UIResourceLoading />
        ) : isLoadingProxy ? (
          <UIResourceLoading />
        ) : widgetProxyUrl ? (
          <iframe
            ref={iframeRef}
            src={widgetProxyUrl}
            title="MCP Widget"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
            allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write"
            allowFullScreen
            style={{
              width: '100%',
              minHeight: '200px',
              height: '400px',
              border: 'none',
            }}
            onLoad={() => {
              if (iframeRef.current?.contentWindow) {
                sendGlobalsToIframe(iframeRef.current.contentWindow);
                iframeRef.current.focus();
                logger.mcp.debug('Widget proxy iframe loaded, sent globals', { widgetId, protocol: widgetProtocol });
              }
            }}
          />
        ) : (
          <UIResourceErrorBoundary onError={setError}>
            <Suspense fallback={<UIResourceLoading />}>
              <UIResourceRenderer
                resource={rendererResource}
                onUIAction={onUIAction}
                htmlProps={{
                  iframeRenderData: {
                    theme,
                    locale: typeof navigator !== 'undefined' ? navigator.language : 'en',
                    ...widgetData,
                  },
                  autoResizeIframe: { height: true },
                  sandboxPermissions: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation',
                  style: {
                    width: '100%',
                    minHeight: '100px',
                    border: 'none',
                  },
                  iframeProps: {
                    ref: iframeRef as React.RefObject<HTMLIFrameElement>,
                    title: 'MCP Widget',
                  },
                }}
                remoteDomProps={{
                  library: basicComponentLibrary,
                }}
              />
            </Suspense>
          </UIResourceErrorBoundary>
        )}
        <WidgetControls mode={displayMode} onModeChange={setDisplayMode} />
      </div>
    );
  }

  // Fullscreen mode
  if (displayMode === 'fullscreen') {
    const isLoadingProxy = needsWidgetProxy && !widgetProxyUrl;
    const widgetName = getWidgetName(resource);

    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
        {/* Widget content - takes full space */}
        <div
          className="flex-1 overflow-auto focus-within:ring-2 focus-within:ring-ring min-h-0"
          tabIndex={0}
          onClick={() => {
            const iframe = document.querySelector('.fixed.inset-0 iframe') as HTMLIFrameElement;
            if (iframe) iframe.focus();
          }}
        >
          {useMcpAppsRenderer ? (
            renderMcpAppsWidget()
          ) : isMcpAppsLoading ? (
            <UIResourceLoading />
          ) : isLoadingProxy ? (
            <UIResourceLoading />
          ) : widgetProxyUrl ? (
            <iframe
              src={widgetProxyUrl}
              title="MCP Widget"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
              allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write"
              allowFullScreen
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              onLoad={(e) => {
                const iframe = e.currentTarget;
                if (iframe.contentWindow) {
                  sendGlobalsToIframe(iframe.contentWindow);
                  iframe.focus();
                }
              }}
            />
          ) : (
            <UIResourceErrorBoundary onError={setError}>
              <Suspense fallback={<UIResourceLoading />}>
                <UIResourceRenderer
                  resource={rendererResource}
                  onUIAction={onUIAction}
                  htmlProps={{
                    iframeRenderData: {
                      theme,
                      locale: typeof navigator !== 'undefined' ? navigator.language : 'en',
                      displayMode: 'fullscreen',
                      ...widgetData,
                    },
                    sandboxPermissions: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation',
                    style: {
                      width: '100%',
                      height: '100%',
                      border: 'none',
                    },
                  }}
                  remoteDomProps={{
                    library: basicComponentLibrary,
                  }}
                />
              </Suspense>
            </UIResourceErrorBoundary>
          )}
        </div>

        {/* Bottom bar with chat input, title and close */}
        <FullscreenChatInput
          onSubmit={onSendMessage || onPrompt || (() => {})}
          onClose={() => {
            userClosedFullscreenRef.current = true;
            setDisplayMode('inline');
          }}
          widgetName={widgetName}
          messages={simplifiedMessages}
          expanded={chatExpanded}
          onExpandedChange={setChatExpanded}
        />
      </div>
    );
  }

  // PiP mode
  if (displayMode === 'pip') {
    const isLoadingProxy = needsWidgetProxy && !widgetProxyUrl;

    return (
      <>
        {/* Placeholder in original position */}
        <div
          className={cn(
            'rounded-lg border border-dashed bg-muted/20 p-4 text-center text-muted-foreground text-sm',
            className
          )}
        >
          Widget in Picture-in-Picture mode
        </div>

        {/* Floating PiP window */}
        <div
          className="fixed bottom-4 right-4 z-40 w-[400px] h-[300px] rounded-lg overflow-hidden shadow-lg bg-background group"
          style={{
            resize: 'both',
            transform: `translate(${pipPosition.x}px, ${pipPosition.y}px)`,
          }}
        >
          <div
            className="h-6 bg-muted flex items-center justify-between px-2 cursor-move select-none"
            onMouseDown={handleDragStart}
          >
            <span className="text-xs text-muted-foreground truncate">
              {resource.resource?.uri || 'Widget'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4"
              onClick={() => setDisplayMode('inline')}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div
            className="h-[calc(100%-24px)] focus-within:ring-2 focus-within:ring-ring"
            tabIndex={0}
            onClick={() => {
              const iframe = document.querySelector('.fixed.bottom-4.right-4 iframe') as HTMLIFrameElement;
              if (iframe) iframe.focus();
            }}
          >
            {useMcpAppsRenderer ? (
              renderMcpAppsWidget()
            ) : isMcpAppsLoading ? (
              <UIResourceLoading />
            ) : isLoadingProxy ? (
              <UIResourceLoading />
            ) : widgetProxyUrl ? (
              <iframe
                src={widgetProxyUrl}
                title="MCP Widget"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
                allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write"
                allowFullScreen
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  if (iframe.contentWindow) {
                    sendGlobalsToIframe(iframe.contentWindow);
                    iframe.focus();
                  }
                }}
              />
            ) : (
              <UIResourceErrorBoundary onError={setError}>
                <Suspense fallback={<UIResourceLoading />}>
                  <UIResourceRenderer
                    resource={rendererResource}
                    onUIAction={onUIAction}
                    htmlProps={{
                      iframeRenderData: {
                        theme,
                        locale: typeof navigator !== 'undefined' ? navigator.language : 'en',
                        displayMode: 'pip',
                        ...widgetData,
                      },
                      sandboxPermissions: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation',
                      style: {
                        width: '100%',
                        height: '100%',
                        border: 'none',
                      },
                    }}
                    remoteDomProps={{
                      library: basicComponentLibrary,
                    }}
                  />
                </Suspense>
              </UIResourceErrorBoundary>
            )}
          </div>
        </div>
      </>
    );
  }

  // Render modal dialog if requested by widget
  if (isModalOpen && modalRequest) {
    return (
      <>
        {/* Keep widget visible behind modal */}
        <div className={cn('relative group rounded-lg overflow-hidden bg-background', className)}>
          <div className="min-h-[200px] opacity-50 pointer-events-none">
            {/* Widget content is dimmed when modal is open */}
          </div>
        </div>

        {/* Modal Dialog */}
        <Dialog open={isModalOpen} onOpenChange={(open) => !open && handleModalClose()}>
          <DialogContent
            className="p-0 overflow-hidden"
            style={{
              maxWidth: modalRequest.width,
              width: '90vw',
            }}
          >
            <DialogHeader className="px-4 py-2 border-b">
              <DialogTitle>{modalRequest.title}</DialogTitle>
            </DialogHeader>
            <div
              style={{
                height: modalRequest.height,
                maxHeight: '80vh',
              }}
            >
              <iframe
                src={modalRequest.url}
                title={modalRequest.title}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  if (iframe.contentWindow) {
                    // Send globals to modal iframe using correct protocol
                    const globals = {
                      ...buildGlobals(),
                      isModal: true,
                      modalId: modalRequest.modalId,
                    };

                    // Send in correct format based on widget protocol
                    if (widgetProtocol === 'mcp-apps') {
                      iframe.contentWindow.postMessage({
                        jsonrpc: '2.0',
                        method: 'ui/host-context-change',
                        params: globals,
                      }, '*');
                    } else {
                      iframe.contentWindow.postMessage({
                        type: 'openai:set_globals',
                        globals,
                      }, '*');
                    }
                  }
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}

export default UIResourceMessage;
