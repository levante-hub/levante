import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMCPStore } from '@/stores/mcpStore';
import { toast } from 'sonner';
import { MCPServerPreview } from './mcp-server-preview';
import type { MCPTool, MCPServerConfig } from '@/types/mcp';

interface MCPConfiguration {
  mcpServers: Record<string, any>;
  disabled?: Record<string, any>;
}

interface FullJSONEditorPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FullJSONEditorPanel({ isOpen, onClose }: FullJSONEditorPanelProps) {
  const { loadActiveServers, refreshConnectionStatus } = useMCPStore();

  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [serverTests, setServerTests] = useState<Record<string, {
    testing: boolean;
    result: { success: boolean; message: string } | null;
    tools: MCPTool[];
  }>>({});

  useEffect(() => {
    if (isOpen) {
      loadInitialConfiguration();
    }
  }, [isOpen]);

  const loadInitialConfiguration = async () => {
    setIsLoadingInitial(true);
    try {
      const result = await window.levante.mcp.loadConfiguration();
      if (result.success && result.data) {
        setJsonText(JSON.stringify(result.data, null, 2));
        setJsonError(null);
      } else {
        setJsonError('Failed to load configuration');
      }
    } catch (error) {
      setJsonError('Failed to load configuration');
    } finally {
      setIsLoadingInitial(false);
    }
  };

