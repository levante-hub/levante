import { ipcMain } from 'electron';
import { MCPService } from '../services/mcpService.js';
import { MCPConfigurationManager } from '../services/mcpConfigManager.js';
import type { MCPServerConfig, ToolCall } from '../types/mcp.js';

// Create singleton instances
const mcpService = new MCPService();
const configManager = new MCPConfigurationManager();

export function registerMCPHandlers() {
  // Connect to MCP server
  ipcMain.handle('levante/mcp/connect-server', async (_, config: MCPServerConfig) => {
    try {
      await mcpService.connectServer(config);
      // Also save to configuration
      await configManager.addServer(config);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Disconnect from MCP server
  ipcMain.handle('levante/mcp/disconnect-server', async (_, serverId: string) => {
    try {
      await mcpService.disconnectServer(serverId);
      await configManager.removeServer(serverId);
      return { success: true };
    } catch (error: any) {
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
      console.log('[MCP] Refreshing MCP configuration and reconnecting servers...');
      
      // Disconnect all current servers
      await mcpService.disconnectAll();
      
      // Reload configuration from disk
      const config = await configManager.loadConfiguration();
      
      // Reconnect all servers
      const results: Record<string, { success: boolean; error?: string }> = {};
      
      for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
        try {
          await mcpService.connectServer({
            id: serverId,
            ...serverConfig
          });
          results[serverId] = { success: true };
          console.log(`[MCP] Successfully reconnected server: ${serverId}`);
        } catch (error: any) {
          results[serverId] = { success: false, error: error.message };
          console.error(`[MCP] Failed to reconnect server ${serverId}:`, error.message);
        }
      }
      
      console.log('[MCP] Configuration refresh completed');
      return { success: true, data: { serverResults: results, config } };
    } catch (error: any) {
      console.error('[MCP] Configuration refresh failed:', error);
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

  // Test connection to a server without permanently connecting
  ipcMain.handle('levante/mcp/test-connection', async (_, config: MCPServerConfig) => {
    try {
      const testId = `test-${Date.now()}`;
      const testConfig = { ...config, id: testId };
      
      // Try to connect
      await mcpService.connectServer(testConfig);
      
      // Try to list tools to verify connection works
      await mcpService.listTools(testId);
      
      // Disconnect immediately
      await mcpService.disconnectServer(testId);
      
      return { success: true };
    } catch (error: any) {
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
          console.log(`[MCP] Cleaned up deprecated server: ${serverId}`);
        }
      }
      
      return { success: true, data: { cleanedCount: cleaned } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('MCP IPC handlers registered successfully');
}

// Export the service instances for use in other parts of the main process
export { mcpService, configManager };