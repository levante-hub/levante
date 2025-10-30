import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePersonalization } from '@/hooks/usePersonalization';
import { SettingsSection } from './SettingsSection';
import type { PersonalizationSettings } from '../../../types/userProfile';

export const PersonalizationSection = () => {
  const { t } = useTranslation(['settings', 'common']);
  const {
    personalization,
    setPersonalization,
    state,
    handleSave
  } = usePersonalization();

  return (
    <SettingsSection
      icon={<User className="w-5 h-5" />}
      title={t('settings:sections.personalization')}
      defaultOpen
    >
      {/* Enable Customization Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="enableCustomization" className="text-base">
            {t('settings:personalization.enable_customization.label')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('settings:personalization.enable_customization.description')}
          </p>
        </div>
        <Switch
          id="enableCustomization"
          checked={personalization.enabled}
          onCheckedChange={(checked) =>
            setPersonalization(prev => ({ ...prev, enabled: checked }))
          }
        />
      </div>

      {/* Personality Selector */}
      <div className="space-y-2">
        <Label htmlFor="personality">{t('settings:personalization.personality.label')}</Label>
        <Select
          value={personalization.personality}
          onValueChange={(value) =>
            setPersonalization(prev => ({
              ...prev,
              personality: value as PersonalizationSettings['personality']
            }))
          }
          disabled={!personalization.enabled}
        >
          <SelectTrigger id="personality">
            <SelectValue placeholder={t('settings:personalization.personality.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {['default', 'cynic', 'robot', 'listener', 'nerd'].map((option) => (
              <SelectItem key={option} value={option}>
                <div className="flex flex-col">
                  <span className="font-medium">{t(`settings:personalization.personality.options.${option}.label`)}</span>
                  <span className="text-xs text-muted-foreground">{t(`settings:personalization.personality.options.${option}.description`)}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t('settings:personalization.personality.description')}
        </p>
      </div>

      {/* Custom Instructions */}
      <div className="space-y-2">
        <Label htmlFor="customInstructions">{t('settings:personalization.custom_instructions.label')}</Label>
        <Textarea
          id="customInstructions"
          placeholder={t('settings:personalization.custom_instructions.placeholder')}
          value={personalization.customInstructions}
          onChange={(e) =>
            setPersonalization(prev => ({
              ...prev,
              customInstructions: e.target.value
            }))
          }
          disabled={!personalization.enabled}
          className="min-h-[80px] resize-none"
        />
        <p className="text-xs text-muted-foreground">
          {t('settings:personalization.custom_instructions.description')}
        </p>
      </div>

      {/* About You Section */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">{t('settings:personalization.about_you.title')}</h4>

        <div className="space-y-2">
          <Label htmlFor="nickname">{t('settings:personalization.about_you.nickname.label')}</Label>
          <Input
            id="nickname"
            placeholder={t('settings:personalization.about_you.nickname.placeholder')}
            value={personalization.nickname}
            onChange={(e) =>
              setPersonalization(prev => ({
                ...prev,
                nickname: e.target.value
              }))
            }
            disabled={!personalization.enabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="occupation">{t('settings:personalization.about_you.occupation.label')}</Label>
          <Input
            id="occupation"
            placeholder={t('settings:personalization.about_you.occupation.placeholder')}
            value={personalization.occupation}
            onChange={(e) =>
              setPersonalization(prev => ({
                ...prev,
                occupation: e.target.value
              }))
            }
            disabled={!personalization.enabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="aboutUser">{t('settings:personalization.about_you.more.label')}</Label>
          <Textarea
            id="aboutUser"
            placeholder={t('settings:personalization.about_you.more.placeholder')}
            value={personalization.aboutUser}
            onChange={(e) =>
              setPersonalization(prev => ({
                ...prev,
                aboutUser: e.target.value
              }))
            }
            disabled={!personalization.enabled}
            className="min-h-[80px] resize-none"
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4 pt-2">
        <Button
          onClick={handleSave}
          disabled={state.saving || !personalization.enabled}
          variant="outline"
          size="sm"
        >
          {state.saving ? t('settings:personalization.saving') : t('settings:personalization.save_button')}
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
