# PRD: Multi-Language System (i18n)

**Product:** Levante Desktop AI Chat App
**Feature:** Internationalization Support (ES/EN)
**Status:** 📝 Draft
**Created:** 2025-10-22
**Owner:** Levante Team

---

## 📋 Executive Summary

Implement a comprehensive internationalization (i18n) system to support Spanish (ES) and English (EN) languages throughout the Levante application. Users will be able to select their preferred language in Settings, with automatic language detection during the onboarding wizard based on system locale.

### Goals
- ✅ Support full application translation (UI, dialogs, menus, messages, errors)
- ✅ Automatic language detection from system locale during wizard
- ✅ Manual language selection in Settings page
- ✅ Language switching with app restart
- ✅ Persistent language preference in `/Users/oliver/levante/user-profile.json`
- ✅ Graceful fallback to English for missing translations
- ✅ Date/time formatting per locale
- ✅ System menu names following OS conventions

### Non-Goals
- ❌ Translating AI model names (OpenAI GPT-4, Claude, etc. stay as-is)
- ❌ Translating provider names (OpenAI, Anthropic, Google, etc. stay as-is)
- ❌ Translating AI model responses (user controls via their prompts)
- ❌ Translating internal logs (development/debugging logs stay in English)
- ❌ Supporting languages beyond ES/EN in initial release
- ❌ Right-to-left (RTL) language support
- ❌ Automatic translation of user-generated content

---

## 🎯 Problem Statement

Currently, Levante is only available in English, limiting accessibility for Spanish-speaking users. With a significant portion of potential users preferring Spanish as their primary language, implementing multi-language support is essential for:

1. **Market Expansion**: Reach Spanish-speaking markets (Spain, Latin America)
2. **User Experience**: Provide native language experience
3. **Accessibility**: Lower language barriers for non-English speakers
4. **Professional Use**: Enable usage in bilingual work environments

---

## 👥 User Personas

### Persona 1: María - Spanish Developer
- **Location**: Barcelona, Spain
- **Language**: Spanish (native), English (intermediate)
- **Need**: Prefers tools in Spanish for faster comprehension
- **Pain Point**: Context switching between Spanish OS and English tools

### Persona 2: Carlos - Bilingual Product Manager
- **Location**: Mexico City, Mexico
- **Language**: Spanish (native), English (fluent)
- **Need**: Shares AI chat app with Spanish-speaking team
- **Pain Point**: Team members struggle with English-only interfaces

### Persona 3: Sarah - US Developer
- **Location**: United States
- **Language**: English (native)
- **Need**: Default English experience with no friction
- **Pain Point**: Doesn't want unnecessary language selection prompts

---

## 🏗️ Technical Architecture

### Technology Stack

**Selected: i18next + react-i18next**
- Built on i18next (industry standard)
- React hooks integration
- TypeScript support
- Namespace organization
- Lazy loading support
- Main process support

```bash
pnpm add i18next react-i18next i18next-fs-backend
```

### File Structure

```
src/
├── renderer/
│   ├── locales/
│   │   ├── en/
│   │   │   ├── common.json        # Common UI text, navigation, actions
│   │   │   ├── settings.json      # Settings page
│   │   │   ├── chat.json          # Chat interface (NO model names)
│   │   │   ├── wizard.json        # Onboarding wizard
│   │   │   ├── mcp.json           # MCP integration
│   │   │   └── errors.json        # User-facing error messages
│   │   └── es/
│   │       ├── common.json
│   │       ├── settings.json
│   │       ├── chat.json
│   │       ├── wizard.json
│   │       ├── mcp.json
│   │       └── errors.json
│   ├── i18n/
│   │   ├── config.ts              # i18next configuration
│   │   ├── types.ts               # TypeScript types
│   │   └── languageDetector.ts    # System locale detection
│   └── ...
└── main/
    ├── locales/
    │   ├── en/
    │   │   ├── menu.json          # Application menu (system conventions)
    │   │   └── dialogs.json       # Native dialogs (update, errors)
    │   └── es/
    │       ├── menu.json
    │       └── dialogs.json
    └── ...

# User data location (language preference)
/Users/oliver/levante/
└── user-profile.json              # Contains language: 'en' | 'es'
```

**Note:** Model names and provider names stay in original English (e.g., "GPT-4", "Claude 3.5 Sonnet", "OpenAI", "Anthropic")

### Translation File Structure

