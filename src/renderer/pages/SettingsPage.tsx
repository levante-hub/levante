import { useState, useEffect } from 'react';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CheckCircle, Settings, User, ChevronDown, Palette } from 'lucide-react';
import { getRendererLogger } from '@/services/logger';
import { useTranslation } from 'react-i18next';
import type { PersonalizationSettings } from '../../types/userProfile';

const logger = getRendererLogger();

const SettingsPage = () => {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');
  const [language, setLanguage] = useState<'en' | 'es'>('en');

  const [maxStepsConfig, setMaxStepsConfig] = useState({
    baseSteps: 5,
    maxSteps: 20,
    saving: false,
    saved: false
  });

  const [personalization, setPersonalization] = useState<PersonalizationSettings>({
    enabled: false,
    personality: 'default',
    customInstructions: '',
    nickname: '',
    occupation: '',
    aboutUser: '',
  });

  const [personalizationState, setPersonalizationState] = useState({
    saving: false,
    saved: false,
  });

  const [themeState, setThemeSaveState] = useState({
    saving: false,
    saved: false,
  });

  const loadStepsConfig = async () => {
    try {
      const aiConfig = await window.levante.preferences.get('ai');

      setMaxStepsConfig(prev => ({
        ...prev,
        baseSteps: aiConfig?.data?.baseSteps || 5,
        maxSteps: aiConfig?.data?.maxSteps || 20
      }));
    } catch (error) {
      logger.preferences.error('Error loading AI steps configuration', { error: error instanceof Error ? error.message : error });
    }
  };

  const loadPersonalization = async () => {
    try {
      // Load personalization from user-profile.json
      const profile = await window.levante.profile.get();
      if (profile?.data?.personalization) {
        setPersonalization(profile.data.personalization);
      }

      // Load theme and language from ui-preferences.json
      const themeResult = await window.levante.preferences.get('theme');
      if (themeResult?.data) {
        setThemeState(themeResult.data);
      }

      const languageResult = await window.levante.preferences.get('language');
      if (languageResult?.data) {
        setLanguage(languageResult.data);
        i18n.changeLanguage(languageResult.data);
      }
    } catch (error) {
      logger.preferences.error('Error loading personalization settings', { error: error instanceof Error ? error.message : error });
    }
  };

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    setThemeSaveState({ saving: true, saved: false });
    setThemeState(newTheme);

    try {
      await window.levante.preferences.set('theme', newTheme);

      setThemeSaveState({ saving: false, saved: true });

      // Clear saved indicator after 3 seconds
      setTimeout(() => {
        setThemeSaveState({ saving: false, saved: false });
      }, 3000);

      // Dispatch event to notify App.tsx to update theme
      window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: newTheme } }));
    } catch (error) {
      logger.preferences.error('Error saving theme', { theme: newTheme, error: error instanceof Error ? error.message : error });
      setThemeSaveState({ saving: false, saved: false });
    }
  };

  const handleLanguageChange = async (newLanguage: 'en' | 'es') => {
    setLanguage(newLanguage);

    try {
      await window.levante.preferences.set('language', newLanguage);

      // Show restart dialog
      // TODO: Implement restart dialog and app.restart() IPC handler
      logger.preferences.info('Language changed, restart required', { language: newLanguage });
    } catch (error) {
      logger.preferences.error('Error saving language', { language: newLanguage, error: error instanceof Error ? error.message : error });
    }
  };

  const handleSaveStepsConfig = async () => {
    setMaxStepsConfig(prev => ({ ...prev, saving: true, saved: false }));

    try {
      await window.levante.preferences.set('ai', {
        baseSteps: maxStepsConfig.baseSteps,
        maxSteps: maxStepsConfig.maxSteps
      });

      setMaxStepsConfig(prev => ({ ...prev, saving: false, saved: true }));

      // Clear saved indicator after 3 seconds
      setTimeout(() => {
        setMaxStepsConfig(prev => ({ ...prev, saved: false }));
      }, 3000);
    } catch (error) {
      logger.preferences.error('Error saving AI steps configuration', { baseSteps: maxStepsConfig.baseSteps, maxSteps: maxStepsConfig.maxSteps, error: error instanceof Error ? error.message : error });
      setMaxStepsConfig(prev => ({ ...prev, saving: false }));
    }
  };

  const handleSavePersonalization = async () => {
    setPersonalizationState({ saving: true, saved: false });

    try {
      await window.levante.profile.update({
        personalization
      });

      setPersonalizationState({ saving: false, saved: true });

      // Clear saved indicator after 3 seconds
      setTimeout(() => {
        setPersonalizationState({ saving: false, saved: false });
      }, 3000);
    } catch (error) {
      logger.preferences.error('Error saving personalization settings', { error: error instanceof Error ? error.message : error });
      setPersonalizationState({ saving: false, saved: false });
    }
  };

  useEffect(() => {
    loadStepsConfig();
    loadPersonalization();
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6 px-4 mb-10">
        {/* Personalization Settings - First Block */}
        <Collapsible defaultOpen className="bg-card rounded-lg border-none">
          <div className="p-6">
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <User className="w-5 h-5" />
                {t('settings:sections.personalization')}
              </h3>
              <ChevronDown className="w-5 h-5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-4">
              <div className="space-y-6">
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
                    onClick={handleSavePersonalization}
                    disabled={personalizationState.saving || !personalization.enabled}
                    variant="outline"
                    size="sm"
                  >
                    {personalizationState.saving ? t('settings:personalization.saving') : t('settings:personalization.save_button')}
                  </Button>

                  {personalizationState.saved && (
                    <div className="flex items-center text-green-600 text-sm">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      {t('settings:personalization.saved')}
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Appearance - Second Block */}
        <Collapsible className="bg-card rounded-lg border-none">
          <div className="p-6">
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Palette className="w-5 h-5" />
                {t('settings:sections.appearance')}
              </h3>
              <ChevronDown className="w-5 h-5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-4">
              <div className="space-y-6">
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
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* AI Configuration - Third Block */}
        <Collapsible className="bg-card rounded-lg border-none">
          <div className="p-6">
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                {t('settings:sections.ai_configuration')}
              </h3>
              <ChevronDown className="w-5 h-5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-4">
              <div className="space-y-6">
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
                        value={maxStepsConfig.baseSteps}
                        onChange={(e) => setMaxStepsConfig(prev => ({
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
                        value={maxStepsConfig.maxSteps}
                        onChange={(e) => setMaxStepsConfig(prev => ({
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
                      onClick={handleSaveStepsConfig}
                      disabled={maxStepsConfig.saving}
                      variant="outline"
                      size="sm"
                    >
                      {maxStepsConfig.saving ? t('settings:personalization.saving') : t('settings:ai_config.save_button')}
                    </Button>

                    {maxStepsConfig.saved && (
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
                        baseSteps: maxStepsConfig.baseSteps,
                        result: Math.min(Math.max(maxStepsConfig.baseSteps + Math.floor(24 / 5) * 2, maxStepsConfig.baseSteps), maxStepsConfig.maxSteps)
                      })}</li>
                      <li>• {t('settings:ai_config.how_it_works.note')}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

      </div>
    </div>
  )
}

export default SettingsPage