import { ipcRenderer } from 'electron';
import type { MCPServerConfig, MCPConfiguration, MCPToolCall } from '../types';

export const mcpApi = {
  connectServer: (config: MCPServerConfig) =>
    ipcRenderer.invoke('levante/mcp/connect-server', config),

  disconnectServer: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/disconnect-server', serverId),

  enableServer: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/enable-server', serverId),

  disableServer: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/disable-server', serverId),

  listTools: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/list-tools', serverId),

  callTool: (serverId: string, toolCall: MCPToolCall) =>
    ipcRenderer.invoke('levante/mcp/call-tool', serverId, toolCall),

  connectionStatus: (serverId?: string) =>
    ipcRenderer.invoke('levante/mcp/connection-status', serverId),

  loadConfiguration: () =>
    ipcRenderer.invoke('levante/mcp/load-configuration'),

  refreshConfiguration: () =>
    ipcRenderer.invoke('levante/mcp/refresh-configuration'),

  saveConfiguration: (config: MCPConfiguration) =>
    ipcRenderer.invoke('levante/mcp/save-configuration', config),

  addServer: (config: MCPServerConfig) =>
    ipcRenderer.invoke('levante/mcp/add-server', config),

  removeServer: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/remove-server', serverId),

  updateServer: (serverId: string, config: Partial<Omit<MCPServerConfig, 'id'>>) =>
    ipcRenderer.invoke('levante/mcp/update-server', serverId, config),

  getServer: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/get-server', serverId),

  listServers: () =>
    ipcRenderer.invoke('levante/mcp/list-servers'),

  testConnection: (config: MCPServerConfig) =>
    ipcRenderer.invoke('levante/mcp/test-connection', config),

  importConfiguration: (config: MCPConfiguration) =>
    ipcRenderer.invoke('levante/mcp/import-configuration', config),

  exportConfiguration: () =>
    ipcRenderer.invoke('levante/mcp/export-configuration'),

  getConfigPath: () =>
    ipcRenderer.invoke('levante/mcp/get-config-path'),

  getRegistry: () =>
    ipcRenderer.invoke('levante/mcp/get-registry'),

  validatePackage: (packageName: string) =>
    ipcRenderer.invoke('levante/mcp/validate-package', packageName),

  cleanupDeprecated: () =>
    ipcRenderer.invoke('levante/mcp/cleanup-deprecated'),

  healthReport: () =>
    ipcRenderer.invoke('levante/mcp/health-report'),

  unhealthyServers: () =>
    ipcRenderer.invoke('levante/mcp/unhealthy-servers'),

  serverHealth: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/server-health', serverId),

  resetServerHealth: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/reset-server-health', serverId),

  extractConfig: (text: string) =>
    ipcRenderer.invoke('levante/mcp/extract-config', text),

  checkStructuredOutputSupport: () =>
    ipcRenderer.invoke('levante/mcp/check-structured-output-support'),

  verifyPackage: (packageName: string) =>
    ipcRenderer.invoke('levante/mcp/verify-package', packageName),

  // Runtime management
  getRuntimes: () =>
    ipcRenderer.invoke('levante/mcp/get-runtimes'),

  cleanupRuntimes: () =>
    ipcRenderer.invoke('levante/mcp/cleanup-runtimes'),

  installRuntime: (type: string, version: string) =>
    ipcRenderer.invoke('levante/mcp/install-runtime', { type, version }),

  // Provider management
  providers: {
    list: () =>
      ipcRenderer.invoke('levante/mcp/providers/list'),

    sync: (providerId: string) =>
      ipcRenderer.invoke('levante/mcp/providers/sync', providerId),

    syncAll: () =>
      ipcRenderer.invoke('levante/mcp/providers/sync-all'),

    getEntries: (providerId: string) =>
      ipcRenderer.invoke('levante/mcp/providers/get-entries', providerId),

    getAllEntries: () =>
      ipcRenderer.invoke('levante/mcp/providers/get-all-entries'),

    getEntry: (serverId: string) =>
      ipcRenderer.invoke('levante/mcp/providers/get-entry', serverId)
  },

  // Resource methods
  listResources: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/list-resources', serverId),

  readResource: (serverId: string, uri: string) =>
    ipcRenderer.invoke('levante/mcp/read-resource', serverId, uri),

  // Prompt methods
  listPrompts: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/list-prompts', serverId),

  getPrompt: (serverId: string, name: string, args?: Record<string, any>) =>
    ipcRenderer.invoke('levante/mcp/get-prompt', serverId, name, args),

  // Tools management
  getToolsCache: () =>
    ipcRenderer.invoke('levante/mcp/get-tools-cache'),

  getDisabledTools: () =>
    ipcRenderer.invoke('levante/mcp/get-disabled-tools'),

  setDisabledTools: (serverId: string, toolNames: string[]) =>
    ipcRenderer.invoke('levante/mcp/set-disabled-tools', serverId, toolNames),

  toggleTool: (serverId: string, toolName: string, enabled: boolean) =>
    ipcRenderer.invoke('levante/mcp/toggle-tool', serverId, toolName, enabled),

  toggleAllTools: (serverId: string, enabled: boolean) =>
    ipcRenderer.invoke('levante/mcp/toggle-all-tools', serverId, enabled),

  clearServerTools: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/clear-server-tools', serverId),

  // Event listeners
  onToolsUpdated: (
    callback: (data: { serverId: string; tools: any[] }) => void
  ) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('levante/mcp/tools-updated', handler);

    return () => {
      ipcRenderer.removeListener('levante/mcp/tools-updated', handler);
    };
  },
};