**Example: `locales/en/common.json`**
```json
{
  "app": {
    "name": "Levante",
    "tagline": "Your AI companion"
  },
  "actions": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "confirm": "Confirm",
    "close": "Close"
  },
  "navigation": {
    "chat": "Chat",
    "models": "Models",
    "settings": "Settings",
    "mcp": "MCP Store"
  }
}
```

**Example: `locales/es/common.json`**
```json
{
  "app": {
    "name": "Levante",
    "tagline": "Tu compañero de IA"
  },
  "actions": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Eliminar",
    "edit": "Editar",
    "confirm": "Confirmar",
    "close": "Cerrar"
  },
  "navigation": {
    "chat": "Chat",
    "models": "Modelos",
    "settings": "Configuración",
    "mcp": "Tienda MCP"
  }
}
```

### i18n Configuration

**`src/renderer/i18n/config.ts`**
```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { detectSystemLanguage } from './languageDetector';

// Import translations
import enCommon from '../locales/en/common.json';
import enSettings from '../locales/en/settings.json';
import enChat from '../locales/en/chat.json';
import enModels from '../locales/en/models.json';
import enWizard from '../locales/en/wizard.json';
import enMenu from '../locales/en/menu.json';
import enMCP from '../locales/en/mcp.json';
import enErrors from '../locales/en/errors.json';

import esCommon from '../locales/es/common.json';
import esSettings from '../locales/es/settings.json';
import esChat from '../locales/es/chat.json';
import esModels from '../locales/es/models.json';
import esWizard from '../locales/es/wizard.json';
import esMenu from '../locales/es/menu.json';
import esMCP from '../locales/es/mcp.json';
import esErrors from '../locales/es/errors.json';

const resources = {
  en: {
    common: enCommon,
    settings: enSettings,
    chat: enChat,
    models: enModels,
    wizard: enWizard,
    menu: enMenu,
    mcp: enMCP,
    errors: enErrors,
  },
  es: {
    common: esCommon,
    settings: esSettings,
    chat: esChat,
    models: esModels,
    wizard: esWizard,
    menu: esMenu,
    mcp: esMCP,
    errors: esErrors,
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: true,
    },
  });

export default i18n;
```

**`src/renderer/i18n/languageDetector.ts`**
```typescript
/**
 * Detect system language from OS locale
 * Returns 'en' or 'es', defaults to 'en' for unsupported languages
 */
export function detectSystemLanguage(): 'en' | 'es' {
  const systemLocale = navigator.language || navigator.languages[0];

  // Extract language code (e.g., 'es-ES' -> 'es', 'en-US' -> 'en')
  const languageCode = systemLocale.split('-')[0].toLowerCase();

  // Return 'es' if Spanish, otherwise default to 'en'
  return languageCode === 'es' ? 'es' : 'en';
}
```

---

## 🎨 User Experience

### Language Detection Flow (Wizard)

```
┌─────────────────────────────────────┐
│  User Opens Levante First Time     │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  Detect System Locale               │
│  - macOS: NSLocale                  │
│  - Windows: GetUserDefaultLocaleName│
│  - Linux: $LANG environment         │
└────────────────┬────────────────────┘
                 │
          ┌──────┴──────┐
          │             │
          ▼             ▼
     ┌────────┐    ┌────────┐
     │   ES   │    │  Other │
     └───┬────┘    └───┬────┘
         │             │
         ▼             ▼
    ┌─────────┐   ┌─────────┐
    │ Set ES  │   │ Set EN  │
    └────┬────┘   └────┬────┘
         │             │
         └──────┬──────┘
                ▼
┌─────────────────────────────────────┐
│  Wizard Step 1: Language            │
│  ┌───────────────────────────────┐  │
│  │ Choose your language          │  │
│  │ Elige tu idioma               │  │
│  │                               │  │
│  │ ○ English                     │  │
│  │ ● Español  (detected)         │  │
│  │                               │  │
│  │ Detected from your system.    │  │
│  │ You can change this later in  │  │
│  │ Settings.                     │  │
│  └───────────────────────────────┘  │
│                                     │
│              [Continue]             │
└─────────────────────────────────────┘

After selection, wizard continues in chosen language
```

### Language Change Flow (Settings)

