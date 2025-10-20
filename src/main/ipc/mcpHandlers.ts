import { ipcMain } from 'electron';
import { MCPService } from '../services/mcpService.js';
import { MCPConfigurationManager } from '../services/mcpConfigManager.js';
import { mcpHealthService } from '../services/mcpHealthService.js';
import { getLogger } from '../services/logging';
import type { MCPServerConfig, ToolCall } from '../types/mcp.js';

// Create singleton instances
const mcpService = new MCPService();
const configManager = new MCPConfigurationManager();
const logger = getLogger();

export function registerMCPHandlers() {
  // Connect to MCP server
  ipcMain.handle('levante/mcp/connect-server', async (_, config: MCPServerConfig) => {
    try {
      // Connect in runtime
      await mcpService.connectServer(config);

      // Check if server exists in disabled, move it to mcpServers
      const currentConfig = await configManager.loadConfiguration();

      if (currentConfig.disabled && currentConfig.disabled[config.id]) {
        // Move from disabled to mcpServers
        await configManager.enableServer(config.id);
        logger.mcp.info('Server enabled and moved to mcpServers', { serverId: config.id });
      } else if (!currentConfig.mcpServers[config.id]) {
        // Doesn't exist anywhere, add to mcpServers
        await configManager.addServer(config);
        logger.mcp.info('New server added to mcpServers', { serverId: config.id });
      }

      return { success: true };
    } catch (error: any) {
      logger.mcp.error('Failed to connect server', { serverId: config.id, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // Disconnect from MCP server
  ipcMain.handle('levante/mcp/disconnect-server', async (_, serverId: string) => {
    try {
      // Disconnect from service (runtime)
      await mcpService.disconnectServer(serverId);

      // Move from mcpServers to disabled (persistence)
      await configManager.disableServer(serverId);

      logger.mcp.info('Server disconnected and disabled', { serverId });
      return { success: true };
    } catch (error: any) {
      logger.mcp.error('Failed to disconnect server', { serverId, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // List tools from a specific server
  ipcMain.handle('levante/mcp/list-tools', async (_, serverId: string) => {
    try {
      const tools = await mcpService.listTools(serverId);
      return { success: true, data: tools };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Call a specific tool
  ipcMain.handle('levante/mcp/call-tool', async (_, serverId: string, toolCall: ToolCall) => {
    try {
      const result = await mcpService.callTool(serverId, toolCall);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get connection status
  ipcMain.handle('levante/mcp/connection-status', async (_, serverId?: string) => {
    try {
      if (serverId) {
        const isConnected = mcpService.isConnected(serverId);
        return { success: true, data: { [serverId]: isConnected ? 'connected' : 'disconnected' } };
      } else {
        const connectedServers = mcpService.getConnectedServers();
        const allServers = await configManager.listServers();
        const status: Record<string, 'connected' | 'disconnected'> = {};
        
        allServers.forEach(server => {
          status[server.id] = connectedServers.includes(server.id) ? 'connected' : 'disconnected';
        });
        
        return { success: true, data: status };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Configuration management handlers
  ipcMain.handle('levante/mcp/load-configuration', async () => {
    try {
      const config = await configManager.loadConfiguration();
      return { success: true, data: config };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Refresh configuration and reconnect servers
  ipcMain.handle('levante/mcp/refresh-configuration', async () => {
    try {
      logger.mcp.info('Refreshing MCP configuration and reconnecting servers');

      // Disconnect all current servers
      await mcpService.disconnectAll();

      // Reload configuration from disk
      const config = await configManager.loadConfiguration();

      // ONLY reconnect servers in mcpServers (NOT disabled)
      const results: Record<string, { success: boolean; error?: string }> = {};

      for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
        try {
          await mcpService.connectServer({
            id: serverId,
            ...serverConfig
          });
          results[serverId] = { success: true };
          logger.mcp.info('Successfully reconnected MCP server', { serverId });
        } catch (error: any) {
          results[serverId] = { success: false, error: error.message };
          logger.mcp.error('Failed to reconnect MCP server', { serverId, error: error.message });
        }
      }

      // Log disabled servers info
      const disabledCount = Object.keys(config.disabled || {}).length;
      logger.mcp.info('MCP configuration refresh completed', {
        connectedCount: Object.keys(results).length,
        disabledCount
      });

      return { success: true, data: { serverResults: results, config } };
    } catch (error: any) {
      logger.mcp.error('MCP configuration refresh failed', { error: error instanceof Error ? error.message : error });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('levante/mcp/save-configuration', async (_, config) => {
    try {
      await configManager.saveConfiguration(config);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('levante/mcp/add-server', async (_, config: MCPServerConfig) => {
    try {
      await configManager.addServer(config);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('levante/mcp/remove-server', async (_, serverId: string) => {
    try {
      await configManager.removeServer(serverId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('levante/mcp/update-server', async (_, serverId: string, config) => {
    try {
      await configManager.updateServer(serverId, config);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('levante/mcp/get-server', async (_, serverId: string) => {
    try {
      const server = await configManager.getServer(serverId);
      return { success: true, data: server };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('levante/mcp/list-servers', async () => {
    try {
      const servers = await configManager.listServers();
      return { success: true, data: servers };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Enable server (move from disabled to mcpServers)
  ipcMain.handle('levante/mcp/enable-server', async (_, serverId: string) => {
    try {
      await configManager.enableServer(serverId);
      logger.mcp.info('Server enabled', { serverId });
      return { success: true };
    } catch (error: any) {
      logger.mcp.error('Failed to enable server', { serverId, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // Disable server (move from mcpServers to disabled)
  ipcMain.handle('levante/mcp/disable-server', async (_, serverId: string) => {
    try {
      await configManager.disableServer(serverId);
      logger.mcp.info('Server disabled', { serverId });
      return { success: true };
    } catch (error: any) {
      logger.mcp.error('Failed to disable server', { serverId, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // Test connection to a server without permanently connecting
  ipcMain.handle('levante/mcp/test-connection', async (_, config: MCPServerConfig) => {
    const testId = `test-${Date.now()}`;
    const testConfig = { ...config, id: testId };

    try {
      // Create a timeout promise that rejects after 15 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Connection test timed out after 15 seconds. This may indicate a transport mismatch (e.g., trying to connect to an HTTP server with SSE transport, or vice versa).`));
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
  });

  // Import configuration
  ipcMain.handle('levante/mcp/import-configuration', async (_, importedConfig) => {
    try {
      await configManager.importConfiguration(importedConfig);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Export configuration
  ipcMain.handle('levante/mcp/export-configuration', async () => {
    try {
      const config = await configManager.exportConfiguration();
      return { success: true, data: config };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get config file path
  ipcMain.handle('levante/mcp/get-config-path', async () => {
    try {
      const path = configManager.getConfigPath();
      return { success: true, data: path };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Diagnose system for MCP compatibility
  ipcMain.handle('levante/mcp/diagnose-system', async () => {
    try {
      const diagnosis = await mcpService.diagnoseSystem();
      return { success: true, data: diagnosis };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get MCP registry information
  ipcMain.handle('levante/mcp/get-registry', async () => {
    try {
      const registry = await mcpService.getRegistry();
      return { success: true, data: registry };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Validate MCP package
  ipcMain.handle('levante/mcp/validate-package', async (_, packageName: string) => {
    try {
      const validation = await mcpService.validatePackage(packageName);
      return { success: true, data: validation };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Clean up deprecated servers from configuration
  ipcMain.handle('levante/mcp/cleanup-deprecated', async () => {
    try {
      const registry = await mcpService.getRegistry();
      const config = await configManager.loadConfiguration();
      
      let cleaned = 0;
      const deprecatedPackages = registry.deprecated.map(entry => entry.npmPackage);
      
      // Remove deprecated servers from configuration
      for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
        if (serverConfig.command && deprecatedPackages.some(pkg => 
          serverConfig.command?.includes(pkg.replace('@modelcontextprotocol/', ''))
        )) {
          await configManager.removeServer(serverId);
          await mcpService.disconnectServer(serverId);
          cleaned++;
          logger.mcp.info('Cleaned up deprecated MCP server', { serverId });
        }
      }
      
      return { success: true, data: { cleanedCount: cleaned } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Health monitoring handlers
  ipcMain.handle('levante/mcp/health-report', async () => {
    try {
      const healthReport = mcpHealthService.getHealthReport();
      return { success: true, data: healthReport };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('levante/mcp/unhealthy-servers', async () => {
    try {
      const unhealthyServers = mcpHealthService.getUnhealthyServers();
      return { success: true, data: unhealthyServers };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('levante/mcp/server-health', async (_, serverId: string) => {
    try {
      const health = mcpHealthService.getServerHealth(serverId);
      return { success: true, data: health };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('levante/mcp/reset-server-health', async (_, serverId: string) => {
    try {
      mcpHealthService.resetServerHealth(serverId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  logger.mcp.info('MCP IPC handlers registered successfully');
}

// Export the service instances for use in other parts of the main process
export { mcpService, configManager };