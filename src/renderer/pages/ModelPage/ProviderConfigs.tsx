import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import { useModelStore } from '@/stores/modelStore';
import { useOpenRouterOAuth } from '@/hooks/useOpenRouterOAuth';
import type { ProviderConfig } from '../../../types/models';
import { useTranslation } from 'react-i18next';

export const OpenRouterConfig = ({ provider }: { provider: ProviderConfig }) => {
  const { t } = useTranslation('models');
  const { updateProvider, syncProviderModels, syncing } = useModelStore();
  const [apiKey, setApiKey] = React.useState(provider.apiKey || '');

  // OAuth hook
  const { isAuthenticating, initiateOAuthFlow } = useOpenRouterOAuth({
    onSuccess: async (newApiKey) => {
      setApiKey(newApiKey);
      await updateProvider(provider.id, { apiKey: newApiKey });
      syncProviderModels(provider.id);
    }
  });

  // Sync local state when provider changes
  React.useEffect(() => {
    setApiKey(provider.apiKey || '');
  }, [provider.apiKey]);

  const handleSave = () => {
    updateProvider(provider.id, { apiKey });
  };

  const handleSync = () => {
    syncProviderModels(provider.id);
  };

  return (
    <div className="space-y-6">
      {/* OAuth Login - Primary Option */}
      <div className="space-y-3">
        <Button
          onClick={initiateOAuthFlow}
          disabled={isAuthenticating}
          className="w-full h-11"
          variant="default"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          {isAuthenticating ? t('oauth.waiting') : t('oauth.sign_in')}
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          {t('oauth.connect_message')}
        </p>
      </div>

      {/* Divider with "o" */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-sm text-muted-foreground">o</span>
        </div>
      </div>

      {/* Manual API Key - Secondary Option */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="openrouter-key" className="text-sm font-normal">
            {t('api_key.label')} (manual)
          </Label>
          <div className="flex gap-2">
            <Input
              id="openrouter-key"
              type="password"
              placeholder="sk-or-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono text-sm"
            />
            <Button onClick={handleSave} variant="outline">{t('stats.save')}</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground inline-flex items-center gap-1"
            >
              {t('api_key.get_key')} <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>

      {/* Sync Button */}
      <Button onClick={handleSync} disabled={syncing} variant="outline" className="w-full">
        <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
        {t('models.sync')}
      </Button>
    </div>
  );
};

export const GatewayConfig = ({ provider }: { provider: ProviderConfig }) => {
  const { t } = useTranslation('models');
  const { updateProvider, syncProviderModels, syncing } = useModelStore();
  const [apiKey, setApiKey] = React.useState(provider.apiKey || '');
  const [baseUrl, setBaseUrl] = React.useState(provider.baseUrl || 'https://ai-gateway.vercel.sh/v1');

  // Sync local state when provider changes
  React.useEffect(() => {
    setApiKey(provider.apiKey || '');
    setBaseUrl(provider.baseUrl || 'https://ai-gateway.vercel.sh/v1');
  }, [provider.apiKey, provider.baseUrl]);

  const handleSave = async () => {
    await updateProvider(provider.id, { apiKey, baseUrl });
    // Trigger sync after saving if API key is present
    if (apiKey) {
      syncProviderModels(provider.id);
    }
  };

  const handleSync = () => {
    syncProviderModels(provider.id);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="gateway-key">{t('api_key.label')}</Label>
        <div className="flex gap-2">
          <Input
            id="gateway-key"
            type="password"
            placeholder="Your gateway API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button onClick={handleSave}>{t('stats.save')}</Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gateway-url">{t('base_url.label')}</Label>
        <Input
          id="gateway-url"
          type="url"
          placeholder="https://ai-gateway.vercel.sh/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t('base_url.help_gateway')}{' '}
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t('links.vercel_dashboard')} <ExternalLink className="w-3 h-3 inline" />
          </a>
        </p>
      </div>

      {provider.apiKey && (
        <Button onClick={handleSync} disabled={syncing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {t('models.sync')}
        </Button>
      )}
    </div>
  );
};

export const LocalConfig = ({ provider }: { provider: ProviderConfig }) => {
  const { t } = useTranslation('models');
  const { updateProvider, syncProviderModels, syncing } = useModelStore();
  const [baseUrl, setBaseUrl] = React.useState(provider.baseUrl || 'http://localhost:11434');
  const [apiKey, setApiKey] = React.useState(provider.apiKey || '');

  // Sync local state when provider changes
  React.useEffect(() => {
    setBaseUrl(provider.baseUrl || 'http://localhost:11434');
    setApiKey(provider.apiKey || '');
  }, [provider.baseUrl, provider.apiKey]);

  const handleSave = async () => {
    await updateProvider(provider.id, {
      baseUrl,
      apiKey: apiKey.trim() || undefined,
    });
    if (baseUrl) {
      syncProviderModels(provider.id);
    }
  };

  const handleSync = () => {
    syncProviderModels(provider.id);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="local-url">{t('base_url.label')}</Label>
        <Input
          id="local-url"
          type="url"
          placeholder="http://localhost:11434"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('base_url.help_local')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="local-api-key">{t('api_key.label_local')}</Label>
        <Input
          id="local-api-key"
          type="password"
          placeholder={t('api_key.placeholder_local')}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">{t('api_key.help_local')}</p>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave}>{t('stats.save')}</Button>
        {provider.baseUrl && (
          <Button onClick={handleSync} disabled={syncing} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {t('models.discover')}
          </Button>
        )}
      </div>
    </div>
  );
};

export const CloudConfig = ({ provider }: { provider: ProviderConfig }) => {
  const { t } = useTranslation('models');
  const { updateProvider, syncProviderModels } = useModelStore();
  const [apiKey, setApiKey] = React.useState(provider.apiKey || '');
  const [organizationId, setOrganizationId] = React.useState(provider.organizationId || '');
  const [projectId, setProjectId] = React.useState(provider.projectId || '');

  // Sync local state when provider changes
  React.useEffect(() => {
    setApiKey(provider.apiKey || '');
    setOrganizationId(provider.organizationId || '');
    setProjectId(provider.projectId || '');
  }, [provider.apiKey, provider.organizationId, provider.projectId]);

  const handleSave = async () => {
    const updates: any = { apiKey };
    // Always include organizationId/projectId to allow clearing them
    updates.organizationId = organizationId.trim() || undefined;
    updates.projectId = projectId.trim() || undefined;
    await updateProvider(provider.id, updates);

    // Auto-sync for dynamic providers after saving API key
    if (apiKey && provider.modelSource === 'dynamic') {
      syncProviderModels(provider.id);
    }
  };

  // Provider-specific configuration
  const getProviderConfig = () => {
    switch (provider.type) {
      case 'openai':
        return {
          apiKeyLabel: 'OpenAI API Key',
          apiKeyPlaceholder: 'sk-...',
          apiKeyHelpLink: 'https://platform.openai.com/api-keys',
          apiKeyHelpText: 'Get your API key from OpenAI Platform',
          showOrganizationId: true
        };
      case 'anthropic':
        return {
          apiKeyLabel: 'Anthropic API Key',
          apiKeyPlaceholder: 'sk-ant-...',
          apiKeyHelpLink: 'https://console.anthropic.com/settings/keys',
          apiKeyHelpText: 'Get your API key from Anthropic Console',
          showProjectId: false
        };
      case 'google':
        return {
          apiKeyLabel: 'Google AI API Key',
          apiKeyPlaceholder: 'AIza...',
          apiKeyHelpLink: 'https://aistudio.google.com/app/apikey',
          apiKeyHelpText: 'Get your API key from Google AI Studio',
          showProjectId: false
        };
      case 'groq':
        return {
          apiKeyLabel: 'Groq API Key',
          apiKeyPlaceholder: 'gsk_...',
          apiKeyHelpLink: 'https://console.groq.com/keys',
          apiKeyHelpText: 'Get your API key from Groq Console',
          showProjectId: false
        };
      case 'xai':
        return {
          apiKeyLabel: 'xAI API Key',
          apiKeyPlaceholder: 'xai-...',
          apiKeyHelpLink: 'https://console.x.ai',
          apiKeyHelpText: 'Get your API key from xAI Console',
          showProjectId: false
        };
      case 'huggingface':
        return {
          apiKeyLabel: 'Hugging Face API Key',
          apiKeyPlaceholder: 'hf_...',
          apiKeyHelpLink: 'https://huggingface.co/settings/tokens',
          apiKeyHelpText: 'Get your API key from Hugging Face Settings',
          showProjectId: false
        };
      default:
        return {
          apiKeyLabel: 'API Key',
          apiKeyPlaceholder: 'Enter API key...',
          apiKeyHelpLink: '#',
          apiKeyHelpText: 'Configure your API key',
          showProjectId: false
        };
    }
  };

  const config = getProviderConfig();

  return (
    <div className="space-y-4">
      {/* API Key */}
      <div className="space-y-2">
        <Label htmlFor={`${provider.id}-api-key`}>{config.apiKeyLabel}</Label>
        <div className="flex gap-2">
          <Input
            id={`${provider.id}-api-key`}
            type="password"
            placeholder={config.apiKeyPlaceholder}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button onClick={handleSave}>{t('stats.save')}</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {config.apiKeyHelpText}.{' '}
          <a
            href={config.apiKeyHelpLink}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t('api_key.get_key')} <ExternalLink className="w-3 h-3 inline" />
          </a>
        </p>
      </div>

      {/* Organization ID (OpenAI only) */}
      {config.showOrganizationId && (
        <div className="space-y-2">
          <Label htmlFor={`${provider.id}-org-id`}>{t('organization_id.label')}</Label>
          <Input
            id={`${provider.id}-org-id`}
            type="text"
            placeholder="org-..."
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('organization_id.description')}</p>
        </div>
      )}
    </div>
  );
};