```
┌─────────────────────────────────────┐
│  Settings Page                      │
│  ┌───────────────────────────────┐  │
│  │ Appearance                    │  │
│  │                               │  │
│  │ Language                      │  │
│  │ Requires app restart          │  │
│  │ ┌─────────────────────────┐   │  │
│  │ │ English           ▼     │   │  │
│  │ └─────────────────────────┘   │  │
│  │   └─ English                  │  │
│  │   └─ Español                  │  │
│  │                               │  │
│  │ Theme                         │  │
│  │ [System ▼]                    │  │
│  └───────────────────────────────┘  │
│              [Save]                 │
└─────────────────────────────────────┘
         │ User selects Español + Save
         ▼
┌─────────────────────────────────────┐
│  Confirmation Dialog                │
│  ┌───────────────────────────────┐  │
│  │ Restart Required              │  │
│  │                               │  │
│  │ Language will change to       │  │
│  │ Spanish after restarting.     │  │
│  │                               │  │
│  │    [Restart Now] [Later]      │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
         │ If "Restart Now"
         ▼
┌─────────────────────────────────────┐
│  App Restarts                       │
│  - Preference saved to              │
│    /Users/oliver/levante/           │
│    user-profile.json                │
│  - App loads in Spanish             │
└─────────────────────────────────────┘
```

### Settings Page UI

**English Version:**
```
┌────────────────────────────────────────────┐
│ Settings                                   │
│                                            │
│ ┌──────────────────────────────────────┐   │
│ │ Appearance                           │   │
│ │                                      │   │
│ │ Language                             │   │
│ │ Choose your preferred language       │   │
│ │ ┌──────────────────────────────┐     │   │
│ │ │ English               ▼      │     │   │
│ │ └──────────────────────────────┘     │   │
│ │                                      │   │
│ │ Theme                                │   │
│ │ Select color theme                   │   │
│ │ ┌──────────────────────────────┐     │   │
│ │ │ System                ▼      │     │   │
│ │ └──────────────────────────────┘     │   │
│ └──────────────────────────────────────┘   │
└────────────────────────────────────────────┘
```

**Spanish Version:**
```
┌────────────────────────────────────────────┐
│ Configuración                              │
│                                            │
│ ┌──────────────────────────────────────┐   │
│ │ Apariencia                           │   │
│ │                                      │   │
│ │ Idioma                               │   │
│ │ Elige tu idioma preferido            │   │
│ │ ┌──────────────────────────────┐     │   │
│ │ │ Español               ▼      │     │   │
│ │ └──────────────────────────────┘     │   │
│ │                                      │   │
│ │ Tema                                 │   │
│ │ Selecciona el tema de color          │   │
│ │ ┌──────────────────────────────┐     │   │
│ │ │ Sistema               ▼      │     │   │
│ │ └──────────────────────────────┘     │   │
│ └──────────────────────────────────────┘   │
└────────────────────────────────────────────┘
```

---

## 🔧 Implementation Plan

### Phase 1: Infrastructure Setup ✅

**Estimated Time:** 2-3 days

**Tasks:**
1. Install i18n dependencies
   ```bash
   pnpm add react-i18next i18next
   pnpm add -D @types/react-i18next
   ```

2. Create directory structure
   ```bash
   mkdir -p src/renderer/locales/{en,es}
   mkdir -p src/renderer/i18n
   mkdir -p src/main/locales/{en,es}
   ```

3. Setup i18n configuration
   - Create `src/renderer/i18n/config.ts`
   - Create `src/renderer/i18n/languageDetector.ts`
   - Create `src/renderer/i18n/types.ts`

4. Initialize i18n in App.tsx
   ```typescript
   import './i18n/config';
   ```

5. Update UserProfile type and storage location
   ```typescript
   // src/types/userProfile.ts
   interface UserProfile {
     id: string;
     language: 'en' | 'es';  // NEW FIELD
     theme: 'light' | 'dark' | 'system';
     personalization: PersonalizationSettings;
     createdAt: number;
     updatedAt: number;
   }
   ```

6. Update userProfileService to save to correct location
   ```typescript
   // Storage path: /Users/oliver/levante/user-profile.json
   const LEVANTE_DIR = '/Users/oliver/levante';
   const PROFILE_FILE = 'user-profile.json';
   ```

**Deliverables:**
- ✅ Working i18n infrastructure
- ✅ Language detection from system locale
- ✅ Base translation files (empty structure)

---

### Phase 2: Translation Files Creation ✅

**Estimated Time:** 4-5 days

**Tasks:**

