import React, { useEffect, useState } from 'react';
import { useMCPStore } from '@/stores/mcpStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Settings, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IntegrationCard } from './integration-card';
import { AddNewModal } from './add-new-modal';

export function StoreLayout() {
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
    disconnectServer
  } = useMCPStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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
        console.log('Need to configure server:', registryEntry);
      }
    }
  };

  const handleConfigureServer = (serverId: string) => {
    console.log('Configure server:', serverId);
    // This will be implemented in Phase 4
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
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">MCP Store</h1>
        <p className="text-muted-foreground">
          Manage your Model Context Protocol integrations to extend AI capabilities
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading MCP servers...</span>
        </div>
      )}

      {/* Active Integrations Section */}
      {activeServers.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Active integrations</h2>
            <Badge variant="secondary">
              {activeServers.length} configured
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeServers.map(server => {
              const registryEntry = registry.entries.find(entry => entry.id === server.id);
              const status = connectionStatus[server.id] || 'disconnected';
              
              return (
                <IntegrationCard
                  key={server.id}
                  entry={registryEntry}
                  server={server}
                  status={status}
                  isActive={true}
                  onToggle={() => handleToggleServer(server.id)}
                  onConfigure={() => handleConfigureServer(server.id)}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Available Integrations Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Available integrations</h2>
          <Badge variant="outline">
            {registry.entries.length} available
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Add New Card */}
          <Card className="p-6 border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer">
            <div 
              className="flex flex-col items-center justify-center text-center h-full min-h-[200px]"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">Add Custom Integration</h3>
              <p className="text-sm text-muted-foreground">
                Connect to your own MCP server
              </p>
            </div>
          </Card>
          
          {/* Registry Cards */}
          {registry.entries.map(entry => {
            const server = activeServers.find(s => s.id === entry.id);
            const status = connectionStatus[entry.id] || 'disconnected';
            const isActive = !!server;
            
            return (
              <IntegrationCard
                key={entry.id}
                entry={entry}
                server={server}
                status={status}
                isActive={isActive}
                onToggle={() => handleToggleServer(entry.id)}
                onConfigure={() => handleConfigureServer(entry.id)}
              />
            );
          })}
        </div>
      </section>

      {/* Add New Modal */}
      <AddNewModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
}