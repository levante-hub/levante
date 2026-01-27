import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  MCPServerConfig,
  Tool,
  ToolCall,
  ToolResult,
  MCPResource,
  MCPResourceContent,
  MCPPrompt,
  MCPPromptResult,
} from "../../types/mcp.js";
import { getLogger } from "../logging";
import { createTransport, handleConnectionError } from "./transports.js";
import { loadMCPRegistry } from "./registry.js";
import type { MCPRegistry } from "./types";
import type { IMCPService } from "./IMCPService.js";
import { RuntimeResolver } from "../runtime/RuntimeResolver.js";
import { RuntimeManager } from "../runtime/runtimeManager.js";
import { PreferencesService } from "../preferencesService.js";
import { OAuthService } from "../oauth/OAuthService.js";

/**
 * Legacy MCP service implementation using @modelcontextprotocol/sdk.
 *
 * This implementation provides direct tool calls without code mode capabilities.
 * Used when user selects "Official SDK" in Settings > MCP.
 */
export class MCPLegacyService implements IMCPService {
  private logger = getLogger();
  private clients: Map<string, Client> = new Map();
  private runtimeResolver: RuntimeResolver;
  private oauthAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();

  constructor() {
    // Initialize RuntimeResolver for automatic runtime management
    this.runtimeResolver = new RuntimeResolver(
      new RuntimeManager(),
      new PreferencesService(),
      this.logger
    );
  }

  /**
   * Initialize the MCP service. No-op for legacy service.
   */
  async initialize(): Promise<void> {
    // No initialization needed for legacy service
  }

