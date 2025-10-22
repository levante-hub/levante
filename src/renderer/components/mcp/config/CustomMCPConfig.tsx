import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { useMCPStore } from '@/stores/mcpStore';
import { MCPServerConfig, MCPTool } from '@/types/mcp';
import { MCPServerPreview } from './mcp-server-preview';
import { useTranslation } from 'react-i18next';

interface CustomMCPConfigProps {
  serverId: string | null;
  onClose: () => void;
  initialConfig?: Partial<MCPServerConfig>;
  onConfigChange?: (config: any | null) => void;
}

export function CustomMCPConfig({ serverId, onClose, initialConfig, onConfigChange }: CustomMCPConfigProps) {
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

  // Load initial JSON configuration
  useEffect(() => {
    if (serverId) {
      setHasUserEdits(false);

      // If initialConfig provided (from Automatic mode), use it
      if (initialConfig) {
        setJsonText(JSON.stringify(initialConfig, null, 2));
        return;
      }

      // Otherwise load from server/registry as before
      if (isCustomNewServer) {
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
  }, [serverId, server, registryEntry, isCustomNewServer, initialConfig]);

  // Sync tools with global connection status
  useEffect(() => {
    if (serverId && !isCustomNewServer && !hasUserEdits) {
      if (connectionStatus[serverId] === 'connected') {
        loadToolsFromConnectedServer(serverId);
      } else {
        setTestResult(null);
        setTools([]);
      }
    }
  }, [serverId, connectionStatus, isCustomNewServer, hasUserEdits]);

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

      if (isCustomNewServer && !parsed.name) {
        return { valid: false, error: t('config.validation.missing_name') };
      }

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
    setHasUserEdits(true);
    const validation = validateJSON(text);
    setJsonError(validation.error || null);
  };

  // Notify parent of config changes
  useEffect(() => {
    if (!onConfigChange) return;

    const validation = validateJSON(jsonText);
    if (validation.valid && validation.data) {
      onConfigChange(validation.data);
    } else {
      onConfigChange(null);
    }
  }, [jsonText]); // Remove onConfigChange from dependencies

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

      const result = await window.levante.mcp.testConnection(testConfig);

      setTestResult({
        success: result.success,
        message: result.success
          ? t('config.test.success_message')
          : result.error || t('config.test.failed_message')
      });

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
    <div className="space-y-4">
      {/* JSON Editor */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            {t('config.json_label')}
          </label>
          <Textarea
            value={jsonText}
            onChange={(e) => handleJSONChange(e.target.value)}
            className="font-mono text-sm min-h-[400px] resize-y"
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

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
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
      </div>
    </div>
  );
}
