/**
 * HTTP Proxy Server for MCP Widgets
 *
 * Serves widget HTML content via a local HTTP server.
 * This solves the CSP issues with srcdoc iframes in Electron:
 * - srcdoc iframes have null origin and inherit parent CSP
 * - HTTP localhost gives widgets a real origin with their own permissive CSP
 *
 * Similar to Goose's mcp-ui-proxy approach.
 */

import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import { getLogger } from './logging';
import type { WidgetProtocol, WidgetBridgeOptions } from './ai/widgets/types';
import { generateMcpAppsBridgeScript } from './ai/widgets/mcpAppsBridge';

const logger = getLogger();

/**
 * Widget store entry with protocol info
 */
interface WidgetStoreEntry {
  html: string;
  createdAt: number;
  protocol: WidgetProtocol;
  bridgeOptions?: WidgetBridgeOptions;
  baseUrl?: string;
}

// Store widget HTML content by ID
const widgetContentStore = new Map<string, WidgetStoreEntry>();

// Server instance
let server: http.Server | null = null;
let serverPort: number | null = null;

// Secret token for authentication (prevents unauthorized access)
let secretToken: string | null = null;

// Clean up old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const MAX_AGE = 30 * 60 * 1000; // 30 minutes

// Permissive CSP for widget content
const WIDGET_CSP = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "style-src * 'unsafe-inline' data: blob:",
  "font-src * data: blob:",
  "img-src * data: blob:",
  "connect-src *",
  "frame-src * data: blob:",
  "base-uri *",
  "form-action *",
].join('; ');

/**
 * Generate the proxy wrapper HTML page
 * This creates a sandboxed iframe and sets up postMessage relay
 * Similar to Goose's mcp-ui-proxy pattern
 */
function generateProxyHtml(widgetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">
  <title>MCP Widget Proxy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <script>
    // Create sandboxed iframe for the widget content
    const widgetUrl = ${JSON.stringify(widgetUrl)};
    const widgetOrigin = new URL(widgetUrl).origin;

    const iframe = document.createElement('iframe');
    iframe.id = 'widget-iframe';
    iframe.src = widgetUrl;
    // Permissive sandbox to allow widget functionality
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation';
    iframe.allow = 'clipboard-read; clipboard-write; fullscreen; autoplay; gamepad';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
    document.body.appendChild(iframe);

    // Message relay: Host <--> This proxy <--> Widget iframe
    window.addEventListener('message', (event) => {
      // Forward messages from host (parent) to widget iframe
      if (event.source === window.parent) {
        console.log('[MCP Proxy] Forwarding message from host to widget:', event.data?.type || event.data);
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage(event.data, '*');
        }
      }
      // Forward messages from widget iframe to host (parent)
      else if (event.source === iframe.contentWindow) {
        console.log('[MCP Proxy] Forwarding message from widget to host:', event.data?.type || event.data);
        window.parent.postMessage(event.data, '*');
      }
    });

    // Notify parent when iframe loads
    iframe.onload = () => {
      console.log('[MCP Proxy] Widget iframe loaded');
      window.parent.postMessage({ type: 'proxy-iframe-loaded' }, '*');
    };

    // Log any errors
    iframe.onerror = (err) => {
      console.error('[MCP Proxy] Widget iframe error:', err);
    };
  </script>
