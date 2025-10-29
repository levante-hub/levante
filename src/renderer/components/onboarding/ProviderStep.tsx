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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, XCircle, Loader2, ExternalLink, ChevronDown, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOpenRouterOAuth } from '@/hooks/useOpenRouterOAuth';
import type { Model } from '../../../types/models';

interface ProviderStepProps {
  selectedProvider: string;
  apiKey: string;
  endpoint: string;
  validationStatus: 'idle' | 'validating' | 'valid' | 'invalid';
  validationError: string;
  availableModels: Model[];
  selectedModel: string | null;
  onProviderChange: (provider: string) => void;
  onApiKeyChange: (key: string) => void;
  onEndpointChange: (endpoint: string) => void;
  onValidate: () => void;
  onModelSelect: (modelId: string) => void;
  onOAuthSuccess?: (apiKey: string) => void;
}

const PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter (Recommended)',
    description: '100+ models with a single API key',
    requiresKey: true,
    signupUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'vercel-gateway',
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
  availableModels,
  selectedModel,
  onProviderChange,
  onApiKeyChange,
  onEndpointChange,
  onValidate,
  onModelSelect,
  onOAuthSuccess,
}: ProviderStepProps) {
  const { t } = useTranslation('wizard');
  const provider = PROVIDERS.find((p) => p.id === selectedProvider);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  // OAuth hook for OpenRouter
  const { isAuthenticating, initiateOAuthFlow } = useOpenRouterOAuth({
    onSuccess: (newApiKey) => {
      // If onOAuthSuccess is provided, use it (for onboarding with proper state handling)
      // Otherwise fall back to the old behavior (for settings page)
      if (onOAuthSuccess) {
        onOAuthSuccess(newApiKey);
      } else {
        onApiKeyChange(newApiKey);
        // Auto-validate after successful OAuth
        setTimeout(() => {
          onValidate();
        }, 500);
      }
    }
  });

  const showApiKeyField = provider?.requiresKey;
  const showEndpointField = provider?.requiresEndpoint;

  // Check if required fields are filled
  const canValidate = () => {
    if (!selectedProvider) return false;
    if (provider?.requiresKey && !apiKey) return false;
    if (provider?.requiresEndpoint && !endpoint) return false;
    return true;
  };

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
            {/* OAuth Login for OpenRouter - Primary Option */}
            {selectedProvider === 'openrouter' && showApiKeyField && (
              <div className="space-y-3">
                <Button
                  onClick={initiateOAuthFlow}
                  disabled={isAuthenticating}
                  className="w-full h-11"
                  variant="default"
                  type="button"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {isAuthenticating ? t('provider.oauth.waiting') : t('provider.oauth.sign_in')}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  {t('provider.oauth.connect_message')}
                </p>
              </div>
            )}

            {/* Divider with "o" for OpenRouter */}
            {selectedProvider === 'openrouter' && showApiKeyField && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-sm text-muted-foreground">o</span>
                </div>
              </div>
            )}

            {/* OpenRouter: Collapsible Advanced Section */}
            {selectedProvider === 'openrouter' && (
              <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between p-3 h-auto font-normal hover:bg-accent rounded-lg"
                      type="button"
                    >
                      <span className="text-sm text-muted-foreground">{t('provider.advanced')}</span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          isAdvancedOpen ? 'transform rotate-180' : ''
                        }`}
                      />
                    </Button>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="space-y-4 px-3 pb-3">
                    {/* API Key Field - Manual for OpenRouter */}
                    {showApiKeyField && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="apiKey" className="text-sm font-normal">
                            {t('provider.api_key')} (manual)
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
                          placeholder={t('provider.enter_api_key')}
                          value={apiKey}
                          onChange={(e) => onApiKeyChange(e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    )}

                    <div className="pt-2">
                      <Button
                        onClick={onValidate}
                        disabled={validationStatus === 'validating' || !canValidate()}
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
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {/* Other Providers: Direct API Key and Connection Test */}
            {selectedProvider !== 'openrouter' && (
              <>
                {/* API Key Field - Primary for non-OpenRouter */}
                {showApiKeyField && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="apiKey">{t('provider.api_key')}</Label>
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
                      placeholder={t('provider.enter_api_key')}
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

                {selectedProvider === 'vercel-gateway' && (
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
                    disabled={validationStatus === 'validating' || !canValidate()}
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
              </>
            )}

            {validationStatus === 'valid' && (
              <>
                <Alert className="border-green-500/50 bg-green-500/10 dark:bg-green-500/20 [&>svg]:top-3.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-700 dark:text-green-300">
                    {t('provider.validation_success')}
                  </AlertDescription>
                </Alert>

                {/* Model Selector */}
                {availableModels.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="model-select">
                      {t('provider.select_model')}
                    </Label>
                    <Select
                      value={selectedModel || ''}
                      onValueChange={onModelSelect}
                    >
                      <SelectTrigger id="model-select">
                        <SelectValue placeholder={t('provider.select_model_placeholder')} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[400px]">
                        {/* Search Input */}
                        <div className="sticky top-0 bg-popover p-2 border-b z-10">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder={t('provider.search_models')}
                              value={modelSearchQuery}
                              onChange={(e) => setModelSearchQuery(e.target.value)}
                              className="pl-8 h-9"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        {/* Models List */}
                        <div className="max-h-[300px] overflow-y-auto">
                          {availableModels
                            .filter((model) =>
                              model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
                              model.id.toLowerCase().includes(modelSearchQuery.toLowerCase())
                            )
                            .map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name}
                              </SelectItem>
                            ))}
                          {availableModels.filter((model) =>
                            model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
                            model.id.toLowerCase().includes(modelSearchQuery.toLowerCase())
                          ).length === 0 && (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                              {t('provider.no_models_found')}
                            </div>
                          )}
                        </div>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t('provider.can_change_later')}
                    </p>
                  </div>
                )}
              </>
            )}

            {validationStatus === 'invalid' && (
              <Alert variant="destructive" className="border-red-500/50 bg-red-500/10 dark:border-red-500/50 dark:bg-red-500/20 [&>svg]:top-3.5">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertDescription className="text-red-700 dark:text-red-300">{validationError}</AlertDescription>
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
