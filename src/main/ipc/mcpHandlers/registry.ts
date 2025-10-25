import { ipcMain } from "electron";
import { getLogger } from "../../services/logging";

const logger = getLogger();

export function registerRegistryHandlers(mcpService: any, configManager: any) {
  // Diagnose system for MCP compatibility
  ipcMain.handle("levante/mcp/diagnose-system", async () => {
    try {
      const diagnosis = await mcpService.diagnoseSystem();
      return { success: true, data: diagnosis };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get MCP registry information
  ipcMain.handle("levante/mcp/get-registry", async () => {
    try {
      const registry = await mcpService.getRegistry();
      return { success: true, data: registry };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Validate MCP package
  ipcMain.handle(
    "levante/mcp/validate-package",
    async (_, packageName: string) => {
      try {
        const validation = await mcpService.validatePackage(packageName);
        return { success: true, data: validation };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Clean up deprecated servers from configuration
  ipcMain.handle("levante/mcp/cleanup-deprecated", async () => {
    try {
      const registry = await mcpService.getRegistry();
      const config = await configManager.loadConfiguration();

      let cleaned = 0;
      const deprecatedPackages = registry.deprecated.map(
        (entry: any) => entry.npmPackage
      );

      // Remove deprecated servers from configuration
      for (const [serverId, serverConfig] of Object.entries(
        config.mcpServers
      )) {
        const typedConfig = serverConfig as any;
        if (
          typedConfig.command &&
          deprecatedPackages.some((pkg: string) =>
            typedConfig.command?.includes(
              pkg.replace("@modelcontextprotocol/", "")
            )
          )
        ) {
          await configManager.removeServer(serverId);
          await mcpService.disconnectServer(serverId);
          cleaned++;
          logger.mcp.info("Cleaned up deprecated MCP server", { serverId });
        }
      }

      return { success: true, data: { cleanedCount: cleaned } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
