import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

export const useAppearance = () => {
  const { i18n } = useTranslation();
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');
  const [language, setLanguage] = useState<'en' | 'es'>('en');
  const [themeState, setThemeSaveState] = useState({
    saving: false,
    saved: false,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const themeResult = await window.levante.preferences.get('theme');
      if (themeResult?.data) {
        setThemeState(themeResult.data);
      }

      const languageResult = await window.levante.preferences.get('language');
      if (languageResult?.data) {
        const lang = languageResult.data as 'en' | 'es';
        setLanguage(lang);
        i18n.changeLanguage(lang);
      }
    } catch (error) {
      logger.preferences.error('Error loading appearance settings', {
        error: error instanceof Error ? error.message : error
      });
    }
  };

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    setThemeSaveState({ saving: true, saved: false });
    setThemeState(newTheme);

    try {
      await window.levante.preferences.set('theme', newTheme);

      setThemeSaveState({ saving: false, saved: true });

      setTimeout(() => {
        setThemeSaveState({ saving: false, saved: false });
      }, 3000);

      window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: newTheme } }));
    } catch (error) {
      logger.preferences.error('Error saving theme', {
        theme: newTheme,
        error: error instanceof Error ? error.message : error
      });
      setThemeSaveState({ saving: false, saved: false });
    }
  };

  const handleLanguageChange = async (newLanguage: 'en' | 'es') => {
    setLanguage(newLanguage);

    try {
      await window.levante.preferences.set('language', newLanguage);
      logger.preferences.info('Language changed, restart required', { language: newLanguage });
    } catch (error) {
      logger.preferences.error('Error saving language', {
        language: newLanguage,
        error: error instanceof Error ? error.message : error
      });
    }
  };

  return {
    theme,
    language,
    themeState,
    handleThemeChange,
    handleLanguageChange
  };
};