const SUBSCRIPTION_OAUTH_UI: Record<
  'anthropic' | 'openai',
  {
    oauthButtonLabel: string;
    oauthDescription: string;
    apiKeyLabel: string;
    apiKeyPlaceholder: string;
    apiKeyHelpUrl: string;
    apiKeyHelpText: string;
    extraFields?: Array<{
      key: keyof ProviderConfig;
      label: string;
      placeholder: string;
      description: string;
    }>;
  }
> = {
  anthropic: {
    oauthButtonLabel: 'Claude Max/Pro',
    oauthDescription:
      'Connect your Claude Max or Claude Pro subscription to use it without an API key.',
    apiKeyLabel: 'Anthropic API Key',
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyHelpText: 'Get your API key from Anthropic Console',
  },
  openai: {
    oauthButtonLabel: 'ChatGPT Plus/Pro',
    oauthDescription:
      'Connect your ChatGPT Plus or Pro subscription to use OpenAI models without an API key.',
    apiKeyLabel: 'OpenAI API Key',
    apiKeyPlaceholder: 'sk-...',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    apiKeyHelpText: 'Get your API key from OpenAI Platform',
    extraFields: [
      {
        key: 'organizationId',
        label: 'Organization ID (optional)',
        placeholder: 'org-...',
        description: 'Only needed for organization-scoped access.',
      },
    ],
  },
};

