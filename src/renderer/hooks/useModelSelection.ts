/**
 * useModelSelection Hook
 *
 * Handles model selection logic including:
 * - Loading available models from modelService
 * - Filtering models based on session type
 * - Validating model changes against session type
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { modelService } from '@/services/modelService';
import { getRendererLogger } from '@/services/logger';
import { usePreference } from '@/hooks/usePreferences';
import { usePlatformStore } from '@/stores/platformStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { resolveStoredModelForCatalog } from '@/lib/selectableModels';
import type { Model, GroupedModelsByProvider } from '../../types/models';

const logger = getRendererLogger();

// ============================================================================
// Types
// ============================================================================

interface Session {
  id: string;
  model?: string;
  session_type?: 'chat' | 'inference';
}

interface UseModelSelectionOptions {
  currentSession: Session | null;
  onLoadUserName?: () => void;
}

interface UseModelSelectionReturn {
  model: string;
  setModel: (model: string) => void;
  availableModels: Model[];
  filteredAvailableModels: Model[];
  groupedModelsByProvider: GroupedModelsByProvider | null;
  modelsLoading: boolean;
  modelsError: string | null;
  retryModels: (() => Promise<void>) | null;
  currentModelInfo: Model | undefined;
  modelTaskType: string | undefined;
  handleModelChange: (newModelId: string) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a model is an inference model (non-chat)
 */
function isInferenceModel(taskType: string | undefined): boolean {
  return !!taskType && taskType !== 'chat' && taskType !== 'image-text-to-text';
}

/**
 * Filter models based on session type
 * NOTE: Session type filtering has been removed - all models are now shown
 * regardless of session type. Session type updates dynamically when switching models.
 */