1. **Common Translations** (`common.json`)
   - App name and tagline
   - Common actions (Save, Cancel, Delete, etc.)
   - Navigation items
   - Status messages

2. **Settings Page** (`settings.json`)
   - All settings labels and descriptions
   - Personality options
   - Theme options
   - **Language selector** (new!)
   - AI configuration labels

3. **Chat Interface** (`chat.json`)
   - Input placeholders
   - Message status
   - Model selection UI labels (NOT model names)
   - Stop/Send buttons
   - Empty states
   - **Note:** Model names like "GPT-4 Turbo" stay in English

4. **Wizard** (`wizard.json`)
   - Welcome messages
   - **Language selection step** (first step!)
   - Step instructions
   - Directory setup
   - Provider configuration (labels only, not provider names)
   - Completion messages

5. **Application Menu** (`menu.json`)
   - Menu items following OS conventions:
     - **macOS**: "Levante", "File", "Edit", "View", "Window", "Help"
     - **Windows/Linux**: Translate to Spanish if OS is in Spanish
   - Menu actions (Check for Updates, Quit, etc.)
   - Shortcuts display (⌘Q, Ctrl+Q, etc.)

6. **MCP Integration** (`mcp.json`)
   - Store page
   - Server configuration labels
   - Tool descriptions
   - Health status messages
   - Error messages

7. **Error Messages** (`errors.json`)
   - User-facing error messages only:
     - Database errors
     - Network errors
     - Validation errors
     - API errors
   - **Note:** Internal debug logs stay in English

8. **Dialogs** (Main Process - `dialogs.json`)
   - Update check dialogs
   - Confirmation dialogs
   - Error alerts
   - File picker labels

**Translation Guidelines:**
- Use professional, neutral tone
- Keep technical terms consistent (e.g., "API Key" = "Clave de API")
- **Maintain brand name "Levante" untranslated**
- **Model names stay in English** (GPT-4, Claude 3.5 Sonnet, Gemini Pro, etc.)
- **Provider names stay in English** (OpenAI, Anthropic, Google, OpenRouter, etc.)
- Translate UI labels but not technical identifiers
- Internal logs and developer messages stay in English

**Deliverables:**
- ✅ Complete EN translations
- ✅ Complete ES translations
- ✅ Translation review checklist

---

### Phase 3: UI Integration ✅

**Estimated Time:** 5-6 days

**Tasks:**

1. **Replace hardcoded strings in components**

   Before:
   ```tsx
   <Button>Save</Button>
   ```

   After:
   ```tsx
   import { useTranslation } from 'react-i18next';

   const { t } = useTranslation('common');
   <Button>{t('actions.save')}</Button>
   ```

2. **Components to update:**
   - `src/renderer/pages/SettingsPage.tsx`
   - `src/renderer/pages/ChatPage.tsx`
   - `src/renderer/pages/ModelsPage.tsx`
   - `src/renderer/components/onboarding/*`
   - `src/renderer/components/layout/MainLayout.tsx`
   - `src/renderer/components/mcp/*`
   - All dialog components

3. **Main Process Updates**
   - Update `src/main/menu.ts` for translated menus
   - Update `src/main/services/updateService.ts` for dialogs
   - Create i18n helper for main process

4. **Add language selector to Settings**
   ```tsx
   <Select
     value={language}
     onValueChange={handleLanguageChange}
   >
     <SelectTrigger>
       <SelectValue />
     </SelectTrigger>
     <SelectContent>
       <SelectItem value="en">English</SelectItem>
       <SelectItem value="es">Español</SelectItem>
     </SelectContent>
   </Select>
   ```

**Deliverables:**
- ✅ All UI components use i18n
- ✅ No hardcoded user-facing strings
- ✅ Language selector in Settings

---

### Phase 4: Wizard Integration ✅

**Estimated Time:** 2-3 days

**Tasks:**

1. Detect system language on first launch
   ```typescript
   const systemLang = detectSystemLanguage();
   await window.levante.profile.update({ language: systemLang });
   ```

2. Add language selection as first wizard step (optional)
   - Show detected language
   - Allow user to override
   - Save preference immediately

3. Update all wizard steps with translations
   - DirectoryStep
   - ProviderStep
   - CompletionStep

**Deliverables:**
- ✅ Auto-detection works on first launch
- ✅ Wizard displays in detected language
- ✅ User can change language in wizard

---

### Phase 5: Preferences Integration ✅

**Estimated Time:** 2 days

