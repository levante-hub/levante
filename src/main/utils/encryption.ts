import { safeStorage } from 'electron';
import { getLogger } from '../services/logging';

const logger = getLogger();

/**
 * Configuration: Fields that should be encrypted
 * Use JSONPath-like syntax to specify nested fields
 *
 * Examples:
 * - 'providers[].apiKey' - Encrypt apiKey in all provider objects
 * - 'cloudConfig.secret' - Encrypt a specific nested field
 * - 'sensitiveData' - Encrypt a top-level field
 */
export const ENCRYPTED_FIELDS = [
  'providers[].apiKey',  // API keys in provider configs
];

/**
 * Encryption utility for sensitive values
 * Uses Electron's safeStorage API for platform-native encryption
 */

/**
 * Encrypt a string value
 * Returns base64-encoded encrypted data
 */
export function encryptValue(plaintext: string): string {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      logger.core.warn('Encryption not available, storing value in plaintext');
      return plaintext;
    }

    const encrypted = safeStorage.encryptString(plaintext);
    const base64 = encrypted.toString('base64');

    // Prefix with marker to identify encrypted values
    return `ENCRYPTED:${base64}`;
  } catch (error) {
    logger.core.error('Failed to encrypt value', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

/**
 * Decrypt a string value
 * Returns plaintext if value is encrypted, otherwise returns as-is
 */
export function decryptValue(ciphertext: string): string {
  try {
    // Check if value is encrypted
    if (!ciphertext.startsWith('ENCRYPTED:')) {
      // Not encrypted - return as-is (backward compatibility)
      return ciphertext;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      logger.core.warn('Encryption not available, cannot decrypt value');
      return ciphertext;
    }

    // Remove prefix and decode base64
    const base64 = ciphertext.replace('ENCRYPTED:', '');
    const encrypted = Buffer.from(base64, 'base64');

    const plaintext = safeStorage.decryptString(encrypted);
    return plaintext;
  } catch (error) {
    logger.core.error('Failed to decrypt value', {
      error: error instanceof Error ? error.message : error
    });
    // Return ciphertext on error (don't break the app)
    return ciphertext;
  }
}

/**
 * Check if a value is encrypted
 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith('ENCRYPTED:');
}

/**
 * Encrypt API key in provider config
 */
export function encryptProviderApiKey(provider: any): any {
  if (!provider) return provider;

  const encrypted = { ...provider };

  if (encrypted.apiKey && typeof encrypted.apiKey === 'string') {
    // Only encrypt if not already encrypted
    if (!isEncrypted(encrypted.apiKey)) {
      encrypted.apiKey = encryptValue(encrypted.apiKey);
    }
  }

  return encrypted;
}

/**
 * Decrypt API key in provider config
 */
export function decryptProviderApiKey(provider: any): any {
  if (!provider) return provider;

  const decrypted = { ...provider };

  if (decrypted.apiKey && typeof decrypted.apiKey === 'string') {
    // Only decrypt if the value is actually encrypted
    if (isEncrypted(decrypted.apiKey)) {
      decrypted.apiKey = decryptValue(decrypted.apiKey);
    }
    // If not encrypted, leave as-is (already plaintext)
  }

  return decrypted;
}

/**
 * Encrypt API keys in all providers
 */
export function encryptProvidersApiKeys(providers: any[]): any[] {
  if (!Array.isArray(providers)) return providers;

  return providers.map(encryptProviderApiKey);
}

/**
 * Decrypt API keys in all providers
 */
export function decryptProvidersApiKeys(providers: any[]): any[] {
  if (!Array.isArray(providers)) return providers;

  return providers.map(decryptProviderApiKey);
}
