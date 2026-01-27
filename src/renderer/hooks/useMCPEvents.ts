import { useEffect } from 'react';
import { useMCPStore } from '@/stores/mcpStore';

/**
 * Hook to listen for MCP events from the main process.
 * Currently handles:
 * - Initial load of active servers and connection status
 * - Periodic refresh of connection status
 * - tools/list_changed: When a server's tools list changes
 */
export function useMCPEvents() {
  const { loadActiveServers, loadToolsCache, refreshConnectionStatus } = useMCPStore();

  // Load initial MCP state on mount
  useEffect(() => {
    loadActiveServers();
    loadToolsCache();
    refreshConnectionStatus();
  }, [loadActiveServers, loadToolsCache, refreshConnectionStatus]);

  // Refresh connection status periodically
  useEffect(() => {
    const interval = setInterval(refreshConnectionStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshConnectionStatus]);

  // Listen for tools updated event
  useEffect(() => {
    const cleanup = window.levante.mcp.onToolsUpdated((data) => {
      console.log('MCP tools updated for server:', data.serverId);

      // Reload the tools cache to get the updated tools
      loadToolsCache();
    });

    return () => {
      cleanup();
    };
  }, [loadToolsCache]);
}
