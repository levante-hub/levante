import { useEffect, useState, useRef } from 'react';
import { useMCPStore } from '@/stores/mcpStore';
import { useOAuthStore } from '@/stores/oauthStore';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Loader2, AlertCircle, Store, Wrench, Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IntegrationCard } from './integration-card';
import { SourceFilter, CategoryFilter } from './provider-filter';
import { JSONEditorPanel } from '../config/json-editor-panel';
import { FullJSONEditorPanel } from '../config/full-json-editor-panel';
import { ImportExport } from '../config/import-export';
import { NetworkStatus } from '../connection/connection-status';
import { ApiKeysModal } from '../config/api-keys-modal';
import { RuntimeChoiceDialog, RuntimeErrorType } from '@/components/runtime/RuntimeChoiceDialog';
import { MCPInfoSheet } from '../info/MCPInfoSheet';
import { getRendererLogger } from '@/services/logger';
import { toast } from 'sonner';
import { MCPServerConfig, MCPConfigField } from '@/types/mcp';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const logger = getRendererLogger();

interface StoreLayoutProps {
  mode: 'active' | 'store';
  onModeChange: (mode: 'active' | 'store') => void;
}

// Helper to get button style based on mode - avoids TypeScript narrowing issues
const getModeButtonStyle = (currentMode: 'active' | 'store', buttonMode: 'active' | 'store') =>
  currentMode === buttonMode
    ? "bg-background text-foreground shadow-sm"
    : "text-muted-foreground hover:text-foreground";

