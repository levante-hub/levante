import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CheckCircle, Activity, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTelemetry } from '@/hooks/useTelemetry';
import { SettingsSection } from './SettingsSection';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const TelemetrySection = () => {
  const { t } = useTranslation(['settings', 'common']);
  const {
    telemetry,
    setTelemetry,
    state,
    handleSave
  } = useTelemetry();

  return (
    <SettingsSection
      icon={<Activity className="w-5 h-5" />}
      title={t('settings:sections.telemetry')}
    >
      {/* Privacy Notice */}
      <Alert className="mb-4">
        <Shield className="h-4 w-4" />
        <AlertDescription>
          {t('settings:telemetry.privacy_notice')}
        </AlertDescription>
      </Alert>

      {/* Enable Telemetry Toggle */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-0.5 flex-1 mr-4">
          <Label htmlFor="telemetryEnabled" className="text-base">
            {t('settings:telemetry.enabled.label')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('settings:telemetry.enabled.description')}
          </p>
        </div>
        <Switch
          id="telemetryEnabled"
          checked={telemetry.enabled}
          onCheckedChange={(checked) =>
            setTelemetry(prev => ({ ...prev, enabled: checked }))
          }
        />
      </div>

      {/* Anonymous Usage Toggle */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-0.5 flex-1 mr-4">
          <Label
            htmlFor="anonymousUsage"
            className={`text-base ${!telemetry.enabled ? 'opacity-50' : ''}`}
          >
            {t('settings:telemetry.anonymous_usage.label')}
          </Label>
          <p className={`text-sm text-muted-foreground ${!telemetry.enabled ? 'opacity-50' : ''}`}>
            {t('settings:telemetry.anonymous_usage.description')}
          </p>
        </div>
        <Switch
          id="anonymousUsage"
          checked={telemetry.anonymousUsage}
          disabled={!telemetry.enabled}
          onCheckedChange={(checked) =>
            setTelemetry(prev => ({ ...prev, anonymousUsage: checked }))
          }
        />
      </div>

      {/* Crash Reports Toggle */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-0.5 flex-1 mr-4">
          <Label
            htmlFor="crashReports"
            className={`text-base ${!telemetry.enabled ? 'opacity-50' : ''}`}
          >
            {t('settings:telemetry.crash_reports.label')}
          </Label>
          <p className={`text-sm text-muted-foreground ${!telemetry.enabled ? 'opacity-50' : ''}`}>
            {t('settings:telemetry.crash_reports.description')}
          </p>
        </div>
        <Switch
          id="crashReports"
          checked={telemetry.crashReports}
          disabled={!telemetry.enabled}
          onCheckedChange={(checked) =>
            setTelemetry(prev => ({ ...prev, crashReports: checked }))
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
          {state.saving ? t('settings:personalization.saving') : t('settings:telemetry.save_button')}
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
