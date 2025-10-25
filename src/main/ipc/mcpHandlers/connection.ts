import { ipcMain } from "electron";
import type { MCPServerConfig } from "../../types/mcp.js";
import { getLogger } from "../../services/logging";

const logger = getLogger();

export function registerConnectionHandlers(
  mcpService: any,
  configManager: any
) {
  // Connect to MCP server
  ipcMain.handle(
    "levante/mcp/connect-server",
    async (_, config: MCPServerConfig) => {
      try {
        // Connect in runtime
        await mcpService.connectServer(config);

        // Check if server exists in disabled, move it to mcpServers
        const currentConfig = await configManager.loadConfiguration();

        if (currentConfig.disabled && currentConfig.disabled[config.id]) {
          // Move from disabled to mcpServers
          await configManager.enableServer(config.id);
          logger.mcp.info("Server enabled and moved to mcpServers", {
            serverId: config.id,
          });
        } else if (!currentConfig.mcpServers[config.id]) {
          // Doesn't exist anywhere, add to mcpServers
          await configManager.addServer(config);
          logger.mcp.info("New server added to mcpServers", {
            serverId: config.id,
          });
        }

        return { success: true };
      } catch (error: any) {
        logger.mcp.error("Failed to connect server", {
          serverId: config.id,
          error: error.message,
        });
        return { success: false, error: error.message };
      }
    }
  );

  // Disconnect from MCP server
  ipcMain.handle(
    "levante/mcp/disconnect-server",
    async (_, serverId: string) => {
      try {
        // Disconnect from service (runtime)
        await mcpService.disconnectServer(serverId);

        // Move from mcpServers to disabled (persistence)
        await configManager.disableServer(serverId);

        logger.mcp.info("Server disconnected and disabled", { serverId });
        return { success: true };
      } catch (error: any) {
        logger.mcp.error("Failed to disconnect server", {
          serverId,
          error: error.message,
        });
        return { success: false, error: error.message };
      }
    }
  );

  // Enable server (move from disabled to mcpServers)
  ipcMain.handle("levante/mcp/enable-server", async (_, serverId: string) => {
    try {
      await configManager.enableServer(serverId);
      logger.mcp.info("Server enabled", { serverId });
      return { success: true };
    } catch (error: any) {
      logger.mcp.error("Failed to enable server", {
        serverId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  });

  // Disable server (move from mcpServers to disabled)
  ipcMain.handle("levante/mcp/disable-server", async (_, serverId: string) => {
    try {
      await configManager.disableServer(serverId);
      logger.mcp.info("Server disabled", { serverId });
      return { success: true };
    } catch (error: any) {
      logger.mcp.error("Failed to disable server", {
        serverId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  });

  // Get connection status
  ipcMain.handle(
    "levante/mcp/connection-status",
    async (_, serverId?: string) => {
      try {
        if (serverId) {
          const isConnected = mcpService.isConnected(serverId);
          return {
            success: true,
            data: { [serverId]: isConnected ? "connected" : "disconnected" },
          };
        } else {
          const connectedServers = mcpService.getConnectedServers();
          const allServers = await configManager.listServers();
          const status: Record<string, "connected" | "disconnected"> = {};

          allServers.forEach((server: any) => {
            status[server.id] = connectedServers.includes(server.id)
              ? "connected"
              : "disconnected";
          });

          return { success: true, data: status };
        }
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Test connection to a server without permanently connecting
  ipcMain.handle(
    "levante/mcp/test-connection",
    async (_, config: MCPServerConfig) => {
      const testId = `test-${Date.now()}`;
      const testConfig = { ...config, id: testId };

      try {
        // Create a timeout promise that rejects after 15 seconds
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `Connection test timed out after 15 seconds. This may indicate a transport mismatch (e.g., trying to connect to an HTTP server with SSE transport, or vice versa).`
              )
            );
          }, 15000);
        });

        // Race the connection test against the timeout
        const connectionTest = async () => {
          // Try to connect
          await mcpService.connectServer(testConfig);

          // Try to list tools to verify connection works
          const tools = await mcpService.listTools(testId);

          // Disconnect immediately
          await mcpService.disconnectServer(testId);

          return tools;
        };

        const tools = await Promise.race([connectionTest(), timeoutPromise]);

        return { success: true, data: tools };
      } catch (error: any) {
        // Make sure to clean up even if test fails
        try {
          await mcpService.disconnectServer(testId);
        } catch {
          // Ignore cleanup errors
        }

        return { success: false, error: error.message };
      }
    }
  );
}
