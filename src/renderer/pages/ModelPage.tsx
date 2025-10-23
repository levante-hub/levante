import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, RefreshCw, Search } from 'lucide-react';
import { useModelStore } from '@/stores/modelStore';
import type { ProviderConfig } from '../../types/models';
import { useTranslation } from 'react-i18next';
import { OpenRouterConfig, GatewayConfig, LocalConfig, CloudConfig } from './ModelPage/ProviderConfigs';
import { ModelList } from './ModelPage/ModelList';

const ModelPage = () => {
  const { t } = useTranslation('models');
  const {
    providers,
    activeProvider,
    loading,
    syncing,
    error,
    success,
    initialize,
    setActiveProvider,
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
    activeProvider.models.filter((m) => m.isAvailable).forEach((model) => {
      selections[model.id] = true;
    });

    setModelSelections(activeProvider.id, selections);
  };

  const handleDeselectAll = () => {
    if (!activeProvider) return;

    const selections: { [modelId: string]: boolean } = {};
    activeProvider.models.filter((m) => m.isAvailable).forEach((model) => {
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
        <Card className="border-none">
          <CardHeader className="pb-4">
            <CardTitle>{t('provider_config.title')}</CardTitle>
            <CardDescription>{t('provider_config.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Provider Selector */}
            <div className="space-y-2">
              <Label htmlFor="provider-select">{t('provider_config.active_provider')}</Label>
              <Select value={activeProvider?.id || ''} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('provider_config.select_provider')} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-2">
                        <span>{provider.name}</span>
                        {provider.apiKey && (
                          <Badge variant="secondary" className="text-xs">
                            {t('provider_config.configured')}
                          </Badge>
                        )}
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
                  <Badge>{t('stats.active')}</Badge>
                  <span className="text-sm font-medium">{activeProvider.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {t(`provider_types.${activeProvider.type.replace('-', '_')}`)}
                  </span>
                </div>
                {renderProviderConfig(activeProvider)}

                {/* Provider stats */}
                <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t">
                  <p>
                    <strong>
                      {t('stats.available', {
                        count: activeProvider.models.filter((m) => m.isAvailable).length
                      })}
                    </strong>
                  </p>
                  <p>
                    <strong>
                      {t('stats.source', {
                        source:
                          activeProvider.modelSource === 'dynamic'
                            ? t('stats.source_dynamic')
                            : t('stats.source_user')
                      })}
                    </strong>
                  </p>
                  {activeProvider.lastModelSync && (
                    <p>
                      <strong>
                        {t('stats.last_sync', {
                          date: new Date(activeProvider.lastModelSync).toLocaleString()
                        })}
                      </strong>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t('stats.select_message')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Models Section */}
        {activeProvider && (
          <Card className="border-none">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('models.title')}</CardTitle>
                  <CardDescription>
                    {t('models.from', { provider: activeProvider.name })}
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
                        {t('models.select_all')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDeselectAll}
                        disabled={syncing}
                      >
                        {t('models.deselect_all')}
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
                      {t('models.sync')}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activeProvider.models.filter((m) => m.isAvailable).length === 0 ? (
                <div className="text-center py-12">
                  <div className="mb-4">
                    <RefreshCw className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{t('models.no_models')}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {activeProvider.modelSource === 'dynamic'
                      ? activeProvider.apiKey
                        ? t('models.sync_prompt')
                        : t('models.configure_key')
                      : t('models.user_defined')}
                  </p>
                  {activeProvider.modelSource === 'dynamic' && activeProvider.apiKey && (
                    <Button onClick={() => syncProviderModels(activeProvider.id)} disabled={syncing}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                      {t('models.sync_now')}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {activeProvider.modelSource === 'dynamic' && (
                    <div className="mb-4 p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between text-sm">
                        <span>
                          {t('models.selected', {
                            count: activeProvider.models.filter(
                              (m) => m.isAvailable && m.isSelected !== false
                            ).length,
                            total: activeProvider.models.filter((m) => m.isAvailable).length
                          })}
                        </span>
                        <span className="text-muted-foreground">{t('models.only_selected')}</span>
                      </div>
                    </div>
                  )}

                  {/* Search input */}
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t('models.search_placeholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <ModelList
                    models={activeProvider.models.filter((m) => m.isAvailable)}
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

export default ModelPage;
