import { create } from 'zustand';
import { MCPRegistry, MCPServerConfig, MCPConnectionStatus } from '../types/mcp';
import mcpRegistryData from '../data/mcpRegistry.json';

interface MCPStore {
  // State
  registry: MCPRegistry;
  activeServers: MCPServerConfig[];
  connectionStatus: Record<string, MCPConnectionStatus>;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadRegistry: () => void;
  loadActiveServers: () => Promise<void>;
  refreshConnectionStatus: () => Promise<void>;
  connectServer: (config: MCPServerConfig) => Promise<void>;
  disconnectServer: (serverId: string) => Promise<void>;
  testConnection: (config: MCPServerConfig) => Promise<boolean>;
  addServer: (config: MCPServerConfig) => Promise<void>;
  updateServer: (serverId: string, config: Partial<Omit<MCPServerConfig, 'id'>>) => Promise<void>;
  removeServer: (serverId: string) => Promise<void>;
  importConfiguration: (config: any) => Promise<void>;
  exportConfiguration: () => Promise<any>;
  
  // Helper methods
  isServerActive: (serverId: string) => boolean;
  getServerById: (serverId: string) => MCPServerConfig | undefined;
  getRegistryEntryById: (entryId: string) => any;
}

export const useMCPStore = create<MCPStore>((set, get) => ({
  // Initial state
  registry: mcpRegistryData as MCPRegistry,
  activeServers: [],
  connectionStatus: {},
  isLoading: false,
  error: null,

  // Load curated registry from JSON
  loadRegistry: () => {
    try {
      set({ registry: mcpRegistryData as MCPRegistry });
    } catch (error) {
      console.error('Failed to load MCP registry:', error);
      set({ error: 'Failed to load MCP registry' });
    }
  },

  // Load active servers from configuration
  loadActiveServers: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.levante.mcp.listServers();
      
      if (result.success && result.data) {
        set({ activeServers: result.data });
        // Also refresh connection status
        await get().refreshConnectionStatus();
      } else {
        set({ error: result.error || 'Failed to load servers' });
      }
    } catch (error) {
      console.error('Failed to load active servers:', error);
      set({ error: 'Failed to load active servers' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Refresh connection status for all servers
  refreshConnectionStatus: async () => {
    try {
      const result = await window.levante.mcp.connectionStatus();
      
      if (result.success && result.data) {
        set({ connectionStatus: result.data });
      }
    } catch (error) {
      console.error('Failed to refresh connection status:', error);
    }
  },

  // Connect to a server
  connectServer: async (config: MCPServerConfig) => {
    set({ isLoading: true, error: null });
    
    try {
      // Update connection status to connecting
      set(state => ({
        connectionStatus: {
          ...state.connectionStatus,
          [config.id]: 'connecting'
        }
      }));

      const result = await window.levante.mcp.connectServer(config);
      
      if (result.success) {
        // Add to active servers if not already there
        set(state => ({
          activeServers: state.activeServers.some(s => s.id === config.id)
            ? state.activeServers
            : [...state.activeServers, config],
          connectionStatus: {
            ...state.connectionStatus,
            [config.id]: 'connected'
          }
        }));
      } else {
        set(state => ({
          connectionStatus: {
            ...state.connectionStatus,
            [config.id]: 'error'
          },
          error: result.error || 'Failed to connect to server'
        }));
      }
    } catch (error) {
      console.error('Failed to connect server:', error);
      set(state => ({
        connectionStatus: {
          ...state.connectionStatus,
          [config.id]: 'error'
        },
        error: 'Failed to connect to server'
      }));
    } finally {
      set({ isLoading: false });
    }
  },

  // Disconnect from a server
  disconnectServer: async (serverId: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.levante.mcp.disconnectServer(serverId);
      
      if (result.success) {
        set(state => ({
          activeServers: state.activeServers.filter(s => s.id !== serverId),
          connectionStatus: {
            ...state.connectionStatus,
            [serverId]: 'disconnected'
          }
        }));
      } else {
        set({ error: result.error || 'Failed to disconnect from server' });
      }
    } catch (error) {
      console.error('Failed to disconnect server:', error);
      set({ error: 'Failed to disconnect from server' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Test connection to a server
  testConnection: async (config: MCPServerConfig) => {
    try {
      const result = await window.levante.mcp.testConnection(config);
      return result.success;
    } catch (error) {
      console.error('Failed to test connection:', error);
      return false;
    }
  },

  // Add a new server
  addServer: async (config: MCPServerConfig) => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.levante.mcp.addServer(config);
      
      if (result.success) {
        // Reload active servers
        await get().loadActiveServers();
      } else {
        set({ error: result.error || 'Failed to add server' });
      }
    } catch (error) {
      console.error('Failed to add server:', error);
      set({ error: 'Failed to add server' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Update a server configuration
  updateServer: async (serverId: string, config: Partial<Omit<MCPServerConfig, 'id'>>) => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.levante.mcp.updateServer(serverId, config);
      
      if (result.success) {
        // Update local state
        set(state => ({
          activeServers: state.activeServers.map(server => 
            server.id === serverId 
              ? { ...server, ...config }
              : server
          )
        }));
      } else {
        set({ error: result.error || 'Failed to update server' });
      }
    } catch (error) {
      console.error('Failed to update server:', error);
      set({ error: 'Failed to update server' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Remove a server
  removeServer: async (serverId: string) => {
    set({ isLoading: true, error: null });
    
    try {
      // First disconnect if connected
      await get().disconnectServer(serverId);
      
      const result = await window.levante.mcp.removeServer(serverId);
      
      if (result.success) {
        set(state => ({
          activeServers: state.activeServers.filter(s => s.id !== serverId),
          connectionStatus: {
            ...state.connectionStatus,
            [serverId]: 'disconnected'
          }
        }));
      } else {
        set({ error: result.error || 'Failed to remove server' });
      }
    } catch (error) {
      console.error('Failed to remove server:', error);
      set({ error: 'Failed to remove server' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Import configuration
  importConfiguration: async (config: any) => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.levante.mcp.importConfiguration(config);
      
      if (result.success) {
        // Reload everything
        await get().loadActiveServers();
      } else {
        set({ error: result.error || 'Failed to import configuration' });
      }
    } catch (error) {
      console.error('Failed to import configuration:', error);
      set({ error: 'Failed to import configuration' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Export configuration
  exportConfiguration: async () => {
    try {
      const result = await window.levante.mcp.exportConfiguration();
      
      if (result.success) {
        return result.data;
      } else {
        set({ error: result.error || 'Failed to export configuration' });
        return null;
      }
    } catch (error) {
      console.error('Failed to export configuration:', error);
      set({ error: 'Failed to export configuration' });
      return null;
    }
  },

  // Helper: Check if server is active
  isServerActive: (serverId: string) => {
    const { activeServers } = get();
    return activeServers.some(server => server.id === serverId);
  },

  // Helper: Get server by ID
  getServerById: (serverId: string) => {
    const { activeServers } = get();
    return activeServers.find(server => server.id === serverId);
  },

  // Helper: Get registry entry by ID
  getRegistryEntryById: (entryId: string) => {
    const { registry } = get();
    return registry.entries.find(entry => entry.id === entryId);
  }
}));