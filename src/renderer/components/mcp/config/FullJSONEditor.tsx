import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useMCPStore } from '@/stores/mcpStore';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface MCPConfiguration {
  mcpServers: Record<string, any>;
  disabled?: Record<string, any>;
}

interface FullJSONEditorProps {
  onClose: () => void;
  onConfigChange?: (config: any | null) => void;
}

export function FullJSONEditor({ onClose, onConfigChange }: FullJSONEditorProps) {
  const { t } = useTranslation('mcp');
  const { loadActiveServers, refreshConnectionStatus } = useMCPStore();

  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);

  useEffect(() => {
    loadInitialConfiguration();
  }, []);

  // Notify parent of config changes (send full configuration for preview)
  useEffect(() => {
    if (!onConfigChange) return;

    const validation = validateJSON(jsonText);
    if (validation.valid && validation.data) {
      onConfigChange(validation.data);
    } else {
      onConfigChange(null);
    }
  }, [jsonText]); // Remove onConfigChange from dependencies to avoid infinite loop

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
      {/* JSON Editor */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            {t('config.full_editor.title')}
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

        {/* Success indicator */}
        {validation.valid && !jsonError && (
          <Alert className="border-green-200 bg-green-50 text-green-800">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>{t('config.validation.valid')}</AlertDescription>
          </Alert>
        )}
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
