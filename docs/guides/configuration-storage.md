# Configuration Storage and Migrations

**Date:** 2025-10-29
**Status:** Active
**Version:** 1.1.0

This guide explains Levante's configuration storage architecture, encryption implementation, and migration system.

## Table of Contents

- [Overview](#overview)
- [Configuration Files](#configuration-files)
- [Encryption](#encryption)
- [Migration System](#migration-system)
- [Adding New Configuration Fields](#adding-new-configuration-fields)
- [Creating New Migrations](#creating-new-migrations)
- [Testing Migrations](#testing-migrations)
- [Troubleshooting](#troubleshooting)

---

## Overview

Levante uses **electron-store** for all configuration storage with **selective encryption** for sensitive data. All configuration files are stored in `~/levante/` directory.

### Key Features

- ✅ **Selective encryption** - Only sensitive values (API keys) encrypted using safeStorage API
- ✅ **Automatic migrations** - Version-controlled schema updates
- ✅ **Type-safe** - Full TypeScript support with JSON schema validation
- ✅ **Centralized** - All config in one directory
- ✅ **Readable JSON** - Files remain human-readable with encrypted values marked

---

## Configuration Files

### Directory Structure

```
~/levante/
├── .config-version          # Migration version tracker
├── ui-preferences.json      # User interface preferences (API keys encrypted)
├── user-profile.json        # User profile data (no encryption)
├── levante.db              # SQLite database
└── logs/                   # Application logs
```

### ui-preferences.json

**Purpose:** User interface and application preferences

**Managed by:** `PreferencesService`
**Location:** `src/main/services/preferencesService.ts`

**Contents:**
```typescript
{
  // UI Preferences
  theme: 'light' | 'dark' | 'system',
  language: 'en' | 'es',

  // Window Settings
  windowBounds: { width, height, x, y },
  sidebarCollapsed: boolean,
  chatInputHeight: number,

  // Display Settings
  fontSize: 'small' | 'medium' | 'large',
  codeTheme: 'light' | 'dark' | 'auto',
  showLineNumbers: boolean,
  wordWrap: boolean,
  autoSave: boolean,

  // Notifications
  notifications: {
    showDesktop: boolean,
    showInApp: boolean,
    soundEnabled: boolean
  },

  // Keyboard Shortcuts
  shortcuts: {
    newChat: string,
    toggleSidebar: string,
    search: string
  },

  // AI Providers (includes API keys - encrypted!)
  providers: ProviderConfig[],
  activeProvider: string | null,

  // AI Configuration
  ai: {
    baseSteps: number,
    maxSteps: number
  },

  // Warnings
  hasAcceptedFreeModelWarning: boolean,
  hasAcceptedPaidModelWarning: boolean
}
```

### user-profile.json

**Purpose:** User profile and personalization data

**Managed by:** `UserProfileService`
**Location:** `src/main/services/userProfileService.ts`

**Contents:**
```typescript
{
  // Onboarding Wizard
  wizard: 'not_started' | 'in_progress' | 'completed',
  completedAt?: string,
  initialProvider?: string,

  // Metadata
  version: string,
  userId?: string,
  installedAt?: string,

  // AI Personalization
  personalization?: {
    enabled: boolean,
    personality: 'default' | 'cynic' | 'robot' | 'listener' | 'nerd',
    customInstructions?: string,
    nickname?: string,
    occupation?: string,
    aboutUser?: string
  }
}
```

---

## Encryption

### Selective Encryption Approach

Levante uses **selective field-level encryption** - only sensitive values are encrypted, not entire files. This provides:
- ✅ Security for sensitive data (API keys)
- ✅ Human-readable configuration files
- ✅ Easy debugging and troubleshooting
- ✅ No performance overhead for non-sensitive data

### How It Works

**1. Configure Encrypted Fields:**

```typescript
// src/main/utils/encryption.ts
export const ENCRYPTED_FIELDS = [
  'providers[].apiKey',  // Encrypt all API keys in providers array
];
```

**2. Automatic Encryption on Write:**

```typescript
// When saving preferences
await window.levante.preferences.set('providers', [
  {
    id: 'openai',
    apiKey: 'sk-...' // Plain text from user
  }
]);

// PreferencesService automatically encrypts API keys
// Result in ui-preferences.json:
{
  "providers": [{
    "id": "openai",
    "apiKey": "ENCRYPTED:base64encodeddata..."
  }]
}
```

**3. Automatic Decryption on Read:**

```typescript
// When reading preferences
const result = await window.levante.preferences.get('providers');

// PreferencesService automatically decrypts API keys
// User receives:
{
  providers: [{
    id: 'openai',
    apiKey: 'sk-...' // Decrypted plain text
  }]
}
```

### Platform-Specific Protection

Electron's `safeStorage` API provides OS-level encryption:

- **macOS:** Keychain
- **Windows:** DPAPI (Data Protection API)
- **Linux:** libsecret

### What Gets Encrypted

| File | Encrypted Fields | Contains Secrets |
|------|-----------------|------------------|
| `ui-preferences.json` | `providers[].apiKey` only | ✅ API keys |
| `user-profile.json` | None | ❌ No secrets |
| `.config-version` | None | ❌ Version number only |

### Encryption Utility

**Location:** `src/main/utils/encryption.ts`

**Key Functions:**

```typescript
// Encrypt a single value
encryptValue(plaintext: string): string
// Returns: "ENCRYPTED:base64data..."

// Decrypt a single value
decryptValue(ciphertext: string): string
// Returns: original plaintext

// Check if value is encrypted
isEncrypted(value: string): boolean
// Returns: true if starts with "ENCRYPTED:"

// Encrypt/decrypt provider API keys
encryptProvidersApiKeys(providers: any[]): any[]
decryptProvidersApiKeys(providers: any[]): any[]
```

### Example Encrypted File

**ui-preferences.json:**
```json
{
  "theme": "dark",
  "language": "en",
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "apiKey": "ENCRYPTED:SGVsbG8gV29ybGQ=",
      "isActive": true
    }
  ]
}
```

Note how only the `apiKey` value is encrypted while the rest remains readable.

---

## Migration System

### Architecture

The migration system uses semantic versioning to track and apply configuration changes automatically.

**Service:** `ConfigMigrationService`
**Location:** `src/main/services/configMigrationService.ts`

### Migration Flow

```
App Starts
    ↓
1. Read .config-version (e.g., "1.0.0")
    ↓
2. Compare with registered migrations
    ↓
3. Run pending migrations sequentially
    ↓
4. Update .config-version to latest
    ↓
5. Initialize services (PreferencesService, UserProfileService)
```

### Migration Lifecycle

```typescript
// In main.ts
app.whenReady().then(async () => {
  // 1. Initialize database
  await databaseService.initialize();

  // 2. Run config migrations BEFORE initializing services
  await configMigrationService.runMigrations();

  // 3. Initialize services (now reading migrated data)
  await preferencesService.initialize();
  await userProfileService.initialize();

  // 4. Continue app initialization...
});
```

### Existing Migrations

#### Migration 1.0 → 1.1

**Name:** `move-theme-language`
**Date:** 2025-10-29

**Changes:**
- Move `theme` from `user-profile.json` → `ui-preferences.json`
- Move `language` from `user-profile.json` → `ui-preferences.json`
- Remove obsolete fields: `user`, `metadata`, `conversations`
- Clean up `user-profile.json` schema

**Implementation:**
```typescript
{
  version: '1.1.0',
  name: 'move-theme-language',
  description: 'Move theme and language from user-profile.json to ui-preferences.json',
  migrate: async () => {
    // Read old JSON files
    // Extract and move theme/language
    // Clean obsolete fields
    // Write updated files
  }
}
```

---

## Adding New Configuration Fields

### Step 1: Update TypeScript Types

**For ui-preferences:**

```typescript
// src/types/preferences.ts
export interface UIPreferences {
  // ... existing fields

  newFeature: {
    enabled: boolean;
    settings: string;
  };
}
```

**For user-profile:**

```typescript
// src/types/userProfile.ts
export interface UserProfile {
  // ... existing fields

  newUserData?: string;
}
```

### Step 2: Add to electron-store Schema

**For ui-preferences:**

```typescript
// src/main/services/preferencesService.ts
this.store = new Store({
  schema: {
    // ... existing schema

    newFeature: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: false },
        settings: { type: 'string', default: 'default' }
      },
      default: { enabled: false, settings: 'default' }
    }
  }
});
```

**For user-profile:**

```typescript
// src/main/services/userProfileService.ts
this.store = new Store({
  schema: {
    // ... existing schema

    newUserData: {
      type: 'string'
    }
  }
});
```

### Step 3: Update Defaults

```typescript
// src/types/preferences.ts
export const DEFAULT_PREFERENCES: UIPreferences = {
  // ... existing defaults
  newFeature: { enabled: false, settings: 'default' }
};
```

### Step 4: Use in Renderer

```typescript
// In a React component
const result = await window.levante.preferences.get('newFeature');
if (result.success) {
  console.log(result.data); // { enabled: false, settings: 'default' }
}

await window.levante.preferences.set('newFeature', {
  enabled: true,
  settings: 'custom'
});
```

---

## Creating New Migrations

### When to Create a Migration

Create a migration when:
- ✅ Moving fields between config files
- ✅ Renaming fields
- ✅ Changing field structure
- ✅ Removing obsolete fields
- ✅ Transforming data format

**Do NOT create a migration for:**
- ❌ Adding new optional fields (use schema defaults)
- ❌ Changing UI text/labels
- ❌ Code refactoring

### Migration Template

```typescript
// src/main/services/configMigrationService.ts

private registerMigrations(): void {
  // ... existing migrations

  // Migration 1.1 → 1.2: Your migration
  this.migrations.push({
    version: '1.2.0',  // Increment version
    name: 'your-migration-name',
    description: 'Brief description of what this migration does',
    migrate: async () => {
      await this.yourMigrationFunction();
    }
  });
}

private async yourMigrationFunction(): Promise<void> {
  const prefsPath = path.join(directoryService.getBaseDir(), 'ui-preferences.json');
  const profilePath = path.join(directoryService.getBaseDir(), 'user-profile.json');

  try {
    // 1. Read existing files
    const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf-8'));
    const profile = JSON.parse(await fs.readFile(profilePath, 'utf-8'));

    // 2. Transform data
    // ... your migration logic here

    // 3. Write updated files
    await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf-8');

    logger.core.info('Migration 1.1 → 1.2 completed');
  } catch (error) {
    logger.core.error('Migration failed', { error });
    throw error;
  }
}
```

### Migration Best Practices

1. **Version Incrementing:**
   - Patch (1.1.0 → 1.1.1): Bug fixes, no schema changes
   - Minor (1.1.0 → 1.2.0): New fields, backward-compatible
   - Major (1.1.0 → 2.0.0): Breaking changes

2. **Safety:**
   - ✅ Always check if fields exist before accessing
   - ✅ Provide fallback values
   - ✅ Log important steps
   - ✅ Don't throw on missing fields (users may have partial data)

3. **Data Preservation:**
   - ✅ Never delete data without explicit user consent
   - ✅ Move data, don't copy (avoid duplication)
   - ✅ Validate transformed data

4. **Error Handling:**
   ```typescript
   try {
     // Migration logic
   } catch (error) {
     logger.core.error('Migration failed', { error });
     // Don't throw - allow app to continue
     // User data is better than broken app
   }
   ```

---

## Testing Migrations

### Manual Testing

1. **Create test data:**
   ```bash
   # Backup current config
   cp ~/levante/ui-preferences.json ~/levante/ui-preferences.json.backup
   cp ~/levante/user-profile.json ~/levante/user-profile.json.backup

   # Create test data (old version)
   echo "1.0.0" > ~/levante/.config-version
   # Edit JSON files to simulate old structure
   ```

2. **Run app:**
   ```bash
   pnpm dev
   ```

3. **Check logs:**
   ```bash
   tail -f ~/levante/logs/main.log
   # Look for: "Config migration completed"
   ```

4. **Verify data:**
   ```bash
   # Check version updated
   cat ~/levante/.config-version  # Should be "1.2.0"

   # Check files transformed
   cat ~/levante/ui-preferences.json
   cat ~/levante/user-profile.json
   ```

5. **Restore backup:**
   ```bash
   cp ~/levante/ui-preferences.json.backup ~/levante/ui-preferences.json
   cp ~/levante/user-profile.json.backup ~/levante/user-profile.json
   ```

### Automated Testing

```typescript
// tests/migrations.test.ts
import { configMigrationService } from '@/main/services/configMigrationService';

describe('Config Migrations', () => {
  it('should migrate from 1.0 to 1.1', async () => {
    // Setup: Create v1.0 config files
    // Run: configMigrationService.runMigrations()
    // Assert: Verify v1.1 structure
  });
});
```

---

## Troubleshooting

### Migration Not Running

**Symptom:** Config version stays at old version

**Check:**
1. Verify `.config-version` exists and is readable
2. Check logs for migration errors
3. Ensure migration version > current version

**Fix:**
```bash
# Force re-run migration
rm ~/levante/.config-version
# Restart app
```

### Encrypted Files Unreadable

**Symptom:** "Failed to decrypt" errors

**Possible causes:**
- Encryption key changed
- Platform security changed (e.g., password changed)
- Corrupted `.encryption-key` file

**Fix:**
```bash
# Last resort: Reset encryption
# WARNING: Loses all config data!
rm ~/levante/.encryption-key
rm ~/levante/ui-preferences.json
rm ~/levante/user-profile.json
# Restart app to regenerate
```

### Migration Failed Mid-Way

**Symptom:** Some data migrated, some not

**Check:**
1. View logs: `~/levante/logs/main.log`
2. Check which migration step failed
3. Verify file permissions

**Fix:**
```bash
# Restore from backup
cp ~/levante/ui-preferences.json.backup ~/levante/ui-preferences.json

# Reset migration version to retry
echo "1.0.0" > ~/levante/.config-version

# Restart app
```

### Schema Validation Errors

**Symptom:** electron-store throws validation errors

**Fix:**
1. Check TypeScript types match schema
2. Verify default values are valid
3. Update schema to allow new data types

---

## Developer Checklist

When modifying configuration:

- [ ] Updated TypeScript types
- [ ] Updated electron-store schema
- [ ] Updated default values
- [ ] Created migration if needed
- [ ] Tested migration with old data
- [ ] Updated this documentation
- [ ] Checked encrypted data works
- [ ] Verified version incremented

---

## Security Considerations

### DO:
- ✅ Store API keys with selective encryption
- ✅ Use safeStorage for encryption
- ✅ Add new sensitive fields to `ENCRYPTED_FIELDS` configuration
- ✅ Test encryption/decryption when adding encrypted fields
- ✅ Keep config files human-readable for debugging

### DON'T:
- ❌ Store secrets in plaintext
- ❌ Encrypt entire files unnecessarily
- ❌ Store passwords (use OS keychain/password manager instead)
- ❌ Skip encryption for API keys or tokens
- ❌ Remove `ENCRYPTED:` prefix manually from files

---

## Further Reading

- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [electron-store documentation](https://github.com/sindresorhus/electron-store)
- [JSON Schema validation](https://json-schema.org/)
- [CLAUDE.md](../../CLAUDE.md) - Project development guide

---

**Last Updated:** 2025-10-29
**Maintainers:** Levante Development Team
