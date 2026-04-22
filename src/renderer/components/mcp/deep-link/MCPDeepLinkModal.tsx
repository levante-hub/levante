import { useState } from 'react';
import { Link2, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { MCPServerConfig, MCPConfigField } from '../../../types/mcp';
import { ApiKeysModal } from '../config/api-keys-modal';

/**
 * Detect if a value contains placeholder patterns like ${VARIABLE_NAME}
 */
function hasPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /\$\{[A-Z_][A-Z0-9_]*\}/g.test(value);
}

/**
 * Extract placeholder variable names from values
 * E.g., "${API_KEY}" -> "API_KEY"
 */
function extractPlaceholder(value: string): string | null {
  const match = value.match(/\$\{([A-Z_][A-Z0-9_]*)\}/);
  return match ? match[1] : null;
}

/**
 * Generate MCPConfigField definitions from config with placeholders
 */
function detectRequiredFields(config: Partial<MCPServerConfig>): MCPConfigField[] {
  const fields: MCPConfigField[] = [];
  const seenKeys = new Set<string>();

  // Check environment variables for placeholders
  if (config.env && typeof config.env === 'object') {
    Object.entries(config.env).forEach(([key, value]) => {
      if (hasPlaceholder(value)) {
        const placeholder = extractPlaceholder(value as string);
        if (placeholder && !seenKeys.has(placeholder)) {
          seenKeys.add(placeholder);
          fields.push({
            key: placeholder,
            label: placeholder.replace(/_/g, ' ').toLowerCase()
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' '),
            type: placeholder.toLowerCase().includes('password') ||
              placeholder.toLowerCase().includes('secret') ||
              placeholder.toLowerCase().includes('token') ||
              placeholder.toLowerCase().includes('key')
              ? 'password'
              : 'string',
            required: true,
            placeholder: `Enter your ${placeholder.toLowerCase().replace(/_/g, ' ')}`,
            description: `Required for ${config.name || 'this server'}`
          });
        }
      }
    });
  }

  // Check headers for placeholders (http/sse servers)
  if (config.headers && typeof config.headers === 'object') {
    Object.entries(config.headers).forEach(([headerKey, value]) => {
      if (hasPlaceholder(value)) {
        const placeholder = extractPlaceholder(value as string);
        if (placeholder && !seenKeys.has(placeholder)) {
          seenKeys.add(placeholder);
          fields.push({
            key: placeholder,
            label: placeholder.replace(/_/g, ' ').toLowerCase()
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' '),
            type: 'password', // Headers often contain tokens
            required: true,
            placeholder: `Enter your ${placeholder.toLowerCase().replace(/_/g, ' ')}`,
            description: `Used in ${headerKey} header`
          });
        }
      }
    });
  }

  // Check URL for placeholders
  if (config.url && hasPlaceholder(config.url)) {
    const placeholder = extractPlaceholder(config.url);
    if (placeholder && !seenKeys.has(placeholder)) {
      seenKeys.add(placeholder);
      fields.push({
        key: placeholder,
        label: placeholder.replace(/_/g, ' ').toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        type: 'string',
        required: true,
        placeholder: `Enter ${placeholder.toLowerCase().replace(/_/g, ' ')}`,
        description: 'Used in server URL'
      });
    }
  }

  return fields;
}

/**
 * Replace all placeholders in a config object with actual values
 * Also adds any unused input values to env (for inputs without placeholders)
 */
