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
 *
 * Note: Encryption is controlled by the security.encryptApiKeys toggle in preferences.
 * All fields listed here will be encrypted when the toggle is enabled.
 */
export const ENCRYPTED_FIELDS = [
  'providers[].apiKey',                // API keys in provider configs (OpenRouter, OpenAI, etc.)
  'mcpOAuthTokens.*.access_token',    // OAuth access tokens for MCP servers
  'mcpOAuthTokens.*.refresh_token',   // OAuth refresh tokens for MCP servers
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

/**
 * Encrypt OAuth tokens for MCP servers
 * Encrypts access_token and refresh_token when security.encryptApiKeys is enabled
 *
 * @param tokens - Record of serverId -> token data
 * @returns Record with encrypted access_token and refresh_token fields
 */
export function encryptMcpOAuthTokens(tokens: Record<string, any>): Record<string, any> {
  if (!tokens || typeof tokens !== 'object') return tokens;

  const encrypted: Record<string, any> = {};

  for (const [serverId, token] of Object.entries(tokens)) {
    if (!token || typeof token !== 'object') {
      encrypted[serverId] = token;
      continue;
    }

    encrypted[serverId] = {
      ...token,
      access_token: token.access_token && typeof token.access_token === 'string'
        ? (isEncrypted(token.access_token) ? token.access_token : encryptValue(token.access_token))
        : token.access_token,
      refresh_token: token.refresh_token && typeof token.refresh_token === 'string'
        ? (isEncrypted(token.refresh_token) ? token.refresh_token : encryptValue(token.refresh_token))
        : token.refresh_token
    };
  }

  return encrypted;
}

/**
 * Decrypt OAuth tokens for MCP servers
 * Decrypts access_token and refresh_token when security.encryptApiKeys is enabled
 *
 * @param tokens - Record of serverId -> token data (with encrypted fields)
 * @returns Record with decrypted access_token and refresh_token fields
 */
export function decryptMcpOAuthTokens(tokens: Record<string, any>): Record<string, any> {
  if (!tokens || typeof tokens !== 'object') return tokens;

  const decrypted: Record<string, any> = {};

  for (const [serverId, token] of Object.entries(tokens)) {
    if (!token || typeof token !== 'object') {
      decrypted[serverId] = token;
      continue;
    }

    decrypted[serverId] = {
      ...token,
      access_token: token.access_token && typeof token.access_token === 'string' && isEncrypted(token.access_token)
        ? decryptValue(token.access_token)
        : token.access_token,
      refresh_token: token.refresh_token && typeof token.refresh_token === 'string' && isEncrypted(token.refresh_token)
        ? decryptValue(token.refresh_token)
        : token.refresh_token
    };
  }

  return decrypted;
}
