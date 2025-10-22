import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { detectSystemLanguage } from './languageDetector';

// Import translations
import enCommon from '../locales/en/common.json';
import enSettings from '../locales/en/settings.json';
import enChat from '../locales/en/chat.json';
import enModels from '../locales/en/models.json';
import enWizard from '../locales/en/wizard.json';
import enMCP from '../locales/en/mcp.json';
import enErrors from '../locales/en/errors.json';

import esCommon from '../locales/es/common.json';
import esSettings from '../locales/es/settings.json';
import esChat from '../locales/es/chat.json';
import esModels from '../locales/es/models.json';
import esWizard from '../locales/es/wizard.json';
import esMCP from '../locales/es/mcp.json';
import esErrors from '../locales/es/errors.json';

const resources = {
  en: {
    common: enCommon,
    settings: enSettings,
    chat: enChat,
    models: enModels,
    wizard: enWizard,
    mcp: enMCP,
    errors: enErrors,
  },
  es: {
    common: esCommon,
    settings: esSettings,
    chat: esChat,
    models: esModels,
    wizard: esWizard,
    mcp: esMCP,
    errors: esErrors,
  },
};

// Initialize i18next
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectSystemLanguage(), // Default to system language
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false, // Disable suspense to avoid loading issues
    },
  });

export default i18n;