function replacePlaceholders(
  config: Partial<MCPServerConfig>,
  values: Record<string, string>
): MCPServerConfig {
  const result = { ...config } as MCPServerConfig;
  const usedKeys = new Set<string>();

  // Ensure env exists
  if (!result.env) {
    result.env = {};
  }

  // Replace in env
  const newEnv: Record<string, string> = {};
  Object.entries(result.env).forEach(([key, value]) => {
    if (typeof value === 'string') {
      let replaced = value;
      Object.entries(values).forEach(([placeholder, actualValue]) => {
        if (replaced.includes(`\${${placeholder}}`)) {
          replaced = replaced.replace(`\${${placeholder}}`, actualValue);
          usedKeys.add(placeholder);
        }
      });
      newEnv[key] = replaced;
    } else {
      newEnv[key] = value;
    }
  });
  result.env = newEnv;

  // Replace in headers
  if (result.headers) {
    const newHeaders: Record<string, string> = {};
    Object.entries(result.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        let replaced = value;
        Object.entries(values).forEach(([placeholder, actualValue]) => {
          if (replaced.includes(`\${${placeholder}}`)) {
            replaced = replaced.replace(`\${${placeholder}}`, actualValue);
            usedKeys.add(placeholder);
          }
        });
        newHeaders[key] = replaced;
      } else {
        newHeaders[key] = value;
      }
    });
    result.headers = newHeaders;
  }

  // Replace in URL
  if (result.url && typeof result.url === 'string') {
    let replaced = result.url;
    Object.entries(values).forEach(([placeholder, actualValue]) => {
      if (replaced.includes(`\${${placeholder}}`)) {
        replaced = replaced.replace(`\${${placeholder}}`, actualValue);
        usedKeys.add(placeholder);
      }
    });
    result.url = replaced;
  }

  // Replace in args (for stdio servers)
  if (result.args && Array.isArray(result.args)) {
    result.args = result.args.map(arg => {
      if (typeof arg === 'string') {
        let replaced = arg;
        Object.entries(values).forEach(([placeholder, actualValue]) => {
          if (replaced.includes(`\${${placeholder}}`)) {
            replaced = replaced.replace(`\${${placeholder}}`, actualValue);
            usedKeys.add(placeholder);
          }
        });
        return replaced;
      }
      return arg;
    });
  }

  // Add any unused input values directly to env
  // This handles cases where inputs don't have explicit placeholders
  Object.entries(values).forEach(([key, value]) => {
    if (!usedKeys.has(key)) {
      result.env![key] = value;
      logger.mcp.debug('Added input to env (no placeholder found)', { key });
    }
  });

  return result;
}
import { ServerInfoPanel } from './ServerInfoPanel';
import { JSONPreview } from './JSONPreview';
import { useServerValidation } from '@/hooks/useServerValidation';
import { useMCPStore } from '@/stores/mcpStore';
import { logger } from '@/services/logger';
import { toast } from 'sonner';
import { RuntimeChoiceDialog } from '@/components/runtime/RuntimeChoiceDialog';
import type { RuntimeType } from '../../../../types/runtime';
import { useTranslation } from 'react-i18next';

interface InputDefinition {
  label: string;
  required: boolean;
  type: 'string' | 'password' | 'number' | 'boolean';
  default?: string;
  description?: string;
}

interface MCPDeepLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: Partial<MCPServerConfig> | null;
  serverName: string;
  sourceUrl?: string;
  inputs?: Record<string, InputDefinition>;
}

/**
 * Convert InputDefinition from deep-link to MCPConfigField format
 */
function convertInputsToFields(inputs: Record<string, InputDefinition>): MCPConfigField[] {
  return Object.entries(inputs).map(([key, input]) => ({
    key,
    label: input.label,
    type: input.type,
    required: input.required,
    description: input.description,
    placeholder: input.description || `Enter ${input.label}`,
    defaultValue: input.default
  }));
}

