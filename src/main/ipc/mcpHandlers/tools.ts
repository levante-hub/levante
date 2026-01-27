import { ipcMain } from "electron";
import type { ToolCall, ToolsCache, DisabledTools } from "../../types/mcp.js";
import { preferencesService } from "../../services/preferencesService.js";

export function registerToolHandlers(mcpService: any) {
  // List tools from a specific server and update cache
  ipcMain.handle("levante/mcp/list-tools", async (_, serverId: string) => {
    try {
      const tools = await mcpService.listTools(serverId);

      // Update cache in preferences
      const prefs = preferencesService.getAll();
      const toolsCache: ToolsCache = prefs.mcp?.toolsCache || {};

      toolsCache[serverId] = {
        tools,
        lastUpdated: Date.now()
      };

      preferencesService.set('mcp.toolsCache', toolsCache);

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

  // Get tools cache (without reconnecting)
  ipcMain.handle('levante/mcp/get-tools-cache', async () => {
    try {
      const prefs = preferencesService.getAll();
      return { success: true, data: prefs.mcp?.toolsCache || {} };
    } catch (error: any) {
      return { success: false, error: 'Failed to get tools cache' };
    }
  });

  // Get disabled tools
  ipcMain.handle('levante/mcp/get-disabled-tools', async () => {
    try {
      const prefs = preferencesService.getAll();
      return { success: true, data: prefs.mcp?.disabledTools || {} };
    } catch (error: any) {
      return { success: false, error: 'Failed to get disabled tools' };
    }
  });

  // Set disabled tools for a server
  ipcMain.handle('levante/mcp/set-disabled-tools', async (
    _,
    serverId: string,
    toolNames: string[]
  ) => {
    try {
      const prefs = preferencesService.getAll();
      const disabledTools: DisabledTools = prefs.mcp?.disabledTools || {};

      if (toolNames.length === 0) {
        // If no disabled tools, remove the entry
        delete disabledTools[serverId];
      } else {
        disabledTools[serverId] = toolNames;
      }

      preferencesService.set('mcp.disabledTools', disabledTools);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: 'Failed to set disabled tools' };
    }
  });

  // Toggle a specific tool (enable/disable)
  // enabled=true → remove from disabledTools (enable)
  // enabled=false → add to disabledTools (disable)
  ipcMain.handle('levante/mcp/toggle-tool', async (
    _,
    serverId: string,
    toolName: string,
    enabled: boolean
  ) => {
    try {
      const prefs = preferencesService.getAll();
      const disabledTools: DisabledTools = prefs.mcp?.disabledTools || {};

      // Initialize array if doesn't exist
      if (!disabledTools[serverId]) {
        disabledTools[serverId] = [];
      }

      if (enabled) {
        // Enable = remove from disabled list
        disabledTools[serverId] = disabledTools[serverId].filter(n => n !== toolName);
        // Clean up if empty
        if (disabledTools[serverId].length === 0) {
          delete disabledTools[serverId];
        }
      } else {
        // Disable = add to list
        if (!disabledTools[serverId].includes(toolName)) {
          disabledTools[serverId].push(toolName);
        }
      }

      preferencesService.set('mcp.disabledTools', disabledTools);

      return { success: true, data: disabledTools[serverId] || [] };
    } catch (error: any) {
      return { success: false, error: 'Failed to toggle tool' };
    }
  });

  // Enable/disable all tools from a server
  // enabled=true → clear disabledTools (enable all)
  // enabled=false → add all to disabledTools (disable all)
  ipcMain.handle('levante/mcp/toggle-all-tools', async (
    _,
    serverId: string,
    enabled: boolean
  ) => {
    try {
      const prefs = preferencesService.getAll();
      const disabledTools: DisabledTools = prefs.mcp?.disabledTools || {};
      const toolsCache: ToolsCache = prefs.mcp?.toolsCache || {};

      if (enabled) {
        // Enable all = remove entry from disabledTools
        delete disabledTools[serverId];
      } else {
        // Disable all = add all tools to array
        const serverTools = toolsCache[serverId]?.tools || [];
        disabledTools[serverId] = serverTools.map(t => t.name);
      }

      preferencesService.set('mcp.disabledTools', disabledTools);

      return { success: true, data: disabledTools[serverId] || [] };
    } catch (error: any) {
      return { success: false, error: 'Failed to toggle all tools' };
    }
  });

  // Clear cache and disabled tools for a server (when removing server)
  ipcMain.handle('levante/mcp/clear-server-tools', async (_, serverId: string) => {
    try {
      const prefs = preferencesService.getAll();

      // Clear cache
      const toolsCache: ToolsCache = { ...prefs.mcp?.toolsCache };
      delete toolsCache[serverId];

      // Clear disabled tools
      const disabledTools: DisabledTools = { ...prefs.mcp?.disabledTools };
      delete disabledTools[serverId];

      preferencesService.set('mcp.toolsCache', toolsCache);
      preferencesService.set('mcp.disabledTools', disabledTools);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: 'Failed to clear server tools' };
    }
  });
}
