import { Badge } from '@/components/ui/badge';
import type { Model } from '../../../types/models';
import { useTranslation } from 'react-i18next';

interface ModelListProps {
  models: Model[];
  showSelection?: boolean;
  onModelToggle?: (modelId: string, selected: boolean) => void;
  searchQuery?: string;
}

export const ModelList = ({
  models,
  showSelection = false,
  onModelToggle,
  searchQuery = ''
}: ModelListProps) => {
  const { t } = useTranslation('models');

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
  const unselectedModels = filteredModels.filter((m) => m.isSelected === false);

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
  );
};
