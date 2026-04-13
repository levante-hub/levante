/**
 * AccountPage - Levante Platform account management
 * Only visible in platform mode. Shows user info, allowed models, and logout.
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatformStore } from '@/stores/platformStore';
import { usePreference } from '@/hooks/usePreferences';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Building2, RefreshCw, LogOut, Bot, Loader2, ExternalLink, Search, AlertTriangle, ArrowLeft } from 'lucide-react';
import { LEVANTE_PLATFORM_URL } from '@/lib/platformConstants';
import { CATEGORY_DISPLAY_NAMES } from '../../types/modelCategories';
import { ProviderConfigPanel } from '@/components/providers/ProviderConfigPanel';
import type { Model } from '../../types/models';
import type { ModelCategory } from '../../types/modelCategories';

const CATEGORY_ORDER: string[] = ['chat', 'multimodal', 'image', 'audio', 'specialized', 'other'];

function getInitials(email?: string): string {
  if (!email) return '?';
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

function formatContextLength(contextLength: number): string {
  if (contextLength >= 1_000_000) {
    return `${(contextLength / 1_000_000).toFixed(1)}M tokens`;
  }
  if (contextLength >= 1_000) {
    return `${Math.round(contextLength / 1_000)}k tokens`;
  }
  return `${contextLength} tokens`;
}

function formatPricing(pricing: { input: number; output: number }): string {
  if (pricing.input === 0 && pricing.output === 0) return 'Free';
  return `$${pricing.input}/M in · $${pricing.output}/M out`;
}

function ModelRow({ model, tChat }: { model: Model; tChat: (key: string) => string }) {
  const displayName = model.name || model.id;
  const showId = model.name && model.name !== model.id;

  return (
    <div className="border rounded-lg px-4 py-2.5 bg-card hover:bg-accent/30 transition-colors flex items-center justify-between gap-4">
      {/* Left: name + badges */}
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="font-medium text-sm truncate">{displayName}</span>
        {showId && (
          <span className="text-[11px] text-muted-foreground/50 font-mono truncate hidden sm:inline">
            {model.id}
          </span>
        )}
        {model.zeroDataRetention && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-medium text-green-600 border-green-600/30 shrink-0">
            {tChat('model_selector.private_badge')}
          </Badge>
        )}
        {model.capabilities.length > 0 && model.capabilities.map((cap) => (
          <Badge key={cap} variant="outline" className="text-[10px] px-1 py-0 h-4 text-muted-foreground shrink-0">
            {cap}
          </Badge>
        ))}
      </div>
      {/* Right: metadata */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        {model.contextLength > 0 && (
          <span>{formatContextLength(model.contextLength)}</span>
        )}
        {model.pricing && !(model.pricing.input === 0 && model.pricing.output === 0) && (
          <span>{formatPricing(model.pricing)}</span>
        )}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { t } = useTranslation('account');
  const { t: tc } = useTranslation('common');
  const { t: tChat } = useTranslation('chat');
  const { user, models, modelsLoading, modelsError, modelsLoadState, fetchModels, retryModels, logout } = usePlatformStore();
  const [useOtherProviders, setUseOtherProviders] = usePreference('useOtherProviders');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showProvidersView, setShowProvidersView] = useState(false);
  const [search, setSearch] = useState('');

  const filteredModels = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.capabilities.some((c) => c.toLowerCase().includes(q))
    );
  }, [models, search]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, Model[]> = {};
    filteredModels.forEach((model) => {
      const key = model.category || 'other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(model);
    });
    return CATEGORY_ORDER
      .filter((key) => groups[key] && groups[key].length > 0)
      .map((key) => ({
        category: key,
        label: key === 'other' ? t('category_other') : CATEGORY_DISPLAY_NAMES[key as ModelCategory] || key,
        models: groups[key],
      }));
  }, [filteredModels, t]);

  const handleRefreshModels = async () => {
    await fetchModels();
  };

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    await logout();
  };

  const handleOpenPlatform = () => {
    window.levante.openExternal(LEVANTE_PLATFORM_URL);
  };

  // Providers sub-view
  if (showProvidersView) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 pb-10">
          <div className="py-6">
            <button
              onClick={() => setShowProvidersView(false)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('other_providers_back')}
            </button>

            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">{t('other_providers_title')}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('other_providers_description')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="other-providers-toggle" className="text-sm">
                  {t('other_providers_toggle')}
                </label>
                <Switch
                  id="other-providers-toggle"
                  checked={useOtherProviders ?? false}
                  onCheckedChange={(checked) => setUseOtherProviders(checked)}
                />
              </div>
            </div>

            {useOtherProviders && (
              <>
                <Alert variant="default" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{t('other_providers_warning')}</AlertDescription>
                </Alert>
                <ProviderConfigPanel />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 pb-10">
        {/* Profile Header */}
        <div className="flex items-start justify-between py-8">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                {getInitials(user?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
              {user?.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span className="text-sm">{user.email}</span>
                </div>
              )}
              {user?.orgId && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span className="text-sm">{t('org_label', { orgId: user.orgId })}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 pt-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenPlatform}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('manage_plan')}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setShowLogoutConfirm(true)}>
                <LogOut className="h-4 w-4 mr-2" />
                {t('log_out')}
              </Button>
            </div>
            <button
              onClick={() => setShowProvidersView(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              {t('use_other_providers_link')}
            </button>
          </div>
        </div>

        <Separator />

        {/* Models Section */}
        <div className="py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Bot className="h-5 w-5" />
                {t('models_title')}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('models_description', { count: models.length })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshModels}
              disabled={modelsLoading}
            >
              {modelsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {t('refresh_models')}
            </Button>
          </div>

          {/* Error alert */}
          {modelsError && models.length === 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{t('models_load_error')}</span>
                <Button variant="outline" size="sm" onClick={() => retryModels()} disabled={modelsLoading}>
                  {modelsLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  {t('retry_models')}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Search */}
          {models.length > 0 && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('search_placeholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {modelsLoading && models.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('models_loading')}
            </div>
          ) : models.length === 0 && modelsLoadState === 'ready' ? (
            <p className="text-sm text-muted-foreground">{t('no_models')}</p>
          ) : models.length === 0 ? (
            // error state already shown above, just a fallback
            !modelsError && <p className="text-sm text-muted-foreground">{t('no_models')}</p>
          ) : filteredModels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('no_search_results')}</p>
          ) : (
            groupedByCategory.map((group) => (
              <div key={group.category} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </h3>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    {group.models.length}
                  </Badge>
                </div>
                <div className="grid gap-2">
                  {group.models.map((model) => (
                    <ModelRow key={model.id} model={model} tChat={tChat} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Logout Confirmation Dialog */}
        <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('logout_confirm_title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('logout_confirm_description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout}>
                {t('log_out')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
