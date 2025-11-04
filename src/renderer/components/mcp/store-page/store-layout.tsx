import { useEffect, useState } from 'react';
import { useMCPStore } from '@/stores/mcpStore';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { IntegrationCard } from './integration-card';
import { JSONEditorPanel } from '../config/json-editor-panel';
import { FullJSONEditorPanel } from '../config/full-json-editor-panel';
import { ImportExport } from '../config/import-export';
import { NetworkStatus } from '../connection/connection-status';
import { SystemDiagnosticAlert } from '../SystemDiagnosticAlert';
import { ApiKeysModal } from '../config/api-keys-modal';
import { getRendererLogger } from '@/services/logger';
import { toast } from 'sonner';
import { MCPServerConfig, MCPConfigField } from '@/types/mcp';
import { useTranslation } from 'react-i18next';

const logger = getRendererLogger();

interface StoreLayoutProps {
  mode: 'active' | 'store';
}

export function StoreLayout({ mode }: StoreLayoutProps) {
  const { t } = useTranslation('mcp');
  const {
    registry,
    activeServers,
    connectionStatus,
    error,
    loadRegistry,
    loadActiveServers,
    refreshConnectionStatus,
    connectServer,
    disconnectServer,
    addServer,
    removeServer,
    clearError
  } = useMCPStore();

  const [configServerId, setConfigServerId] = useState<string | null>(null);
  const [isFullJSONEditorOpen, setIsFullJSONEditorOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [installingServerId, setInstallingServerId] = useState<string | null>(null);
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

  useEffect(() => {
    // Load initial data
    loadRegistry();
    loadActiveServers();

    // Refresh connection status every 30 seconds
    const interval = setInterval(refreshConnectionStatus, 30000);
    return () => clearInterval(interval);
  }, [loadRegistry, loadActiveServers, refreshConnectionStatus]);

  // Handle errors with toast instead of blocking UI
  useEffect(() => {
    if (error) {
      toast.error(error);
      // Clear error from store after showing toast
      clearError();
    }
  }, [error, clearError]);

  const handleToggleServer = async (serverId: string) => {
    const server = activeServers.find(s => s.id === serverId);
    const isActive = connectionStatus[serverId] === 'connected';

    if (isActive) {
      await disconnectServer(serverId);
    } else if (server) {
      await connectServer(server);
    } else {
      // Server not configured yet, open config modal
      const registryEntry = registry.entries.find(entry => entry.id === serverId);
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
    const registryEntry = registry.entries.find(e => e.id === entryId);
    if (!registryEntry) return;

    // Detectar si hay campos que requieren input del usuario
    const fieldsNeedingInput = registryEntry.configuration?.fields?.filter(
      field => field.key !== 'command' && field.key !== 'args' && field.key !== 'baseUrl'
    ) || [];

    // Si hay campos que necesitan input y no se han proporcionado valores, abrir modal
    if (fieldsNeedingInput.length > 0 && !apiKeyValues) {
      setApiKeysModalState({
        isOpen: true,
        entryId,
        serverName: registryEntry.name,
        fields: fieldsNeedingInput,
      });
      return;
    }

    try {
      // Marcar servidor como "instalando"
      setInstallingServerId(entryId);

      const template = registryEntry.configuration?.template;
      const transportType = template?.type || 'stdio';

      // Construir config desde template según el tipo de transporte
      const serverConfig: MCPServerConfig = {
        id: entryId,
        name: registryEntry.name,
        transport: transportType,
      };

      // Agregar campos específicos según el tipo de transporte
      if (transportType === 'stdio') {
        serverConfig.command = template?.command || '';
        serverConfig.args = template?.args || [];

        // Reemplazar placeholders en env con valores del usuario
        const env = { ...template?.env };
        if (apiKeyValues) {
          Object.keys(env).forEach(envKey => {
            const envValue = env[envKey];
            if (typeof envValue === 'string') {
              // Reemplazar ${variable} con el valor real
              let replacedValue = envValue;
              Object.entries(apiKeyValues).forEach(([key, value]) => {
                replacedValue = replacedValue.replace(`\${${key}}`, value);
              });
              env[envKey] = replacedValue;
            }
          });
        }
        serverConfig.env = env;
      } else if (transportType === 'http' || transportType === 'sse') {
        // Reemplazar placeholders en baseUrl con valores del usuario
        let baseUrl = template?.baseUrl || '';
        if (apiKeyValues) {
          Object.entries(apiKeyValues).forEach(([key, value]) => {
            baseUrl = baseUrl.replace(`\${${key}}`, value);
          });
        }
        serverConfig.baseUrl = baseUrl;

        // Reemplazar placeholders en headers con valores del usuario
        const headers = { ...template?.headers };
        if (apiKeyValues) {
          Object.keys(headers).forEach(headerKey => {
            const headerValue = headers[headerKey];
            if (typeof headerValue === 'string') {
              // Reemplazar ${variable} con el valor real
              let replacedValue = headerValue;
              Object.entries(apiKeyValues).forEach(([key, value]) => {
                replacedValue = replacedValue.replace(`\${${key}}`, value);
              });
              headers[headerKey] = replacedValue;
            }
          });
        }
        serverConfig.headers = headers;
      }

      // Guardar directo en .mcp.json (sin test, sin connect)
      await addServer(serverConfig);

      // Recargar lista de servidores activos
      await loadActiveServers();

      // Feedback al usuario
      toast.success(t('messages.added', { name: registryEntry.name }));
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
          {/* System Diagnostic Alert */}
          <SystemDiagnosticAlert />

          {activeServers.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">{t('active.connected_servers')}</h2>
                <Badge variant="secondary">
                  {t('active.active_count', { count: activeServers.length })}
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
                  const registryEntry = registry.entries.find(entry => entry.id === server.id);
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
            <h2 className="text-2xl font-bold">{t('store.available_integrations')}</h2>
            <Badge variant="outline">
              {t('store.available', { count: registry.entries.length })}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Registry Cards */}
            {registry.entries.map(entry => {
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
    </div>
  );
}