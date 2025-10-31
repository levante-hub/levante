import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CheckCircle, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSecurity } from '@/hooks/useSecurity';
import { SettingsSection } from './SettingsSection';

export const SecuritySection = () => {
  const { t } = useTranslation(['settings', 'common']);
  const {
    security,
    setSecurity,
    state,
    handleSave
  } = useSecurity();

  return (
    <SettingsSection
      icon={<Shield className="w-5 h-5" />}
      title={t('settings:sections.security')}
    >
      {/* Encrypt API Keys Toggle */}
      <div className="flex items-start justify-between">
        <div className="space-y-0.5 flex-1 mr-4">
          <Label htmlFor="encryptApiKeys" className="text-base">
            {t('settings:security.encrypt_api_keys.label')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('settings:security.encrypt_api_keys.description')}
          </p>
          <p className="text-xs text-amber-600 mt-2">
            ⚠️ {t('settings:security.encrypt_api_keys.warning')}
          </p>
        </div>
        <Switch
          id="encryptApiKeys"
          checked={security.encryptApiKeys}
          onCheckedChange={(checked) =>
            setSecurity(prev => ({ ...prev, encryptApiKeys: checked }))
          }
        />
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4 pt-2">
        <Button
          onClick={handleSave}
          disabled={state.saving}
          variant="outline"
          size="sm"
        >
          {state.saving ? t('settings:personalization.saving') : t('settings:security.save_button')}
        </Button>

        {state.saved && (
          <div className="flex items-center text-green-600 text-sm">
            <CheckCircle className="w-4 h-4 mr-1" />
            {t('settings:personalization.saved')}
          </div>
        )}
      </div>
    </SettingsSection>
  );
};