**Tasks:**

1. Add language to UserProfile schema
   ```typescript
   interface UserProfile {
     id: string;
     language: 'en' | 'es';
     theme: 'light' | 'dark' | 'system';
     personalization: PersonalizationSettings;
     createdAt: number;
     updatedAt: number;
   }
   ```

2. Update preferences service to handle language
   - Load language on app start
   - Apply language immediately
   - Save language changes

3. Create `useLanguage` hook
   ```typescript
   export function useLanguage() {
     const { i18n } = useTranslation();
     const [language, setLanguage] = useState<'en' | 'es'>('en');

     const changeLanguage = async (lang: 'en' | 'es') => {
       // Save to user-profile.json at /Users/oliver/levante/
       await window.levante.profile.update({ language: lang });
       setLanguage(lang);

       // Show restart dialog
       const shouldRestart = await showRestartDialog();
       if (shouldRestart) {
         // Restart app
         await window.levante.app.restart();
       }
     };

     return { language, changeLanguage };
   }
   ```

4. Add app restart IPC handler
   ```typescript
   // src/main/main.ts
   ipcMain.handle('levante/app/restart', () => {
     app.relaunch();
     app.quit();
   });
   ```

**Deliverables:**
- ✅ Language persisted in `/Users/oliver/levante/user-profile.json`
- ✅ Language changes apply after app restart
- ✅ Settings page shows current language with restart notice
- ✅ Restart confirmation dialog

---

### Phase 6: Date/Number Formatting ✅

**Estimated Time:** 1-2 days

**Tasks:**

1. Use `date-fns` with locale support
   ```typescript
   import { format } from 'date-fns';
   import { es, enUS } from 'date-fns/locale';

   const locale = language === 'es' ? es : enUS;
   format(date, 'PPpp', { locale });
   ```

2. Format dates consistently
   - EN: MM/DD/YYYY, 12:00 PM
   - ES: DD/MM/YYYY, 12:00

3. Number formatting (if needed)
   - EN: 1,234.56
   - ES: 1.234,56

**Deliverables:**
- ✅ Date formatting follows locale
- ✅ Time formatting follows locale

---

### Phase 7: Testing & QA ✅

**Estimated Time:** 3-4 days

**Tasks:**

1. **Manual Testing**
   - [ ] Test all pages in EN
   - [ ] Test all pages in ES
   - [ ] Test language switching
   - [ ] Test wizard language detection
   - [ ] Test settings persistence

2. **Edge Cases**
   - [ ] Missing translations (fallback to EN)
   - [ ] Very long Spanish text (layout)
   - [ ] Special characters (á, é, í, ó, ú, ñ, ¿, ¡)
   - [ ] Pluralization rules

3. **Platform Testing**
   - [ ] macOS (EN/ES detection)
   - [ ] Windows (EN/ES detection)
   - [ ] Linux (EN/ES detection)

4. **Create translation validation script**
   ```typescript
   // scripts/validate-translations.ts
   // Ensures all keys exist in both EN and ES
   ```

**Deliverables:**
- ✅ All tests passing
- ✅ Translation validation script
- ✅ QA checklist completed

---

### Phase 8: Documentation ✅

**Estimated Time:** 1 day

**Tasks:**

1. Update README with language support
2. Create translation contribution guide
3. Document how to add new translations
4. Update CLAUDE.md with i18n patterns

**Deliverables:**
- ✅ Updated documentation
- ✅ Translation guide for contributors

---

## 📊 Success Metrics

### User Metrics
- **Language Distribution**: % of users using ES vs EN
- **Language Change Rate**: How often users switch languages
- **Wizard Completion Rate**: Compare before/after i18n

### Technical Metrics
- **Translation Coverage**: 100% of user-facing strings
- **Missing Translation Rate**: 0% fallbacks in production
- **Performance Impact**: < 50ms additional load time
- **Bundle Size**: < 100KB additional for all translations

### Quality Metrics
- **Translation Accuracy**: Native speaker review
- **UI Layout**: No overflow/truncation issues
- **Consistency**: Same terminology across app

---

## 🚨 Risks & Mitigation

### Risk 1: Incomplete Translations
**Impact:** High - Users see English mixed with Spanish
**Probability:** Medium
**Mitigation:**
- Translation validation script in CI/CD
- Block PRs with missing translations
- Fallback to English with warning logged