export function MCPDeepLinkModal({
  open,
  onOpenChange,
  config,
  serverName,
  sourceUrl,
  inputs
}: MCPDeepLinkModalProps) {
  const { t } = useTranslation('mcp');

  // State for runtime choice dialog (Advanced Mode only)
  const [runtimeDialogState, setRuntimeDialogState] = useState<{
    isOpen: boolean;
    errorType: 'RUNTIME_NOT_FOUND' | 'RUNTIME_CHOICE_REQUIRED' | null;
    serverName: string;
    serverConfig: MCPServerConfig | null;
    metadata: {
      systemPath?: string;
      runtimeType?: 'node' | 'python';
      runtimeVersion?: string;
    };
  }>({
    isOpen: false,
    errorType: null,
    serverName: '',
    serverConfig: null,
    metadata: {}
  });

  const [isAdding, setIsAdding] = useState(false);

  // State for API Keys Modal
  const [apiKeysModalState, setApiKeysModalState] = useState<{
    isOpen: boolean;
    fields: MCPConfigField[];
  }>({
    isOpen: false,
    fields: [],
  });

  // Get MCP store to refresh active servers list
  const { connectServer, loadActiveServers, activeServers } = useMCPStore();

  // Validation hooks
  const validation = useServerValidation(config);

  const handleAddServer = async (apiKeyValues?: Record<string, string>) => {
    if (!config || !config.id) {
      toast.error(t('deep_link.toasts.invalid_config'));
      return;
    }

    // Check if server already exists
    const serverExists = activeServers.some(server => server.id === config.id);
    if (serverExists) {
      logger.mcp.warn('Server already exists, cannot add duplicate', { serverId: config.id });
      toast.error(t('deep_link.toasts.server_already_exists', { name: serverName }), {
        description: t('deep_link.toasts.server_already_exists_description'),
        duration: 5000
      });
      onOpenChange(false);
      return;
    }

    // Determine fields that need user input:
    // 1. If inputs provided in deep-link, use those
    // 2. Otherwise, auto-detect from placeholders (legacy behavior)
    let fieldsNeedingInput: MCPConfigField[];

    if (inputs && Object.keys(inputs).length > 0) {
      // Use inputs from deep-link
      fieldsNeedingInput = convertInputsToFields(inputs);
      logger.mcp.info('Using input definitions from deep link', {
        serverId: config.id,
        fieldCount: fieldsNeedingInput.length,
        fields: fieldsNeedingInput.map(f => f.key)
      });
    } else {
      // Fallback to auto-detection from placeholders
      fieldsNeedingInput = detectRequiredFields(config);
      logger.mcp.info('Auto-detected fields from placeholders', {
        serverId: config.id,
        fieldCount: fieldsNeedingInput.length,
        fields: fieldsNeedingInput.map(f => f.key)
      });
    }

    // If there are fields needing input and no values provided, open ApiKeysModal
    if (fieldsNeedingInput.length > 0 && !apiKeyValues) {
      setApiKeysModalState({
        isOpen: true,
        fields: fieldsNeedingInput,
      });
      return;
    }

    setIsAdding(true);

    try {
      const loadingToast = toast.loading(t('deep_link.toasts.adding_server', { name: serverName }));

      // Replace placeholders with actual values if provided
      const finalConfig = apiKeyValues
        ? replacePlaceholders(config, apiKeyValues)
        : (config as MCPServerConfig);

      logger.mcp.debug('Final config after placeholder replacement', {
        serverId: finalConfig.id,
        hasEnv: !!finalConfig.env,
        hasHeaders: !!finalConfig.headers,
        envKeys: finalConfig.env ? Object.keys(finalConfig.env) : []
      });

      // Step 1: Save configuration to .mcp.json
      const addResult = await window.levante.mcp.addServer(finalConfig);

      if (!addResult.success) {
        toast.dismiss(loadingToast);
        toast.error(t('deep_link.toasts.add_failed', { name: serverName }), {
          description: addResult.error || 'An unknown error occurred',
          duration: 7000
        });
        setIsAdding(false);
        return;
      }

      // Step 2: Sync store state
      await loadActiveServers();

      // Step 3: Attempt to connect (this triggers runtime checking and auto-installation)
      // Note: Always connect after adding (no "add as disabled" option - keep it simple)
      toast.dismiss(loadingToast);
      const connectingToast = toast.loading(t('deep_link.toasts.connecting_server', { name: serverName }));

      try {
        await connectServer(finalConfig);

        // Success!
        toast.dismiss(connectingToast);
        toast.success(t('deep_link.toasts.add_connect_success', { name: serverName }), {
          description: t('deep_link.toasts.add_connect_success_description'),
          duration: 5000
        });

        logger.mcp.info('MCP server added and connected via deep link', {
          serverId: finalConfig.id,
          trustLevel: validation.trustLevel
        });

        onOpenChange(false);
      } catch (connectError: any) {
        toast.dismiss(connectingToast);

        // Handle runtime-specific errors (Advanced Mode only)
        if (connectError.errorCode === 'RUNTIME_CHOICE_REQUIRED' ||
          connectError.errorCode === 'RUNTIME_NOT_FOUND') {

          logger.mcp.info('Runtime issue detected for deep link server (Advanced Mode)', {
            serverId: finalConfig.id,
            errorCode: connectError.errorCode,
            metadata: connectError.metadata
          });

          // Show runtime choice dialog
          setRuntimeDialogState({
            isOpen: true,
            errorType: connectError.errorCode,
            serverName: serverName,
            serverConfig: finalConfig,
            metadata: (connectError.metadata as any) || {}
          });

          toast.info(t('deep_link.runtime_needed'), {
            description: t('deep_link.runtime_needed_description'),
            duration: 4000
          });
        } else {
          // Other connection errors
          logger.mcp.error('Failed to connect deep link server', {
            serverId: finalConfig.id,
            error: connectError.message
          });

          toast.error(t('deep_link.toasts.add_failed_connection'), {
            description: connectError.message || t('deep_link.toasts.add_failed_connection_description'),
            duration: 7000
          });

          onOpenChange(false);
        }
      }
    } catch (error) {
      toast.error(t('deep_link.toasts.add_error'), {
        description: error instanceof Error ? error.message : 'Unknown error',
        duration: 5000
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleApiKeysSubmit = (values: Record<string, string>) => {
    logger.mcp.debug('Received API keys from modal', {
      keys: Object.keys(values)
    });

    // Close the API keys modal
    setApiKeysModalState({
      isOpen: false,
      fields: [],
    });

    // Retry adding the server with the collected values
    handleAddServer(values);
  };

  const handleRuntimeUseSystem = async () => {
    if (!runtimeDialogState.serverConfig) return;

    try {
      const toastId = toast.loading(t('deep_link.toasts.connecting_system_runtime', { name: runtimeDialogState.serverName }));

      // Modify server config to use system runtime explicitly
      const modifiedConfig = {
        ...runtimeDialogState.serverConfig,
        runtime: {
          ...runtimeDialogState.serverConfig.runtime!,
          source: 'system' as const
        }
      };

      await connectServer(modifiedConfig);

      toast.success(t('deep_link.toasts.connected_system_runtime', { name: runtimeDialogState.serverName }), {
        id: toastId
      });

      // Close both dialogs
      setRuntimeDialogState({
        isOpen: false,
        errorType: null,
        serverName: '',
        serverConfig: null,
        metadata: {}
      });
      onOpenChange(false);
    } catch (error: any) {
      logger.mcp.error('Failed to connect with system runtime', {
        error: error.message
      });
      toast.error(t('deep_link.toasts.failed_system_runtime'), {
        description: error.message
      });
    }
  };

  const handleRuntimeInstallLevante = async () => {
    if (!runtimeDialogState.serverConfig) return;

    try {
      const toastId = toast.loading(t('deep_link.toasts.installing_runtime', { name: runtimeDialogState.serverName }));

      // Install runtime via IPC
      const installResult = await window.levante.mcp.installRuntime(
        runtimeDialogState.metadata.runtimeType! as RuntimeType,
        runtimeDialogState.metadata.runtimeVersion!
      );

      if (!installResult.success) {
        throw new Error(installResult.error || 'Failed to install runtime');
      }

      // Now connect with the installed Levante runtime
      await connectServer(runtimeDialogState.serverConfig);

      toast.success(t('deep_link.toasts.runtime_installed', { name: runtimeDialogState.serverName }), {
        id: toastId
      });

      // Close both dialogs
      setRuntimeDialogState({
        isOpen: false,
        errorType: null,
        serverName: '',
        serverConfig: null,
        metadata: {}
      });
      onOpenChange(false);
    } catch (error: any) {
      logger.mcp.error('Failed to install runtime', {
        error: error.message
      });
      toast.error(t('deep_link.toasts.failed_install_runtime', { error: error.message }));
    }
  };

  const canProceed = validation.structureValid && !validation.errors.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              <Link2 className="w-5 h-5 mt-0.5 text-muted-foreground" />
              <div>
                <DialogTitle>{t('deep_link.title')}</DialogTitle>
                <DialogDescription className="mt-1">
                  {t('deep_link.description')}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Server Info */}
          {config && <ServerInfoPanel config={config} />}

          {/* JSON Preview */}
          {config && <JSONPreview config={config} />}

          <div className="text-xs text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
            <Link2 className="w-3 h-3 shrink-0" />
            <span>This server will execute with your system permissions</span>
          </div>

          {/* Source Information */}
          {sourceUrl && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <ExternalLink className="w-3 h-3" />
              <span>{t('deep_link.source')}: {sourceUrl}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-3">
          <div className="flex items-center space-x-2 mr-auto">
            {/* Checkbox removed as per Deep Link Runtime Integration plan */}
          </div>

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAdding}
          >
            {t('deep_link.cancel')}
          </Button>

          <Button
            onClick={() => handleAddServer()}
            disabled={!canProceed || isAdding}
          >
            {isAdding ? t('deep_link.adding') : t('deep_link.add_button')}
          </Button>
        </DialogFooter>
      </DialogContent>

      <RuntimeChoiceDialog
        open={runtimeDialogState.isOpen}
        onClose={() => setRuntimeDialogState({
          isOpen: false,
          errorType: null,
          serverName: '',
          serverConfig: null,
          metadata: {}
        })}
        errorType={runtimeDialogState.errorType!}
        serverName={runtimeDialogState.serverName}
        metadata={runtimeDialogState.metadata}
        onUseSystem={handleRuntimeUseSystem}
        onInstallLevante={handleRuntimeInstallLevante}
      />

      {/* API Keys Modal */}
      <ApiKeysModal
        isOpen={apiKeysModalState.isOpen}
        onClose={() => setApiKeysModalState({ isOpen: false, fields: [] })}
        onSubmit={handleApiKeysSubmit}
        serverName={serverName}
        fields={apiKeysModalState.fields}
      />
    </Dialog>
  );
}