export function StoreLayout({ mode, onModeChange }: StoreLayoutProps) {
  const { t } = useTranslation('mcp');
  const hasSyncedProviders = useRef(false);
  const {
    activeServers,
    connectionStatus,
    isLoading,
    error,
    loadActiveServers,
    refreshConnectionStatus,
    connectServer,
    disconnectServer,
    addServer,
    removeServer,
    // Provider state and actions
    providers,
    selectedSource,
    selectedCategory,
    loadingProviders,
    providerErrors,
    providersSynced,
    syncAllProviders,
    setSelectedSource,
    setSelectedCategory,
    clearProviderError,
    getFilteredEntries,
    getRegistryEntryById,
    getAvailableSources,
    getAvailableCategories
  } = useMCPStore();

  const [configServerId, setConfigServerId] = useState<string | null>(null);
  const [isFullJSONEditorOpen, setIsFullJSONEditorOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [installingServerId, setInstallingServerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiKeysModalState, setApiKeysModalState] = useState<{
    isOpen: boolean;
    entryId: string | null;
    serverName: string;
    fields: MCPConfigField[];
  }>({
    isOpen: false,
    entryId: null,
    serverName: '',
    fields: [],
  });

  const [runtimeDialogState, setRuntimeDialogState] = useState<{
    isOpen: boolean;
    errorType: RuntimeErrorType | null;
    serverName: string;
    serverConfig: MCPServerConfig | null;
    metadata: {
      systemPath?: string;
      runtimeType?: 'node' | 'python';
      runtimeVersion?: string;
    };
  }>({
    isOpen: false,
    errorType: null,
    serverName: '',
    serverConfig: null,
    metadata: {},
  });

  const [infoSheetState, setInfoSheetState] = useState<{
    isOpen: boolean;
    entryId: string | null;
  }>({
    isOpen: false,
    entryId: null,
  });

  // Filter entries by provider and search query
  const getFilteredAndSearchedEntries = () => {
    const filteredByProvider = getFilteredEntries();

    if (!searchQuery.trim()) {
      return filteredByProvider;
    }

    const query = searchQuery.toLowerCase();
    return filteredByProvider.filter(entry =>
      (entry.displayName || entry.name).toLowerCase().includes(query) ||
      entry.description.toLowerCase().includes(query) ||
      entry.category.toLowerCase().includes(query)
    );
  };

  useEffect(() => {
    // Load initial data
    // Note: loadActiveServers is now called globally in useMCPEvents hook
    // but we call it here too to ensure the data is fresh when entering the page
    loadActiveServers();

    // ✅ ELIMINADO: syncAllProviders() - ahora es lazy (se ejecuta al cambiar de tab)
    // ✅ ELIMINADO: setInterval(refreshConnectionStatus) - ahora se hace globalmente en useMCPEvents
  }, [loadActiveServers]);

  // ✅ NUEVO: Lazy loading de proveedores cuando se cambia a modo "store"
  useEffect(() => {
    if (mode === 'store' && !providersSynced) {
      syncAllProviders();
    }
  }, [mode, providersSynced, syncAllProviders]);

  const handleToggleServer = async (serverId: string) => {
    const server = activeServers.find(s => s.id === serverId);
    const isEnabled = server?.enabled !== false;

    if (isEnabled) {
      // Server is enabled → disable it (disconnect + move to disabled)
      await disconnectServer(serverId);
    } else if (server) {
      // Server is disabled → enable it (connect + move to mcpServers)
      try {
        await connectServer(server);
        toast.success(t('messages.connected', { name: server.name || serverId }));
      } catch (error: any) {
        // Handle OAuth required error
        if (error.code === 'OAUTH_REQUIRED') {
          logger.mcp.info('OAuth required for MCP server', {
            serverId,
            mcpServerUrl: error.metadata?.mcpServerUrl
          });

          // Trigger OAuth dialog by calling the store
          const { handleOAuthRequired } = useOAuthStore.getState();
          handleOAuthRequired({
            serverId: error.serverConfig?.id || serverId,
            mcpServerUrl: error.metadata?.mcpServerUrl || '',
            wwwAuth: error.metadata?.wwwAuth || ''
          });

          toast.info(
            t('messages.oauth_required', {
              name: server.name || serverId
            }) || 'OAuth authorization required. Please check the authorization dialog.',
            {
              duration: 5000
            }
          );
          return;
        }

        // Handle runtime-specific errors
        if (error.errorCode === 'RUNTIME_CHOICE_REQUIRED' || error.errorCode === 'RUNTIME_NOT_FOUND') {
          setRuntimeDialogState({
            isOpen: true,
            errorType: error.errorCode,
            serverName: server.name || server.id,
            serverConfig: error.serverConfig || server,
            metadata: error.metadata || {},
          });
          return;
        }

        // Other errors
        logger.mcp.error('Failed to toggle server', { serverId, error: error.message });
        toast.error(
          t('messages.connection_failed', {
            name: server.name || serverId,
            error: error.message
          }) || `Failed to connect: ${error.message}`
        );
      }
    } else {
      // Server not configured yet, open config modal
      const registryEntry = getRegistryEntryById(serverId);
      if (registryEntry) {
        // This would trigger server configuration
        logger.mcp.debug('Server needs configuration', { serverId, registryEntry: registryEntry.name });
      }
    }
  };

  const handleConfigureServer = (serverId: string) => {
    setConfigServerId(serverId);
  };

  const handleAddToActive = async (entryId: string, apiKeyValues?: Record<string, string>) => {
    const registryEntry = getRegistryEntryById(entryId);
    if (!registryEntry) return;

    const displayName = registryEntry.displayName || registryEntry.name;

    // Detectar si hay campos que requieren input del usuario
    const fieldsNeedingInput = registryEntry.configuration?.fields?.filter(
      (field: MCPConfigField) => field.key !== 'command' && field.key !== 'args' && field.key !== 'baseUrl'
    ) || [];

    // Si hay campos que necesitan input y no se han proporcionado valores, abrir modal
    if (fieldsNeedingInput.length > 0 && !apiKeyValues) {
      setApiKeysModalState({
        isOpen: true,
        entryId,
        serverName: displayName,
        fields: fieldsNeedingInput,
      });
      return;
    }

    try {
      // Marcar servidor como "instalando"
      setInstallingServerId(entryId);

      const template = registryEntry.configuration?.template;
      const transportType = template?.type || 'stdio';

      // Build complete values object: user values + defaults from fields
      const allFields = registryEntry.configuration?.fields || [];
      const completeValues: Record<string, string> = {};

      // First, add all default values from fields
      allFields.forEach((field: MCPConfigField) => {
        if (field.defaultValue) {
          completeValues[field.key] = field.defaultValue;
        }
      });

      // Then override with user-provided values (exact input preserved)
      if (apiKeyValues) {
        Object.entries(apiKeyValues).forEach(([key, value]) => {
          if (value !== undefined && value !== '') {
            completeValues[key] = value;
          }
        });
      }

      // Construir config desde template según el tipo de transporte
      const serverConfig: MCPServerConfig = {
        id: entryId,
        name: registryEntry.name, // Use technical name for config, not displayName
        transport: transportType,
      };

      // Agregar campos específicos según el tipo de transporte
      if (transportType === 'stdio') {
        serverConfig.command = template?.command || '';

        // Reemplazar placeholders en args con valores del usuario o defaults
        // Si no hay valor, eliminar el argumento que contiene el placeholder
        const args = [...(template?.args || [])];
        const processedArgs = args
          .map(arg => {
            if (typeof arg === 'string') {
              let replacedArg = arg;
              Object.entries(completeValues).forEach(([key, value]) => {
                replacedArg = replacedArg.replace(`\${${key}}`, value);
              });
              return replacedArg;
            }
            return arg;
          })
          .filter(arg => typeof arg !== 'string' || !arg.includes('${'));
        serverConfig.args = processedArgs;

        // Reemplazar placeholders en env con valores del usuario o defaults
        // Si no hay valor, eliminar la variable de entorno
        const env: Record<string, string> = {};
        const templateEnv = template?.env || {};
        Object.keys(templateEnv).forEach(envKey => {
          const envValue = templateEnv[envKey];
          if (typeof envValue === 'string') {
            // Reemplazar ${variable} con el valor real
            let replacedValue = envValue;
            Object.entries(completeValues).forEach(([key, value]) => {
              replacedValue = replacedValue.replace(`\${${key}}`, value);
            });
            // Solo incluir si no quedan placeholders sin resolver
            if (!replacedValue.includes('${')) {
              env[envKey] = replacedValue;
            }
          }
        });
        if (Object.keys(env).length > 0) {
          serverConfig.env = env;
        }
      } else if (transportType === 'http' || transportType === 'sse' || transportType === 'streamable-http') {
        // Reemplazar placeholders en url/baseUrl con valores del usuario o defaults
        // Support both 'url' (new) and 'baseUrl' (legacy)
        let serverUrl = template?.url || template?.baseUrl || '';
        Object.entries(completeValues).forEach(([key, value]) => {
          serverUrl = serverUrl.replace(`\${${key}}`, value);
        });
        serverConfig.url = serverUrl;

        // Reemplazar placeholders en headers con valores del usuario o defaults
        // Si no hay valor, eliminar el header
        const headers: Record<string, string> = {};
        const templateHeaders = template?.headers || {};
        Object.keys(templateHeaders).forEach(headerKey => {
          const headerValue = templateHeaders[headerKey];
          if (typeof headerValue === 'string') {
            // Reemplazar ${variable} con el valor real
            let replacedValue = headerValue;
            Object.entries(completeValues).forEach(([key, value]) => {
              replacedValue = replacedValue.replace(`\${${key}}`, value);
            });
            // Solo incluir si no quedan placeholders sin resolver
            if (!replacedValue.includes('${')) {
              headers[headerKey] = replacedValue;
            }
          }
        });
        if (Object.keys(headers).length > 0) {
          serverConfig.headers = headers;
        }
      }

      // Guardar directo en .mcp.json
      await addServer(serverConfig);

      // Recargar lista de servidores activos
      await loadActiveServers();

      // Intentar conectar (esto instalará el runtime si es necesario)
      const toastId = toast.loading(t('messages.connecting', { name: displayName }));

      try {
        await connectServer(serverConfig);
        toast.success(t('messages.added', { name: displayName }), { id: toastId });
      } catch (connectError: any) {
        // Server is saved but connection failed
        // This can happen if runtime installation fails or OAuth is required
        logger.mcp.warn('Server added but connection failed', {
          serverId: entryId,
          error: connectError.message
        });

        if (connectError.code === 'OAUTH_REQUIRED') {
          // Trigger OAuth dialog
          const { handleOAuthRequired } = useOAuthStore.getState();
          handleOAuthRequired({
            serverId: connectError.serverConfig?.id || serverConfig.id,
            mcpServerUrl: connectError.metadata?.mcpServerUrl || '',
            wwwAuth: connectError.metadata?.wwwAuth || ''
          });

          toast.info('OAuth authorization required. Please check the authorization dialog.', {
            id: toastId
          });
          return;
        }

        if (connectError.message === 'RUNTIME_NOT_FOUND') {
          toast.error(t('messages.runtime_not_available'), { id: toastId });
        } else {
          // Server saved, but couldn't connect - user can try to connect manually
          toast.warning(t('messages.added_not_connected', { name: displayName }), { id: toastId });
        }
      }
    } catch (error) {
      toast.error(t('messages.add_failed'));
    } finally {
      // Limpiar estado de "instalando"
      setInstallingServerId(null);
    }
  };

  const handleApiKeysSubmit = (values: Record<string, string>) => {
    if (apiKeysModalState.entryId) {
      handleAddToActive(apiKeysModalState.entryId, values);
    }
    setApiKeysModalState({
      isOpen: false,
      entryId: null,
      serverName: '',
      fields: [],
    });
  };

  const handleDeleteServer = async (serverId: string) => {
    try {
      await removeServer(serverId);

      // Recargar lista de servidores activos
      await loadActiveServers();

      // Feedback al usuario
      toast.success(t('messages.deleted'));
    } catch (error) {
      logger.mcp.error('Failed to delete server', { serverId, error });
      toast.error(t('messages.delete_failed'));
    }
  };

  const handleRuntimeUseSystem = async () => {
    if (!runtimeDialogState.serverConfig) return;

    try {
      // Modify server config to use system runtime explicitly
      const modifiedConfig = {
        ...runtimeDialogState.serverConfig,
        runtime: {
          ...runtimeDialogState.serverConfig.runtime!,
          source: 'system' as const
        }
      };

      await connectServer(modifiedConfig);
      toast.success(`Connected ${runtimeDialogState.serverName} using system runtime`);
    } catch (error: any) {
      logger.mcp.error('Failed to connect with system runtime', { error: error.message });
      toast.error('Failed to connect with system runtime');
    }
  };

  const handleRuntimeInstallLevante = async () => {
    if (!runtimeDialogState.serverConfig) return;

    try {
      const toastId = toast.loading(`Installing runtime for ${runtimeDialogState.serverName}...`);

      // Install runtime via IPC
      const installResult = await window.levante.mcp.installRuntime(
        runtimeDialogState.metadata.runtimeType!,
        runtimeDialogState.metadata.runtimeVersion!
      );

      if (!installResult.success) {
        throw new Error(installResult.error || 'Failed to install runtime');
      }

      // Now connect with the installed Levante runtime
      await connectServer(runtimeDialogState.serverConfig);

      toast.success(`Runtime installed and ${runtimeDialogState.serverName} connected!`, { id: toastId });
    } catch (error: any) {
      logger.mcp.error('Failed to install runtime', { error: error.message });
      toast.error(`Failed to install runtime: ${error.message}`);
    }
  };

  const handleRefreshConfiguration = async () => {
    setIsRefreshing(true);

    try {
      logger.mcp.info('Refreshing MCP configuration from Store page');
      const result = await window.levante.mcp.refreshConfiguration();

      if (result.success) {
        // Reload active servers and connection status
        await loadActiveServers();
        await refreshConnectionStatus();

        toast.success(t('messages.refreshed'));

        // Log any server connection errors
        if (result.data?.serverResults) {
          const failedServers = Object.entries(result.data.serverResults)
            .filter(([_, res]: [string, any]) => !res.success)
            .map(([id]) => id);

          if (failedServers.length > 0) {
            toast.warning(t('messages.some_failed', { servers: failedServers.join(', ') }));
          }
        }
      } else {
        toast.error(result.error || t('messages.refresh_failed'));
      }
    } catch (error) {
      logger.mcp.error('MCP refresh error in Store page', { error: error instanceof Error ? error.message : error });
      toast.error(t('messages.refresh_failed'));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleShowInfo = (entryId: string) => {
    setInfoSheetState({
      isOpen: true,
      entryId,
    });
  };

  const handleCloseInfo = () => {
    setInfoSheetState({
      isOpen: false,
      entryId: null,
    });
  };

  // ✅ ELIMINADO: El error global ya no bloquea toda la UI
  // Los errores de proveedores se muestran de forma granular más abajo

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4">
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {mode === 'active' ? t('active.title') : t('store.title')}
            </h1>
            <p className="text-muted-foreground">
              {mode === 'active'
                ? t('active.description')
                : t('store.description')
              }
            </p>
          </div>
          <div className="flex items-center gap-4">
            {mode === 'active' && (
              <NetworkStatus
                connectedCount={Object.values(connectionStatus).filter(s => s === 'connected').length}
                totalCount={activeServers.length}
                size="md"
              />
            )}
            <ImportExport
              variant="dropdown"
              onRefresh={handleRefreshConfiguration}
              isRefreshing={isRefreshing}
            />
          </div>
        </div>
      </div>

      {/* Active Mode: Show only active servers */}
      {mode === 'active' && (
        <section>
          {activeServers.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold">{t('active.connected_servers')}</h2>
                  <div className="inline-flex items-center rounded-full bg-muted p-1">
                    <button
                      onClick={() => onModeChange('active')}
                      className={cn(
                        "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                        getModeButtonStyle(mode, 'active')
                      )}
                      title={t('active.title')}
                    >
                      <Wrench className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onModeChange('store')}
                      className={cn(
                        "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                        getModeButtonStyle(mode, 'store')
                      )}
                      title={t('store.title')}
                    >
                      <Store className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <Badge variant="secondary">
                  {t('active.active_count', { count: activeServers.filter(s => s.enabled !== false).length })}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Add New Card */}
                <Card className="p-6 border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer">
                  <div
                    className="flex flex-col items-center justify-center text-center h-full min-h-[200px]"
                    onClick={() => setIsFullJSONEditorOpen(true)}
                  >
                    <Plus className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-2">{t('active.add_custom')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('active.edit_json')}
                    </p>
                  </div>
                </Card>
                {activeServers.map(server => {
                  const registryEntry = getRegistryEntryById(server.id);
                  const status = connectionStatus[server.id] || 'disconnected';

                  return (
                    <IntegrationCard
                      key={server.id}
                      mode="active"
                      entry={registryEntry}
                      server={server}
                      status={status}
                      isActive={true}
                      onToggle={() => handleToggleServer(server.id)}
                      onConfigure={() => handleConfigureServer(server.id)}
                      onDelete={() => handleDeleteServer(server.id)}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-2xl font-bold">{t('active.connected_servers')}</h2>
                <div className="inline-flex items-center rounded-full bg-muted p-1">
                  <button
                    onClick={() => onModeChange('active')}
                    className={cn(
                      "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                      getModeButtonStyle(mode, 'active')
                    )}
                    title={t('active.title')}
                  >
                    <Wrench className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onModeChange('store')}
                    className={cn(
                      "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                      getModeButtonStyle(mode, 'store')
                    )}
                    title={t('store.title')}
                  >
                    <Store className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-center py-8">
                <p className="text-muted-foreground mb-2">{t('active.no_servers')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('active.switch_to_store')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Add New Card - shown even when no servers */}
                <Card className="p-6 border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer">
                  <div
                    className="flex flex-col items-center justify-center text-center h-full min-h-[200px]"
                    onClick={() => setIsFullJSONEditorOpen(true)}
                  >
                    <Plus className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-2">{t('active.add_custom')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('active.edit_json')}
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Store Mode: Show available servers */}
      {mode === 'store' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{t('store.available_integrations')}</h2>
              <div className="inline-flex items-center rounded-full bg-muted p-1">
                <button
                  onClick={() => onModeChange('active')}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                    getModeButtonStyle(mode, 'active')
                  )}
                  title={t('active.title')}
                >
                  <Wrench className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onModeChange('store')}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                    getModeButtonStyle(mode, 'store')
                  )}
                  title={t('store.title')}
                >
                  <Store className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SourceFilter
                selectedSource={selectedSource}
                availableSources={getAvailableSources()}
                onSelectSource={setSelectedSource}
              />
              <Badge variant="outline">
                {t('store.available', { count: getFilteredAndSearchedEntries().length })}
              </Badge>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t('store.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Category Filter */}
          {getAvailableCategories().length > 1 && (
            <div className="mb-4">
              <CategoryFilter
                selectedCategory={selectedCategory}
                availableCategories={getAvailableCategories()}
                onSelectCategory={setSelectedCategory}
              />
            </div>
          )}

          {/* Provider Error Alerts */}
          {Object.entries(providerErrors).filter(([_, error]) => error !== null).length > 0 && (
            <div className="space-y-2 mb-4">
              {Object.entries(providerErrors)
                .filter(([_, error]) => error !== null)
                .map(([providerId, error]) => {
                  const provider = providers.find(p => p.id === providerId);
                  return (
                    <div key={providerId} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-foreground" />
                        <span className="text-sm text-foreground">
                          {t('store.provider_error', {
                            name: provider?.name || providerId
                          })}
                        </span>
                      </div>
                      <button
                        onClick={() => clearProviderError(providerId)}
                        className="text-sm text-foreground/60 hover:text-foreground underline hover:no-underline ml-4"
                      >
                        {t('common:actions.dismiss')}
                      </button>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* No Results Message */}
          {getFilteredAndSearchedEntries().length === 0 && searchQuery.trim() && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-2">{t('store.no_results')}</p>
              <p className="text-sm text-muted-foreground">
                {t('store.no_results_description')}
              </p>
            </div>
          )}

          {/* ✅ NUEVO: Empty State cuando todos los proveedores fallan */}
          {getFilteredAndSearchedEntries().length === 0 && !searchQuery.trim() && providersSynced && (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">
                {t('store.no_providers_title')}
              </h3>
              <p className="text-muted-foreground">
                {t('store.no_providers_description')}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Registry Cards */}
            {getFilteredAndSearchedEntries().map(entry => {
              const server = activeServers.find(s => s.id === entry.id);
              const status = connectionStatus[entry.id] || 'disconnected';
              const isActive = !!server;
              const isInstalling = installingServerId === entry.id;

              return (
                <IntegrationCard
                  key={entry.id}
                  mode="store"
                  entry={entry}
                  server={server}
                  status={status}
                  isActive={isActive}
                  isInstalling={isInstalling}
                  onToggle={() => handleToggleServer(entry.id)}
                  onConfigure={() => handleConfigureServer(entry.id)}
                  onAddToActive={() => handleAddToActive(entry.id)}
                  onShowInfo={() => handleShowInfo(entry.id)}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Full JSON Editor Panel */}
      <FullJSONEditorPanel
        isOpen={isFullJSONEditorOpen}
        onClose={() => setIsFullJSONEditorOpen(false)}
      />

      {/* JSON Editor Panel */}
      <JSONEditorPanel
        serverId={configServerId}
        isOpen={!!configServerId}
        onClose={() => setConfigServerId(null)}
      />

      {/* API Keys Modal */}
      <ApiKeysModal
        isOpen={apiKeysModalState.isOpen}
        onClose={() => setApiKeysModalState({ isOpen: false, entryId: null, serverName: '', fields: [] })}
        onSubmit={handleApiKeysSubmit}
        serverName={apiKeysModalState.serverName}
        fields={apiKeysModalState.fields}
      />

      {/* Runtime Choice Dialog */}
      <RuntimeChoiceDialog
        open={runtimeDialogState.isOpen}
        onClose={() => setRuntimeDialogState({ isOpen: false, errorType: null, serverName: '', serverConfig: null, metadata: {} })}
        errorType={runtimeDialogState.errorType!}
        serverName={runtimeDialogState.serverName}
        metadata={runtimeDialogState.metadata}
        onUseSystem={handleRuntimeUseSystem}
        onInstallLevante={handleRuntimeInstallLevante}
      />

      {/* MCP Info Sheet */}
      <MCPInfoSheet
        entry={infoSheetState.entryId ? (getRegistryEntryById(infoSheetState.entryId) || null) : null}
        isOpen={infoSheetState.isOpen}
        isInstalled={infoSheetState.entryId ? activeServers.some(s => s.id === infoSheetState.entryId) : false}
        onClose={handleCloseInfo}
        onInstall={() => {
          if (infoSheetState.entryId) {
            handleAddToActive(infoSheetState.entryId);
            handleCloseInfo();
          }
        }}
      />

    </div>
  );
}