### Risk 2: Layout Issues with Spanish Text
**Impact:** Medium - UI breaks with longer Spanish text
**Probability:** Medium
**Mitigation:**
- Use flexible layouts (flex, grid)
- Test all pages with Spanish
- Add max-width where needed
- Use CSS `text-overflow: ellipsis` for long text

### Risk 3: Performance Impact
**Impact:** Low - Slower app load
**Probability:** Low
**Mitigation:**
- Lazy load translation files
- Bundle only active language
- Monitor bundle size

### Risk 4: Maintenance Burden
**Impact:** Medium - Every new feature needs 2x translations
**Probability:** High
**Mitigation:**
- Template for new features (include i18n keys)
- Translation validation in PR checklist
- Community translation contributions

---

## 🔄 Future Enhancements

### Post-MVP Features
- [ ] Additional languages (FR, DE, PT, IT)
- [ ] User-contributed translations (Crowdin integration)
- [ ] AI-powered translation suggestions
- [ ] Language-specific AI prompt templates
- [ ] Locale-specific date/time formats
- [ ] Currency formatting
- [ ] Keyboard shortcut localization

---

## 📝 Appendix

### A. Translation Key Naming Convention

```
namespace.category.item[.variant]
```

**Examples:**
- `common.actions.save` → "Save" / "Guardar"
- `settings.theme.options.light` → "Light" / "Claro"
- `chat.input.placeholder` → "Type a message..." / "Escribe un mensaje..."
- `errors.network.connection_failed` → "Connection failed" / "Conexión fallida"

**What NOT to translate:**
- Model names: `GPT-4 Turbo`, `Claude 3.5 Sonnet`, `Gemini Pro`
- Provider names: `OpenAI`, `Anthropic`, `Google`, `OpenRouter`
- Technical IDs: `gpt-4-turbo-preview`, `claude-3-5-sonnet-20241022`
- Internal log messages (logger.core.debug, logger.aiSdk.info, etc.)
- Error codes: `ERR_NETWORK_001`

### B. Pluralization Rules

**English:**
```json
{
  "items": "{{count}} item",
  "items_plural": "{{count}} items"
}
```

**Spanish:**
```json
{
  "items": "{{count}} elemento",
  "items_plural": "{{count}} elementos"
}
```

### C. Variable Interpolation

```typescript
// Translation file
{
  "welcome": "Hello, {{name}}!"
}

// Usage
t('common.welcome', { name: 'María' })
// Output: "Hello, María!"
```

### D. Context-Specific Translations

```json
{
  "delete": "Delete",
  "delete_confirm": "Are you sure you want to delete {{item}}?",
  "delete_success": "{{item}} deleted successfully"
}
```

### E. System Locale Detection

**macOS:**
```bash
defaults read -g AppleLocale
# Returns: es_ES, en_US, etc.
```

**Windows:**
```javascript
navigator.language // 'es-ES', 'en-US'
```

**Linux:**
```bash
echo $LANG
# Returns: es_ES.UTF-8, en_US.UTF-8
```

---

## ✅ Acceptance Criteria

### Must Have
- [ ] English and Spanish translations for all UI text
- [ ] Model names and provider names stay in English
- [ ] Internal logs stay in English
- [ ] Automatic language detection during first launch (wizard step 1)
- [ ] Manual language selection in Settings
- [ ] Language persisted in `/Users/oliver/levante/user-profile.json`
- [ ] App restart required after language change
- [ ] Restart confirmation dialog
- [ ] All user-facing dialogs and menus translated
- [ ] System menu names follow OS conventions
- [ ] No hardcoded user-facing strings
- [ ] Translation validation script in CI

### Should Have
- [x] Date/time formatting per locale
- [x] Graceful fallback for missing translations
- [x] Translation contribution guide
- [x] Native speaker review of Spanish translations

### Nice to Have
- [ ] Language switching keyboard shortcut
- [ ] Translation preview in development mode
- [ ] Automatic missing translation detection
- [ ] Community translation platform integration

---

## 📚 References

- [i18next Documentation](https://www.i18next.com/)
- [react-i18next Documentation](https://react.i18next.com/)
- [MDN: Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
- [date-fns Locales](https://date-fns.org/docs/I18n)
- [Electron Localization](https://www.electronjs.org/docs/latest/tutorial/localization)

---

**Last Updated:** 2025-10-22
**Next Review:** After Phase 1 completion
**Questions/Feedback:** Contact Levante Team
