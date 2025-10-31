import { ipcMain } from "electron";
import { mcpHealthService } from "../../services/mcpHealthService.js";

export function registerHealthHandlers() {
  // Health monitoring handlers
  ipcMain.handle("levante/mcp/health-report", async () => {
    try {
      const healthReport = mcpHealthService.getHealthReport();
      return { success: true, data: healthReport };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("levante/mcp/unhealthy-servers", async () => {
    try {
      const unhealthyServers = mcpHealthService.getUnhealthyServers();
      return { success: true, data: unhealthyServers };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("levante/mcp/server-health", async (_, serverId: string) => {
    try {
      const health = mcpHealthService.getServerHealth(serverId);
      return { success: true, data: health };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    "levante/mcp/reset-server-health",
    async (_, serverId: string) => {
      try {
        mcpHealthService.resetServerHealth(serverId);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );
}
