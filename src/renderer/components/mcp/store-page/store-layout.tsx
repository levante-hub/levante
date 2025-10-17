import { useEffect, useState } from 'react';
import { useMCPStore } from '@/stores/mcpStore';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IntegrationCard } from './integration-card';
import { JSONEditorPanel } from '../config/json-editor-panel';
import { FullJSONEditorPanel } from '../config/full-json-editor-panel';
import { ImportExport } from '../config/import-export';
import { NetworkStatus } from '../connection/connection-status';
import { getRendererLogger } from '@/services/logger';
import { toast } from 'sonner';
import { MCPServerConfig } from '@/types/mcp';

const logger = getRendererLogger();

interface StoreLayoutProps {
  mode: 'active' | 'store';
}

export function StoreLayout({ mode }: StoreLayoutProps) {
  const {
    registry,
    activeServers,
    connectionStatus,
    isLoading,
    error,
    loadRegistry,
    loadActiveServers,
    refreshConnectionStatus,
    connectServer,
    disconnectServer,
    addServer,
    removeServer
  } = useMCPStore();

  const [configServerId, setConfigServerId] = useState<string | null>(null);
  const [isFullJSONEditorOpen, setIsFullJSONEditorOpen] = useState(false);

  useEffect(() => {
    // Load initial data
    loadRegistry();
    loadActiveServers();

    // Refresh connection status every 30 seconds
    const interval = setInterval(refreshConnectionStatus, 30000);
    return () => clearInterval(interval);
  }, [loadRegistry, loadActiveServers, refreshConnectionStatus]);

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

  const handleAddToActive = async (entryId: string) => {
    const registryEntry = registry.entries.find(e => e.id === entryId);
    if (!registryEntry) return;

    try {
      // Construir config desde template
      const serverConfig: MCPServerConfig = {
        id: entryId,
        name: registryEntry.name,
        transport: registryEntry.configuration?.template?.type || 'stdio',
        command: registryEntry.configuration?.template?.command || '',
        args: registryEntry.configuration?.template?.args || [],
        env: registryEntry.configuration?.template?.env || {}
      };

      // Guardar directo en .mcp.json (sin test, sin connect)
      await addServer(serverConfig);

      // Recargar lista de servidores activos
      await loadActiveServers();

      // Feedback al usuario
      toast.success(`${registryEntry.name} added to Active MCPs`);
    } catch (error) {
      toast.error('Failed to add server');
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    try {
      await removeServer(serverId);

      // Recargar lista de servidores activos
      await loadActiveServers();

      // Feedback al usuario
      toast.success('Server deleted successfully');
    } catch (error) {
      logger.mcp.error('Failed to delete server', { serverId, error });
      toast.error('Failed to delete server');
    }
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="px-10 py-6">
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {mode === 'active' ? 'Active MCPs' : 'MCP Store'}
            </h1>
            <p className="text-muted-foreground">
              {mode === 'active'
                ? 'Manage your connected MCP servers'
                : 'Discover and configure new MCP integrations'
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
            <ImportExport variant="dropdown" />
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading MCP servers...</span>
        </div>
      )}

      {/* Active Mode: Show only active servers */}
      {mode === 'active' && (
        <section>
          {activeServers.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Connected Servers</h2>
                <Badge variant="secondary">
                  {activeServers.length} active
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
                    <h3 className="font-semibold mb-2">Add Custom Integration</h3>
                    <p className="text-sm text-muted-foreground">
                      Edit .mcp.json directly
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
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No active MCP servers</p>
              <p className="text-sm text-muted-foreground">
                Switch to the Store tab to configure new integrations
              </p>
            </div>
          )}
        </section>
      )}

      {/* Store Mode: Show available servers */}
      {mode === 'store' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Available Integrations</h2>
            <Badge variant="outline">
              {registry.entries.length} available
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Registry Cards */}
            {registry.entries.map(entry => {
              const server = activeServers.find(s => s.id === entry.id);
              const status = connectionStatus[entry.id] || 'disconnected';
              const isActive = !!server;

              return (
                <IntegrationCard
                  key={entry.id}
                  mode="store"
                  entry={entry}
                  server={server}
                  status={status}
                  isActive={isActive}
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
    </div>
  );
}