import { create } from 'zustand';
import { MCPServerConfig, MCPConnectionStatus, MCPProvider, MCPRegistryEntry, MCPSource, MCPCategory, Tool, ToolsCache, DisabledTools } from '../types/mcp';
import mcpProvidersData from '../data/mcpProviders.json';
import { useOAuthStore } from './oauthStore';

interface MCPStore {
  // State
  activeServers: MCPServerConfig[];
  connectionStatus: Record<string, MCPConnectionStatus>;
  isLoading: boolean;
  error: string | null;

  // Provider state
  providers: MCPProvider[];
  selectedSource: MCPSource | 'all';
  selectedCategory: MCPCategory | 'all';
  loadingProviders: Record<string, boolean>;
  providerEntries: Record<string, MCPRegistryEntry[]>;
  providerErrors: Record<string, string | null>;
  providersSynced: boolean;

  // Tools state
  toolsCache: ToolsCache;
  disabledTools: DisabledTools;
  loadingTools: Record<string, boolean>;

  // Actions
  loadActiveServers: () => Promise<void>;
  refreshConnectionStatus: () => Promise<void>;
  connectServer: (config: MCPServerConfig) => Promise<void>;
  disconnectServer: (serverId: string) => Promise<void>;
  enableServer: (serverId: string) => Promise<void>;
  disableServer: (serverId: string) => Promise<void>;
  testConnection: (config: MCPServerConfig) => Promise<boolean>;
  addServer: (config: MCPServerConfig) => Promise<void>;
  updateServer: (serverId: string, config: Partial<Omit<MCPServerConfig, 'id'>>) => Promise<void>;
  removeServer: (serverId: string) => Promise<void>;
  importConfiguration: (config: any) => Promise<void>;
  exportConfiguration: () => Promise<any>;

  // Provider actions
  loadProviders: () => Promise<void>;
  syncProvider: (providerId: string) => Promise<void>;
  syncAllProviders: () => Promise<void>;
  setSelectedSource: (source: MCPSource | 'all') => void;
  setSelectedCategory: (category: MCPCategory | 'all') => void;
  clearProviderError: (providerId: string) => void;
  getFilteredEntries: () => MCPRegistryEntry[];
  getAvailableSources: () => MCPSource[];
  getAvailableCategories: () => MCPCategory[];

  // Tools actions
  loadToolsCache: () => Promise<void>;
  loadDisabledTools: () => Promise<void>;
  fetchServerTools: (serverId: string) => Promise<Tool[]>;
  toggleTool: (serverId: string, toolName: string, enabled: boolean) => Promise<void>;
  toggleAllTools: (serverId: string, enabled: boolean) => Promise<void>;
  isToolEnabled: (serverId: string, toolName: string) => boolean;
  getServerTools: (serverId: string) => Tool[];
  getEnabledToolsCount: (serverId: string) => number;
  getDisabledToolsCount: (serverId: string) => number;
  getTotalToolsCount: () => number;
  getEnabledToolsTotal: () => number;

  // Helper methods
  isServerActive: (serverId: string) => boolean;
  getServerById: (serverId: string) => MCPServerConfig | undefined;
  getRegistryEntryById: (entryId: string) => MCPRegistryEntry | undefined;
}

