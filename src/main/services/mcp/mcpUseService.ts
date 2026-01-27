import { MCPClient, Logger as MCPLogger, type MCPClientOptions, type MCPSession } from 'mcp-use';
import type {
  MCPServerConfig,
  Tool,
  ToolCall,
  ToolResult,
  CodeModeConfig,
  MCPResource,
  MCPResourceContent,
  MCPPrompt,
  MCPPromptResult,
} from "../../types/mcp.js";
import type { MCPPreferences } from "../../../types/preferences.js";
import { getLogger } from "../logging";
import { loadMCPRegistry } from "./registry.js";
import type { MCPRegistry } from "./types";
import type { IMCPService } from "./IMCPService.js";
import { RuntimeResolver } from "../runtime/RuntimeResolver.js";
import { RuntimeManager } from "../runtime/runtimeManager.js";
import { PreferencesService } from "../preferencesService.js";
import { OAuthService } from "../oauth/OAuthService.js";

/**
 * Modern MCP service implementation using mcp-use framework.
 *
 * This implementation provides code mode capabilities for better token efficiency
 * and advanced workflow orchestration. This is the default implementation.
 */
export class MCPUseService implements IMCPService {
  private logger = getLogger();
  private clients: Map<string, any> = new Map(); // MCPClient instances
  private sessions: Map<string, MCPSession> = new Map();
  private globalPreferences: MCPPreferences;
  private runtimeResolver: RuntimeResolver;
  private oauthAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private static mcpUseLoaded = false;

  constructor(preferences: MCPPreferences) {
    this.globalPreferences = preferences;

    // Initialize RuntimeResolver for automatic runtime management
    this.runtimeResolver = new RuntimeResolver(
      new RuntimeManager(),
      new PreferencesService(),
      this.logger
    );
  }

  /**
   * Initialize mcp-use Logger. Must be called before using MCPClient.
   * This configures the mcp-use library logger.
   */
  async initialize(): Promise<void> {
    if (!MCPUseService.mcpUseLoaded) {
      try {
        // Configure the mcp-use logger with minimal output
        // Use 'error' level to minimize console output (only errors shown)
        await MCPLogger.configure({ level: 'error', format: 'minimal' });

        MCPUseService.mcpUseLoaded = true;
        this.logger.mcp.debug('mcp-use Logger configured');
      } catch (error) {
        this.logger.mcp.error('Failed to initialize mcp-use', {
          error: error instanceof Error ? error.message : error
        });
        throw error;
      }
    }
  }

