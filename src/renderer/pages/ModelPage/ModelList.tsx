import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import type { Model } from '../../../types/models';
import type { ProviderType } from '../../../types/models';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';

interface ModelListProps {
  models: Model[];
  showSelection?: boolean;
  onModelToggle?: (modelId: string, selected: boolean) => void;
  searchQuery?: string;
  providerType?: ProviderType;
}

// Utility function to check if a model is free
const isFreeModel = (model: Model): boolean => {
  return model.pricing?.input === 0 && model.pricing?.output === 0;
};

export const ModelList = ({
  models,
  showSelection = false,
  onModelToggle,
  searchQuery = '',
  providerType
}: ModelListProps) => {
  const { t } = useTranslation('models');
  const [showFreeModelWarning, setShowFreeModelWarning] = useState(false);
  const [pendingFreeModel, setPendingFreeModel] = useState<{ modelId: string; selected: boolean } | null>(null);
  const [hasAcceptedWarning, setHasAcceptedWarning] = useState(false);

  // Load preference on mount
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const result = await window.levante.preferences.get('hasAcceptedFreeModelWarning');
        if (result.success && result.data) {
          setHasAcceptedWarning(true);
        }
      } catch (error) {
        console.error('Failed to load free model warning preference:', error);
      }
    };
    loadPreference();
  }, []);

  if (models.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('models.no_models_configured')}
      </div>
    );
  }

  // Filter models based on search query
  const filteredModels = searchQuery
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : models;

  // Show no results message if search returns nothing
  if (searchQuery && filteredModels.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('models.no_search_results', { query: searchQuery })}
      </div>
    );
  }

  // Separate selected and unselected models
  const selectedModels = filteredModels.filter((m) => m.isSelected !== false);
  let unselectedModels = filteredModels.filter((m) => m.isSelected === false);

  // For OpenRouter, prioritize free models in the unselected section
  if (providerType === 'openrouter') {
    unselectedModels = unselectedModels.sort((a, b) => {
      const aIsFree = isFreeModel(a);
      const bIsFree = isFreeModel(b);
      if (aIsFree && !bIsFree) return -1;
      if (!aIsFree && bIsFree) return 1;
      return 0;
    });
  }

  const handleCheckboxChange = (model: Model, selected: boolean) => {
    // For OpenRouter free models, show warning when selecting (only if not already accepted)
    if (providerType === 'openrouter' && isFreeModel(model) && selected && !hasAcceptedWarning) {
      setPendingFreeModel({ modelId: model.id, selected });
      setShowFreeModelWarning(true);
    } else {
      onModelToggle?.(model.id, selected);
    }
  };

  const handleConfirmFreeModel = async () => {
    try {
      // Save preference to not show warning again
      await window.levante.preferences.set('hasAcceptedFreeModelWarning', true);
      setHasAcceptedWarning(true);

      // Continue with model selection
      if (pendingFreeModel && onModelToggle) {
        onModelToggle(pendingFreeModel.modelId, pendingFreeModel.selected);
      }
    } catch (error) {
      console.error('Failed to save free model warning preference:', error);
    } finally {
      setShowFreeModelWarning(false);
      setPendingFreeModel(null);
    }
  };

  const handleCancelFreeModel = () => {
    setShowFreeModelWarning(false);
    setPendingFreeModel(null);
  };

  const renderModel = (model: Model) => (
      <div key={model.id} className="border rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {showSelection && onModelToggle && (
              <input
                type="checkbox"
                checked={model.isSelected ?? true}
                onChange={(e) => handleCheckboxChange(model, e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
            )}
            <h4 className="font-medium">{model.name}</h4>
          </div>
          <div className="flex gap-2">
            {model.capabilities.map((cap) => (
              <Badge key={cap} variant="outline" className="text-xs">
                {cap}
              </Badge>
            ))}
          </div>
        </div>
      <div className="text-sm text-muted-foreground space-y-1">
        <p>{t('model_info.context_length', { length: model.contextLength.toLocaleString() })}</p>
        {model.pricing && (
          <p>
            {t('model_info.pricing', { input: model.pricing.input, output: model.pricing.output })}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
      {/* Selected models section */}
      {selectedModels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t('models.selected_section', { count: selectedModels.length })}
            </h3>
            <p className="text-xs text-muted-foreground">{t('models.selected_description')}</p>
          </div>
          <div className="grid gap-3">{selectedModels.map(renderModel)}</div>
        </div>
      )}

      {/* Unselected models section */}
      {unselectedModels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t('models.available_section', { count: unselectedModels.length })}
            </h3>
            <p className="text-xs text-muted-foreground">{t('models.available_description')}</p>
          </div>
          <div className="grid gap-3 opacity-60">{unselectedModels.map(renderModel)}</div>
        </div>
      )}
      </div>

      {/* Free Model Warning Modal */}
      <Dialog open={showFreeModelWarning} onOpenChange={setShowFreeModelWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              {t('free_model_warning.title')}
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-4">
              <p>
                {t('free_model_warning.description_1')}
              </p>
              <p>
                {t('free_model_warning.description_2')}
              </p>
              <div className="bg-muted p-3 rounded-md text-sm space-y-2">
                <p className="font-medium">{t('free_model_warning.required_settings')}</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>{t('free_model_warning.setting_1')}</li>
                  <li>{t('free_model_warning.setting_2')}</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row !justify-between gap-2">
            <Button
              variant="outline"
              onClick={handleCancelFreeModel}
            >
              {t('free_model_warning.cancel')}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  window.open('https://openrouter.ai/settings/privacy', '_blank');
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {t('free_model_warning.privacy_settings')}
              </Button>
              <Button
                onClick={handleConfirmFreeModel}
              >
                {t('free_model_warning.continue')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
