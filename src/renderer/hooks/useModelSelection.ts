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
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [groupedModelsByProvider, setGroupedModelsByProvider] = useState<GroupedModelsByProvider | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Load and save lastUsedModel from preferences
  const [lastUsedModel, setLastUsedModel] = usePreference('lastUsedModel');

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

  // Load available models on component mount
  useEffect(() => {
    const loadModels = async () => {
      setModelsLoading(true);
      try {
        // Ensure model service is initialized
        await modelService.initialize();

        // Load legacy single-provider models AND grouped multi-provider models
        const [models, grouped] = await Promise.all([
          modelService.getAvailableModels(),
          modelService.getAllProvidersWithSelectedModels()
        ]);

        setAvailableModels(models);
        setGroupedModelsByProvider(grouped);

        // Log available models for debugging
        logger.models.debug(`Loaded models`, {
          count: models.length,
          groupedCount: grouped.totalModelCount,
          providerCount: grouped.providers.length
        });
      } catch (error) {
        logger.models.error('Failed to load models', {
          error: error instanceof Error ? error.message : error
        });
      } finally {
        setModelsLoading(false);
      }
    };

    loadModels();


    // Also load user name if callback provided
    if (onLoadUserName) {
      onLoadUserName();
    }
  }, [onLoadUserName]);

  // Auto-select model if only one is available OR use lastUsedModel when no model is selected
  useEffect(() => {
    if (!modelsLoading && !model && !currentSession) {
      // Logic:
      // 1. If groupedModels exists, check total count.
      // 2. If availableModels exists (legacy/active), check that.
      // 3. If multiple models available, use lastUsedModel if available

      let candidateModel = '';

      if (groupedModelsByProvider && groupedModelsByProvider.totalModelCount === 1) {
        // Only 1 model across all providers
        const provider = groupedModelsByProvider.providers[0];
        if (provider && provider.models.length === 1) {
          candidateModel = provider.models[0].id;
        }
      } else if (availableModels.length === 1) {
        // Fallback or specific scope
        candidateModel = availableModels[0].id;
      } else if (lastUsedModel) {
        // Multiple models available - use lastUsedModel if it exists in available models
        // Check if lastUsedModel exists in availableModels or groupedModelsByProvider
        const modelExists = availableModels.some(m => m.id === lastUsedModel) ||
          (groupedModelsByProvider?.providers.some(p =>
            p.models.some(m => m.id === lastUsedModel)
          ) ?? false);

        if (modelExists) {
          candidateModel = lastUsedModel;
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
  }, [availableModels, groupedModelsByProvider, modelsLoading, model, currentSession, lastUsedModel]);

  // Sync model with current session when session changes
  useEffect(() => {
    if (currentSession?.model) {
      logger.core.info('Syncing model from session', {
        sessionId: currentSession.id,
        model: currentSession.model
      });
      setModel(currentSession.model);
    }
  }, [currentSession?.id, currentSession?.model]);

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
    // Keep internal sync with new model logic (async wrapper)

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
      // If no current session, proceed blindly, otherwise block safe
      if (currentSession) return;
    }

    // If no current session, allow any model (it will determine session type on creation)
    if (!currentSession) {
      // Check if we need to switch provider
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
          // Refresh available models for the new active provider
          const models = await modelService.getAvailableModels();
          setAvailableModels(models);
        }
      } catch (err) {
        logger.models.error('Failed to auto-switch provider', {
          error: err instanceof Error ? err.message : String(err)
        });
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
        // Update session type in database
        const result = await window.levante.db.sessions.update({
          id: currentSession.id,
          session_type: newSessionType
        });

        if (!result.success) {
          logger.core.error('Failed to update session type', {
            error: result.error
          });
          // Continue anyway - the model change will still work
        }
      } catch (err) {
        logger.core.error('Error updating session type', {
          error: err instanceof Error ? err.message : String(err)
        });
        // Continue anyway - the model change will still work
      }
    }

    // Valid change - check provider switch
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

        // Refresh available models (active provider changed)
        const models = await modelService.getAvailableModels();
        setAvailableModels(models);

        // Also refresh grouped models to update order (active logic)
        const grouped = await modelService.getAllProvidersWithSelectedModels();
        setGroupedModelsByProvider(grouped);
      }
    } catch (err) {
      logger.models.error('Failed to auto-switch provider', {
        error: err instanceof Error ? err.message : String(err)
      });
    }

    logger.core.info('Model changed', {
      oldModel: model,
      newModel: newModelId,
      sessionType: newSessionType,
      compatible: true
    });
    setModel(newModelId);
  }, [currentSession, availableModels, model, groupedModelsByProvider]);

  return {
    model,
    setModel,
    availableModels,
    filteredAvailableModels,
    groupedModelsByProvider,
    modelsLoading,
    currentModelInfo,
    modelTaskType,
    handleModelChange,
  };
}

// Export helper for use in other places
export { isInferenceModel };
