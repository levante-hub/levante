import { preferencesService } from '../../preferencesService';
import type { OAuthTokenData } from '../../../../types/preferences';
import { getLogger } from '../../logging';

/**
 * MCPOAuthTokenManager
 *
 * Simple wrapper over PreferencesService for managing OAuth tokens
 * for MCP servers. Tokens are stored in ui-preferences.json.
 *
 * Encryption behavior:
 * - Follows the same toggle-based pattern as AI provider API keys
 * - When security.encryptApiKeys is enabled in Settings:
 *   * Tokens (access_token, refresh_token) are encrypted using safeStorage
 *   * Uses Electron's safeStorage API (OS Keychain/DPAPI/libsecret)
 * - When disabled, tokens are stored in plaintext JSON
 * - User has full control over encryption via Settings toggle
 *
 * Note: It's recommended to enable encryption for OAuth tokens.
 */
export class MCPOAuthTokenManager {
  private logger = getLogger();

  /**
   * Save OAuth token for an MCP server
   * Tokens are encrypted if security.encryptApiKeys is enabled in preferences
   *
   * @param serverId - Unique identifier for the MCP server (e.g., "figma", "github-mcp")
   * @param token - OAuth token data (access_token, refresh_token, etc.)
   */
  async saveToken(serverId: string, token: OAuthTokenData): Promise<void> {
    try {
      const tokens = preferencesService.get('mcpOAuthTokens') || {};
      tokens[serverId] = token;
      preferencesService.set('mcpOAuthTokens', tokens);

      this.logger.mcp.info('OAuth token saved for MCP server', {
        serverId,
        hasRefreshToken: !!token.refresh_token,
        expiresAt: token.expires_at ? new Date(token.expires_at).toISOString() : undefined
      });
    } catch (error) {
      this.logger.mcp.error('Failed to save OAuth token', {
        serverId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get OAuth token for an MCP server
   * Tokens are decrypted if security.encryptApiKeys is enabled in preferences
   *
   * @param serverId - Unique identifier for the MCP server
   * @returns OAuth token data if found, null otherwise
   */
  async getToken(serverId: string): Promise<OAuthTokenData | null> {
    try {
      const tokens = preferencesService.get('mcpOAuthTokens') || {};
      const token = tokens[serverId];

      if (!token) {
        this.logger.mcp.debug('No OAuth token found for MCP server', { serverId });
        return null;
      }

      this.logger.mcp.debug('OAuth token retrieved for MCP server', {
        serverId,
        hasRefreshToken: !!token.refresh_token,
        isExpired: token.expires_at ? Date.now() > token.expires_at : undefined
      });

      return token;
    } catch (error) {
      this.logger.mcp.error('Failed to get OAuth token', {
        serverId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Delete OAuth token for an MCP server
   *
   * @param serverId - Unique identifier for the MCP server
   */
  async deleteToken(serverId: string): Promise<void> {
    try {
      const tokens = preferencesService.get('mcpOAuthTokens') || {};

      if (!tokens[serverId]) {
        this.logger.mcp.warn('Attempted to delete non-existent OAuth token', { serverId });
        return;
      }

      delete tokens[serverId];
      preferencesService.set('mcpOAuthTokens', tokens);

      this.logger.mcp.info('OAuth token deleted for MCP server', { serverId });
    } catch (error) {
      this.logger.mcp.error('Failed to delete OAuth token', {
        serverId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Check if token exists and is valid (not expired)
   *
   * @param serverId - Unique identifier for the MCP server
   * @returns true if token exists and is not expired, false otherwise
   */
  async isTokenValid(serverId: string): Promise<boolean> {
    try {
      const token = await this.getToken(serverId);

      if (!token) {
        return false;
      }

      // If no expiration time, consider it valid
      if (!token.expires_at) {
        return true;
      }

      // Check if token is expired (with 5 minute buffer for clock skew)
      const buffer = 5 * 60 * 1000; // 5 minutes in ms
      const isValid = Date.now() < (token.expires_at - buffer);

      if (!isValid) {
        this.logger.mcp.debug('OAuth token expired for MCP server', {
          serverId,
          expiresAt: new Date(token.expires_at).toISOString()
        });
      }

      return isValid;
    } catch (error) {
      this.logger.mcp.error('Failed to check token validity', {
        serverId,
        error: error instanceof Error ? error.message : error
      });
      return false;
    }
  }

  /**
   * Get all stored OAuth tokens
   * Useful for debugging or showing connected accounts in UI
   *
   * @returns Record of serverId -> token data
   */
  async getAllTokens(): Promise<Record<string, OAuthTokenData>> {
    try {
      return preferencesService.get('mcpOAuthTokens') || {};
    } catch (error) {
      this.logger.mcp.error('Failed to get all OAuth tokens', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Clear all OAuth tokens
   * Useful for logout/reset functionality
   */
  async clearAllTokens(): Promise<void> {
    try {
      preferencesService.set('mcpOAuthTokens', {});
      this.logger.mcp.info('All OAuth tokens cleared');
    } catch (error) {
      this.logger.mcp.error('Failed to clear all OAuth tokens', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }
}

// Singleton instance
export const mcpOAuthTokenManager = new MCPOAuthTokenManager();