  const validateJSON = (text: string): { valid: boolean; data?: MCPConfiguration; error?: string } => {
    try {
      const parsed = JSON.parse(text);

      // Validate required structure
      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        return { valid: false, error: 'Missing or invalid "mcpServers" field (must be an object)' };
      }

      // Validate each server in mcpServers
      for (const [serverId, serverConfig] of Object.entries(parsed.mcpServers)) {
        if (!serverConfig || typeof serverConfig !== 'object') {
          return { valid: false, error: `Invalid configuration for server "${serverId}"` };
        }

        const config = serverConfig as any;

        // Accept both "transport" and "type" for compatibility
        const transportType = config.transport || config.type;

        if (!transportType || !['stdio', 'http', 'sse'].includes(transportType)) {
          return { valid: false, error: `Server "${serverId}": missing or invalid "transport" or "type" field` };
        }

        if (transportType === 'stdio' && !config.command) {
          return { valid: false, error: `Server "${serverId}": missing "command" field (required for stdio)` };
        }

        if ((transportType === 'http' || transportType === 'sse') && !config.baseUrl && !config.url) {
          return { valid: false, error: `Server "${serverId}": missing "baseUrl" or "url" field (required for http/sse)` };
        }

        // Validate server ID format
        if (!/^[a-z0-9-_]+$/i.test(serverId)) {
          return { valid: false, error: `Server "${serverId}": ID must contain only alphanumeric characters, hyphens, and underscores` };
        }
      }

      // Validate disabled section if present
      if (parsed.disabled && typeof parsed.disabled !== 'object') {
        return { valid: false, error: 'Invalid "disabled" field (must be an object)' };
      }

      // Validate each server in disabled
      if (parsed.disabled) {
        for (const [serverId, serverConfig] of Object.entries(parsed.disabled)) {
          if (!serverConfig || typeof serverConfig !== 'object') {
            return { valid: false, error: `Invalid configuration for disabled server "${serverId}"` };
          }

          const config = serverConfig as any;

          // Accept both "transport" and "type" for compatibility
          const transportType = config.transport || config.type;

          if (!transportType || !['stdio', 'http', 'sse'].includes(transportType)) {
            return { valid: false, error: `Disabled server "${serverId}": missing or invalid "transport" or "type" field` };
          }
        }
      }

      return { valid: true, data: parsed };
    } catch (error) {
      return { valid: false, error: 'Invalid JSON syntax' };
    }
  };

  const handleJSONChange = (text: string) => {
    setJsonText(text);
    const validation = validateJSON(text);
    setJsonError(validation.error || null);

    // Reset test states when JSON changes
    setServerTests({});
  };

  const handleTestServer = async (serverId: string, serverConfig: any) => {
    // Start testing
    setServerTests(prev => ({
      ...prev,
      [serverId]: { testing: true, result: null, tools: [] }
    }));

    try {
      const testConfig: MCPServerConfig = {
        id: `test-${serverId}-${Date.now()}`,
        name: serverConfig.name || serverId,
        transport: serverConfig.transport || serverConfig.type,
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: serverConfig.env || {},
        baseUrl: serverConfig.baseUrl || serverConfig.url,
        headers: serverConfig.headers
      };

      const result = await window.levante.mcp.testConnection(testConfig);

      setServerTests(prev => ({
        ...prev,
        [serverId]: {
          testing: false,
          result: {
            success: result.success,
            message: result.success
              ? 'Connection successful'
              : result.error || 'Connection failed'
          },
          tools: result.data || []
        }
      }));
    } catch (error) {
      setServerTests(prev => ({
        ...prev,
        [serverId]: {
          testing: false,
          result: { success: false, message: (error as Error).message || 'Unexpected error' },
          tools: []
        }
      }));
    }
  };

  const handleSave = async () => {
    const validation = validateJSON(jsonText);
    if (!validation.valid || !validation.data) {
      setJsonError(validation.error || 'Invalid JSON');
      return;
    }

    setIsSaving(true);

    try {
      // Save configuration
      const saveResult = await window.levante.mcp.saveConfiguration(validation.data);
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save configuration');
      }

      // Refresh configuration to reconnect servers
      const refreshResult = await window.levante.mcp.refreshConfiguration();
      if (!refreshResult.success) {
        throw new Error(refreshResult.error || 'Failed to refresh configuration');
      }

      // Reload active servers in the UI
      await loadActiveServers();
      await refreshConnectionStatus();

      toast.success('Configuration saved and applied successfully');
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save configuration';
      setJsonError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const validation = validateJSON(jsonText);
  const previewData = validation.valid && validation.data ? validation.data : null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[900px] sm:max-w-[90vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit MCP Configuration</SheetTitle>
        </SheetHeader>

        {isLoadingInitial ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Loading configuration...</span>
          </div>
        ) : (
          <div className="py-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Left Column: JSON Editor */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    MCP Configuration (.mcp.json)
                  </label>
                  <Textarea
                    value={jsonText}
                    onChange={(e) => handleJSONChange(e.target.value)}
                    className="font-mono text-sm min-h-[500px]"
                    placeholder="Enter JSON configuration..."
                  />
                </div>

                {/* Validation Error */}
                {jsonError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{jsonError}</AlertDescription>
                  </Alert>
                )}

                {/* Success indicator */}
                {validation.valid && !jsonError && (
                  <Alert className="border-green-200 bg-green-50 text-green-800">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription>Configuration is valid</AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Right Column: Preview */}
              <div className="space-y-4">
                <label className="text-sm font-medium mb-2 block">
                  Configuration Preview
                </label>

                {previewData ? (
                  <>
                    {/* Active Servers List */}
                    {Object.keys(previewData.mcpServers).length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Active Servers</CardTitle>
                          <CardDescription>
                            These servers will be connected on startup
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {Object.entries(previewData.mcpServers).map(([id, config]: [string, any]) => {
                              const testState = serverTests[id] || {
                                testing: false,
                                result: null,
                                tools: []
                              };

                              return (
                                <MCPServerPreview
                                  key={id}
                                  serverName={config.name || id}
                                  isValidJSON={true}
                                  testResult={testState.result}
                                  tools={testState.tools}
                                  isTestingConnection={testState.testing}
                                  isLoadingTools={testState.testing}
                                  onTestConnection={() => handleTestServer(id, config)}
                                />
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center text-muted-foreground">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Fix JSON errors to see preview</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}

        <SheetFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving || isLoadingInitial}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!!jsonError || isSaving || isLoadingInitial || !validation.valid}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save & Apply'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
