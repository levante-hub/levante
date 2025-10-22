import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProviderValidationConfig } from '../../../types/wizard';

interface ProviderStepProps {
  selectedProvider: string;
  apiKey: string;
  endpoint: string;
  validationStatus: 'idle' | 'validating' | 'valid' | 'invalid';
  validationError: string;
  onProviderChange: (provider: string) => void;
  onApiKeyChange: (key: string) => void;
  onEndpointChange: (endpoint: string) => void;
  onValidate: () => void;
}

const PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter (Recommended)',
    description: '100+ models with a single API key',
    requiresKey: false,
    signupUrl: 'https://openrouter.ai',
  },
  {
    id: 'gateway',
    name: 'Vercel AI Gateway',
    description: 'Enterprise AI routing and fallback',
    requiresKey: true,
    signupUrl: 'https://vercel.com/docs/ai',
  },
  {
    id: 'local',
    name: 'Local (Ollama, LM Studio)',
    description: 'Run models on your computer',
    requiresKey: false,
    requiresEndpoint: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-5, GPT-4.1 and more',
    requiresKey: true,
    signupUrl: 'https://platform.openai.com',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Sonnet, Haiku, Opus and more',
    requiresKey: true,
    signupUrl: 'https://console.anthropic.com',
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini models',
    requiresKey: true,
    signupUrl: 'https://makersuite.google.com/app/apikey',
  },
];

export function ProviderStep({
  selectedProvider,
  apiKey,
  endpoint,
  validationStatus,
  validationError,
  onProviderChange,
  onApiKeyChange,
  onEndpointChange,
  onValidate,
}: ProviderStepProps) {
  const { t } = useTranslation('wizard');
  const provider = PROVIDERS.find((p) => p.id === selectedProvider);

  const showApiKeyField =
    provider && (provider.requiresKey || selectedProvider === 'openrouter');
  const showEndpointField = provider?.requiresEndpoint;
  const isOptionalKey = selectedProvider === 'openrouter';

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          {t('provider.title')}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {t('provider.subtitle')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="provider">{t('provider.label')}</Label>
          <Select value={selectedProvider} onValueChange={onProviderChange}>
            <SelectTrigger id="provider">
              <SelectValue placeholder={t('provider.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedProvider && (
          <>
            {showApiKeyField && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="apiKey">
                    {t('provider.api_key')} {isOptionalKey && t('provider.optional_recommended')}
                  </Label>
                  {provider?.signupUrl && (
                    <a
                      href={provider.signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      {t('provider.get_api_key')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={
                    isOptionalKey ? t('provider.optional') : t('provider.enter_api_key')
                  }
                  value={apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            )}

            {showEndpointField && (
              <div className="space-y-2">
                <Label htmlFor="endpoint">{t('provider.endpoint')}</Label>
                <Input
                  id="endpoint"
                  type="url"
                  placeholder="http://localhost:11434"
                  value={endpoint}
                  onChange={(e) => onEndpointChange(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t('provider.endpoint_description')}
                </p>
              </div>
            )}

            {selectedProvider === 'gateway' && (
              <div className="space-y-2">
                <Label htmlFor="gateway-endpoint">{t('provider.base_url_optional')}</Label>
                <Input
                  id="gateway-endpoint"
                  type="url"
                  placeholder="https://your-gateway.vercel.app"
                  value={endpoint}
                  onChange={(e) => onEndpointChange(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            )}

            <div className="pt-2">
              <Button
                onClick={onValidate}
                disabled={validationStatus === 'validating'}
                className="w-full"
                variant={validationStatus === 'valid' ? 'default' : 'outline'}
              >
                {validationStatus === 'validating' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('provider.testing_connection')}
                  </>
                ) : validationStatus === 'valid' ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t('provider.connection_verified')}
                  </>
                ) : (
                  t('provider.test_connection')
                )}
              </Button>
            </div>

            {validationStatus === 'valid' && (
              <Alert className="border-green-500/50 bg-green-500/10 dark:bg-green-500/20">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-700 dark:text-green-300">
                  {t('provider.validation_success')}
                </AlertDescription>
              </Alert>
            )}

            {validationStatus === 'invalid' && (
              <Alert variant="destructive" className="dark:border-red-500/50 dark:bg-red-500/10">
                <XCircle className="h-4 w-4" />
                <AlertDescription className="dark:text-red-300">{validationError}</AlertDescription>
              </Alert>
            )}
          </>
        )}

        {!selectedProvider && (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            {t('provider.select_to_continue')}
          </div>
        )}
      </div>
    </div>
  );
}
