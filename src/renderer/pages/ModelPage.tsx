import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { modelService } from '@/services/modelService';
import type { ProviderConfig, Model } from '../../types/models';

const ModelPage = () => {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProvider, setActiveProvider] = useState<ProviderConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      setLoading(true);
      await modelService.initialize();
      setProviders(modelService.getProviders());
      setActiveProvider(await modelService.getActiveProvider());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = async (providerId: string) => {
    try {
      setError(null);
      await modelService.setActiveProvider(providerId);
      const newActiveProvider = await modelService.getActiveProvider();
      setActiveProvider(newActiveProvider);
      setProviders(modelService.getProviders());
      setSuccess(`Switched to ${newActiveProvider?.name}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch provider');
    }
  };

  const handleApiKeyUpdate = async (providerId: string, apiKey: string) => {
    try {
      setError(null);
      await modelService.updateProvider(providerId, { apiKey });
      setProviders(modelService.getProviders());
      setSuccess('API key updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update API key');
    }
  };

  const handleSyncModels = async (providerId: string) => {
    try {
      setSyncing(true);
      setError(null);
      await modelService.syncProviderModels(providerId);
      setProviders(modelService.getProviders());
      setSuccess('Models synced successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync models');
    } finally {
      setSyncing(false);
    }
  };

  const handleModelToggle = async (modelId: string, selected: boolean) => {
    if (!activeProvider) return;
    
    try {
      setError(null);
      await modelService.toggleModelSelection(activeProvider.id, modelId, selected);
      
      // Force refresh by creating new object references
      const updatedProviders = JSON.parse(JSON.stringify(modelService.getProviders()));
      const updatedActiveProvider = await modelService.getActiveProvider();
      
      setProviders(updatedProviders);
      setActiveProvider(updatedActiveProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update model selection');
    }
  };

  const handleSelectAll = async () => {
    if (!activeProvider) return;
    
    try {
      setError(null);
      const selections: { [modelId: string]: boolean } = {};
      activeProvider.models.filter(m => m.isAvailable).forEach(model => {
        selections[model.id] = true;
      });
      
      await modelService.setModelSelections(activeProvider.id, selections);
      
      // Force refresh by creating new object references
      const updatedProviders = JSON.parse(JSON.stringify(modelService.getProviders()));
      const updatedActiveProvider = await modelService.getActiveProvider();
      
      setProviders(updatedProviders);
      setActiveProvider(updatedActiveProvider);
      setSuccess('All models selected');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select all models');
    }
  };

  const handleDeselectAll = async () => {
    if (!activeProvider) return;
    
    try {
      setError(null);
      const selections: { [modelId: string]: boolean } = {};
      activeProvider.models.filter(m => m.isAvailable).forEach(model => {
        selections[model.id] = false;
      });
      
      await modelService.setModelSelections(activeProvider.id, selections);
      
      // Force refresh by creating new object references
      const updatedProviders = JSON.parse(JSON.stringify(modelService.getProviders()));
      const updatedActiveProvider = await modelService.getActiveProvider();
      
      setProviders(updatedProviders);
      setActiveProvider(updatedActiveProvider);
      setSuccess('All models deselected');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deselect all models');
    }
  };

  const renderProviderConfig = (provider: ProviderConfig) => {
    switch (provider.type) {
      case 'openrouter':
        return <OpenRouterConfig provider={provider} onApiKeyUpdate={handleApiKeyUpdate} onSync={handleSyncModels} syncing={syncing} />;
      case 'vercel-gateway':
        return <GatewayConfig provider={provider} onApiKeyUpdate={handleApiKeyUpdate} onSync={handleSyncModels} syncing={syncing} />;
      case 'local':
        return <LocalConfig provider={provider} />;
      case 'cloud':
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
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-2">
          <p className="text-muted-foreground">
            Configure AI providers, manage API keys, and select models for your conversations.
          </p>
        </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Active Provider</CardTitle>
          <CardDescription>
            Select the AI provider to use for new conversations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="provider-select">Provider</Label>
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

            {activeProvider && (
              <div className="text-sm text-muted-foreground">
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
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="configuration" className="space-y-4">
        <TabsList>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="space-y-4">
          {activeProvider ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {activeProvider.name}
                      <Badge>Active</Badge>
                    </CardTitle>
                    <CardDescription>
                      {getProviderDescription(activeProvider.type)}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {renderProviderConfig(activeProvider)}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  No active provider selected. Please select a provider above.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="models" className="space-y-4">
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
                        onClick={() => handleSyncModels(activeProvider.id)}
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
                <ModelList 
                  models={activeProvider.models.filter(m => m.isAvailable)} 
                  showSelection={activeProvider.modelSource === 'dynamic'}
                  onModelToggle={handleModelToggle}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};

// Provider-specific configuration components
const OpenRouterConfig = ({ 
  provider, 
  onApiKeyUpdate, 
  onSync, 
  syncing 
}: { 
  provider: ProviderConfig; 
  onApiKeyUpdate: (id: string, key: string) => void;
  onSync: (id: string) => void;
  syncing: boolean;
}) => {
  const [apiKey, setApiKey] = useState(provider.apiKey || '');

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
          <Button onClick={() => onApiKeyUpdate(provider.id, apiKey)}>
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Get your API key from{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">
            OpenRouter Dashboard <ExternalLink className="w-3 h-3 inline" />
          </a>
        </p>
      </div>
      
      {provider.apiKey && (
        <Button onClick={() => onSync(provider.id)} disabled={syncing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Sync Models
        </Button>
      )}
    </div>
  );
};

const GatewayConfig = ({ 
  provider, 
  onApiKeyUpdate, 
  onSync, 
  syncing 
}: { 
  provider: ProviderConfig; 
  onApiKeyUpdate: (id: string, key: string) => void;
  onSync: (id: string) => void;
  syncing: boolean;
}) => {
  const [apiKey, setApiKey] = useState(provider.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl || 'https://ai-gateway.vercel.sh/v1');

  const handleSave = async () => {
    try {
      await modelService.updateProvider(provider.id, { 
        apiKey, 
        baseUrl 
      });
      // Trigger sync after saving
      if (apiKey) {
        onSync(provider.id);
      }
    } catch (error) {
      console.error('Failed to update gateway config:', error);
    }
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
        <Button onClick={() => onSync(provider.id)} disabled={syncing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Sync Models
        </Button>
      )}
    </div>
  );
};

const LocalConfig = ({ provider }: { provider: ProviderConfig }) => {
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Local provider configuration will be implemented in Phase 4.
          This will allow you to connect to Ollama, LM Studio, and other local AI services.
        </AlertDescription>
      </Alert>
    </div>
  );
};

const CloudConfig = ({ provider }: { provider: ProviderConfig }) => {
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Cloud provider management will be implemented in Phase 4.
          This will allow you to configure direct connections to OpenAI, Anthropic, Google, and other providers.
        </AlertDescription>
      </Alert>
      <div className="text-sm text-muted-foreground">
        <p>Currently using default models:</p>
        <ul className="list-disc list-inside mt-2">
          {provider.models.slice(0, 3).map(model => (
            <li key={model.id}>{model.name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const ModelList = ({ 
  models, 
  showSelection = false, 
  onModelToggle 
}: { 
  models: Model[]; 
  showSelection?: boolean;
  onModelToggle?: (modelId: string, selected: boolean) => void;
}) => {
  if (models.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No models available. Configure your provider and sync models.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {models.map((model) => (
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
              {!model.isSelected && showSelection && (
                <Badge variant="secondary" className="text-xs">
                  Hidden
                </Badge>
              )}
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
      ))}
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
    case 'cloud':
      return 'Direct cloud provider integrations';
    default:
      return '';
  }
};

export default ModelPage;