export const useMCPStore = create<MCPStore>((set, get) => ({
  // Initial state
  activeServers: [],
  connectionStatus: {},
  isLoading: false,
  error: null,

  // Provider initial state
  providers: mcpProvidersData.providers as MCPProvider[],
  selectedSource: 'all',
  selectedCategory: 'all',
  loadingProviders: {},
  providerEntries: {},
  providerErrors: {},
  providersSynced: false,

  // Tools initial state
  toolsCache: {},
  disabledTools: {},
  loadingTools: {},

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
        // Update or add to activeServers with enabled=true
        set(state => {
          const existingIndex = state.activeServers.findIndex(s => s.id === config.id);

          if (existingIndex !== -1) {
            // Update existing server
            const updatedServers = [...state.activeServers];
            updatedServers[existingIndex] = { ...config, enabled: true };

            return {
              activeServers: updatedServers,
              connectionStatus: {
                ...state.connectionStatus,
                [config.id]: 'connected'
              }
            };
          } else {
            // Add new server
            return {
              activeServers: [...state.activeServers, { ...config, enabled: true }],
              connectionStatus: {
                ...state.connectionStatus,
                [config.id]: 'connected'
              }
            };
          }
        });

        // Track MCP activation
        window.levante.analytics?.trackMCP?.(config.name || config.id, 'active').catch(() => { });
      } else {
        // Check for OAuth required error first
        if ((result as any).errorCode === 'OAUTH_REQUIRED') {
          const enrichedError = new Error(result.error || 'OAuth authorization required');
          (enrichedError as any).code = 'OAUTH_REQUIRED';
          (enrichedError as any).metadata = (result as any).metadata;
          (enrichedError as any).serverConfig = config;

          // Set pending_oauth state (not error) - OAuth flow will handle reconnection
          set(state => ({
            connectionStatus: {
              ...state.connectionStatus,
              [config.id]: 'pending_oauth'
            },
            error: null // Clear error since OAuth is in progress
          }));

          throw enrichedError;
        }

        // Check for runtime-specific errors that need UI intervention
        if ((result as any).errorCode === 'RUNTIME_CHOICE_REQUIRED' || (result as any).errorCode === 'RUNTIME_NOT_FOUND') {
          // Throw enriched error for UI to catch and show dialog
          const enrichedError = new Error(result.error || 'Runtime error');
          (enrichedError as any).errorCode = (result as any).errorCode;
          (enrichedError as any).metadata = (result as any).metadata;
          (enrichedError as any).serverConfig = config;
          throw enrichedError;
        }

        set(state => ({
          connectionStatus: {
            ...state.connectionStatus,
            [config.id]: 'error'
          },
          error: result.error || 'Failed to connect to server'
        }));
      }
    } catch (error) {
      // Re-throw OAuth and runtime errors for UI handling
      if ((error as any).code === 'OAUTH_REQUIRED' ||
        (error as any).errorCode === 'RUNTIME_CHOICE_REQUIRED' ||
        (error as any).errorCode === 'RUNTIME_NOT_FOUND') {
        throw error;
      }

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
          // DO NOT remove from activeServers, just mark as disabled
          activeServers: state.activeServers.map(server =>
            server.id === serverId
              ? { ...server, enabled: false }
              : server
          ),
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

  // Enable a server (move config to active + connect)
  enableServer: async (serverId: string) => {
    try {
      // 1. Get server config (already available in activeServers with enabled=false)
      const server = get().getServerById(serverId);
      if (!server) {
        console.error('Server not found:', serverId);
        return;
      }

      // 2. Move from disabled to mcpServers in config (persistence)
      const result = await window.levante.mcp.enableServer(serverId);
      if (!result.success) {
        console.error('Failed to enable server in config:', result.error);
        return;
      }

      // 3. Connect using existing connectServer logic (handles OAuth, runtime errors, etc.)
      // This will update activeServers and connectionStatus appropriately
      await get().connectServer({ ...server, enabled: true });
    } catch (error) {
      // connectServer may throw for OAuth/runtime errors - these are handled by the UI
      // Only log unexpected errors
      if (!(error as any).code && !(error as any).errorCode) {
        console.error('Failed to enable server:', error);
      }
      throw error; // Re-throw for UI handling
    }
  },

  // Disable a server (disconnect + move config to disabled)
  disableServer: async (serverId: string) => {
    try {
      // Use disconnectServer which already does:
      // 1. mcpService.disconnectServer() - runtime disconnection
      // 2. configManager.disableServer() - moves config to disabled section
      // 3. Updates store state (activeServers.enabled=false, connectionStatus='disconnected')
      await get().disconnectServer(serverId);
    } catch (error) {
      console.error('Failed to disable server:', error);
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

        // Track MCP installation/activation
        window.levante.analytics?.trackMCP?.(config.name || config.id, 'active').catch(() => { });
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

      // Get server info for analytics before removal
      const server = get().getServerById(serverId);

      // NUEVO: Limpiar credenciales OAuth
      // (El main process también lo hace, esto es redundante pero seguro)
      try {
        await window.levante.oauth.cleanup({ serverId });
        // También limpiar el estado local del store renderer
        useOAuthStore.getState().clearServerState(serverId);
      } catch (oauthError) {
        // No fallar si la limpieza OAuth falla
        console.warn('OAuth cleanup warning:', oauthError);
      }

      const result = await window.levante.mcp.removeServer(serverId);

      if (result.success) {
        // Track MCP removal
        if (server) {
          window.levante.analytics?.trackMCP?.(server.name || server.id, 'removed').catch(() => { });
        }

        // Clean up tools cache and disabled tools
        try {
          await window.levante.mcp.clearServerTools(serverId);
        } catch (clearError) {
          console.warn('Failed to clear server tools:', clearError);
        }

        set(state => {
          const newToolsCache = { ...state.toolsCache };
          const newDisabledTools = { ...state.disabledTools };
          delete newToolsCache[serverId];
          delete newDisabledTools[serverId];

          return {
            activeServers: state.activeServers.filter(s => s.id !== serverId),
            connectionStatus: {
              ...state.connectionStatus,
              [serverId]: 'disconnected'
            },
            toolsCache: newToolsCache,
            disabledTools: newDisabledTools
          };
        });
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

  // Helper: Get registry entry by ID (searches all sources)
  getRegistryEntryById: (entryId: string) => {
    const { providerEntries } = get();

    // Check provider entries
    for (const entries of Object.values(providerEntries)) {
      const providerEntry = entries.find(entry => entry.id === entryId);
      if (providerEntry) return providerEntry;
    }

    return undefined;
  },

  // Load providers from IPC
  loadProviders: async () => {
    try {
      const result = await window.levante.mcp.providers.list();

      if (result.success && result.data) {
        set({ providers: result.data });
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  },

  // Sync a specific provider
  syncProvider: async (providerId: string) => {
    set(state => ({
      loadingProviders: { ...state.loadingProviders, [providerId]: true }
    }));

    try {
      const result = await window.levante.mcp.providers.sync(providerId);

      if (result.success && result.data) {
        const entries = result.data.entries;
        set(state => ({
          providerEntries: {
            ...state.providerEntries,
            [providerId]: entries
          },
          loadingProviders: { ...state.loadingProviders, [providerId]: false },
          providerErrors: { ...state.providerErrors, [providerId]: null } // ✅ Limpiar error
        }));

        // Reload providers to get updated serverCount
        await get().loadProviders();
      } else {
        // ✅ Error no crítico: guardar en providerErrors en lugar de error global
        set(state => ({
          loadingProviders: { ...state.loadingProviders, [providerId]: false },
          providerErrors: {
            ...state.providerErrors,
            [providerId]: result.error || 'Failed to sync provider'
          }
        }));
      }
    } catch (error) {
      console.error('Failed to sync provider:', error);
      // ✅ Error no crítico: guardar en providerErrors
      set(state => ({
        loadingProviders: { ...state.loadingProviders, [providerId]: false },
        providerErrors: {
          ...state.providerErrors,
          [providerId]: error instanceof Error ? error.message : 'Failed to sync provider'
        }
      }));
    }
  },

  // Sync all enabled providers
  syncAllProviders: async () => {
    const { providers } = get();
    // Sync all enabled providers
    const enabledProviders = providers.filter(p => p.enabled);

    // ✅ Sincronizar todos los proveedores (incluso si algunos fallan)
    for (const provider of enabledProviders) {
      await get().syncProvider(provider.id);
      // Los errores se guardan en providerErrors, no se propagan
    }

    // ✅ Marcar como sincronizados
    set({ providersSynced: true });
  },

  // Set selected source filter (official/community)
  setSelectedSource: (source: MCPSource | 'all') => {
    set({ selectedSource: source });
  },

  // Set selected category filter
  setSelectedCategory: (category: MCPCategory | 'all') => {
    set({ selectedCategory: category });
  },

  // Clear provider error
  clearProviderError: (providerId: string) => {
    set(state => ({
      providerErrors: { ...state.providerErrors, [providerId]: null }
    }));
  },

  // Get filtered entries based on selected source and category
  getFilteredEntries: () => {
    const { selectedSource, selectedCategory, providerEntries } = get();
    let entries = Object.values(providerEntries).flat();

    // Filter by source (official/community)
    if (selectedSource !== 'all') {
      entries = entries.filter(entry => entry.source === selectedSource);
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      entries = entries.filter(entry => entry.category === selectedCategory);
    }

    return entries;
  },

  // Get available sources from loaded entries
  getAvailableSources: (): MCPSource[] => {
    const { providerEntries } = get();
    const allEntries = Object.values(providerEntries).flat();
    const sources = new Set<MCPSource>();

    allEntries.forEach(entry => {
      if (entry.source) {
        sources.add(entry.source);
      }
    });

    return Array.from(sources).sort();
  },

  // Get available categories from loaded entries
  getAvailableCategories: (): MCPCategory[] => {
    const { providerEntries } = get();
    const allEntries = Object.values(providerEntries).flat();
    const categories = new Set<MCPCategory>();

    allEntries.forEach(entry => {
      if (entry.category) {
        categories.add(entry.category);
      }
    });

    return Array.from(categories).sort();
  },

  // Load tools cache from preferences
  loadToolsCache: async () => {
    try {
      const result = await window.levante.mcp.getToolsCache();
      if (result.success && result.data) {
        set({ toolsCache: result.data });
      }
    } catch (error) {
      console.error('Failed to load tools cache:', error);
    }
  },

  // Load disabled tools from preferences
  loadDisabledTools: async () => {
    try {
      const result = await window.levante.mcp.getDisabledTools();
      if (result.success && result.data) {
        set({ disabledTools: result.data });
      }
    } catch (error) {
      console.error('Failed to load disabled tools:', error);
    }
  },

  // Fetch tools from a server (with cache update)
  fetchServerTools: async (serverId: string) => {
    set(state => ({
      loadingTools: { ...state.loadingTools, [serverId]: true }
    }));

    try {
      const result = await window.levante.mcp.listTools(serverId);

      if (result.success && result.data) {
        const tools = result.data;

        // Update local cache
        set(state => ({
          toolsCache: {
            ...state.toolsCache,
            [serverId]: {
              tools,
              lastUpdated: Date.now()
            }
          },
          loadingTools: { ...state.loadingTools, [serverId]: false }
        }));

        return tools;
      }

      set(state => ({
        loadingTools: { ...state.loadingTools, [serverId]: false }
      }));
      return [];
    } catch (error) {
      console.error('Failed to fetch server tools:', error);
      set(state => ({
        loadingTools: { ...state.loadingTools, [serverId]: false }
      }));
      return [];
    }
  },

  // Toggle a specific tool
  toggleTool: async (serverId: string, toolName: string, enabled: boolean) => {
    try {
      const result = await window.levante.mcp.toggleTool(serverId, toolName, enabled);

      if (result.success) {
        set(state => {
          const newDisabledTools = { ...state.disabledTools };
          if (result.data && result.data.length > 0) {
            newDisabledTools[serverId] = result.data;
          } else {
            delete newDisabledTools[serverId];
          }
          return { disabledTools: newDisabledTools };
        });
      }
    } catch (error) {
      console.error('Failed to toggle tool:', error);
    }
  },

  // Toggle all tools from a server
  toggleAllTools: async (serverId: string, enabled: boolean) => {
    try {
      const result = await window.levante.mcp.toggleAllTools(serverId, enabled);

      if (result.success) {
        set(state => {
          const newDisabledTools = { ...state.disabledTools };
          if (result.data && result.data.length > 0) {
            newDisabledTools[serverId] = result.data;
          } else {
            delete newDisabledTools[serverId];
          }
          return { disabledTools: newDisabledTools };
        });
      }
    } catch (error) {
      console.error('Failed to toggle all tools:', error);
    }
  },

  // Check if a tool is enabled
  isToolEnabled: (serverId: string, toolName: string) => {
    const { disabledTools } = get();

    // If no entry for this server, all are enabled
    if (!disabledTools[serverId]) {
      return true;
    }

    // Enabled if NOT in the disabled list
    return !disabledTools[serverId].includes(toolName);
  },

  // Get tools from a server from cache
  getServerTools: (serverId: string) => {
    const { toolsCache } = get();
    return toolsCache[serverId]?.tools || [];
  },

  // Count enabled tools for a server
  getEnabledToolsCount: (serverId: string) => {
    const { disabledTools, toolsCache } = get();
    const totalTools = toolsCache[serverId]?.tools?.length || 0;
    const disabledCount = disabledTools[serverId]?.length || 0;

    return totalTools - disabledCount;
  },

  // Count disabled tools for a server
  getDisabledToolsCount: (serverId: string) => {
    const { disabledTools } = get();
    return disabledTools[serverId]?.length || 0;
  },

  // Count total tools from all servers
  getTotalToolsCount: () => {
    const { toolsCache } = get();
    return Object.values(toolsCache).reduce(
      (sum, cache) => sum + (cache.tools?.length || 0),
      0
    );
  },

  // Count total enabled tools
  getEnabledToolsTotal: () => {
    const { disabledTools, toolsCache, activeServers } = get();

    return activeServers.reduce((sum, server) => {
      if (!server.enabled) return sum;

      const totalTools = toolsCache[server.id]?.tools?.length || 0;
      const disabledCount = disabledTools[server.id]?.length || 0;

      return sum + (totalTools - disabledCount);
    }, 0);
  }
}));