export const SubscriptionOAuthConfig = ({ provider }: { provider: ProviderConfig }) => {
  if (provider.type !== 'anthropic' && provider.type !== 'openai') {
    return <CloudConfig provider={provider} />;
  }

  const ui = SUBSCRIPTION_OAUTH_UI[provider.type];
  const { updateProvider, syncProviderModels } = useModelStore();

  const [authMode, setAuthMode] = React.useState<'api-key' | 'oauth'>(
    (provider.authMode as 'api-key' | 'oauth') || 'api-key'
  );
  const [apiKey, setApiKey] = React.useState(provider.apiKey || '');
  const [extraFieldValues, setExtraFieldValues] = React.useState<Record<string, string>>({});
  const [oauthCode, setOauthCode] = React.useState('');
  const [oauthStatus, setOauthStatus] = React.useState<{
    isConnected: boolean;
    isExpired: boolean;
    expiresAt?: number;
  } | null>(null);
  const [oauthLoading, setOauthLoading] = React.useState(false);
  const [oauthError, setOauthError] = React.useState('');

  React.useEffect(() => {
    setAuthMode((provider.authMode as 'api-key' | 'oauth') || 'api-key');
    setApiKey(provider.apiKey || '');
  }, [provider.authMode, provider.apiKey]);

  React.useEffect(() => {
    const values: Record<string, string> = {};
    for (const field of ui.extraFields || []) {
      values[field.key as string] = String((provider as any)[field.key] || '');
    }
    setExtraFieldValues(values);
  }, [provider.id, provider.organizationId, provider.projectId, ui.extraFields]);

  React.useEffect(() => {
    if (authMode === 'oauth') {
      window.levante.subscriptionOAuth.status(provider.type).then((result) => {
        if (result.success && result.data) {
          setOauthStatus(result.data);
        }
      });
    }
  }, [authMode, provider.type]);

  // Listen for automatic callback completion (local server captured the code)
  React.useEffect(() => {
    const unsubscribe = window.levante.subscriptionOAuth.onCallback(async (data) => {
      if (data.providerId !== provider.type) return;
      if (data.success) {
        setOauthLoading(false);
        setOauthCode('');
        const statusResult = await window.levante.subscriptionOAuth.status(provider.type);
        if (statusResult.success && statusResult.data) {
          setOauthStatus(statusResult.data);
        }
        await updateProvider(provider.id, { authMode: 'oauth', apiKey: undefined });
        syncProviderModels(provider.id);
      } else {
        setOauthLoading(false);
        setOauthError(data.error || 'Callback failed');
      }
    });
    return unsubscribe;
  }, [provider.type, provider.id, updateProvider, syncProviderModels]);

  const handleSaveApiKey = async () => {
    const updates: Partial<ProviderConfig> = {
      apiKey,
      authMode: 'api-key',
    };

    for (const field of ui.extraFields || []) {
      (updates as any)[field.key] = extraFieldValues[field.key as string]?.trim() || undefined;
    }

    await updateProvider(provider.id, updates);

    if (apiKey && provider.modelSource === 'dynamic') {
      syncProviderModels(provider.id);
    }
  };

  const handleSwitchMode = async (mode: 'api-key' | 'oauth') => {
    setAuthMode(mode);
    setOauthError('');

    if (mode === 'api-key') {
      setOauthStatus(null);
      await updateProvider(provider.id, { authMode: 'api-key' });
      return;
    }

    await updateProvider(provider.id, { authMode: 'oauth', apiKey: undefined });
    const result = await window.levante.subscriptionOAuth.status(provider.type);
    if (result.success && result.data) {
      setOauthStatus(result.data);
    }
  };

  const handleStartOAuth = async () => {
    setOauthLoading(true);
    setOauthError('');

    const result = await window.levante.subscriptionOAuth.start(provider.type);

    setOauthLoading(false);
    if (!result.success) {
      setOauthError(result.error || 'Failed to start authorization');
    }
  };

  const handleExchangeCode = async () => {
    if (!oauthCode.trim()) {
      return;
    }

    setOauthLoading(true);
    setOauthError('');

    const result = await window.levante.subscriptionOAuth.exchange(
      provider.type,
      oauthCode.trim()
    );

    setOauthLoading(false);

    if (!result.success) {
      setOauthError(result.error || 'Failed to exchange code');
      return;
    }

    setOauthCode('');

    const statusResult = await window.levante.subscriptionOAuth.status(provider.type);
    if (statusResult.success && statusResult.data) {
      setOauthStatus(statusResult.data);
    }

    await updateProvider(provider.id, { authMode: 'oauth', apiKey: undefined });
    syncProviderModels(provider.id);
  };

  const handleDisconnect = async () => {
    setOauthLoading(true);
    setOauthError('');

    await window.levante.subscriptionOAuth.disconnect(provider.type);

    setOauthStatus(null);
    setOauthLoading(false);
    await updateProvider(provider.id, { authMode: 'api-key', apiKey: undefined });
    setAuthMode('api-key');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Authentication Method</Label>
        <div className="flex gap-2">
          <Button
            variant={authMode === 'api-key' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSwitchMode('api-key')}
          >
            API Key
          </Button>
          <Button
            variant={authMode === 'oauth' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSwitchMode('oauth')}
          >
            {ui.oauthButtonLabel}
          </Button>
        </div>
      </div>

      {authMode === 'api-key' ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${provider.id}-api-key`}>{ui.apiKeyLabel}</Label>
            <div className="flex gap-2">
              <Input
                id={`${provider.id}-api-key`}
                type="password"
                placeholder={ui.apiKeyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button onClick={handleSaveApiKey}>Save</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {ui.apiKeyHelpText}.{' '}
              <a
                href={ui.apiKeyHelpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Get API key <ExternalLink className="w-3 h-3 inline" />
              </a>
            </p>
          </div>

          {(ui.extraFields || []).map((field) => (
            <div key={String(field.key)} className="space-y-2">
              <Label htmlFor={`${provider.id}-${String(field.key)}`}>{field.label}</Label>
              <Input
                id={`${provider.id}-${String(field.key)}`}
                type="text"
                placeholder={field.placeholder}
                value={extraFieldValues[String(field.key)] || ''}
                onChange={(e) =>
                  setExtraFieldValues((prev) => ({
                    ...prev,
                    [String(field.key)]: e.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">{field.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {oauthStatus?.isConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-600 font-medium">Connected</span>
                {oauthStatus.isExpired ? (
                  <span className="text-amber-600 text-xs">(token expired)</span>
                ) : null}
              </div>

              {oauthStatus.expiresAt ? (
                <p className="text-xs text-muted-foreground">
                  Expires: {new Date(oauthStatus.expiresAt).toLocaleString()}
                </p>
              ) : null}

              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={oauthLoading}
              >
                {oauthLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{ui.oauthDescription}</p>
              <Button
                onClick={handleStartOAuth}
                disabled={oauthLoading}
                className="w-full"
              >
                {oauthLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Connect {ui.oauthButtonLabel}
              </Button>

              <div className="space-y-2">
                <Label>Paste the authorization code or URL from the browser</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Paste code, URL or query string..."
                    value={oauthCode}
                    onChange={(e) => setOauthCode(e.target.value)}
                  />
                  <Button
                    onClick={handleExchangeCode}
                    disabled={oauthLoading || !oauthCode.trim()}
                  >
                    {oauthLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Connect'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {oauthError ? <p className="text-xs text-red-500">{oauthError}</p> : null}
        </div>
      )}
    </div>
  );
};

export const AnthropicConfig = SubscriptionOAuthConfig;
