import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { useMCPStore } from '@/stores/mcpStore';
import { MCPServerConfig, MCPTool } from '@/types/mcp';
import { MCPServerPreview } from './mcp-server-preview';
import { useTranslation } from 'react-i18next';

interface JSONEditorPanelProps {
  serverId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function JSONEditorPanel({ serverId, isOpen, onClose }: JSONEditorPanelProps) {
  const { t } = useTranslation('mcp');
  const { getServerById, getRegistryEntryById, updateServer, addServer, connectionStatus } = useMCPStore();

  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [hasUserEdits, setHasUserEdits] = useState(false);

  const isCustomNewServer = serverId === 'new-custom-server';
  const server = serverId && !isCustomNewServer ? getServerById(serverId) : null;
  const registryEntry = serverId && !isCustomNewServer ? getRegistryEntryById(serverId) : null;
  const isNewServer = !server;

  // Effect 1: Load initial JSON configuration when panel opens
  useEffect(() => {
    if (isOpen && serverId) {
      // Reset edit flag when opening panel
      setHasUserEdits(false);

      // Load initial JSON
      if (isCustomNewServer) {
        // New custom server: show empty template with name field
        setJsonText(JSON.stringify({
          name: '',
          type: 'stdio',
          command: 'npx',
          args: [],
          env: {}
        }, null, 2));
      } else if (server) {
        const config = {
          type: server.transport,
          command: server.command,
          args: server.args || [],
          env: server.env || {},
          ...(server.baseUrl && { baseUrl: server.baseUrl }),
          ...(server.headers && { headers: server.headers })
        };
        setJsonText(JSON.stringify(config, null, 2));
      } else if (registryEntry?.configuration?.template) {
        setJsonText(JSON.stringify(registryEntry.configuration.template, null, 2));
      } else {
        setJsonText(JSON.stringify({
          type: 'stdio',
          command: '',
          args: [],
          env: {}
        }, null, 2));
      }

      setJsonError(null);
    }
  }, [isOpen, serverId, server, registryEntry, isCustomNewServer]);

  // Effect 2: Sync tools with global connection status (only if user hasn't edited)
  useEffect(() => {
    if (isOpen && serverId && !isCustomNewServer && !hasUserEdits) {
      if (connectionStatus[serverId] === 'connected') {
        loadToolsFromConnectedServer(serverId);
      } else {
        setTestResult(null);
        setTools([]);
      }
    }
  }, [isOpen, serverId, connectionStatus, isCustomNewServer, hasUserEdits]);

  const loadToolsFromConnectedServer = async (serverId: string) => {
    setIsLoadingTools(true);
    try {
      const result = await window.levante.mcp.listTools(serverId);
      if (result.success && result.data) {
        setTestResult({ success: true, message: t('config.test.success') });
        setTools(result.data);
      } else {
        setTestResult(null);
        setTools([]);
      }
    } catch {
      setTestResult(null);
      setTools([]);
    } finally {
      setIsLoadingTools(false);
    }
  };

  const validateJSON = (text: string): { valid: boolean; data?: any; error?: string } => {
    try {
      const parsed = JSON.parse(text);

      // For custom new servers, require name field
      if (isCustomNewServer && !parsed.name) {
        return { valid: false, error: t('config.validation.missing_name') };
      }

      // Validate required fields
      if (!parsed.type) {
        return { valid: false, error: t('config.validation.missing_type') };
      }

      if (parsed.type === 'stdio' && !parsed.command) {
        return { valid: false, error: t('config.validation.missing_command') };
      }

      if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.baseUrl) {
        return { valid: false, error: t('config.validation.missing_baseurl') };
      }

      return { valid: true, data: parsed };
    } catch (error) {
      return { valid: false, error: t('config.validation.invalid_json') };
    }
  };

  const handleJSONChange = (text: string) => {
    setJsonText(text);
    setHasUserEdits(true); // Mark that user has made edits
    const validation = validateJSON(text);
    setJsonError(validation.error || null);
  };

  const handleTestConnection = async () => {
    const validation = validateJSON(jsonText);
    if (!validation.valid || !validation.data) {
      setJsonError(validation.error || 'Invalid JSON');
      return;
    }

    setIsTestingConnection(true);
    setIsLoadingTools(true);
    setTestResult(null);
    setTools([]);

    try {
      const testConfig: MCPServerConfig = {
        id: `test-${Date.now()}`,
        name: registryEntry?.name || 'Test Server',
        transport: validation.data.type,
        command: validation.data.command,
        args: validation.data.args || [],
        env: validation.data.env || {},
        baseUrl: validation.data.baseUrl,
        headers: validation.data.headers
      };

      // Call IPC directly to get tools
      const result = await window.levante.mcp.testConnection(testConfig);

      setTestResult({
        success: result.success,
        message: result.success
          ? t('config.test.success_message')
          : result.error || t('config.test.failed_message')
      });

      // Set tools from the result
      if (result.success && result.data) {
        setTools(result.data);
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: t('config.test.error_message')
      });
    } finally {
      setIsTestingConnection(false);
      setIsLoadingTools(false);
    }
  };

  const handleSave = async () => {
    const validation = validateJSON(jsonText);
    if (!validation.valid || !validation.data || !serverId) {
      setJsonError(validation.error || 'Invalid JSON');
      return;
    }

    setIsSaving(true);

    try {
      const serverConfig: MCPServerConfig = {
        id: isCustomNewServer
          ? `custom-${Date.now()}`
          : serverId,
        name: isCustomNewServer
          ? (validation.data.name || `Custom Server ${Date.now()}`)
          : (registryEntry?.name || serverId),
        transport: validation.data.type,
        command: validation.data.command,
        args: validation.data.args || [],
        env: validation.data.env || {},
        baseUrl: validation.data.baseUrl,
        headers: validation.data.headers
      };

      if (isNewServer || isCustomNewServer) {
        await addServer(serverConfig);
      } else {
        await updateServer(serverId, {
          name: serverConfig.name,
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
          transport: serverConfig.transport,
          baseUrl: serverConfig.baseUrl,
          headers: serverConfig.headers
        });
      }

      onClose();
    } catch (error) {
      setJsonError(t('config.save_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const validation = validateJSON(jsonText);
  const serverName = isCustomNewServer
    ? (validation.valid && validation.data?.name ? validation.data.name : t('config.new_server_name'))
    : (registryEntry?.name || serverId || 'MCP Server');

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[900px] sm:max-w-[90vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isNewServer ? t('config.configure') : t('config.edit')} {serverName}
          </SheetTitle>
        </SheetHeader>

        <div className="py-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column: JSON Editor */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t('config.json_label')}
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
            </div>

            {/* Right Column: Server Preview */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t('config.preview_label')}
              </label>
              <MCPServerPreview
                serverName={serverName}
                isValidJSON={validation.valid}
                testResult={testResult}
                tools={tools}
                isTestingConnection={isTestingConnection}
                isLoadingTools={isLoadingTools}
                onTestConnection={handleTestConnection}
              />
            </div>
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            {t('dialog.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!!jsonError || isTestingConnection || isSaving}
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