function filterModelsBySessionType(
  models: Model[],
  session: Session | null
): Model[] {
  // No filtering by session type - show all models
  // Session type will update automatically when user switches models
  return models;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useModelSelection(options: UseModelSelectionOptions): UseModelSelectionReturn {
  const { currentSession, onLoadUserName } = options;

  const [model, setModel] = useState<string>('');

  // Platform mode state
  const appMode = usePlatformStore(s => s.appMode);
  const platformModels = usePlatformStore(s => s.models);
  const platformModelsLoadState = usePlatformStore(s => s.modelsLoadState);
  const platformModelsLoading = usePlatformStore(s => s.modelsLoading);
  const platformModelsError = usePlatformStore(s => s.modelsError);
  const platformRetryModels = usePlatformStore(s => s.retryModels);
  const isPlatformMode = appMode === 'platform';

  // Load preferences
  const [lastUsedModel, setLastUsedModel] = usePreference('lastUsedModel');
  const [useOtherProviders] = usePreference('useOtherProviders');

  // Catalog state from shared store (cached across mounts)
  const catalog = useCatalogStore(s => s.result);
  const catalogLoading = useCatalogStore(s => s.loading);
  const ensureLoaded = useCatalogStore(s => s.ensureLoaded);

  const availableModels = useMemo<Model[]>(
    () => catalog?.availableModels ?? [],
    [catalog]
  );
  const groupedModelsByProvider = useMemo<GroupedModelsByProvider | null>(
    () => catalog?.groupedModelsByProvider ?? null,
    [catalog]
  );

  // Get current model info - search in grouped models if available, otherwise availableModels
  const currentModelInfo = useMemo(() => {
    // First try to find in available models (active provider)
    let info = availableModels.find((m) => m.id === model);

    // If not found, search in grouped models (other providers)
    if (!info && groupedModelsByProvider) {
      for (const group of groupedModelsByProvider.providers) {
        info = group.models.find(m => m.id === model);
        if (info) break;
      }
    }
    return info;
  }, [model, availableModels, groupedModelsByProvider]);

  const modelTaskType = currentModelInfo?.taskType;

  // Filter available models based on current session type
  const filteredAvailableModels = useMemo(() => {
    return filterModelsBySessionType(availableModels, currentSession);
  }, [availableModels, currentSession]);

  // Ensure catalog is loaded for current params; cached across mounts in catalogStore.
  useEffect(() => {
    // In platform mode, wait until the platform catalog is resolved before
    // computing the selectable-models catalog (otherwise we'd load with an
    // empty platformModels list and then re-load once it arrives).
    if (isPlatformMode && (platformModelsLoadState === 'idle' || platformModelsLoadState === 'loading')) {
      return;
    }

    ensureLoaded({
      appMode,
      useOtherProviders: useOtherProviders ?? false,
      platformModels,
    }).catch((error) => {
      // ensureLoaded already logs; nothing else to do here.
      logger.models.debug('ensureLoaded threw', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, [ensureLoaded, appMode, platformModels, platformModelsLoadState, useOtherProviders, isPlatformMode]);

  // Also load user name if callback provided (kept separate from catalog load)
  useEffect(() => {
    if (onLoadUserName) {
      onLoadUserName();
    }
  }, [onLoadUserName]);

  // Auto-select model if only one is available OR use lastUsedModel when no model is selected
  useEffect(() => {
    if (!catalogLoading && !model && !currentSession && catalog) {
      let candidateModel = '';

      if (groupedModelsByProvider && groupedModelsByProvider.totalModelCount === 1) {
        const provider = groupedModelsByProvider.providers[0];
        if (provider && provider.models.length === 1) {
          candidateModel = provider.models[0].id;
        }
      } else if (availableModels.length === 1) {
        candidateModel = availableModels[0].id;
      } else if (lastUsedModel) {
        // Resolve lastUsedModel against catalog (handles qualified + legacy)
        const resolved = resolveStoredModelForCatalog(lastUsedModel, catalog);
        if (resolved) {
          candidateModel = resolved;
          logger.models.info('Using last used model', { model: candidateModel });
        }
      }

      if (candidateModel) {
        if (candidateModel !== lastUsedModel && availableModels.length === 1) {
          logger.models.info('Auto-selecting single available model', { model: candidateModel });
        }
        setModel(candidateModel);
      }
    }
  }, [availableModels, groupedModelsByProvider, catalogLoading, model, currentSession, lastUsedModel, catalog]);

  // Sync model with current session when session changes
  useEffect(() => {
    if (currentSession?.model && catalog) {
      // Resolve stored model (handles qualified + legacy)
      const resolved = resolveStoredModelForCatalog(currentSession.model, catalog);
      const modelToSet = resolved ?? currentSession.model;

      logger.core.info('Syncing model from session', {
        sessionId: currentSession.id,
        storedModel: currentSession.model,
        resolvedModel: modelToSet,
      });
      setModel(modelToSet);
    } else if (currentSession?.model) {
      // Catalog not loaded yet, use raw value
      setModel(currentSession.model);
    }
  }, [currentSession?.id, currentSession?.model, catalog]);

  // Save model to preferences when it changes (for default selection in new chats)
  useEffect(() => {
    if (model && model !== lastUsedModel) {
      logger.models.info('Saving last used model to preferences', { model });
      setLastUsedModel(model).catch((error) => {
        logger.models.error('Failed to save last used model', {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }
  }, [model, lastUsedModel, setLastUsedModel]);

  // Handle model change with session type validation
  const handleModelChange = useCallback(async (newModelId: string) => {
    // Find model info across all providers
    let newModelInfo = availableModels.find((m) => m.id === newModelId);
    if (!newModelInfo && groupedModelsByProvider) {
      for (const group of groupedModelsByProvider.providers) {
        newModelInfo = group.models.find(m => m.id === newModelId);
        if (newModelInfo) break;
      }
    }

    // If still not found (rare edge case), we can't validate
    if (!newModelInfo) {
      logger.models.warn('Model not found for selection', { newModelId });
      if (currentSession) return;
    }

    // If no current session, allow any model (it will determine session type on creation)
    if (!currentSession) {
      // In platform mode (pure or hybrid), no provider switching needed
      // In standalone puro, auto-switch provider
      if (!isPlatformMode) {
        try {
          const newProviderId = await modelService.getProviderForModel(newModelId);
          const activeProvider = await modelService.getActiveProvider();

          if (newProviderId && activeProvider && newProviderId !== activeProvider.id) {
            logger.models.info('Auto-switching provider for new session', {
              from: activeProvider.id,
              to: newProviderId,
              model: newModelId
            });
            await modelService.setActiveProvider(newProviderId);
            useCatalogStore.getState().invalidate('provider-sync');
          }
        } catch (err) {
          logger.models.error('Failed to auto-switch provider', {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }

      setModel(newModelId);
      return;
    }

    const newTaskType = newModelInfo?.taskType;
    const isNewModelInference = isInferenceModel(newTaskType);

    // Determine new session type based on model
    const newSessionType = isNewModelInference ? 'inference' : 'chat';
    const currentSessionType = currentSession.session_type;

    // If session type changes, update it dynamically
    if (currentSessionType !== newSessionType) {
      logger.core.info('Updating session type for model switch', {
        sessionId: currentSession.id,
        oldType: currentSessionType,
        newType: newSessionType,
        model: newModelId
      });

      try {
        const result = await window.levante.db.sessions.update({
          id: currentSession.id,
          session_type: newSessionType
        });

        if (!result.success) {
          logger.core.error('Failed to update session type', {
            error: result.error
          });
        }
      } catch (err) {
        logger.core.error('Error updating session type', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // Valid change - check provider switch (standalone mode only, not hybrid)
    if (!isPlatformMode) {
      try {
        const newProviderId = await modelService.getProviderForModel(newModelId);
        const activeProvider = await modelService.getActiveProvider();

        if (newProviderId && activeProvider && newProviderId !== activeProvider.id) {
          logger.models.info('Auto-switching provider for existing session', {
            from: activeProvider.id,
            to: newProviderId,
            model: newModelId
          });
          await modelService.setActiveProvider(newProviderId);
          useCatalogStore.getState().invalidate('provider-sync');
        }
      } catch (err) {
        logger.models.error('Failed to auto-switch provider', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    logger.core.info('Model changed', {
      oldModel: model,
      newModel: newModelId,
      sessionType: newSessionType,
      compatible: true
    });
    setModel(newModelId);
  }, [currentSession, availableModels, model, groupedModelsByProvider, isPlatformMode]);

  // Effective loading / error: in platform mode, reflect catalog state
  const effectiveModelsLoading = isPlatformMode
    ? catalogLoading || platformModelsLoading
    : catalogLoading;

  const effectiveModelsError = isPlatformMode ? platformModelsError : null;
  const effectiveRetryModels = isPlatformMode ? platformRetryModels : null;

  return {
    model,
    setModel,
    availableModels,
    filteredAvailableModels,
    groupedModelsByProvider,
    modelsLoading: effectiveModelsLoading,
    modelsError: effectiveModelsError,
    retryModels: effectiveRetryModels,
    currentModelInfo,
    modelTaskType,
    handleModelChange,
  };
}

// Export helper for use in other places
export { isInferenceModel };