  async connectServer(config: MCPServerConfig): Promise<void> {
    // Ensure mcp-use is loaded before attempting to connect
    if (!MCPUseService.mcpUseLoaded) {
      await this.initialize();
    }

    // Normalize transport for configs that still use `type` (Claude compatibility)
    const transport = config.transport || (config as any).type;
    const normalizedConfig = { ...config, transport };

    // Resolve runtime if needed (stdio transport only)
    // This handles auto-detection, installation, and path resolution
    if (transport === 'stdio' && this.runtimeResolver.needsRuntime(normalizedConfig)) {
      config = await this.runtimeResolver.resolve(normalizedConfig);
    } else {
      config = normalizedConfig;
    }

    const codeModeConfig = this.resolveCodeModeConfig(config);

    // Auto-detect transport type if not provided (already normalized above, but fallback)
    const finalTransport: MCPServerConfig['transport'] | null = config.transport ||
      (config.command ? 'stdio' : (config.baseUrl || (config as any).url) ? 'http' : null);

    // Normalize url → baseUrl
    const baseUrl = config.baseUrl || (config as any).url;

    this.logger.mcp.info("Attempting to connect to server (mcp-use)", {
      serverId: config.id,
      transport: finalTransport,
      codeMode: codeModeConfig.enabled,
      executor: codeModeConfig.executor,
    });

    if (!finalTransport) {
      throw new Error('Cannot determine transport type from config');
    }

    // Build server configuration for mcp-use
    const serverConfig: Record<string, any> = {
      transport: finalTransport,
    };

    // Track OAuth token usage across all transports
    let hasOAuthToken = false;

    // Add transport-specific configuration
    if (finalTransport === 'stdio') {
      serverConfig.command = config.command;
      serverConfig.args = config.args;
      serverConfig.env = config.env;
    } else if (finalTransport === 'http' || finalTransport === 'sse' || finalTransport === 'streamable-http') {
      serverConfig.url = baseUrl;

      let headers = { ...(config.headers || {}) };

      // Phase 4: Try to use existing OAuth token if available
      try {
        const preferencesService = new PreferencesService();
        await preferencesService.initialize();
        const oauthService = new OAuthService(preferencesService);

        const tokens = await oauthService.getExistingToken(config.id);
        if (tokens) {
          this.logger.mcp.debug("Using existing OAuth token", { serverId: config.id });
          // IMPORTANT: mcp-use adds "Bearer " prefix automatically, so pass token without prefix
          // TEMP: full token log for debugging connectivity issues; remove after verification
          this.logger.mcp.warn('DEBUG FULL OAUTH TOKEN (temporary)', {
            serverId: config.id,
            tokenType: tokens.tokenType,
            accessToken: tokens.accessToken,
          });
          // Use authToken (mcp-use will add "Bearer " prefix automatically)
          (serverConfig as any).authToken = tokens.accessToken;
          hasOAuthToken = true;
        } else {
          this.logger.mcp.debug("No OAuth tokens found", {
            serverId: config.id
          });
        }
      } catch (error) {
        this.logger.mcp.debug("No OAuth token available, will connect without auth", {
          serverId: config.id
        });
      }

      // If using HTTP-based transport and no OAuth token, check if server requires OAuth
      // This preliminary check allows us to obtain the WWW-Authenticate header
      // which mcp-use might not provide if it detects auth requirements internally
      // IMPORTANT: Use the exact same URL that will be passed to mcp-use transport
      if (!hasOAuthToken) {
        this.logger.mcp.debug('Performing preliminary OAuth check (no token present)', {
          serverId: config.id,
          transport: finalTransport,
          url: baseUrl
        });

        try {
          // Pass both transportUrl (exact URL for preflight) and baseUrl (for error metadata)
          await this.checkOAuthRequirement(config.id, baseUrl, baseUrl);
          // If no error thrown, OAuth is not required or check failed non-critically
          this.logger.mcp.debug('Preliminary OAuth check passed, proceeding with connection', {
            serverId: config.id
          });
        } catch (error: any) {
          // If OAuth is required, this error will be caught by the outer try-catch
          // and handled by the IPC handler which will initiate the OAuth flow
          if (error.code === 'OAUTH_REQUIRED' || error.code === 'OAUTH_LIMIT_EXCEEDED') {
            this.logger.mcp.info('OAuth required, aborting connection attempt', {
              serverId: config.id,
              errorCode: error.code
            });
            throw error;
          }
          // Other errors are logged but don't stop the connection attempt
          this.logger.mcp.debug('Preliminary OAuth check error ignored', {
            serverId: config.id,
            error: error.message
          });
        }
      }

      if (Object.keys(headers).length > 0) {
        serverConfig.headers = headers;
      }

      // DEBUG: Log OAuth configuration details (without exposing full token)
      if (hasOAuthToken) {
        const authTokenPreview = ((serverConfig as any).authToken || '').substring(0, 20) + '...[REDACTED]';
        this.logger.mcp.debug('OAuth token configured for connection (mcp-use will add Bearer prefix)', {
          serverId: config.id,
          authTokenConfigured: !!(serverConfig as any).authToken,
          authTokenPreview,
          note: 'Token passed without Bearer prefix - mcp-use adds it automatically'
        });
      }
    }

    // Build MCP client options
    const clientOptions: MCPClientOptions = {};

    // Add code mode configuration if enabled
    if (codeModeConfig.enabled) {
      const executorOpts: any = {};

      if (codeModeConfig.executor === 'vm' || !codeModeConfig.executor) {
        // VM executor options
        executorOpts.timeoutMs =
          codeModeConfig.executorOptions?.timeout ||
          this.globalPreferences.codeModeDefaults?.vmTimeout ||
          30000;

        executorOpts.memoryLimitMb =
          (codeModeConfig.executorOptions?.memoryLimit ||
            this.globalPreferences.codeModeDefaults?.vmMemoryLimit ||
            134217728) / (1024 * 1024); // Convert bytes to MB
      } else if (codeModeConfig.executor === 'e2b') {
        // E2B executor options
        executorOpts.apiKey =
          codeModeConfig.executorOptions?.apiKey ||
          this.globalPreferences.e2bApiKey;

        if (!executorOpts.apiKey) {
          throw new Error('E2B executor requires API key');
        }

        if (codeModeConfig.executorOptions?.timeout) {
          executorOpts.timeoutMs = codeModeConfig.executorOptions.timeout;
        }
      }

      clientOptions.codeMode = {
        enabled: true,
        executor: codeModeConfig.executor || 'vm',
        executorOptions: executorOpts,
      };
    }

    // Retry configuration for cold start handling
    // mcp-use hardcodes initial connection timeout to 3 seconds, so we implement retry at service level
    const maxRetries = (finalTransport === 'http' || finalTransport === 'sse' || finalTransport === 'streamable-http') ? 3 : 1;
    const retryDelayMs = 2000; // 2 second delay between retries
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Create client with server configuration
        // mcp-use expects config wrapped in 'mcpServers' object
        const clientConfig = {
          mcpServers: {
            [config.id]: serverConfig
          }
        };

        // DEBUG: Log complete server config structure (sanitize sensitive data)
        const sanitizedConfig = { ...serverConfig };
        if ((sanitizedConfig as any).authToken) {
          (sanitizedConfig as any).authToken =
            (sanitizedConfig as any).authToken.substring(0, 20) + '...[REDACTED]';
        }
        this.logger.mcp.debug('Creating mcp-use client with config', {
          serverId: config.id,
          attempt,
          serverConfig: sanitizedConfig,
          hasAuthToken: !!(serverConfig as any).authToken,
          note: hasOAuthToken ? 'OAuth token set (no Bearer prefix - added by mcp-use)' : undefined
        });

        const client = new MCPClient(clientConfig, clientOptions);

        // Create and initialize session with timeout to prevent hanging on auth required
        const createSessionWithTimeout = async (timeoutMs: number) => {
          return Promise.race([
            client.createSession(config.id, true),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Connection timeout - authentication may be required')), timeoutMs)
            )
          ]);
        };

