import { ipcMain } from "electron";
import type { ToolCall } from "../../types/mcp.js";

export function registerToolHandlers(mcpService: any) {
  // List tools from a specific server
  ipcMain.handle("levante/mcp/list-tools", async (_, serverId: string) => {
    try {
      const tools = await mcpService.listTools(serverId);
      return { success: true, data: tools };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Call a specific tool
  ipcMain.handle(
    "levante/mcp/call-tool",
    async (_, serverId: string, toolCall: ToolCall) => {
      try {
        const result = await mcpService.callTool(serverId, toolCall);
        return { success: true, data: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );
}
