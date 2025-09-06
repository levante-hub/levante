import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, CheckCircle, XCircle, Settings, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

const SettingsPage = () => {
  const [mcpStatus, setMcpStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
    serverResults?: Record<string, { success: boolean; error?: string }>;
  }>({ loading: false });

  const [maxStepsConfig, setMaxStepsConfig] = useState({
    baseSteps: 5,
    maxSteps: 20,
    saving: false,
    saved: false
  });

  const [healthData, setHealthData] = useState<{
    servers: Record<string, {
      status: 'healthy' | 'unhealthy' | 'unknown';
      errorCount: number;
      successCount: number;
      consecutiveErrors: number;
    }>;
    loading: boolean;
  }>({ servers: {}, loading: false });

  const handleRefreshMCP = async () => {
    setMcpStatus({ loading: true });
    
    try {
      logger.mcp.info('Refreshing MCP configuration from Settings page');
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
      logger.mcp.error('MCP refresh error in Settings page', { error: error instanceof Error ? error.message : error });
      setMcpStatus({
        loading: false,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
    
    // Reload health data after MCP refresh
    await loadHealthData();
    
    // Clear status after 5 seconds
    setTimeout(() => {
      setMcpStatus({ loading: false });
    }, 5000);
  };

  const loadStepsConfig = async () => {
    try {
      const aiConfig = await window.levante.preferences.get('ai');
      
      setMaxStepsConfig(prev => ({
        ...prev,
        baseSteps: aiConfig?.data?.baseSteps || 5,
        maxSteps: aiConfig?.data?.maxSteps || 20
      }));
    } catch (error) {
      logger.preferences.error('Error loading AI steps configuration', { error: error instanceof Error ? error.message : error });
    }
  };

  const handleSaveStepsConfig = async () => {
    setMaxStepsConfig(prev => ({ ...prev, saving: true, saved: false }));
    
    try {
      await window.levante.preferences.set('ai', {
        baseSteps: maxStepsConfig.baseSteps,
        maxSteps: maxStepsConfig.maxSteps
      });
      
      setMaxStepsConfig(prev => ({ ...prev, saving: false, saved: true }));
      
      // Clear saved indicator after 3 seconds
      setTimeout(() => {
        setMaxStepsConfig(prev => ({ ...prev, saved: false }));
      }, 3000);
    } catch (error) {
      logger.preferences.error('Error saving AI steps configuration', { baseSteps: maxStepsConfig.baseSteps, maxSteps: maxStepsConfig.maxSteps, error: error instanceof Error ? error.message : error });
      setMaxStepsConfig(prev => ({ ...prev, saving: false }));
    }
  };

  const loadHealthData = async () => {
    setHealthData(prev => ({ ...prev, loading: true }));
    
    try {
      const healthReport = await window.levante.mcp.healthReport();
      
      if (healthReport.success && healthReport.data) {
        const healthServers: typeof healthData.servers = {};
        
        for (const [serverId, health] of Object.entries(healthReport.data.servers)) {
          healthServers[serverId] = {
            status: health.status,
            errorCount: health.errorCount,
            successCount: health.successCount,
            consecutiveErrors: health.consecutiveErrors
          };
        }
        
        setHealthData({ servers: healthServers, loading: false });
      } else {
        setHealthData(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      logger.mcp.error('Error loading MCP health data in Settings', { error: error instanceof Error ? error.message : error });
      setHealthData(prev => ({ ...prev, loading: false }));
    }
  };

  const sortServersByHealth = (servers: Record<string, { success: boolean; error?: string }>) => {
    return Object.entries(servers).sort(([serverIdA, resultA], [serverIdB, resultB]) => {
      const healthA = healthData.servers[serverIdA];
      const healthB = healthData.servers[serverIdB];
      
      // First sort by connection result (successful connections first)
      if (resultA.success && !resultB.success) return -1;
      if (!resultA.success && resultB.success) return 1;
      
      // Then sort by health status (healthy first)
      if (healthA && healthB) {
        if (healthA.status === 'healthy' && healthB.status !== 'healthy') return -1;
        if (healthA.status !== 'healthy' && healthB.status === 'healthy') return 1;
        
        if (healthA.status === 'unhealthy' && healthB.status === 'unknown') return 1;
        if (healthA.status === 'unknown' && healthB.status === 'unhealthy') return -1;
        
        // Finally sort by error count (fewer errors first)
        return healthA.consecutiveErrors - healthB.consecutiveErrors;
      }
      
      // Fallback to alphabetical
      return serverIdA.localeCompare(serverIdB);
    });
  };

  useEffect(() => {
    loadStepsConfig();
    loadHealthData();
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-2">
          <p className="text-muted-foreground">Configure your application preferences here.</p>
        </div>
        
        <div className="bg-card p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            AI Configuration
          </h3>
          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Multi-Step Tool Execution Limits</h4>
              <p className="text-muted-foreground text-sm">
                Configure how many steps the AI can take when using tools. The actual step count is calculated dynamically based on the number of available tools.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="baseSteps">Base Steps</Label>
                  <Input
                    id="baseSteps"
                    type="number"
                    min="1"
                    max="10"
                    value={maxStepsConfig.baseSteps}
                    onChange={(e) => setMaxStepsConfig(prev => ({ 
                      ...prev, 
                      baseSteps: parseInt(e.target.value) || 5 
                    }))}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum steps allowed (default: 5)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="maxSteps">Maximum Steps</Label>
                  <Input
                    id="maxSteps"
                    type="number"
                    min="5"
                    max="50"
                    value={maxStepsConfig.maxSteps}
                    onChange={(e) => setMaxStepsConfig(prev => ({ 
                      ...prev, 
                      maxSteps: parseInt(e.target.value) || 20 
                    }))}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum steps allowed (default: 20)
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 pt-2">
                <Button 
                  onClick={handleSaveStepsConfig}
                  disabled={maxStepsConfig.saving}
                  variant="outline"
                  size="sm"
                >
                  {maxStepsConfig.saving ? 'Saving...' : 'Save Configuration'}
                </Button>
                
                {maxStepsConfig.saved && (
                  <div className="flex items-center text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Saved successfully
                  </div>
                )}
              </div>
              
              <div className="bg-muted/50 p-3 rounded-md text-sm">
                <p className="font-medium mb-1">How it works:</p>
                <ul className="text-muted-foreground space-y-1 text-xs">
                  <li>• Formula: Base Steps + (Number of Tools ÷ 5) × 2</li>
                  <li>• With 24 tools: {maxStepsConfig.baseSteps} + (24 ÷ 5) × 2 = {Math.min(Math.max(maxStepsConfig.baseSteps + Math.floor(24 / 5) * 2, maxStepsConfig.baseSteps), maxStepsConfig.maxSteps)} steps</li>
                  <li>• Prevents infinite loops while allowing complex operations</li>
                </ul>
              </div>
            </div>
          </div>
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
                <h4 className="text-sm font-medium flex items-center gap-2">
                  Server Connection Results:
                  {healthData.loading && (
                    <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                  )}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {sortServersByHealth(mcpStatus.serverResults).map(([serverId, result]) => {
                    const health = healthData.servers[serverId];
                    const isUnhealthy = health?.status === 'unhealthy';
                    const hasErrors = health && health.consecutiveErrors > 0;
                    
                    return (
                      <div 
                        key={serverId}
                        className={`p-2 rounded border relative ${
                          result.success 
                            ? isUnhealthy 
                              ? 'bg-yellow-50 border-yellow-200 text-yellow-800' 
                              : 'bg-green-50 border-green-200 text-green-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {result.success ? (
                              isUnhealthy ? (
                                <AlertCircle className="w-3 h-3" />
                              ) : (
                                <CheckCircle className="w-3 h-3" />
                              )
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            <span className="font-mono text-xs">{serverId}</span>
                          </div>
                          
                          {health && (
                            <div className="flex items-center gap-1 text-xs opacity-75">
                              {health.status === 'healthy' && '✓'}
                              {health.status === 'unhealthy' && '⚠'}
                              {health.status === 'unknown' && '?'}
                              {hasErrors && (
                                <span className="text-xs">({health.consecutiveErrors} errors)</span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {result.error && (
                          <div className="text-xs mt-1 opacity-75">{result.error}</div>
                        )}
                        
                        {health && (health.errorCount > 0 || health.successCount > 0) && (
                          <div className="text-xs mt-1 opacity-60">
                            {health.successCount} success, {health.errorCount} errors
                          </div>
                        )}
                        
                        {isUnhealthy && (
                          <div className="absolute top-1 right-1">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {Object.values(healthData.servers).some(h => h.status === 'unhealthy') && (
                  <div className="text-xs text-yellow-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Unhealthy servers are shown with warning indicators and moved down in the list
                  </div>
                )}
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