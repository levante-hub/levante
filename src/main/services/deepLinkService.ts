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

      // Extract path segments (remove leading slashes)
      const pathname = parsedUrl.pathname.replace(/^\/+/, '');
      const [category, action] = pathname.split('/');

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
   * Parse MCP server addition deep link
   * Format: levante://mcp/add?name=server&type=stdio&command=npx&args=package-name
   */
  private parseMCPAddLink(params: Record<string, string>): DeepLinkAction | null {
    const { name, type, command, args, url, headers } = params;

    if (!name || !type) {
      logger.core.warn('Missing required parameters for MCP add', { params });
      return null;
    }

    // Validate server type
    if (type !== 'stdio' && type !== 'http' && type !== 'sse') {
      logger.core.warn('Invalid MCP server type', { type });
      return null;
    }

    const serverConfig: Partial<MCPServerConfig> = {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      type: type as 'stdio' | 'http' | 'sse',
    };

    // Handle stdio type
    if (type === 'stdio') {
      if (!command) {
        logger.core.warn('Missing command for stdio MCP server', { params });
        return null;
      }

      serverConfig.command = command;
      serverConfig.args = args ? args.split(',') : [];
      serverConfig.env = {};
    }

    // Handle http/sse types
    if (type === 'http' || type === 'sse') {
      if (!url) {
        logger.core.warn('Missing URL for HTTP/SSE MCP server', { params });
        return null;
      }

      serverConfig.url = url;
      serverConfig.headers = headers ? JSON.parse(headers) : {};
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
