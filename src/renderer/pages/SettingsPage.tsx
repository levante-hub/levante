import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const SettingsPage = () => {
  const [mcpStatus, setMcpStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
    serverResults?: Record<string, { success: boolean; error?: string }>;
  }>({ loading: false });

  const handleRefreshMCP = async () => {
    setMcpStatus({ loading: true });
    
    try {
      console.log('[Settings] Refreshing MCP configuration...');
      const result = await window.levante.mcp.refreshConfiguration();
      
      if (result.success) {
        setMcpStatus({
          loading: false,
          success: true,
          message: 'MCP configuration refreshed successfully',
          serverResults: result.data?.serverResults
        });
      } else {
        setMcpStatus({
          loading: false,
          success: false,
          message: result.error || 'Failed to refresh MCP configuration'
        });
      }
    } catch (error) {
      console.error('[Settings] MCP refresh error:', error);
      setMcpStatus({
        loading: false,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
    
    // Clear status after 5 seconds
    setTimeout(() => {
      setMcpStatus({ loading: false });
    }, 5000);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-2">
          <p className="text-muted-foreground">Configure your application preferences here.</p>
        </div>
        
        <div className="bg-card p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">General Settings</h3>
          <p className="text-muted-foreground">Application settings will be implemented here.</p>
        </div>

        <div className="bg-card p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            🔧 MCP Configuration
          </h3>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Manage Model Context Protocol (MCP) server connections and configuration.
            </p>
            
            <div className="flex items-center gap-4">
              <Button 
                onClick={handleRefreshMCP}
                disabled={mcpStatus.loading}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${mcpStatus.loading ? 'animate-spin' : ''}`} />
                {mcpStatus.loading ? 'Refreshing...' : 'Refresh Configuration'}
              </Button>
              
              {mcpStatus.success === true && (
                <div className="flex items-center text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Configuration refreshed
                </div>
              )}
              
              {mcpStatus.success === false && (
                <div className="flex items-center text-red-600 text-sm">
                  <XCircle className="w-4 h-4 mr-1" />
                  Refresh failed
                </div>
              )}
            </div>

            {mcpStatus.message && (
              <Alert variant={mcpStatus.success ? "default" : "destructive"}>
                <AlertDescription>
                  {mcpStatus.message}
                </AlertDescription>
              </Alert>
            )}

            {mcpStatus.serverResults && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Server Connection Results:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {Object.entries(mcpStatus.serverResults).map(([serverId, result]) => (
                    <div 
                      key={serverId}
                      className={`p-2 rounded border ${
                        result.success 
                          ? 'bg-green-50 border-green-200 text-green-800' 
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {result.success ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        <span className="font-mono text-xs">{serverId}</span>
                      </div>
                      {result.error && (
                        <div className="text-xs mt-1 opacity-75">{result.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              <p>• Configuration file: <code className="text-xs bg-muted px-1 rounded">~/levante/mcp.json</code></p>
              <p>• Use this to reload changes made to the MCP configuration file</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage