import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMCPStore } from '@/stores/mcpStore';
import { toast } from 'sonner';
import { MCPServerPreview } from './mcp-server-preview';
import { useTranslation } from 'react-i18next';
import type { MCPTool, MCPServerConfig } from '@/types/mcp';

interface MCPConfiguration {
  mcpServers: Record<string, any>;
  disabled?: Record<string, any>;
}

interface FullJSONEditorProps {
  onClose: () => void;
}

export function FullJSONEditor({ onClose }: FullJSONEditorProps) {
  const { t } = useTranslation('mcp');
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
    loadInitialConfiguration();
  }, []);

  const loadInitialConfiguration = async () => {
    setIsLoadingInitial(true);
    try {
      const result = await window.levante.mcp.loadConfiguration();
      if (result.success && result.data) {
        setJsonText(JSON.stringify(result.data, null, 2));
        setJsonError(null);
      } else {
        setJsonError(t('config.full_editor.load_failed'));
      }
    } catch (error) {
      setJsonError(t('config.full_editor.load_failed'));
    } finally {
      setIsLoadingInitial(false);
    }
  };

  const validateJSON = (text: string): { valid: boolean; data?: MCPConfiguration; error?: string } => {
    try {
      const parsed = JSON.parse(text);

      // Validate required structure
      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        return { valid: false, error: t('config.validation.missing_mcpservers') };
      }

      // Validate each server in mcpServers
      for (const [serverId, serverConfig] of Object.entries(parsed.mcpServers)) {
        if (!serverConfig || typeof serverConfig !== 'object') {
          return { valid: false, error: t('config.validation.invalid_server_config', { serverId }) };
        }

        const config = serverConfig as any;

        // Accept both "transport" and "type" for compatibility
        const transportType = config.transport || config.type;

        if (!transportType || !['stdio', 'http', 'sse'].includes(transportType)) {
          return { valid: false, error: t('config.validation.invalid_transport', { serverId }) };
        }

        if (transportType === 'stdio' && !config.command) {
          return { valid: false, error: t('config.validation.missing_command', { serverId }) };
        }

        if ((transportType === 'http' || transportType === 'sse') && !config.baseUrl && !config.url) {
          return { valid: false, error: t('config.validation.missing_baseurl', { serverId }) };
        }

        // Validate server ID format
        if (!/^[a-z0-9-_]+$/i.test(serverId)) {
          return { valid: false, error: t('config.validation.invalid_server_id', { serverId }) };
        }
      }

      // Validate disabled section if present
      if (parsed.disabled && typeof parsed.disabled !== 'object') {
        return { valid: false, error: t('config.validation.invalid_disabled') };
      }

      // Validate each server in disabled
      if (parsed.disabled) {
        for (const [serverId, serverConfig] of Object.entries(parsed.disabled)) {
          if (!serverConfig || typeof serverConfig !== 'object') {
            return { valid: false, error: t('config.validation.invalid_disabled_server', { serverId }) };
          }

          const config = serverConfig as any;

          // Accept both "transport" and "type" for compatibility
          const transportType = config.transport || config.type;

          if (!transportType || !['stdio', 'http', 'sse'].includes(transportType)) {
            return { valid: false, error: t('config.validation.invalid_disabled_transport', { serverId }) };
          }
        }
      }

      return { valid: true, data: parsed };
    } catch (error) {
      return { valid: false, error: t('config.validation.invalid_json') };
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
              ? t('config.test.success_message')
              : result.error || t('config.test.failed_message')
          },
          tools: result.data || []
        }
      }));
    } catch (error) {
      setServerTests(prev => ({
        ...prev,
        [serverId]: {
          testing: false,
          result: { success: false, message: (error as Error).message || t('config.test.error_message') },
          tools: []
        }
      }));
    }
  };

  const handleSave = async () => {
    const validation = validateJSON(jsonText);
    if (!validation.valid || !validation.data) {
      setJsonError(validation.error || t('config.validation.invalid'));
      return;
    }

    setIsSaving(true);

    try {
      // Save configuration
      const saveResult = await window.levante.mcp.saveConfiguration(validation.data);
      if (!saveResult.success) {
        throw new Error(saveResult.error || t('messages.error'));
      }

      // Refresh configuration to reconnect servers
      const refreshResult = await window.levante.mcp.refreshConfiguration();
      if (!refreshResult.success) {
        throw new Error(refreshResult.error || t('messages.refresh_failed'));
      }

      // Reload active servers in the UI
      await loadActiveServers();
      await refreshConnectionStatus();

      toast.success(t('messages.saved'));
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('messages.error');
      setJsonError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const validation = validateJSON(jsonText);
  const previewData = validation.valid && validation.data ? validation.data : null;

  if (isLoadingInitial) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>{t('config.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column: JSON Editor */}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              {t('config.full_editor.title')}
            </label>
            <Textarea
              value={jsonText}
              onChange={(e) => handleJSONChange(e.target.value)}
              className="font-mono text-sm min-h-[500px]"
              placeholder={t('config.json_placeholder')}
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
              <AlertDescription>{t('config.validation.valid')}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Right Column: Preview */}
        <div className="space-y-4">
          <label className="text-sm font-medium mb-2 block">
            {t('config.preview_label')}
          </label>

          {previewData ? (
            <>
              {/* Active Servers List */}
              {Object.keys(previewData.mcpServers).length > 0 && (
                <Card className="border-none">
                  <CardHeader>
                    <CardTitle className="text-lg">{t('config.preview.active_servers')}</CardTitle>
                    <CardDescription>
                      {t('config.preview.startup_note')}
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
            <Card className="border-none">
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('config.validation.invalid')}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={isSaving}
        >
          {t('dialog.cancel')}
        </Button>
        <Button
          onClick={handleSave}
          disabled={!!jsonError || isSaving || !validation.valid}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              {t('config.saving')}
            </>
          ) : (
            t('config.save')
          )}
        </Button>
      </div>
    </div>
  );
}