  async connectServer(config: MCPServerConfig): Promise<void> {
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

    const transportType = config.transport || (config as any).type;
    const baseUrl = config.baseUrl || (config as any).url;

    if (transportType === 'http' || transportType === 'sse' || transportType === 'streamable-http') {
      let headers = { ...(config.headers || {}) };

      try {
        const preferencesService = new PreferencesService();
        await preferencesService.initialize();
        const oauthService = new OAuthService(preferencesService);

        const tokens = await oauthService.getExistingToken(config.id);
        if (tokens) {
          this.logger.mcp.debug("Using existing OAuth token", { serverId: config.id });
          headers = {
            ...headers,
            Authorization: `${tokens.tokenType} ${tokens.accessToken}`,
          };
        }
      } catch (error) {
        this.logger.mcp.debug("No OAuth token available, will connect without auth", {
          serverId: config.id
        });
      }

      config.headers = headers;
    }

    try {
      const { client, transport } = await createTransport(config);

      // Connect to the server with detailed error handling
      this.logger.mcp.info("Attempting to connect to server (Official SDK)", {
        serverId: config.id,
      });

      try {
        await client.connect(transport);
        this.logger.mcp.info("Successfully connected to server", {
          serverId: config.id,
        });
      } catch (connectionError) {
        if (this.is401Error(connectionError)) {
          if (!this.canAttemptOAuth(config.id)) {
            this.logger.mcp.error('Too many OAuth attempts', { serverId: config.id });
          } else {
            this.logger.mcp.info("Received 401, initiating OAuth flow", {
              serverId: config.id,
              url: baseUrl
            });

            const wwwAuth = this.extractWWWAuthenticate(connectionError);

            if (wwwAuth) {
              await this.initiateOAuthFlow(config.id, baseUrl, wwwAuth);

              throw {
                code: 'OAUTH_REQUIRED',
                message: 'OAuth authorization required',
                serverId: config.id,
                mcpServerUrl: baseUrl,
                wwwAuth
              };
            }
          }
        }

        this.logger.mcp.error("Connection failed for server", {
          serverId: config.id,
          error:
            connectionError instanceof Error
              ? connectionError.message
              : connectionError,
        });

        // Provide more specific error messages
        if (connectionError instanceof Error) {
          throw await handleConnectionError(
            connectionError,
            config,
            transportType,
            baseUrl
          );
        }

        throw connectionError;
      }

      // Store the client
      this.clients.set(config.id, client);

      this.logger.mcp.info("Successfully connected to MCP server (Official SDK)", {
        serverId: config.id,
      });
    } catch (error) {
      this.logger.mcp.error("Failed to connect to MCP server", {
        serverId: config.id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  async listTools(serverId: string): Promise<Tool[]> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(
        `Client ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      const response = await client.listTools();
      return response.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema,
        _meta: (tool as any)._meta, // Preserve metadata (e.g., openai/outputTemplate for Skybridge)
      }));
    } catch (error) {
      this.logger.mcp.error("Failed to list tools from server", {
        serverId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  async callTool(serverId: string, toolCall: ToolCall): Promise<ToolResult> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(
        `Client ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      const response = await client.callTool({
        name: toolCall.name,
        arguments: toolCall.arguments,
      });

      // Handle content field - MCP spec 2025-06-18
      // Prefer structuredContent over legacy content field
      let content: any[];

      if ((response as any).structuredContent) {
        // Prefer structuredContent (modern MCP spec field)
        this.logger.mcp.debug("Using structuredContent as primary content source", {
          serverId,
          toolName: toolCall.name,
          hasLegacyContent: !!response.content,
        });
        content = [{
          type: "text",
          text: JSON.stringify((response as any).structuredContent, null, 2)
        }];
      } else if (Array.isArray(response.content)) {
        // Fallback to legacy content field
        content = response.content;
      } else {
        content = [];
      }

      const result: ToolResult = {
        content,
        isError: Boolean(response.isError),
      };

      // Preserve structuredContent and _meta if present
      if ((response as any).structuredContent) {
        result.structuredContent = (response as any).structuredContent;
      }
      if ((response as any)._meta) {
        result._meta = (response as any)._meta;
      }

      return result;
    } catch (error) {
      this.logger.mcp.error("Failed to call tool on server", {
        serverId,
        toolName: toolCall.name,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.close();
        this.clients.delete(serverId);
        this.logger.mcp.info("Successfully disconnected from MCP server (Official SDK)", {
          serverId,
        });
      } catch (error) {
        this.logger.mcp.error("Error disconnecting from server", {
          serverId,
          error: error instanceof Error ? error.message : error,
        });
        // Still remove from clients map even if disconnect failed
        this.clients.delete(serverId);
      }
    }
  }

  isConnected(serverId: string): boolean {
    return this.clients.has(serverId);
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.keys()).map(
      (serverId) => this.disconnectServer(serverId)
    );

    await Promise.allSettled(disconnectPromises);
  }

  async ping(serverId: string): Promise<boolean> {
    const client = this.clients.get(serverId);
    if (!client) {
      return false;
    }

    try {
      // Try to list tools as a way to ping the server
      await client.listTools();
      return true;
    } catch (error) {
      return false;
    }
  }

  async reconnectServer(serverId: string): Promise<void> {
    // Implementation will depend on stored config
    this.logger.mcp.info("Reconnecting to server (Official SDK)", { serverId });
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
          message: `Package ${packageName} is available (v${
            activeEntry.version || "latest"
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
    return (
      error?.status === 401 ||
      error?.statusCode === 401 ||
      error?.response?.status === 401 ||
      (error?.message && typeof error.message === 'string' && error.message.includes('401')) ||
      (error?.message && typeof error.message === 'string' && error.message.toLowerCase().includes('unauthorized'))
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
   * Uses official SDK client.listResources() API.
   */
  async listResources(serverId: string): Promise<MCPResource[]> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(
        `Client ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      // Official SDK API: client.listResources()
      const response = await client.listResources();

      this.logger.mcp.debug("Listed resources from server (Official SDK)", {
        serverId,
        resourceCount: response.resources?.length || 0,
      });

      // Map to our MCPResource type
      return (response.resources || []).map((r: any) => ({
        name: r.name,
        uri: r.uri,
        description: r.description,
        mimeType: r.mimeType,
        annotations: r.annotations,
      }));
    } catch (error) {
      this.logger.mcp.error("Failed to list resources from server (Official SDK)", {
        serverId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Read the content of a specific resource from an MCP server.
   * Uses official SDK client.readResource(uri) API.
   */
  async readResource(serverId: string, uri: string): Promise<MCPResourceContent> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(
        `Client ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      // Official SDK API: client.readResource({ uri })
      const response = await client.readResource({ uri });

      this.logger.mcp.debug("Read resource from server (Official SDK)", {
        serverId,
        uri,
        contentsCount: response.contents?.length || 0,
      });

      return {
        uri,
        contents: (response.contents || []).map((c: any) => ({
          uri: c.uri,
          mimeType: c.mimeType,
          text: c.text,
          blob: c.blob,
        })),
      };
    } catch (error) {
      this.logger.mcp.error("Failed to read resource from server (Official SDK)", {
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
   * Uses official SDK client.listPrompts() API.
   */
  async listPrompts(serverId: string): Promise<MCPPrompt[]> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(
        `Client ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      // Official SDK API: client.listPrompts()
      const response = await client.listPrompts();

      this.logger.mcp.debug("Listed prompts from server (Official SDK)", {
        serverId,
        promptCount: response.prompts?.length || 0,
      });

      // Map to our MCPPrompt type
      return (response.prompts || []).map((p: any) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments?.map((arg: any) => ({
          name: arg.name,
          description: arg.description,
          required: arg.required,
        })),
      }));
    } catch (error) {
      this.logger.mcp.error("Failed to list prompts from server (Official SDK)", {
        serverId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get a prompt from an MCP server with optional arguments.
   * Uses official SDK client.getPrompt() API.
   */
  async getPrompt(serverId: string, name: string, args?: Record<string, any>): Promise<MCPPromptResult> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(
        `Client ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      // Official SDK API: client.getPrompt({ name, arguments })
      // Ensure arguments are strings as per MCP protocol
      const request: { name: string; arguments?: Record<string, string> } = {
        name: String(name),
      };

      if (args && Object.keys(args).length > 0) {
        request.arguments = Object.fromEntries(
          Object.entries(args).map(([k, v]) => [k, String(v)])
        );
      }

      const response = await client.getPrompt(request);

      this.logger.mcp.debug("Got prompt from server (Official SDK)", {
        serverId,
        name,
        messagesCount: response.messages?.length || 0,
      });

      return {
        description: response.description,
        messages: (response.messages || []).map((m: any) => ({
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
      this.logger.mcp.error("Failed to get prompt from server (Official SDK)", {
        serverId,
        name,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}
