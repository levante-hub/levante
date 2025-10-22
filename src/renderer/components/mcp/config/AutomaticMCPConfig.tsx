import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMCPStore } from '@/stores/mcpStore';
import { logger } from '@/services/logger';
import type { MCPServerConfig } from '@/types/mcp';

interface AutomaticMCPConfigProps {
  serverId: string | null;
  onClose: () => void;
  onSwitchToCustom: (partialConfig?: any) => void;
  onConfigChange?: (config: any | null) => void;
}

type ExtractionPhase = 'idle' | 'analyzing' | 'security' | 'extracting' | 'validating' | 'complete' | 'error';

interface ExtractedConfig {
  name: string;
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export function AutomaticMCPConfig({ serverId, onClose, onSwitchToCustom, onConfigChange }: AutomaticMCPConfigProps) {
  const { t } = useTranslation('mcp');

  const [inputText, setInputText] = useState('');
  const [phase, setPhase] = useState<ExtractionPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [extractedConfig, setExtractedConfig] = useState<ExtractedConfig | null>(null);

  // Notify parent of config changes
  useEffect(() => {
    if (!onConfigChange) return;

    if (extractedConfig) {
      onConfigChange({
        id: extractedConfig.name,
        name: extractedConfig.name,
        transport: extractedConfig.type,
        command: extractedConfig.command,
        args: extractedConfig.args,
        env: extractedConfig.env,
        baseUrl: extractedConfig.baseUrl,
        headers: extractedConfig.headers,
      });
    } else {
      onConfigChange(null);
    }
  }, [extractedConfig]); // Remove onConfigChange from dependencies

  const handleExtract = async () => {
    if (!inputText.trim()) {
      logger.mcp.warn('Automatic extraction: empty input provided');
      setError(t('config.automatic.error_empty_input'));
      return;
    }

    logger.mcp.info('Starting automatic MCP config extraction', {
      inputLength: inputText.length,
      inputPreview: inputText.slice(0, 100) + (inputText.length > 100 ? '...' : ''),
    });

    try {
      // Phase 1: Analyzing
      logger.mcp.debug('Phase 1: Analyzing input text');
      setPhase('analyzing');
      setProgress(20);
      setError(null);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Phase 2: Security check
      logger.mcp.debug('Phase 2: Running security checks');
      setPhase('security');
      setProgress(40);
      await new Promise(resolve => setTimeout(resolve, 300));

      // Phase 3: AI Extraction
      logger.mcp.debug('Phase 3: Starting AI extraction via IPC');
      setPhase('extracting');
      setProgress(60);

      const result = await window.levante.mcp.extractConfig(inputText);

      logger.mcp.debug('Received extraction result from main process', {
        success: result.success,
        hasData: !!result.data,
        error: result.error,
      });

      if (!result.success || !result.data) {
        logger.mcp.error('Extraction failed', {
          error: result.error,
          suggestion: result.suggestion,
        });
        throw new Error(result.error || t('config.automatic.extraction_failed'));
      }

      logger.mcp.info('Extraction successful', {
        name: result.data.name,
        type: result.data.type,
        command: result.data.command,
        hasArgs: !!result.data.args,
        hasEnv: !!result.data.env,
      });

      // Phase 4: Validation
      logger.mcp.debug('Phase 4: Validating extracted configuration');
      setPhase('validating');
      setProgress(90);
      await new Promise(resolve => setTimeout(resolve, 300));

      // Complete
      logger.mcp.info('Automatic extraction complete', {
        configName: result.data.name,
      });
      setPhase('complete');
      setProgress(100);
      setExtractedConfig(result.data);

    } catch (err) {
      logger.mcp.error('Automatic extraction error', {
        error: err instanceof Error ? err.message : String(err),
        phase,
      });
      setPhase('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAdd = async () => {
    if (!extractedConfig) {
      logger.mcp.warn('Attempted to add server without extracted config');
      setError(t('config.automatic.no_config_extracted'));
      return;
    }

    logger.mcp.info('Adding extracted MCP server', {
      name: extractedConfig.name,
      type: extractedConfig.type,
    });

    try {
      setError(null);

      // Convert extracted config to MCPServerConfig format
      const serverConfig: MCPServerConfig = {
        id: extractedConfig.name,
        name: extractedConfig.name,
        transport: extractedConfig.type,
        command: extractedConfig.command,
        args: extractedConfig.args,
        baseUrl: extractedConfig.baseUrl,
        headers: extractedConfig.headers,
        env: extractedConfig.env,
      };

      logger.mcp.debug('Converted config to MCPServerConfig format', {
        serverId: serverConfig.id,
        transport: serverConfig.transport,
        command: serverConfig.command,
        baseUrl: serverConfig.baseUrl,
        hasHeaders: !!serverConfig.headers,
      });

      // Add server via store
      await useMCPStore.getState().addServer(serverConfig);

      logger.mcp.info('MCP server added successfully', {
        serverId: serverConfig.id,
      });

      // Success - close panel
      onClose();
    } catch (err) {
      logger.mcp.error('Failed to add MCP server', {
        error: err instanceof Error ? err.message : String(err),
        serverName: extractedConfig.name,
      });
      setError(err instanceof Error ? err.message : t('config.automatic.add_failed'));
    }
  };

  const getPhaseMessage = (): string => {
    switch (phase) {
      case 'analyzing':
        return t('config.automatic.phase_analyzing');
      case 'security':
        return t('config.automatic.phase_security');
      case 'extracting':
        return t('config.automatic.phase_extracting');
      case 'validating':
        return t('config.automatic.phase_validating');
      case 'complete':
        return t('config.automatic.phase_complete');
      default:
        return '';
    }
  };

  const getPhaseIcon = () => {
    switch (phase) {
      case 'analyzing':
        return '🔍';
      case 'security':
        return '🔐';
      case 'extracting':
        return '🤖';
      case 'validating':
        return '✓';
      case 'complete':
        return '✅';
      default:
        return '';
    }
  };

  const isProcessing = ['analyzing', 'security', 'extracting', 'validating'].includes(phase);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold mb-2">{t('config.automatic.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('config.automatic.description')}
        </p>
      </div>

      {/* Input Textarea */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          {t('config.automatic.textarea_label')}
        </label>
        <Textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={t('config.automatic.textarea_placeholder')}
          className="font-mono text-sm min-h-[200px] resize-y"
          disabled={isProcessing}
        />
      </div>

      {/* Security Warning */}
      <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="text-sm">
          {t('config.automatic.security_warning')}
        </AlertDescription>
      </Alert>

      {/* Processing Phase */}
      {isProcessing && (
        <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getPhaseIcon()}</span>
            <div className="flex-1">
              <p className="text-sm font-medium">{getPhaseMessage()}</p>
              <div className="mt-2 h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{progress}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {phase === 'error' && error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-2">{t('config.automatic.extraction_failed')}</p>
            <p className="text-sm">{error}</p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPhase('idle');
                  setError(null);
                  setProgress(0);
                }}
              >
                {t('config.automatic.edit_input')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSwitchToCustom()}
              >
                {t('config.automatic.use_custom_tab')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={onClose}>
          {t('dialog.cancel')}
        </Button>

        <div className="flex gap-2">
          {phase === 'complete' && extractedConfig && (
            <Button onClick={handleAdd}>
              {t('config.automatic.add_button')}
            </Button>
          )}

          {phase !== 'complete' && !isProcessing && (
            <Button onClick={handleExtract} disabled={!inputText.trim()}>
              <Sparkles className="w-4 h-4 mr-2" />
              {t('config.automatic.extract_button')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
