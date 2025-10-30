import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppearance } from '@/hooks/useAppearance';
import { SettingsSection } from './SettingsSection';

export const AppearanceSection = () => {
  const { t } = useTranslation(['settings', 'common']);
  const {
    theme,
    language,
    themeState,
    handleThemeChange,
    handleLanguageChange
  } = useAppearance();

  return (
    <SettingsSection
      icon={<Palette className="w-5 h-5" />}
      title={t('settings:sections.appearance')}
    >
      {/* Language Selector */}
      <div className="space-y-2">
        <Label htmlFor="language">{t('settings:language.label')}</Label>
        <Select
          value={language}
          onValueChange={(value) => handleLanguageChange(value as 'en' | 'es')}
        >
          <SelectTrigger id="language">
            <SelectValue placeholder={t('settings:language.label')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">
              <span className="font-medium">{t('settings:language.options.en')}</span>
            </SelectItem>
            <SelectItem value="es">
              <span className="font-medium">{t('settings:language.options.es')}</span>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t('settings:language.description')}
        </p>
        <p className="text-xs text-amber-600">
          ⚠️ {t('settings:language.requires_restart')}
        </p>
      </div>

      {/* Theme Selector */}
      <div className="space-y-2">
        <Label htmlFor="theme">{t('settings:theme.label')}</Label>
        <Select
          value={theme || 'system'}
          onValueChange={(value) => handleThemeChange(value as 'light' | 'dark' | 'system')}
        >
          <SelectTrigger id="theme">
            <SelectValue placeholder={t('settings:theme.label')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">
              <div className="flex flex-col">
                <span className="font-medium">{t('settings:theme.options.system')}</span>
              </div>
            </SelectItem>
            <SelectItem value="light">
              <div className="flex flex-col">
                <span className="font-medium">{t('settings:theme.options.light')}</span>
              </div>
            </SelectItem>
            <SelectItem value="dark">
              <div className="flex flex-col">
                <span className="font-medium">{t('settings:theme.options.dark')}</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t('settings:theme.description')}
        </p>

        {/* Save indicator */}
        {themeState.saved && (
          <div className="flex items-center text-green-600 text-sm">
            <CheckCircle className="w-4 h-4 mr-1" />
            {t('common:status.saved')}
          </div>
        )}
      </div>
    </SettingsSection>
  );
};