        const session = await createSessionWithTimeout(10000); // 10 second timeout

        this.clients.set(config.id, client);
        this.sessions.set(config.id, session);

        // Set up tools/list_changed notification handler
        this.setupToolsListChangedHandler(config.id, session);

        this.logger.mcp.info("Successfully connected to MCP server (mcp-use)", {
          serverId: config.id,
          codeMode: codeModeConfig.enabled,
          executor: codeModeConfig.executor || 'vm',
          attempt,
        });
        return; // Success - exit the retry loop
      } catch (error) {
        // DEBUG: Log complete error to understand what mcp-use is throwing
        this.logger.mcp.debug("Connection error caught", {
          serverId: config.id,
          errorType: typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStatus: (error as any)?.status,
          errorStatusCode: (error as any)?.statusCode,
          errorResponseStatus: (error as any)?.response?.status,
          errorKeys: error && typeof error === 'object' ? Object.keys(error) : [],
        });

        if (this.is401Error(error)) {
          if (!this.canAttemptOAuth(config.id)) {
            this.logger.mcp.error('Too many OAuth attempts', { serverId: config.id });
          } else {
            this.logger.mcp.info("Received 401 during connection (fallback detection)", {
              serverId: config.id,
              url: baseUrl,
              note: 'Preliminary OAuth check should have caught this'
            });

            const wwwAuth = this.extractWWWAuthenticate(error);

            if (wwwAuth) {
              await this.initiateOAuthFlow(config.id, baseUrl, wwwAuth);

              throw {
                code: 'OAUTH_REQUIRED',
                message: 'OAuth authorization required',
                serverId: config.id,
                mcpServerUrl: baseUrl,
                wwwAuth
              };
            } else {
              // If we detected 401 but no WWW-Authenticate header (should be rare now)
              this.logger.mcp.warn('Detected 401 error but no WWW-Authenticate header available', {
                serverId: config.id,
                errorMessage: error instanceof Error ? error.message : String(error)
              });
            }
          }
        }

        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;

        // Check if this is a retryable error (timeout or connection issues)
        const isRetryable =
          errorMessage.includes('timed out') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('Request timed out') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('Could not connect') ||
          errorMessage.includes('404') ||
          errorMessage.includes('503');

        if (attempt < maxRetries && isRetryable) {
          this.logger.mcp.warn(`Connection attempt ${attempt}/${maxRetries} failed, retrying in ${retryDelayMs}ms...`, {
            serverId: config.id,
            error: errorMessage,
          });
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        } else {
          // Final attempt failed or non-retryable error
          this.logger.mcp.error("Failed to connect to MCP server (mcp-use)", {
            serverId: config.id,
            error: errorMessage,
            attempt,
            maxRetries,
          });
          throw lastError;
        }
      }
    }
  }

  async listTools(serverId: string): Promise<Tool[]> {
    const session = this.sessions.get(serverId);
    if (!session) {
      throw new Error(
        `Session ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      // Access tools from the connector
      const tools = session.connector.tools;
      return tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema,
        _meta: tool._meta, // Preserve metadata (e.g., openai/outputTemplate for Skybridge)
      }));
    } catch (error) {
      this.logger.mcp.error("Failed to list tools from server (mcp-use)", {
        serverId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  async callTool(serverId: string, toolCall: ToolCall): Promise<ToolResult> {
    const session = this.sessions.get(serverId);
    if (!session) {
      throw new Error(
        `Session ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      const result = await session.connector.callTool(toolCall.name, toolCall.arguments);

      this.logger.mcp.debug("Tool result received (mcp-use) - RAW", {
        serverId,
        toolName: toolCall.name,
        fullResult: JSON.stringify(result).substring(0, 500), // First 500 chars
        resultKeys: Object.keys(result),
        hasContent: !!result.content,
        contentType: Array.isArray(result.content) ? 'array' : typeof result.content,
        contentLength: Array.isArray(result.content) ? result.content.length : 0,
        firstContentItem: Array.isArray(result.content) && result.content[0]
          ? JSON.stringify(result.content[0]).substring(0, 200)
          : null,
        isError: result.isError,
      });

      // Handle different content formats from mcp-use
      // MCP spec 2025-06-18: structuredContent is preferred over content
      let content: any[];

      if (result.structuredContent) {
        // Prefer structuredContent (modern MCP spec field)
        // Convert to text for backward compatibility and LLM consumption
        this.logger.mcp.debug("Using structuredContent as primary content source", {
          serverId,
          toolName: toolCall.name,
          hasLegacyContent: !!result.content,
        });
        content = [{
          type: "text",
          text: JSON.stringify(result.structuredContent, null, 2)
        }];
      } else if (Array.isArray(result.content)) {
        // Fallback to legacy content field
        content = result.content;
      } else if (result.content !== undefined && result.content !== null) {
        // If content is not an array, wrap it in an array
        // MCP protocol expects content to be an array of content items
        content = [{
          type: "text",
          text: typeof result.content === "string"
            ? result.content
            : JSON.stringify(result.content)
        }];
      } else {
        content = [];
      }

      const finalResult: ToolResult = {
        content,
        isError: Boolean(result.isError),
      };

      // Preserve _meta for UI widgets (mcp-use/widget)
      if (result._meta) {
        finalResult._meta = result._meta;
      }

      // Preserve structuredContent for widget data
      if (result.structuredContent) {
        finalResult.structuredContent = result.structuredContent;
      }

      this.logger.mcp.debug("Tool result AFTER processing (mcp-use)", {
        serverId,
        toolName: toolCall.name,
        contentLength: content.length,
        firstItem: content[0] ? JSON.stringify(content[0]).substring(0, 200) : null,
        isError: finalResult.isError,
        hasMeta: !!finalResult._meta,
        hasWidgetMeta: !!finalResult._meta?.['mcp-use/widget'],
        hasStructuredContent: !!finalResult.structuredContent,
      });

      return finalResult;
    } catch (error) {
      this.logger.mcp.error("Failed to call tool on server (mcp-use)", {
        serverId,
        toolName: toolCall.name,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const session = this.sessions.get(serverId);

    if (client && session) {
      try {
        await client.closeSession(serverId);
        this.clients.delete(serverId);
        this.sessions.delete(serverId);
        this.logger.mcp.info("Successfully disconnected from MCP server (mcp-use)", {
          serverId,
        });
      } catch (error) {
        this.logger.mcp.error("Error disconnecting from server (mcp-use)", {
          serverId,
          error: error instanceof Error ? error.message : error,
        });
        // Still remove from maps even if disconnect failed
        this.clients.delete(serverId);
        this.sessions.delete(serverId);
      }
    }
  }

  isConnected(serverId: string): boolean {
    const session = this.sessions.get(serverId);
    return session ? session.isConnected : false;
  }

  getConnectedServers(): string[] {
    return Array.from(this.sessions.keys());
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.sessions.keys()).map(
      (serverId) => this.disconnectServer(serverId)
    );

    await Promise.allSettled(disconnectPromises);
  }

  async ping(serverId: string): Promise<boolean> {
    const session = this.sessions.get(serverId);
    if (!session) {
      return false;
    }

    try {
      // Check if session is connected and tools are available
      return session.isConnected && session.connector.tools.length >= 0;
    } catch (error) {
      return false;
    }
  }

  async reconnectServer(serverId: string): Promise<void> {
    // Implementation will depend on stored config
    this.logger.mcp.info("Reconnecting to server (mcp-use)", { serverId });
    // This will be implemented with config persistence
  }

  async getRegistry(): Promise<MCPRegistry> {
    return await loadMCPRegistry();
  }

  async validatePackage(
    packageName: string
  ): Promise<{
    valid: boolean;
    status: string;
    message: string;
    alternative?: string;
  }> {
    try {
      const registry = await loadMCPRegistry();

      // Check if it's deprecated
      const deprecatedEntry = registry.deprecated.find(
        (entry) => entry.npmPackage === packageName
      );
      if (deprecatedEntry) {
        return {
          valid: false,
          status: "deprecated",
          message: deprecatedEntry.reason,
          alternative: deprecatedEntry.alternative,
        };
      }

      // Check if it's active
      const activeEntry = registry.entries.find(
        (entry) => entry.npmPackage === packageName && entry.status === "active"
      );
      if (activeEntry) {
        return {
          valid: true,
          status: "active",
          message: `Package ${packageName} is available (v${activeEntry.version || "latest"
            })`,
        };
      }

      // Unknown package
      const availablePackages = registry.entries
        .filter((entry) => entry.status === "active")
        .map((entry) => entry.npmPackage)
        .join(", ");

      return {
        valid: false,
        status: "unknown",
        message: `Unknown package. Available packages: ${availablePackages}`,
      };
    } catch (error) {
      return {
        valid: false,
        status: "error",
        message: "Unable to validate package due to registry loading error",
      };
    }
  }

  /**
   * Detects if an error represents a 401 unauthorized response.
   */
  private is401Error(error: any): boolean {
    const message = error?.message && typeof error.message === 'string' ? error.message.toLowerCase() : '';

    return (
      error?.status === 401 ||
      error?.statusCode === 401 ||
      error?.response?.status === 401 ||
      message.includes('401') ||
      message.includes('unauthorized') ||
      // Detect mcp-use authentication patterns
      (message.includes('authentication') && (
        message.includes('required') ||
        message.includes('timeout') ||
        message.includes('may be required')
      ))
    );
  }

  /**
   * Extract WWW-Authenticate header from various error shapes.
   */
  private extractWWWAuthenticate(error: any): string | undefined {
    return (
      error?.headers?.['www-authenticate'] ||
      error?.headers?.['WWW-Authenticate'] ||
      error?.response?.headers?.['www-authenticate'] ||
      error?.response?.headers?.['WWW-Authenticate'] ||
      undefined
    );
  }

  /**
   * Checks if the MCP server requires OAuth by making a preliminary HTTP GET request.
   * This is necessary because mcp-use may detect authentication requirements internally
   * without making an actual HTTP request, preventing us from obtaining the WWW-Authenticate header.
   *
   * IMPORTANT: This method only DETECTS OAuth requirements and throws OAUTH_REQUIRED error.
   * It does NOT initiate the OAuth flow itself to avoid duplication - the IPC handler
   * or retry loop will handle initiating OAuth based on the error code.
   *
   * @param serverId - Server identifier
   * @param transportUrl - Exact URL used by the transport (same URL passed to mcp-use)
   * @param baseUrl - Base MCP server URL (used in error metadata)
   * @throws Error with code 'OAUTH_REQUIRED' if OAuth flow should be initiated
   */
  private async checkOAuthRequirement(
    serverId: string,
    transportUrl: string,
    baseUrl: string
  ): Promise<void> {
    try {
      this.logger.mcp.debug('Checking OAuth requirement with preliminary HTTP request', {
        serverId,
        transportUrl,
        baseUrl
      });

      // Make a simple GET request to the exact transport URL
      // This ensures we get the same 401 response that mcp-use would receive
      const response = await fetch(transportUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/event-stream',
          'User-Agent': 'Levante-MCP-Client/1.0'
        },
        // Don't follow redirects automatically
        redirect: 'manual'
      });

      this.logger.mcp.debug('Preliminary HTTP response received', {
        serverId,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      // Check if response is 401 Unauthorized
      if (response.status === 401) {
        // Extract WWW-Authenticate header
        const wwwAuth = response.headers.get('WWW-Authenticate') ||
          response.headers.get('www-authenticate');

        this.logger.mcp.info('Server requires OAuth authentication (401 received)', {
          serverId,
          hasWWWAuth: !!wwwAuth,
          wwwAuthPreview: wwwAuth ? wwwAuth.substring(0, 100) : undefined
        });

        // DEBUG: Log complete WWW-Authenticate header for debugging
        if (wwwAuth) {
          this.logger.mcp.debug('🔍 RAW WWW-Authenticate header (complete)', {
            serverId,
            headerLength: wwwAuth.length,
            rawHeader: wwwAuth
          });
        }

        if (wwwAuth) {
          // Check if we can attempt OAuth
          if (!this.canAttemptOAuth(serverId)) {
            const error = new Error('Too many OAuth attempts for this server');
            (error as any).code = 'OAUTH_LIMIT_EXCEEDED';
            throw error;
          }

          // DO NOT initiate OAuth here - just throw the error with metadata
          // The IPC handler will initiate OAuth to avoid duplication
          this.logger.mcp.info('OAuth requirement detected, throwing OAUTH_REQUIRED error', {
            serverId,
            note: 'OAuth flow will be initiated by IPC handler'
          });

          // Throw error to stop connection attempt and signal OAuth requirement
          const oauthError = new Error('OAuth authorization required');
          (oauthError as any).code = 'OAUTH_REQUIRED';
          (oauthError as any).serverId = serverId;
          (oauthError as any).mcpServerUrl = baseUrl;
          (oauthError as any).wwwAuth = wwwAuth;
          throw oauthError;
        } else {
          // 401 without WWW-Authenticate - unusual but possible
          this.logger.mcp.warn('Received 401 without WWW-Authenticate header', {
            serverId
          });
        }
      } else if (response.status >= 200 && response.status < 300) {
        // Server is accessible without authentication
        this.logger.mcp.debug('Server accessible without OAuth', {
          serverId,
          status: response.status
        });
      } else if (response.status >= 300 && response.status < 400) {
        // Redirect - log but continue with normal connection attempt
        this.logger.mcp.debug('Server returned redirect', {
          serverId,
          status: response.status,
          location: response.headers.get('Location')
        });
      } else {
        // Other error status - log but continue with normal connection attempt
        this.logger.mcp.debug('Server returned non-401 error status', {
          serverId,
          status: response.status
        });
      }

      // If we reach here, no OAuth is required or detected
    } catch (error: any) {
      // If it's our OAuth error, re-throw it
      if (error.code === 'OAUTH_REQUIRED' || error.code === 'OAUTH_LIMIT_EXCEEDED') {
        throw error;
      }

      // For network errors or other issues, log and continue
      // The normal connection attempt will handle these errors
      this.logger.mcp.debug('Preliminary OAuth check failed, continuing with normal connection', {
        serverId,
        error: error.message,
        errorType: error.constructor.name
      });
    }
  }

  /**
   * Emit OAuth required event to renderer when 401 is detected.
   */
  private async initiateOAuthFlow(
    serverId: string,
    mcpServerUrl: string,
    wwwAuth: string
  ): Promise<void> {
    const { BrowserWindow } = await import('electron');
    const mainWindow = BrowserWindow.getAllWindows()[0];

    if (mainWindow) {
      mainWindow.webContents.send('levante/oauth/required', {
        serverId,
        mcpServerUrl,
        wwwAuth
      });
    }
  }

  /**
   * Set up handler for tools/list_changed MCP notification.
   * When tools list changes on the server, update the cache and notify the renderer.
   */
  private async setupToolsListChangedHandler(
    serverId: string,
    session: MCPSession
  ): Promise<void> {
    try {
      // Check if the session/connector supports notifications
      // mcp-use's connector may have different event mechanisms
      const connector = session.connector;

      // Try to set up notification handler if supported
      // The connector may have an 'on' method for MCP notifications
      if (connector && typeof (connector as any).on === 'function') {
        (connector as any).on('notification', async (notification: any) => {
          if (notification.method === 'notifications/tools/list_changed') {
            this.logger.mcp.info('Tools list changed notification received', { serverId });

            try {
              // Fetch updated tools list
              const tools = await this.listTools(serverId);

              // Update tools cache in preferences
              const preferencesService = new PreferencesService();
              await preferencesService.initialize();
              const prefs = await preferencesService.getAll();

              const toolsCache = prefs.mcp?.toolsCache || {};
              toolsCache[serverId] = {
                tools,
                lastUpdated: Date.now()
              };

              await preferencesService.set('mcp.toolsCache', toolsCache);

              // Notify renderer
              const { BrowserWindow } = await import('electron');
              const mainWindow = BrowserWindow.getAllWindows()[0];

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('levante/mcp/tools-updated', {
                  serverId,
                  tools
                });
              }

              this.logger.mcp.info('Tools cache updated after list_changed notification', {
                serverId,
                toolCount: tools.length
              });
            } catch (error) {
              this.logger.mcp.error('Failed to update tools cache after list_changed', {
                serverId,
                error: error instanceof Error ? error.message : error
              });
            }
          }
        });

        this.logger.mcp.debug('Tools list_changed notification handler registered', { serverId });
      } else {
        // mcp-use connector doesn't support notifications directly
        // This is expected behavior - tools will be refreshed on demand
        this.logger.mcp.debug('Connector does not support notifications, tools will refresh on demand', { serverId });
      }
    } catch (error) {
      // Non-critical error - don't fail the connection
      this.logger.mcp.debug('Failed to set up tools list_changed handler', {
        serverId,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Simple rate limiting for OAuth attempts.
   */
  private canAttemptOAuth(serverId: string): boolean {
    const now = Date.now();
    const attempt = this.oauthAttempts.get(serverId);

    if (!attempt) {
      this.oauthAttempts.set(serverId, { count: 1, lastAttempt: now });
      return true;
    }

    if (now - attempt.lastAttempt > 5 * 60 * 1000) {
      this.oauthAttempts.set(serverId, { count: 1, lastAttempt: now });
      return true;
    }

    if (attempt.count >= 3) {
      return false;
    }

    attempt.count++;
    attempt.lastAttempt = now;
    return true;
  }

  // ==========================================
  // MCP Resources methods
  // ==========================================

  /**
   * List all resources available from a connected MCP server.
   * Uses mcp-use session.listResources() API.
   */
  async listResources(serverId: string): Promise<MCPResource[]> {
    const session = this.sessions.get(serverId);
    if (!session) {
      throw new Error(
        `Session ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      // mcp-use TypeScript API: session.connector.listResources()
      const response = await session.connector.listResources();
      const resources = response?.resources || [];

      this.logger.mcp.debug("Listed resources from server (mcp-use)", {
        serverId,
        resourceCount: resources?.length || 0,
      });

      // Map to our MCPResource type
      return (resources || []).map((r: any) => ({
        name: r.name,
        uri: r.uri,
        description: r.description,
        mimeType: r.mimeType,
        annotations: r.annotations,
      }));
    } catch (error) {
      this.logger.mcp.error("Failed to list resources from server (mcp-use)", {
        serverId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Read the content of a specific resource from an MCP server.
   * Uses mcp-use session.readResource(uri) API.
   */
  async readResource(serverId: string, uri: string): Promise<MCPResourceContent> {
    const session = this.sessions.get(serverId);
    if (!session) {
      throw new Error(
        `Session ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      // mcp-use TypeScript API: session.connector.readResource(uri)
      const result = await session.connector.readResource(uri);

      this.logger.mcp.debug("Read resource from server (mcp-use)", {
        serverId,
        uri,
        contentsCount: result?.contents?.length || 0,
      });

      return {
        uri,
        contents: (result?.contents || []).map((c: any) => ({
          uri: c.uri,
          mimeType: c.mimeType,
          text: c.text,
          blob: c.blob,
        })),
      };
    } catch (error) {
      this.logger.mcp.error("Failed to read resource from server (mcp-use)", {
        serverId,
        uri,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  // ==========================================
  // MCP Prompts methods
  // ==========================================

  /**
   * List all prompts available from a connected MCP server.
   * Uses mcp-use session.listPrompts() API.
   */
  async listPrompts(serverId: string): Promise<MCPPrompt[]> {
    const session = this.sessions.get(serverId);
    if (!session) {
      throw new Error(
        `Session ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      // mcp-use TypeScript API: session.connector.listPrompts()
      const response = await session.connector.listPrompts();

      const prompts = response?.prompts || [];

      this.logger.mcp.debug("Listed prompts from server (mcp-use)", {
        serverId,
        promptCount: prompts?.length || 0,
      });

      // Map to our MCPPrompt type
      return prompts.map((p: any) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments?.map((arg: any) => ({
          name: arg.name,
          description: arg.description,
          required: arg.required,
        })),
      }));
    } catch (error) {
      this.logger.mcp.error("Failed to list prompts from server (mcp-use)", {
        serverId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get a prompt from an MCP server with optional arguments.
   * Uses mcp-use session.getPrompt(name, args) API.
   */
  async getPrompt(serverId: string, name: string, args?: Record<string, any>): Promise<MCPPromptResult> {
    const session = this.sessions.get(serverId);
    if (!session) {
      throw new Error(
        `Session ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      // Convert args to string values if present (MCP protocol requires strings)
      const stringArgs = args && Object.keys(args).length > 0
        ? Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v)]))
        : undefined;

      this.logger.mcp.debug("Calling getPrompt", {
        serverId,
        name,
        hasArgs: !!stringArgs,
      });

      // mcp-use TypeScript API: session.connector.getPrompt(name, args)
      // Args must be an object (empty {} if no args)
      const result = await session.connector.getPrompt(name, stringArgs || {});

      this.logger.mcp.debug("Got prompt from server (mcp-use)", {
        serverId,
        name,
        messagesCount: result?.messages?.length || 0,
      });

      return {
        description: result?.description,
        messages: (result?.messages || []).map((m: any) => ({
          role: m.role,
          content: {
            type: m.content?.text ? 'text' : 'image',
            text: m.content?.text,
            data: m.content?.data,
            mimeType: m.content?.mimeType,
          },
        })),
      };
    } catch (error) {
      this.logger.mcp.error("Failed to get prompt from server (mcp-use)", {
        serverId,
        name,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Resolve code mode configuration for a server.
   * Server-level config takes precedence over global defaults.
   */
  private resolveCodeModeConfig(config: MCPServerConfig): CodeModeConfig {
    // Server-level override takes precedence
    if (config.codeMode !== undefined) {
      if (typeof config.codeMode === 'boolean') {
        return {
          enabled: config.codeMode,
          executor: this.globalPreferences.codeModeDefaults?.executor || 'vm',
        };
      }
      return config.codeMode;
    }

    // Use global defaults
    return {
      enabled: this.globalPreferences.codeModeDefaults?.enabled ?? true,
      executor: this.globalPreferences.codeModeDefaults?.executor || 'vm',
    };
  }
}
