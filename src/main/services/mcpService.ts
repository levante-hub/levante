import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig, Tool, ToolCall, ToolResult } from "../types/mcp.js";

export class MCPService {
  private clients: Map<string, Client> = new Map();

  async connectServer(config: MCPServerConfig): Promise<Client> {
    try {
      // Create client with capabilities
      const client = new Client({
        name: "Levante-MCP-Client",
        version: "1.0.0"
      }, {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      });

      // Create transport based on config
      let transport;
      switch (config.transport) {
        case 'stdio':
          if (!config.command) {
            throw new Error('Command is required for stdio transport');
          }
          transport = new StdioClientTransport({
            command: config.command,
            args: config.args || [],
            env: config.env || {}
          });
          break;
        
        case 'http':
        case 'sse':
          // TODO: Implement HTTP and SSE transports in Phase 2
          throw new Error(`Transport type ${config.transport} not implemented yet`);
          
        default:
          throw new Error(`Unknown transport type: ${config.transport}`);
      }

      // Connect to the server
      await client.connect(transport);
      
      // Store the client
      this.clients.set(config.id, client);
      
      console.log(`Successfully connected to MCP server: ${config.id}`);
      return client;
      
    } catch (error) {
      console.error(`Failed to connect to MCP server ${config.id}:`, error);
      throw error;
    }
  }

  async listTools(serverId: string): Promise<Tool[]> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Client ${serverId} not found. Make sure to connect first.`);
    }

    try {
      const response = await client.listTools();
      return response.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema
      }));
    } catch (error) {
      console.error(`Failed to list tools from server ${serverId}:`, error);
      throw error;
    }
  }

  async callTool(serverId: string, toolCall: ToolCall): Promise<ToolResult> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Client ${serverId} not found. Make sure to connect first.`);
    }

    try {
      const response = await client.callTool({
        name: toolCall.name,
        arguments: toolCall.arguments
      });

      return {
        content: Array.isArray(response.content) ? response.content : [],
        isError: Boolean(response.isError)
      };
    } catch (error) {
      console.error(`Failed to call tool ${toolCall.name} on server ${serverId}:`, error);
      throw error;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.close();
        this.clients.delete(serverId);
        console.log(`Successfully disconnected from MCP server: ${serverId}`);
      } catch (error) {
        console.error(`Error disconnecting from server ${serverId}:`, error);
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
    const disconnectPromises = Array.from(this.clients.keys()).map(serverId => 
      this.disconnectServer(serverId)
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
    console.log(`Reconnecting to server ${serverId}...`);
    // This will be implemented in Phase 5 with config persistence
  }
}