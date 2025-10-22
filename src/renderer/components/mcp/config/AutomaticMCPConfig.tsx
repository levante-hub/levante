import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AutomaticMCPConfigProps {
  serverId: string | null;
  onClose: () => void;
  onSwitchToCustom: (partialConfig?: any) => void;
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

export function AutomaticMCPConfig({ serverId, onClose, onSwitchToCustom }: AutomaticMCPConfigProps) {
  const { t } = useTranslation('mcp');

  const [inputText, setInputText] = useState('');
  const [phase, setPhase] = useState<ExtractionPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [extractedConfig, setExtractedConfig] = useState<ExtractedConfig | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleExtract = async () => {
    if (!inputText.trim()) {
      setError(t('config.automatic.error_empty_input'));
      return;
    }

    try {
      // Phase 1: Analyzing
      setPhase('analyzing');
      setProgress(20);
      setError(null);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Phase 2: Security check
      setPhase('security');
      setProgress(40);
      await new Promise(resolve => setTimeout(resolve, 300));

      // Phase 3: AI Extraction
      setPhase('extracting');
      setProgress(60);

      // TODO: Implement IPC handler for extraction
      // const result = await window.levante.mcp.extractConfig(inputText);
      const result = { success: false, error: 'Not implemented yet' };

      if (!result.success || !result.data) {
        throw new Error(result.error || t('config.automatic.extraction_failed'));
      }

      // Phase 4: Validation
      setPhase('validating');
      setProgress(90);
      await new Promise(resolve => setTimeout(resolve, 300));

      // Complete
      setPhase('complete');
      setProgress(100);
      setExtractedConfig(result.data);
      setShowPreview(true);

    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAdd = async () => {
    if (!extractedConfig) return;

    try {
      // TODO: Add server using extracted config
      // await useMCPStore.getState().addServer(...)
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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

      {/* Preview (Collapsed by default) */}
      {phase === 'complete' && extractedConfig && (
        <div className="space-y-3 border rounded-lg p-4">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 text-sm font-medium w-full text-left hover:text-primary transition-colors"
          >
            <span>{showPreview ? '▾' : '▸'}</span>
            {t('config.automatic.preview_title')}
          </button>

          {showPreview && (
            <div className="space-y-3 pt-3 border-t">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t('config.automatic.preview_name')}
                </p>
                <p className="text-sm font-mono">{extractedConfig.name}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t('config.automatic.preview_command')}
                </p>
                <p className="text-sm font-mono">
                  {extractedConfig.command} {extractedConfig.args?.join(' ')}
                </p>
              </div>

              {extractedConfig.env && Object.keys(extractedConfig.env).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t('config.automatic.preview_env')}
                  </p>
                  <pre className="text-xs font-mono bg-muted p-2 rounded">
                    {JSON.stringify(extractedConfig.env, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
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
