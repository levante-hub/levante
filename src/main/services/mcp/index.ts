import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  MCPServerConfig,
  Tool,
  ToolCall,
  ToolResult,
} from "../../types/mcp.js";
import { getLogger } from "../logging";
import { createTransport, handleConnectionError } from "./transports.js";
import { diagnoseSystem } from "./diagnostics.js";
import { loadMCPRegistry } from "./registry.js";
import type { MCPRegistry } from "./types";

export class MCPService {
  private logger = getLogger();
  private clients: Map<string, Client> = new Map();

  async connectServer(config: MCPServerConfig): Promise<Client> {
    const transportType = config.transport || (config as any).type;
    const baseUrl = config.baseUrl || (config as any).url;

    try {
      const { client, transport } = await createTransport(config);

      // Connect to the server with detailed error handling
      this.logger.mcp.info("Attempting to connect to server", {
        serverId: config.id,
      });

      try {
        await client.connect(transport);
        this.logger.mcp.info("Successfully connected to server", {
          serverId: config.id,
        });
      } catch (connectionError) {
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

      this.logger.mcp.info("Successfully connected to MCP server", {
        serverId: config.id,
      });
      return client;
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

      return {
        content: Array.isArray(response.content) ? response.content : [],
        isError: Boolean(response.isError),
      };
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
        this.logger.mcp.info("Successfully disconnected from MCP server", {
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

  // Ping method for health checks (Phase 5)
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

  // Reconnect method for health checks (Phase 5)
  async reconnectServer(serverId: string): Promise<void> {
    // Implementation will depend on stored config
    this.logger.mcp.info("Reconnecting to server", { serverId });
    // This will be implemented in Phase 5 with config persistence
  }

  // Get MCP registry information
  async getRegistry(): Promise<MCPRegistry> {
    return await loadMCPRegistry();
  }

  // Validate if a package is known and active
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

  // Diagnose system for MCP compatibility
  async diagnoseSystem(): Promise<{
    success: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    return await diagnoseSystem();
  }
}
