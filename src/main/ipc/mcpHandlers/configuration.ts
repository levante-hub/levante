import { ipcMain } from "electron";
import type { MCPServerConfig } from "../../types/mcp.js";
import { getLogger } from "../../services/logging";

const logger = getLogger();

export function registerConfigurationHandlers(
  mcpService: any,
  configManager: any
) {
  // Configuration management handlers
  ipcMain.handle("levante/mcp/load-configuration", async () => {
    try {
      const config = await configManager.loadConfiguration();
      return { success: true, data: config };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Refresh configuration and reconnect servers
  ipcMain.handle("levante/mcp/refresh-configuration", async () => {
    try {
      logger.mcp.info("Refreshing MCP configuration and reconnecting servers");

      // Disconnect all current servers
      await mcpService.disconnectAll();

      // Reload configuration from disk
      const config = await configManager.loadConfiguration();

      // ONLY reconnect servers in mcpServers (NOT disabled)
      const results: Record<string, { success: boolean; error?: string }> = {};

      for (const [serverId, serverConfig] of Object.entries(
        config.mcpServers
      )) {
        try {
          await mcpService.connectServer({
            id: serverId,
            ...(serverConfig as any),
          });
          results[serverId] = { success: true };
          logger.mcp.info("Successfully reconnected MCP server", { serverId });
        } catch (error: any) {
          results[serverId] = { success: false, error: error.message };
          logger.mcp.error("Failed to reconnect MCP server", {
            serverId,
            error: error.message,
          });
        }
      }

      // Log disabled servers info
      const disabledCount = Object.keys(config.disabled || {}).length;
      logger.mcp.info("MCP configuration refresh completed", {
        connectedCount: Object.keys(results).length,
        disabledCount,
      });

      return { success: true, data: { serverResults: results, config } };
    } catch (error: any) {
      logger.mcp.error("MCP configuration refresh failed", {
        error: error instanceof Error ? error.message : error,
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("levante/mcp/save-configuration", async (_, config) => {
    try {
      await configManager.saveConfiguration(config);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    "levante/mcp/add-server",
    async (_, config: MCPServerConfig) => {
      try {
        await configManager.addServer(config);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle("levante/mcp/remove-server", async (_, serverId: string) => {
    try {
      await configManager.removeServer(serverId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    "levante/mcp/update-server",
    async (_, serverId: string, config) => {
      try {
        await configManager.updateServer(serverId, config);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle("levante/mcp/get-server", async (_, serverId: string) => {
    try {
      const server = await configManager.getServer(serverId);
      return { success: true, data: server };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("levante/mcp/list-servers", async () => {
    try {
      const servers = await configManager.listServers();
      return { success: true, data: servers };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Import configuration
  ipcMain.handle(
    "levante/mcp/import-configuration",
    async (_, importedConfig) => {
      try {
        await configManager.importConfiguration(importedConfig);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Export configuration
  ipcMain.handle("levante/mcp/export-configuration", async () => {
    try {
      const config = await configManager.exportConfiguration();
      return { success: true, data: config };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get config file path
  ipcMain.handle("levante/mcp/get-config-path", async () => {
    try {
      const path = configManager.getConfigPath();
      return { success: true, data: path };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