</body>
</html>`;
}

/**
 * Start the widget proxy HTTP server
 * Returns the port number when ready
 */
export async function startWidgetProxyServer(): Promise<number> {
  if (server && serverPort) {
    logger.core.debug('Widget proxy server already running', { port: serverPort });
    return serverPort;
  }

  // Generate secret token for this session
  secretToken = crypto.randomBytes(32).toString('hex');

  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      handleRequest(req, res);
    });

    // Listen on random available port
    server.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      if (address && typeof address === 'object') {
        serverPort = address.port;
        logger.core.info('Widget proxy server started', { port: serverPort });

        // Start cleanup interval
        setInterval(cleanupOldContent, CLEANUP_INTERVAL);

        resolve(serverPort);
      } else {
        reject(new Error('Failed to get server address'));
      }
    });

    server.on('error', (err) => {
      logger.core.error('Widget proxy server error', { error: err.message });
      reject(err);
    });
  });
}

/**
 * Stop the widget proxy server
 */
export function stopWidgetProxyServer(): void {
  if (server) {
    server.close();
    server = null;
    serverPort = null;
    secretToken = null;
    logger.core.info('Widget proxy server stopped');
  }
}

/**
 * Get the current server port
 */
export function getWidgetProxyPort(): number | null {
  return serverPort;
}

/**
 * Get the secret token for authentication
 */
export function getWidgetProxySecret(): string | null {
  return secretToken;
}

/**
 * Handle incoming HTTP requests
 */
function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url || '/', `http://127.0.0.1:${serverPort}`);

  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }

  // Serve MCP Apps sandbox proxy HTML (used by AppRenderer from @mcp-ui/client v6)
  if (url.pathname === '/sandbox-proxy') {
    handleSandboxProxy(res);
    return;
  }

  // Handle /_next/image proxy requests (for Next.js Image optimization)
  if (url.pathname === '/_next/image') {
    handleNextImageProxy(url, res);
    return;
  }

  // Parse path: /proxy/{widgetId} (proxy page with message relay)
  const proxyMatch = url.pathname.match(/^\/proxy\/([^/]+)$/);
  if (proxyMatch) {
    handleProxyPage(proxyMatch[1], url, res);
    return;
  }

  // Parse path: /widget/{widgetId} (actual widget content)
  const widgetMatch = url.pathname.match(/^\/widget\/([^/]+)$/);
  if (widgetMatch) {
    handleWidgetContent(widgetMatch[1], url, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

/**
 * Serve the MCP Apps sandbox proxy HTML
 * This is the thin proxy page used by @mcp-ui/client v6 AppRenderer.
 *
 * Uses a nested iframe with srcdoc to render widget HTML. This is necessary because:
 * - AppBridge stores iframe.contentWindow reference at connect time (line 8510 in @mcp-ui/client)
 * - PostMessageTransport checks event.source === storedContentWindow (line 8259)
 * - document.write() causes contentWindow to become a stale reference in Chromium/Electron
 * - Nested iframe keeps the outer contentWindow stable for source validation
 *
 * The sandbox proxy forwards ALL messages bidirectionally between host and widget.
 * No sandbox/allow attributes on nested iframe (outer iframe already has sandbox from library).
 */
function handleSandboxProxy(res: http.ServerResponse): void {
  const sandboxHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0}html,body,iframe{width:100%;height:100%;border:none;overflow:hidden}</style>
</head><body><script>
(function() {
  var widgetFrame = null;
  var pendingMessages = [];

  window.addEventListener('message', function(event) {
    var data = event.data;

    if (event.source === window.parent) {
      // From host (AppBridge) → intercept sandbox-resource-ready, forward rest to widget
      if (data && typeof data === 'object' && data.method === 'ui/notifications/sandbox-resource-ready') {
        var html = data.params && data.params.html;
        if (html) {
          widgetFrame = document.createElement('iframe');
          widgetFrame.style.cssText = 'width:100%;height:100%;border:none;';
          widgetFrame.srcdoc = html;
          document.body.appendChild(widgetFrame);
          widgetFrame.addEventListener('load', function() {
            for (var i = 0; i < pendingMessages.length; i++) {
              widgetFrame.contentWindow.postMessage(pendingMessages[i], '*');
            }
            pendingMessages = [];
          });
        }
        return;
      }
      // Forward all other messages to widget
      if (widgetFrame && widgetFrame.contentWindow) {
        widgetFrame.contentWindow.postMessage(data, '*');
      } else {
        pendingMessages.push(data);
      }
    } else if (widgetFrame && event.source === widgetFrame.contentWindow) {
      // From widget → forward to host (AppBridge)
      window.parent.postMessage(data, '*');
    }
  });

  // Signal to parent that sandbox proxy is ready
  window.parent.postMessage({
    method: 'ui/notifications/sandbox-proxy-ready',
    params: {}
  }, '*');
})();
</script></body></html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': WIDGET_CSP,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(sandboxHtml);
}

/**
 * Handle proxy page requests - serves the wrapper page with message relay
 */
function handleProxyPage(widgetId: string, url: URL, res: http.ServerResponse): void {
  // Verify secret token
  const providedSecret = url.searchParams.get('secret');
  if (!providedSecret || providedSecret !== secretToken) {
    logger.mcp.warn('Widget proxy unauthorized access attempt', { widgetId });
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Unauthorized');
    return;
  }

  // Check if widget exists
  const content = widgetContentStore.get(widgetId);
  if (!content) {
    logger.mcp.warn('Widget content not found for proxy', { widgetId });
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Widget not found');
    return;
  }

  // Generate proxy page that creates iframe pointing to widget content
  const widgetUrl = `http://127.0.0.1:${serverPort}/widget/${widgetId}?secret=${encodeURIComponent(secretToken || '')}`;
  const proxyHtml = generateProxyHtml(widgetUrl);

  logger.mcp.debug('Widget proxy serving proxy page', { widgetId, widgetUrl });

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': WIDGET_CSP,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(proxyHtml);
}

/**
 * Generate the window.openai bridge script to inject into widget HTML
 * This provides the OpenAI Apps SDK API that widgets expect
 */
function generateOpenAIBridgeScript(widgetId: string, options?: WidgetBridgeOptions): string {
  // Extract data from bridgeOptions
  const theme = options?.theme || 'light';
  const locale = options?.locale || 'en-US';
  const toolInput = options?.toolInput || {};
  const toolOutput = options?.toolOutput || {};
  const responseMetadata = options?.responseMetadata || {};

  return `
<script>
(function() {
  // OpenAI Apps SDK Bridge for MCP Widgets
  // This provides the window.openai API that widgets expect

  // Shim for APIs that don't work in iframes to prevent console errors
  // Keyboard.lock() requires top-level browsing context
  if (navigator.keyboard && navigator.keyboard.lock) {
    const originalLock = navigator.keyboard.lock.bind(navigator.keyboard);
    navigator.keyboard.lock = function(keyCodes) {
      return originalLock(keyCodes).catch(() => {
        // Silently ignore - Keyboard.lock() doesn't work in iframes
      });
    };
  }

  // Document.requestFullscreen shim for nested iframes
  const originalRequestFullscreen = Element.prototype.requestFullscreen;
  if (originalRequestFullscreen) {
    Element.prototype.requestFullscreen = function(options) {
      return originalRequestFullscreen.call(this, options).catch(() => {
        // Silently ignore fullscreen errors in nested iframes
      });
    };
  }

  let _callId = 0;
  const _pendingCalls = new Map();

  const openaiAPI = {
    // Tool input/output from MCP tool execution
    toolInput: ${JSON.stringify(toolInput)},
    toolOutput: ${JSON.stringify(toolOutput)},
    toolResponseMetadata: ${JSON.stringify(responseMetadata)},

    // Display settings
    displayMode: 'inline',
    maxHeight: 600,
    theme: '${theme}',
    locale: '${locale}',

    // Safe area for mobile
    safeArea: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },

    // User agent info
    userAgent: {
      device: { type: 'desktop' },
      capabilities: { hover: true, touch: 'ontouchstart' in window }
    },

    // View mode
    view: { mode: 'inline', params: {} },

    // Widget state
    widgetState: null,

    // Call another MCP tool
    async callTool(toolName, args = {}) {
      const callId = ++_callId;
      return new Promise((resolve, reject) => {
        _pendingCalls.set(callId, { resolve, reject });

        console.log('[OpenAI Bridge] Calling tool:', toolName, args);
        window.parent.postMessage({
          type: 'openai:callTool',
          toolName,
          args,
          callId,
          toolId: '${widgetId}'
        }, '*');

        // Timeout after 30 seconds
        setTimeout(() => {
          if (_pendingCalls.has(callId)) {
            _pendingCalls.delete(callId);
            reject(new Error('Tool call timeout'));
          }
        }, 30000);
      });
    },

    // Send followup message to chat
    async sendFollowUpMessage(message) {
      const prompt = typeof message === 'string' ? message : (message?.prompt || '');
      console.log('[OpenAI Bridge] Sending followup:', prompt);
      window.parent.postMessage({
        type: 'openai:sendFollowUpMessage',
        message: prompt
      }, '*');
    },

    // Alias for sendFollowUpMessage
    async sendFollowupTurn(message) {
      return this.sendFollowUpMessage(message);
    },

    // Request display mode change
    async requestDisplayMode(options = {}) {
      const mode = options.mode || 'inline';
      this.displayMode = mode;
      if (typeof options.maxHeight === 'number') {
        this.maxHeight = options.maxHeight;
      }
      console.log('[OpenAI Bridge] Requesting display mode:', mode);
      window.parent.postMessage({
        type: 'openai:requestDisplayMode',
        mode,
        maxHeight: options.maxHeight
      }, '*');
      return { mode };
    },

    // Set widget state (persists across sessions)
    async setWidgetState(state) {
      this.widgetState = state;
      try {
        localStorage.setItem('widget-state-${widgetId}', JSON.stringify(state));
      } catch (err) {
        console.error('[OpenAI Bridge] Failed to save widget state:', err);
      }
      window.parent.postMessage({
        type: 'openai:setWidgetState',
        toolId: '${widgetId}',
        state
      }, '*');
    },

    // Open external URL
    async openExternal(options) {
      const href = typeof options === 'string' ? options : options?.href;
      if (!href) throw new Error('href is required for openExternal');
      console.log('[OpenAI Bridge] Opening external:', href);
      window.parent.postMessage({
        type: 'openai:openExternal',
        href
      }, '*');
      window.open(href, '_blank', 'noopener,noreferrer');
    },

    // Request modal dialog
    async requestModal(options = {}) {
      console.log('[OpenAI Bridge] Requesting modal:', options);
      window.parent.postMessage({
        type: 'openai:requestModal',
        title: options.title,
        params: options.params,
        anchor: options.anchor
      }, '*');
    },

    // Request widget close
    async requestClose() {
      console.log('[OpenAI Bridge] Requesting close');
      window.parent.postMessage({
        type: 'openai:requestClose'
      }, '*');
    },

    // Resize notification
    async resize(height) {
      window.parent.postMessage({
        type: 'openai:resize',
        height
      }, '*');
    }
  };

  // Load persisted widget state
  try {
    const savedState = localStorage.getItem('widget-state-${widgetId}');
    if (savedState) {
      openaiAPI.widgetState = JSON.parse(savedState);
    }
  } catch (err) {
    console.error('[OpenAI Bridge] Failed to load widget state:', err);
  }

  // Listen for messages from parent
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case 'openai:callTool:response': {
        const pending = _pendingCalls.get(data.callId);
        if (pending) {
          _pendingCalls.delete(data.callId);
          if (data.error) {
            pending.reject(new Error(data.error));
          } else {
            pending.resolve(data.result);
          }
        }
        break;
      }

      case 'openai:set_globals':
      case 'openai-bridge-set-globals': {
        const globals = data.globals || data.payload || data;
        if (globals.theme) openaiAPI.theme = globals.theme;
        if (globals.locale) openaiAPI.locale = globals.locale;
        if (globals.displayMode) openaiAPI.displayMode = globals.displayMode;
        if (typeof globals.maxHeight === 'number') openaiAPI.maxHeight = globals.maxHeight;
        console.log('[OpenAI Bridge] Received globals:', globals);

        // Dispatch event for widgets that listen
        try {
          window.dispatchEvent(new CustomEvent('openai:globals', { detail: globals }));
        } catch (err) {}
        break;
      }

      case 'openai:pushWidgetState': {
        if (data.toolId === '${widgetId}') {
          openaiAPI.widgetState = data.state;
          try {
            localStorage.setItem('widget-state-${widgetId}', JSON.stringify(data.state));
            window.dispatchEvent(new CustomEvent('openai:widget_state', { detail: { state: data.state } }));
          } catch (err) {}
        }
        break;
      }
    }
  });

  // Make available globally
  window.openai = openaiAPI;
  window.webplus = openaiAPI; // Compatibility alias

  // Notify parent that bridge is ready
  window.parent.postMessage({ type: 'openai:bridge-ready', toolId: '${widgetId}' }, '*');

  console.log('[OpenAI Bridge] Initialized for widget:', '${widgetId}');
})();
</script>`;
}

/**
 * Handle widget content requests - serves the actual widget HTML
 * Injects the appropriate bridge script based on widget protocol
 */
function handleWidgetContent(widgetId: string, url: URL, res: http.ServerResponse): void {
  // Verify secret token
  const providedSecret = url.searchParams.get('secret');
  if (!providedSecret || providedSecret !== secretToken) {
    logger.mcp.warn('Widget content unauthorized access attempt', { widgetId });
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Unauthorized');
    return;
  }

  // Get widget content
  const content = widgetContentStore.get(widgetId);
  if (!content) {
    logger.mcp.warn('Widget content not found', { widgetId });
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Widget not found');
    return;
  }

  const { protocol, bridgeOptions } = content;
  logger.mcp.debug('Widget proxy serving widget content', {
    widgetId,
    size: content.html.length,
    protocol,
  });

  let html = content.html;

  // Generate appropriate bridge script based on protocol
  let bridgeScript: string;
  if (protocol === 'mcp-apps' && bridgeOptions) {
    // Use MCP Apps bridge (SEP-1865) with JSON-RPC 2.0
    bridgeScript = generateMcpAppsBridgeScript(bridgeOptions);
    logger.mcp.debug('Using MCP Apps bridge for widget', { widgetId });
  } else {
    // Default to OpenAI Apps SDK bridge
    bridgeScript = generateOpenAIBridgeScript(widgetId, bridgeOptions);
    logger.mcp.debug('Using OpenAI SDK bridge for widget', { widgetId });
  }

  // Inject CSP meta tag if not present
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">`;

  // Find the best place to inject (after <head> tag, before other scripts)
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n${cspMeta}\n${bridgeScript}`);
  } else if (html.includes('<head ')) {
    html = html.replace(/<head[^>]*>/, `$&\n${cspMeta}\n${bridgeScript}`);
  } else if (html.includes('<html')) {
    html = html.replace(/<html[^>]*>/, `$&\n<head>${cspMeta}${bridgeScript}</head>`);
  } else {
    // Prepend if no head/html tag found
    html = `${cspMeta}\n${bridgeScript}\n${html}`;
  }

  logger.mcp.info('Widget content served', {
    widgetId,
    protocol,
    finalSize: html.length,
  });

  // Send response with permissive headers
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': WIDGET_CSP,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(html);
}

/**
 * Handle Next.js image optimization proxy requests
 * Proxies /_next/image requests to the original server using stored widget baseUrl
 */
function handleNextImageProxy(url: URL, res: http.ServerResponse): void {
  // Get the image URL parameter
  const imageUrl = url.searchParams.get('url');
  const width = url.searchParams.get('w') || '256';
  const quality = url.searchParams.get('q') || '75';

  if (!imageUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing url parameter');
    return;
  }

  // Find the base URL from stored widgets (use the most recent one with a baseUrl)
  let targetBaseUrl: string | undefined;

  // Find the most recently created widget with a baseUrl
  let newestTimestamp = 0;
  for (const [, content] of widgetContentStore.entries()) {
    if (content.baseUrl && content.createdAt > newestTimestamp) {
      targetBaseUrl = content.baseUrl;
      newestTimestamp = content.createdAt;
    }
  }

  if (!targetBaseUrl) {
    logger.mcp.warn('No base URL found for Next.js image proxy - no widgets with baseUrl stored');
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('No widget base URL available');
    return;
  }

  // Construct the full URL to the Next.js image endpoint
  const targetUrl = `${targetBaseUrl}/_next/image?url=${encodeURIComponent(imageUrl)}&w=${width}&q=${quality}`;

  logger.mcp.debug('Proxying Next.js image request', {
    originalUrl: url.toString(),
    targetUrl,
    imageUrl,
  });

  // Make the request to the target server
  https.get(targetUrl, (proxyRes) => {
    // Forward the response headers
    const headers: Record<string, string | string[] | undefined> = {
      'Content-Type': proxyRes.headers['content-type'],
      'Cache-Control': proxyRes.headers['cache-control'] || 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*',
    };

    res.writeHead(proxyRes.statusCode || 200, headers);
    proxyRes.pipe(res);
  }).on('error', (err) => {
    logger.mcp.error('Error proxying Next.js image', { error: err.message, targetUrl });
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy error');
  });
}

/**
 * Extract base URL from absolute URLs in HTML (scripts, links, images)
 * This is useful when the resource URI doesn't contain the actual origin
 */
function extractBaseUrlFromHtml(html: string): string | undefined {
  // Look for absolute URLs in script, link, or img tags
  // Prioritize script tags as they're most likely to point to the app origin
  const patterns = [
    // Script src with full origin (most reliable for app origin)
    { pattern: /<script[^>]+src=["'](https?:\/\/[^/"']+)/i, name: 'script-src' },
    // Link href with full origin
    { pattern: /<link[^>]+href=["'](https?:\/\/[^/"']+)/i, name: 'link-href' },
    // Any src attribute with full origin
    { pattern: /src=["'](https?:\/\/[^/"']+)/i, name: 'any-src' },
    // Any href attribute with full origin
    { pattern: /href=["'](https?:\/\/[^/"']+)/i, name: 'any-href' },
  ];

  const foundUrls: { name: string; url: string }[] = [];

  for (const { pattern, name } of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      foundUrls.push({ name, url: match[1] });
    }
  }

  if (foundUrls.length > 0) {
    // Use the first script URL if available, otherwise first match
    const scriptUrl = foundUrls.find(u => u.name.includes('script'));
    const selected = scriptUrl || foundUrls[0];
    logger.mcp.info('Extracted base URL from HTML content', {
      selectedUrl: selected.url,
      selectedFrom: selected.name,
      allFoundUrls: foundUrls,
    });
    return selected.url;
  }

  // Log the first 500 chars of HTML for debugging if no URL found
  logger.mcp.warn('Could not extract base URL from HTML content', {
    htmlPreview: html.substring(0, 500),
    htmlLength: html.length,
  });

  return undefined;
}

/**
 * Options for storing widget content
 */
export interface StoreWidgetOptions {
  /** Widget protocol type */
  protocol?: WidgetProtocol;
  /** Bridge options for MCP Apps protocol */
  bridgeOptions?: Omit<WidgetBridgeOptions, 'widgetId'>;
  /** Base URL for resolving relative paths */
  baseUrl?: string;
}

/**
 * Store widget HTML content and return the proxy URL
 * @param widgetId - Unique widget identifier
 * @param html - HTML content to store
 * @param options - Storage options (protocol, bridgeOptions, baseUrl)
 */
export function storeWidgetContent(
  widgetId: string,
  html: string,
  options?: StoreWidgetOptions | string
): string {
  // Handle legacy signature: storeWidgetContent(id, html, baseUrl)
  const opts: StoreWidgetOptions = typeof options === 'string'
    ? { baseUrl: options }
    : options || {};

  const { protocol = 'openai-sdk', bridgeOptions, baseUrl } = opts;

  logger.mcp.debug('Widget storeWidgetContent called', {
    widgetId,
    htmlSize: html.length,
    protocol,
    providedBaseUrl: baseUrl,
    isHttpUrl: baseUrl?.startsWith('http'),
  });

  // If no baseUrl provided or it's not HTTP, try to extract from HTML content
  let effectiveBaseUrl = baseUrl;
  if (!effectiveBaseUrl || !effectiveBaseUrl.startsWith('http')) {
    effectiveBaseUrl = extractBaseUrlFromHtml(html);
    logger.mcp.debug('Extracted base URL from HTML', {
      widgetId,
      extractedUrl: effectiveBaseUrl,
      originalUrl: baseUrl,
    });
  }

  // Inject base tag if we have a valid baseUrl and none exists
  let processedHtml = html;
  const hasExistingBase = html.includes('<base ');
  logger.mcp.debug('Checking for existing base tag', {
    widgetId,
    hasExistingBase,
    effectiveBaseUrl,
  });

  if (effectiveBaseUrl && !hasExistingBase) {
    // Ensure base URL has a trailing slash for proper relative URL resolution
    const baseHref = effectiveBaseUrl.endsWith('/') ? effectiveBaseUrl : effectiveBaseUrl + '/';
    const baseTag = `<base href="${baseHref}">`;
    if (processedHtml.includes('<head>')) {
      processedHtml = processedHtml.replace('<head>', `<head>\n${baseTag}`);
    } else if (processedHtml.includes('<head ')) {
      processedHtml = processedHtml.replace(/<head[^>]*>/, `$&\n${baseTag}`);
    } else if (processedHtml.includes('<html')) {
      processedHtml = processedHtml.replace(/<html[^>]*>/, `$&\n<head>${baseTag}</head>`);
    } else {
      processedHtml = baseTag + processedHtml;
    }
    logger.mcp.info('Injected base tag for relative URLs', {
      widgetId,
      baseHref,
      injection: processedHtml.includes(baseTag) ? 'success' : 'failed',
    });
  } else if (hasExistingBase) {
    logger.mcp.debug('Skipping base tag injection - already exists', { widgetId });
  } else if (!effectiveBaseUrl) {
    logger.mcp.warn('No base URL available for widget - relative URLs may fail', { widgetId });
  }

  // Build complete bridge options with widgetId
  const completeBridgeOptions: WidgetBridgeOptions | undefined = bridgeOptions
    ? { ...bridgeOptions, widgetId }
    : undefined;

  widgetContentStore.set(widgetId, {
    html: processedHtml,
    createdAt: Date.now(),
    protocol,
    bridgeOptions: completeBridgeOptions,
    baseUrl: effectiveBaseUrl,
  });

  // Return URL to proxy page (not widget directly) for nested iframe + message relay
  const url = `http://127.0.0.1:${serverPort}/proxy/${widgetId}?secret=${encodeURIComponent(secretToken || '')}`;
  logger.mcp.info('Widget content stored', {
    widgetId,
    protocol,
    originalSize: html.length,
    processedSize: processedHtml.length,
    effectiveBaseUrl,
    proxyUrl: url,
  });
  return url;
}

/**
 * Remove widget content from store
 */
export function removeWidgetContent(widgetId: string): void {
  widgetContentStore.delete(widgetId);
  logger.mcp.debug('Widget content removed', { widgetId });
}

/**
 * Generate a unique widget ID
 */
export function generateWidgetId(): string {
  return `widget-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Clean up old widget content
 */
function cleanupOldContent(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, content] of widgetContentStore.entries()) {
    if (now - content.createdAt > MAX_AGE) {
      widgetContentStore.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.mcp.debug('Cleaned up old widget content', { count: cleaned });
  }
}

/**
 * Widget Proxy Service
 * Manages the HTTP server for serving widget HTML
 */
export const widgetProxyService = {
  start: startWidgetProxyServer,
  stop: stopWidgetProxyServer,
  getPort: getWidgetProxyPort,
  getSecret: getWidgetProxySecret,
  store: storeWidgetContent,
  remove: removeWidgetContent,
  generateId: generateWidgetId,
};
