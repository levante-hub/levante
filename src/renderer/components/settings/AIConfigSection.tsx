import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAIConfig } from '@/hooks/useAIConfig';
import { SettingsSection } from './SettingsSection';

export const AIConfigSection = () => {
  const { t } = useTranslation(['settings', 'common']);
  const {
    config,
    setConfig,
    state,
    handleSave
  } = useAIConfig();

  return (
    <SettingsSection
      icon={<Settings className="w-5 h-5" />}
      title={t('settings:sections.ai_configuration')}
    >
      <div className="space-y-4">
        <h4 className="text-sm font-medium">{t('settings:ai_config.title')}</h4>
        <p className="text-muted-foreground text-sm">
          {t('settings:ai_config.description')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="baseSteps">{t('settings:ai_config.base_steps.label')}</Label>
            <Input
              id="baseSteps"
              type="number"
              min="1"
              max="10"
              value={config.baseSteps}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                baseSteps: parseInt(e.target.value) || 5
              }))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              {t('settings:ai_config.base_steps.description')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxSteps">{t('settings:ai_config.max_steps.label')}</Label>
            <Input
              id="maxSteps"
              type="number"
              min="5"
              max="50"
              value={config.maxSteps}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                maxSteps: parseInt(e.target.value) || 20
              }))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              {t('settings:ai_config.max_steps.description')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <Button
            onClick={handleSave}
            disabled={state.saving}
            variant="outline"
            size="sm"
          >
            {state.saving ? t('settings:personalization.saving') : t('settings:ai_config.save_button')}
          </Button>

          {state.saved && (
            <div className="flex items-center text-green-600 text-sm">
              <CheckCircle className="w-4 h-4 mr-1" />
              {t('settings:personalization.saved')}
            </div>
          )}
        </div>

        <div className="bg-muted/50 p-3 rounded-md text-sm">
          <p className="font-medium mb-1">{t('settings:ai_config.how_it_works.title')}</p>
          <ul className="text-muted-foreground space-y-1 text-xs">
            <li>• {t('settings:ai_config.how_it_works.formula')}</li>
            <li>• {t('settings:ai_config.how_it_works.example', {
              baseSteps: config.baseSteps,
              result: Math.min(Math.max(config.baseSteps + Math.floor(24 / 5) * 2, config.baseSteps), config.maxSteps)
            })}</li>
            <li>• {t('settings:ai_config.how_it_works.note')}</li>
          </ul>
        </div>
      </div>
    </SettingsSection>
  );
};
