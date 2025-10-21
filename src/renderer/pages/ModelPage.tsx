import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { useModelStore } from '@/stores/modelStore';
import type { ProviderConfig, Model } from '../../types/models';

const ModelPage = () => {
  const {
    providers,
    activeProvider,
    loading,
    syncing,
    error,
    success,
    initialize,
    setActiveProvider,
    updateProvider,
    syncProviderModels,
    toggleModelSelection,
    setModelSelections,
    clearMessages
  } = useModelStore();

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleProviderChange = (providerId: string) => {
    clearMessages();
    setActiveProvider(providerId);
  };

  const handleModelToggle = (modelId: string, selected: boolean) => {
    if (!activeProvider) return;
    toggleModelSelection(activeProvider.id, modelId, selected);
  };

  const handleSelectAll = () => {
    if (!activeProvider) return;

    const selections: { [modelId: string]: boolean } = {};
    activeProvider.models.filter(m => m.isAvailable).forEach(model => {
      selections[model.id] = true;
    });

    setModelSelections(activeProvider.id, selections);
  };

  const handleDeselectAll = () => {
    if (!activeProvider) return;

    const selections: { [modelId: string]: boolean } = {};
    activeProvider.models.filter(m => m.isAvailable).forEach(model => {
      selections[model.id] = false;
    });

    setModelSelections(activeProvider.id, selections);
  };

  const renderProviderConfig = (provider: ProviderConfig) => {
    switch (provider.type) {
      case 'openrouter':
        return <OpenRouterConfig provider={provider} />;
      case 'vercel-gateway':
        return <GatewayConfig provider={provider} />;
      case 'local':
        return <LocalConfig provider={provider} />;
      case 'openai':
      case 'anthropic':
      case 'google':
      case 'groq':
      case 'xai':
        return <CloudConfig provider={provider} />;
      default:
        return <div>Unknown provider type</div>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6 px-4">

        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Provider Selection & Configuration Section */}
        <Card>
          <CardHeader className='pb-4'>
            <CardTitle>Provider Configuration</CardTitle>
            <CardDescription>
              Select and configure your AI provider
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Provider Selector */}
            <div className="space-y-2">
              <Label htmlFor="provider-select">Active Provider</Label>
              <Select value={activeProvider?.id || ''} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-2">
                        <span>{provider.name}</span>
                        {provider.apiKey && <Badge variant="secondary" className="text-xs">Configured</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Provider-specific configuration */}
            {activeProvider ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Badge>Active</Badge>
                  <span className="text-sm font-medium">{activeProvider.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {getProviderDescription(activeProvider.type)}
                  </span>
                </div>
                {renderProviderConfig(activeProvider)}

                {/* Provider stats */}
                <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t">
                  <p>
                    <strong>Models available:</strong> {activeProvider.models.filter(m => m.isAvailable).length}
                  </p>
                  <p>
                    <strong>Model source:</strong> {activeProvider.modelSource === 'dynamic' ? 'Fetched automatically' : 'User-defined'}
                  </p>
                  {activeProvider.lastModelSync && (
                    <p>
                      <strong>Last sync:</strong> {new Date(activeProvider.lastModelSync).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Please select a provider above to configure
              </div>
            )}
          </CardContent>
        </Card>

        {/* Models Section */}
        {activeProvider && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Available Models</CardTitle>
                  <CardDescription>
                    Models from {activeProvider.name}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {activeProvider.modelSource === 'dynamic' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAll}
                        disabled={syncing}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDeselectAll}
                        disabled={syncing}
                      >
                        Deselect All
                      </Button>
                    </>
                  )}
                  {activeProvider.modelSource === 'dynamic' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncProviderModels(activeProvider.id)}
                      disabled={syncing}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                      Sync Models
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activeProvider.models.filter(m => m.isAvailable).length === 0 ? (
                <div className="text-center py-12">
                  <div className="mb-4">
                    <RefreshCw className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No models available</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {activeProvider.modelSource === 'dynamic'
                      ? activeProvider.apiKey
                        ? 'Click "Sync Models" to load available models from the provider.'
                        : 'Configure your API key above to sync models.'
                      : 'This provider uses user-defined models. Add models manually.'}
                  </p>
                  {activeProvider.modelSource === 'dynamic' && activeProvider.apiKey && (
                    <Button
                      onClick={() => syncProviderModels(activeProvider.id)}
                      disabled={syncing}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                      Sync Models Now
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {activeProvider.modelSource === 'dynamic' && (
                    <div className="mb-4 p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between text-sm">
                        <span>
                          Selected: {activeProvider.models.filter(m => m.isAvailable && m.isSelected !== false).length}
                          {' of '}
                          {activeProvider.models.filter(m => m.isAvailable).length} models
                        </span>
                        <span className="text-muted-foreground">
                          Only selected models appear in chat
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Search input */}
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search models by name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <ModelList
                    models={activeProvider.models.filter(m => m.isAvailable)}
                    showSelection={activeProvider.modelSource === 'dynamic'}
                    onModelToggle={handleModelToggle}
                    searchQuery={searchQuery}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

// Provider-specific configuration components
const OpenRouterConfig = ({ provider }: { provider: ProviderConfig }) => {
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
        <Label htmlFor="openrouter-key">API Key</Label>
        <div className="flex gap-2">
          <Input
            id="openrouter-key"
            type="password"
            placeholder="sk-or-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button onClick={handleSave}>
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          API key is optional for model listing but required for inference.{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">
            Get your key <ExternalLink className="w-3 h-3 inline" />
          </a>
        </p>
      </div>

      <Button onClick={handleSync} disabled={syncing} variant="outline">
        <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
        Sync Models
      </Button>
    </div>
  );
};

const GatewayConfig = ({ provider }: { provider: ProviderConfig }) => {
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
        <Label htmlFor="gateway-key">AI Gateway API Key</Label>
        <div className="flex gap-2">
          <Input
            id="gateway-key"
            type="password"
            placeholder="Your gateway API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gateway-url">Base URL</Label>
        <Input
          id="gateway-url"
          type="url"
          placeholder="https://ai-gateway.vercel.sh/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Configure your Vercel AI Gateway at{' '}
          <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline">
            Vercel Dashboard <ExternalLink className="w-3 h-3 inline" />
          </a>
        </p>
      </div>

      {provider.apiKey && (
        <Button onClick={handleSync} disabled={syncing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Sync Models
        </Button>
      )}
    </div>
  );
};

const LocalConfig = ({ provider }: { provider: ProviderConfig }) => {
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
        <Label htmlFor="local-url">Base URL</Label>
        <div className="flex gap-2">
          <Input
            id="local-url"
            type="url"
            placeholder="http://localhost:11434"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <Button onClick={handleSave}>
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Default ports: Ollama (11434), LM Studio (1234), LocalAI (8080)
        </p>
      </div>

      {provider.baseUrl && (
        <Button onClick={handleSync} disabled={syncing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Discover Models
        </Button>
      )}
    </div>
  );
};

const CloudConfig = ({ provider }: { provider: ProviderConfig }) => {
  const { updateProvider, syncProviderModels, syncing } = useModelStore();
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

  const handleSync = () => {
    syncProviderModels(provider.id);
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
          showOrganizationId: true,
        };
      case 'anthropic':
        return {
          apiKeyLabel: 'Anthropic API Key',
          apiKeyPlaceholder: 'sk-ant-...',
          apiKeyHelpLink: 'https://console.anthropic.com/settings/keys',
          apiKeyHelpText: 'Get your API key from Anthropic Console',
          showProjectId: false,
        };
      case 'google':
        return {
          apiKeyLabel: 'Google AI API Key',
          apiKeyPlaceholder: 'AIza...',
          apiKeyHelpLink: 'https://aistudio.google.com/app/apikey',
          apiKeyHelpText: 'Get your API key from Google AI Studio',
          showProjectId: false,
        };
      case 'groq':
        return {
          apiKeyLabel: 'Groq API Key',
          apiKeyPlaceholder: 'gsk_...',
          apiKeyHelpLink: 'https://console.groq.com/keys',
          apiKeyHelpText: 'Get your API key from Groq Console',
          showProjectId: false,
        };
      case 'xai':
        return {
          apiKeyLabel: 'xAI API Key',
          apiKeyPlaceholder: 'xai-...',
          apiKeyHelpLink: 'https://console.x.ai',
          apiKeyHelpText: 'Get your API key from xAI Console',
          showProjectId: false,
        };
      default:
        return {
          apiKeyLabel: 'API Key',
          apiKeyPlaceholder: 'Enter API key...',
          apiKeyHelpLink: '#',
          apiKeyHelpText: 'Configure your API key',
          showProjectId: false,
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
          <Button onClick={handleSave}>Save</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {config.apiKeyHelpText}.{' '}
          <a
            href={config.apiKeyHelpLink}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Get your key <ExternalLink className="w-3 h-3 inline" />
          </a>
        </p>
      </div>

      {/* Organization ID (OpenAI only) */}
      {config.showOrganizationId && (
        <div className="space-y-2">
          <Label htmlFor={`${provider.id}-org-id`}>Organization ID (Optional)</Label>
          <Input
            id={`${provider.id}-org-id`}
            type="text"
            placeholder="org-..."
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            For users in multiple organizations
          </p>
        </div>
      )}

    </div>
  );
};

const ModelList = ({
  models,
  showSelection = false,
  onModelToggle,
  searchQuery = ''
}: {
  models: Model[];
  showSelection?: boolean;
  onModelToggle?: (modelId: string, selected: boolean) => void;
  searchQuery?: string;
}) => {
  if (models.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No models available. Configure your provider and sync models.
      </div>
    );
  }

  // Filter models based on search query
  const filteredModels = searchQuery
    ? models.filter(m =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : models;

  // Show no results message if search returns nothing
  if (searchQuery && filteredModels.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No models found matching "{searchQuery}"
      </div>
    );
  }

  // Separate selected and unselected models
  const selectedModels = filteredModels.filter(m => m.isSelected !== false);
  const unselectedModels = filteredModels.filter(m => m.isSelected === false);

  const renderModel = (model: Model) => (
    <div key={model.id} className="border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          {showSelection && onModelToggle && (
            <input
              type="checkbox"
              checked={model.isSelected ?? true}
              onChange={(e) => onModelToggle(model.id, e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
          )}
          <h4 className="font-medium">{model.name}</h4>
        </div>
        <div className="flex gap-2">
          {model.capabilities.map(cap => (
            <Badge key={cap} variant="outline" className="text-xs">
              {cap}
            </Badge>
          ))}
        </div>
      </div>
      <div className="text-sm text-muted-foreground space-y-1">
        <p>Context Length: {model.contextLength.toLocaleString()} tokens</p>
        {model.pricing && (
          <p>
            Pricing: ${model.pricing.input}/M input, ${model.pricing.output}/M output
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Selected models section */}
      {selectedModels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Selected Models ({selectedModels.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              These models appear in chat
            </p>
          </div>
          <div className="grid gap-3">
            {selectedModels.map(renderModel)}
          </div>
        </div>
      )}

      {/* Unselected models section */}
      {unselectedModels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Available Models ({unselectedModels.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Select to use in chat
            </p>
          </div>
          <div className="grid gap-3 opacity-60">
            {unselectedModels.map(renderModel)}
          </div>
        </div>
      )}
    </div>
  );
};

const getProviderDescription = (type: ProviderConfig['type']) => {
  switch (type) {
    case 'openrouter':
      return 'Access to 100+ AI models through OpenRouter API';
    case 'vercel-gateway':
      return 'Vercel AI Gateway for unified model access';
    case 'local':
      return 'Local AI models (Ollama, LM Studio, etc.)';
    case 'openai':
      return 'Direct integration with OpenAI GPT models';
    case 'anthropic':
      return 'Direct integration with Anthropic Claude models';
    case 'google':
      return 'Direct integration with Google Gemini models';
    case 'groq':
      return 'Ultra-fast inference with Groq LPU™ Inference Engine';
    case 'xai':
      return 'Access to Grok models from xAI';
    default:
      return '';
  }
};

export default ModelPage;