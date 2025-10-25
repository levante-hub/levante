import { BrowserWindow } from 'electron';
import type { MCPServerConfig } from '../types/mcp.js';
import { getLogger } from './logging';

const logger = getLogger();

export interface DeepLinkAction {
  type: 'mcp-add' | 'chat-new';
  data: Record<string, unknown>;
}

export class DeepLinkService {
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Parse a deep link URL and extract action data
   */
  parseDeepLink(url: string): DeepLinkAction | null {
    try {
      logger.core.info('Parsing deep link URL', { url });

      // Parse the URL
      const parsedUrl = new URL(url);

      // Verify protocol
      if (parsedUrl.protocol !== 'levante:') {
        logger.core.warn('Invalid protocol for deep link', { protocol: parsedUrl.protocol });
        return null;
      }

      // For custom protocols like levante://mcp/add, the URL parser treats:
      // - 'mcp' as the hostname
      // - '/add' as the pathname
      // We need to combine hostname + pathname to get the full path
      const hostname = parsedUrl.hostname || '';
      const pathname = parsedUrl.pathname.replace(/^\/+/, '');
      const fullPath = hostname ? `${hostname}/${pathname}` : pathname;

      const [category, action] = fullPath.split('/');

      // Extract query parameters
      const params = Object.fromEntries(parsedUrl.searchParams.entries());

      logger.core.debug('Parsed deep link', { category, action, params });

      // Route to appropriate handler
      if (category === 'mcp' && action === 'add') {
        return this.parseMCPAddLink(params);
      } else if (category === 'chat' && action === 'new') {
        return this.parseChatNewLink(params);
      }

      logger.core.warn('Unknown deep link action', { category, action });
      return null;
    } catch (error) {
      logger.core.error('Error parsing deep link', {
        url,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Sanitize an object to prevent prototype pollution
   * Removes dangerous keys that can pollute Object.prototype
   */
  private sanitizeObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Create a clean object without prototype chain
    const sanitized = Object.create(null);

    // Dangerous keys that can cause prototype pollution
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

    for (const key in obj) {
      // Skip dangerous keys
      if (dangerousKeys.includes(key)) {
        logger.core.warn('Blocked dangerous key in object', { key });
        continue;
      }

      // Only copy own properties
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];

        // Recursively sanitize nested objects
        if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
    }

    return sanitized;
  }

  /**
   * Parse MCP server addition deep link
   * Format: levante://mcp/add?name=server&transport=stdio&command=npx&args=package-name
   */
  private parseMCPAddLink(params: Record<string, string>): DeepLinkAction | null {
    // Support both 'transport' (correct) and 'type' (legacy) for backwards compatibility
    const { name, transport, type, command, args, url, headers } = params;
    const serverType = transport || type;

    if (!name || !serverType) {
      logger.core.warn('Missing required parameters for MCP add', { params });
      return null;
    }

    // Validate server type
    if (serverType !== 'stdio' && serverType !== 'http' && serverType !== 'sse') {
      logger.core.warn('Invalid MCP server transport type', { serverType });
      return null;
    }

    const serverConfig: Partial<MCPServerConfig> = {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name: name,
      transport: serverType as 'stdio' | 'http' | 'sse',
    };

    // Handle stdio type
    if (serverType === 'stdio') {
      if (!command) {
        logger.core.warn('Missing command for stdio MCP server', { params });
        return null;
      }

      serverConfig.command = command;
      // Support both comma-separated args and single arg (for URLs with single package)
      serverConfig.args = args ? (args.includes(',') ? args.split(',') : [args]) : [];
      serverConfig.env = {};
    }

    // Handle http/sse types
    if (serverType === 'http' || serverType === 'sse') {
      if (!url) {
        logger.core.warn('Missing URL for HTTP/SSE MCP server', { params });
        return null;
      }

      serverConfig.baseUrl = url;

      // Parse and sanitize headers to prevent prototype pollution
      if (headers) {
        try {
          const parsedHeaders = JSON.parse(headers);

          // Sanitize the parsed object to remove dangerous keys
          const sanitizedHeaders = this.sanitizeObject(parsedHeaders);

          // Convert back to regular object for compatibility
          serverConfig.headers = { ...sanitizedHeaders };

          logger.core.debug('Parsed and sanitized headers', {
            originalKeys: Object.keys(parsedHeaders),
            sanitizedKeys: Object.keys(sanitizedHeaders)
          });
        } catch (error) {
          logger.core.error('Failed to parse headers JSON', {
            error: error instanceof Error ? error.message : String(error),
            headers
          });
          // Use empty headers on parse error
          serverConfig.headers = {};
        }
      } else {
        serverConfig.headers = {};
      }
    }

    logger.core.info('Parsed MCP add deep link', { serverConfig });

    return {
      type: 'mcp-add',
      data: {
        name,
        config: serverConfig
      }
    };
  }

  /**
   * Parse chat creation deep link
   * Format: levante://chat/new?prompt=your-message&autoSend=true
   */
  private parseChatNewLink(params: Record<string, string>): DeepLinkAction | null {
    const { prompt, autoSend } = params;

    if (!prompt) {
      logger.core.warn('Missing prompt for chat new', { params });
      return null;
    }

    logger.core.info('Parsed chat new deep link', {
      promptLength: prompt.length,
      autoSend
    });

    return {
      type: 'chat-new',
      data: {
        prompt: decodeURIComponent(prompt),
        autoSend: autoSend === 'true'
      }
    };
  }

  /**
   * Handle a deep link action by sending it to the renderer
   */
  handleDeepLink(url: string): void {
    const action = this.parseDeepLink(url);

    if (!action) {
      logger.core.warn('Unable to handle deep link', { url });
      return;
    }

    if (!this.mainWindow) {
      logger.core.error('Main window not available for deep link', { url });
      return;
    }

    // Show and focus the window
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.show();
    this.mainWindow.focus();

    // Send action to renderer via IPC
    logger.core.info('Sending deep link action to renderer', { action });
    this.mainWindow.webContents.send('levante/deep-link/action', action);
  }
}

// Export singleton instance
export const deepLinkService = new DeepLinkService();
