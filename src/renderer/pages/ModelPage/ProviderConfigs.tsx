import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useModelStore } from '@/stores/modelStore';
import type { ProviderConfig } from '../../../types/models';
import { useTranslation } from 'react-i18next';

export const OpenRouterConfig = ({ provider }: { provider: ProviderConfig }) => {
  const { t } = useTranslation('models');
  const { updateProvider, syncProviderModels, syncing } = useModelStore();
  const [apiKey, setApiKey] = React.useState(provider.apiKey || '');

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
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="openrouter-key">{t('api_key.label')}</Label>
        <div className="flex gap-2">
          <Input
            id="openrouter-key"
            type="password"
            placeholder="sk-or-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button onClick={handleSave}>{t('stats.save')}</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('api_key.optional')}{' '}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t('api_key.get_key')} <ExternalLink className="w-3 h-3 inline" />
          </a>
        </p>
      </div>

      <Button onClick={handleSync} disabled={syncing} variant="outline">
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

  // Sync local state when provider changes
  React.useEffect(() => {
    setBaseUrl(provider.baseUrl || 'http://localhost:11434');
  }, [provider.baseUrl]);

  const handleSave = async () => {
    await updateProvider(provider.id, { baseUrl });
    // Trigger sync after saving
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
        <div className="flex gap-2">
          <Input
            id="local-url"
            type="url"
            placeholder="http://localhost:11434"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <Button onClick={handleSave}>{t('stats.save')}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('base_url.help_local')}</p>
      </div>

      {provider.baseUrl && (
        <Button onClick={handleSync} disabled={syncing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {t('models.discover')}
        </Button>
      )}
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
    if (organizationId) updates.organizationId = organizationId;
    if (projectId) updates.projectId = projectId;
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
