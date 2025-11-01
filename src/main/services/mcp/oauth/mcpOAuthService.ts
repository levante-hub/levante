import { BrowserWindow } from 'electron';
import { getLogger } from '../../logging';
import { oauthCallbackServer } from '../../oauth/callbackServer';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '../../oauth/pkce';
import { safeOpenExternal } from '../../../utils/urlSecurity';
import { mcpOAuthTokenManager } from './tokenManager';
import {
  discoverMCPOAuthMetadata,
  discoverFromUnauthorizedResponse,
  type OAuthMetadataWithEndpoints
} from './metadata';
import { getOrRegisterClient } from './dcr';
import type { OAuthTokenResponse, OAuthTokenData } from '../../oauth/types';

const logger = getLogger();

/**
 * Pending OAuth flow state
 * Stores PKCE parameters and metadata for active authorization flows
 */
interface PendingOAuthFlow {
  serverId: string;
  codeVerifier: string;
  state: string;
  metadata: OAuthMetadataWithEndpoints;
  clientId: string;
  resolve: (token: OAuthTokenData) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * MCP OAuth Service
 *
 * Handles OAuth 2.0 authorization flow for MCP servers with PKCE.
 * This is a backend service that runs in the main process.
 *
 * Flow:
 * 1. MCP connection attempt returns 401
 * 2. Discover OAuth metadata from response or .well-known endpoint
 * 3. Generate PKCE parameters (code_verifier, code_challenge, state)
 * 4. Start local callback server
 * 5. Open browser with authorization URL
 * 6. User authorizes in browser
 * 7. Receive callback with authorization code
 * 8. Exchange code for tokens with PKCE verification
 * 9. Save tokens encrypted via MCPOAuthTokenManager
 * 10. Return tokens to caller
 */
export class MCPOAuthService {
  private pendingFlows = new Map<string, PendingOAuthFlow>();
  private mainWindow: BrowserWindow | null = null;
  private readonly CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Set the main window reference (needed for callback server)
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    oauthCallbackServer.setMainWindow(window);

    // Register callback handler to process MCP OAuth callbacks in the backend
    oauthCallbackServer.setCallbackHandler(async (provider: string, code: string, state?: string) => {
      // Only handle MCP providers (not 'openrouter')
      if (provider === 'openrouter') {
        return; // Let renderer handle OpenRouter OAuth
      }

      logger.mcp.debug('Processing MCP OAuth callback', {
        provider,
        codeLength: code.length,
        hasState: !!state
      });

      await this.handleCallback(provider, code, state);
    });
  }

  /**
   * Authorize MCP server with OAuth 2.0 + PKCE
   *
   * This method is called when a 401 response is received from an MCP server.
   * It discovers OAuth metadata, initiates the authorization flow, and returns tokens.
   *
   * @param serverId - Unique identifier for the MCP server
   * @param unauthorizedResponse - The 401 HTTP response from MCP server (optional)
   * @param baseUrl - Base URL of the MCP server (fallback if no response)
   * @param scopes - Optional scopes to request
   * @param oauthConfig - Optional OAuth configuration (client_id, endpoints)
   * @returns OAuth tokens
   * @throws Error if authorization fails
   */
  async authorize(
    serverId: string,
    unauthorizedResponse?: Response,
    baseUrl?: string,
    scopes?: string[],
    oauthConfig?: {
      client_id?: string;
      authorization_endpoint?: string;
      token_endpoint?: string;
      revocation_endpoint?: string;
    }
  ): Promise<OAuthTokenData> {
    try {
      logger.mcp.info('Starting MCP OAuth authorization', {
        serverId,
        hasResponse: !!unauthorizedResponse,
        baseUrl,
        scopes
      });

      // Check if already authorizing
      if (this.pendingFlows.has(serverId)) {
        logger.mcp.warn('OAuth flow already in progress for server', { serverId });
        throw new Error(`OAuth authorization already in progress for ${serverId}`);
      }

      // 1. Discover OAuth metadata or use provided config
      let metadata: OAuthMetadataWithEndpoints | null = null;

      // Use provided OAuth config if available
      if (oauthConfig?.authorization_endpoint && oauthConfig?.token_endpoint) {
        metadata = {
          authorization_endpoint: oauthConfig.authorization_endpoint,
          token_endpoint: oauthConfig.token_endpoint,
          revocation_endpoint: oauthConfig.revocation_endpoint
        };
        logger.mcp.info('Using provided OAuth configuration', {
          serverId,
          hasClientId: !!oauthConfig.client_id
        });
      } else {
        // Discover metadata
        if (unauthorizedResponse) {
          metadata = await discoverFromUnauthorizedResponse(unauthorizedResponse);
          logger.mcp.debug('Metadata discovery from 401 response', {
            serverId,
            found: !!metadata
          });
        }

        if (!metadata && baseUrl) {
          // Use complete MCP OAuth discovery flow
          // This handles both direct metadata and Protected Resource flow
          metadata = await discoverMCPOAuthMetadata(baseUrl);
          logger.mcp.debug('MCP OAuth metadata discovery from base URL', {
            serverId,
            baseUrl,
            found: !!metadata
          });
        }

        if (!metadata) {
          logger.mcp.error('Failed to discover OAuth metadata', {
            serverId,
            hasResponse: !!unauthorizedResponse,
            baseUrl
          });
          throw new Error(`Could not discover OAuth metadata for ${serverId}. Server may not support OAuth.`);
        }
      }

      logger.mcp.info('OAuth metadata discovered', {
        serverId,
        authEndpoint: metadata.authorization_endpoint,
        tokenEndpoint: metadata.token_endpoint,
        supportedScopes: metadata.scopes_supported
      });

      // 2. Generate PKCE parameters
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = generateState();

      logger.mcp.debug('Generated PKCE parameters', {
        serverId,
        codeChallengeLength: codeChallenge.length,
        stateLength: state.length
      });

      // 3. Start callback server
      const { callbackUrl } = await oauthCallbackServer.start();
      oauthCallbackServer.setProvider(serverId); // Set provider to identify callback

      logger.mcp.info('OAuth callback server started', {
        serverId,
        callbackUrl
      });

      // 4. Get or register client_id
      // Priority: user config > discovered metadata > Dynamic Client Registration > fallback
      let clientId: string;
      let clientIdSource: string;

      if (oauthConfig?.client_id) {
        // User explicitly configured client_id
        clientId = oauthConfig.client_id;
        clientIdSource = 'user-config';
      } else if (metadata.client_id) {
        // Server provided client_id in metadata
        clientId = metadata.client_id;
        clientIdSource = 'discovered';
      } else if (metadata.registration_endpoint) {
        // Server supports Dynamic Client Registration (DCR)
        try {
          logger.mcp.info('Attempting Dynamic Client Registration', {
            serverId,
            registrationEndpoint: metadata.registration_endpoint
          });

          clientId = await getOrRegisterClient(
            serverId,
            metadata.registration_endpoint,
            callbackUrl,
            scopes || metadata.scopes_supported
          );
          clientIdSource = 'dcr';

          logger.mcp.info('DCR successful', { serverId, clientId });
        } catch (dcrError) {
          logger.mcp.error('DCR failed, cannot proceed without valid client_id', {
            serverId,
            error: dcrError instanceof Error ? dcrError.message : dcrError,
            stack: dcrError instanceof Error ? dcrError.stack : undefined
          });

          // For MCP servers with DCR, we MUST use DCR - fallback won't work
          throw new Error(
            `Dynamic Client Registration failed: ${dcrError instanceof Error ? dcrError.message : 'Unknown error'}. ` +
            `This server requires DCR and does not accept public client_ids.`
          );
        }
      } else {
        // No DCR support, use fallback
        logger.mcp.warn('No registration_endpoint found, using fallback client_id', { serverId });
        clientId = 'levante-mcp-client';
        clientIdSource = 'fallback';
      }

      logger.mcp.info('Using OAuth client_id', {
        serverId,
        clientId,
        source: clientIdSource
      });

      const authUrl = new URL(metadata.authorization_endpoint);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', callbackUrl);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);

      if (scopes && scopes.length > 0) {
        authUrl.searchParams.set('scope', scopes.join(' '));
      } else if (metadata.scopes_supported && metadata.scopes_supported.length > 0) {
        authUrl.searchParams.set('scope', metadata.scopes_supported.join(' '));
      }

      // 5. Open browser for user authorization
      const authUrlString = authUrl.toString();
      logger.mcp.info('Opening authorization URL in browser', {
        serverId,
        url: authUrlString.substring(0, 100) // Log first 100 chars
      });

      const openResult = await safeOpenExternal(authUrlString, 'mcp-oauth');
      if (!openResult.success) {
        throw new Error(`Failed to open browser: ${openResult.error}`);
      }

      // 6. Wait for callback (returns a Promise)
      return await this.waitForCallback(serverId, codeVerifier, state, metadata, clientId);

    } catch (error) {
      logger.mcp.error('MCP OAuth authorization failed', {
        serverId,
        error: error instanceof Error ? error.message : error
      });

      // Cleanup
      this.pendingFlows.delete(serverId);
      await oauthCallbackServer.stop();

      throw error;
    }
  }

  /**
   * Wait for OAuth callback from authorization server
   *
   * @param serverId - Server ID
   * @param codeVerifier - PKCE code verifier
   * @param state - CSRF state parameter
   * @param metadata - OAuth metadata
   * @param clientId - OAuth client ID
   * @returns Promise that resolves with tokens when callback is received
   */
  private waitForCallback(
    serverId: string,
    codeVerifier: string,
    state: string,
    metadata: OAuthMetadataWithEndpoints,
    clientId: string
  ): Promise<OAuthTokenData> {
    return new Promise((resolve, reject) => {
      // Set timeout for callback
      const timeoutId = setTimeout(() => {
        logger.mcp.warn('OAuth callback timeout', { serverId });
        this.pendingFlows.delete(serverId);
        oauthCallbackServer.stop();
        reject(new Error('OAuth authorization timed out. Please try again.'));
      }, this.CALLBACK_TIMEOUT_MS);

      // Store pending flow
      this.pendingFlows.set(serverId, {
        serverId,
        codeVerifier,
        state,
        metadata,
        clientId,
        resolve,
        reject,
        timeoutId
      });

      logger.mcp.debug('Waiting for OAuth callback', {
        serverId,
        timeout: this.CALLBACK_TIMEOUT_MS
      });
    });
  }

  /**
   * Handle OAuth callback from authorization server
   *
   * This method is called by the IPC handler when a callback is received.
   *
   * @param serverId - Server ID (from provider field in callback)
   * @param code - Authorization code
   * @param receivedState - State parameter from callback
   */
  async handleCallback(serverId: string, code: string, receivedState?: string): Promise<void> {
    const pendingFlow = this.pendingFlows.get(serverId);

    if (!pendingFlow) {
      logger.mcp.warn('Received OAuth callback for unknown server', { serverId });
      return;
    }

    try {
      // Validate state (CSRF protection)
      if (receivedState && receivedState !== pendingFlow.state) {
        throw new Error('State mismatch - possible CSRF attack');
      }

      logger.mcp.info('Processing OAuth callback', {
        serverId,
        codeLength: code.length,
        stateValid: receivedState === pendingFlow.state
      });

      // Exchange authorization code for tokens
      const tokens = await this.exchangeCodeForTokens(
        code,
        pendingFlow.codeVerifier,
        pendingFlow.metadata,
        pendingFlow.clientId
      );

      // Add metadata to tokens for future refresh/revocation
      tokens.metadata = {
        token_endpoint: pendingFlow.metadata.token_endpoint,
        revocation_endpoint: pendingFlow.metadata.revocation_endpoint
      };

      // Save tokens with metadata
      await mcpOAuthTokenManager.saveToken(serverId, tokens);

      logger.mcp.info('OAuth authorization completed successfully', {
        serverId,
        hasRefreshToken: !!tokens.refresh_token,
        expiresAt: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : 'never'
      });

      // Clear timeout and resolve promise
      clearTimeout(pendingFlow.timeoutId);
      pendingFlow.resolve(tokens);

    } catch (error) {
      logger.mcp.error('Failed to process OAuth callback', {
        serverId,
        error: error instanceof Error ? error.message : error
      });

      clearTimeout(pendingFlow.timeoutId);
      pendingFlow.reject(error instanceof Error ? error : new Error('Unknown error'));

    } finally {
      this.pendingFlows.delete(serverId);
      await oauthCallbackServer.stop();
    }
  }

  /**
   * Exchange authorization code for access/refresh tokens
   *
   * @param code - Authorization code from callback
   * @param codeVerifier - PKCE code verifier
   * @param metadata - OAuth metadata with token endpoint
   * @param clientId - OAuth client ID
   * @returns OAuth tokens
   */
  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    metadata: OAuthMetadataWithEndpoints,
    clientId: string
  ): Promise<OAuthTokenData> {
    logger.mcp.debug('Exchanging authorization code for tokens', {
      tokenEndpoint: metadata.token_endpoint,
      codeLength: code.length,
      clientId
    });

    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        client_id: clientId,
        redirect_uri: `http://localhost:${oauthCallbackServer['port'] || 3000}`
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.mcp.error('Token exchange failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
    }

    const tokenResponse: OAuthTokenResponse = await response.json();

    // Calculate expiration timestamp
    const expiresAt = tokenResponse.expires_in
      ? Date.now() + (tokenResponse.expires_in * 1000)
      : undefined;

    const tokenData: OAuthTokenData = {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: expiresAt,
      scope: tokenResponse.scope,
      token_type: tokenResponse.token_type
    };

    logger.mcp.debug('Tokens received successfully', {
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenResponse.expires_in,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : 'never',
      scope: tokenData.scope
    });

    return tokenData;
  }

  /**
   * Refresh access token using refresh token
   *
   * @param serverId - Server ID
   * @returns New token data
   * @throws Error if refresh fails or no refresh token available
   */
  async refreshToken(serverId: string): Promise<OAuthTokenData> {
    try {
      logger.mcp.info('Refreshing OAuth token', { serverId });

      // Get current token with metadata
      const currentToken = await mcpOAuthTokenManager.getToken(serverId);
      if (!currentToken) {
        throw new Error('No token found for server');
      }

      if (!currentToken.refresh_token) {
        throw new Error('No refresh token available - re-authorization required');
      }

      if (!currentToken.metadata?.token_endpoint) {
        logger.mcp.warn('No token endpoint metadata found, re-authorization required', {
          serverId
        });
        throw new Error('Token metadata missing - re-authorization required');
      }

      logger.mcp.debug('Requesting token refresh', {
        serverId,
        tokenEndpoint: currentToken.metadata.token_endpoint
      });

      // Request token refresh
      const response = await fetch(currentToken.metadata.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: currentToken.refresh_token,
          client_id: 'levante-mcp-client'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.mcp.error('Token refresh request failed', {
          serverId,
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const tokenResponse: OAuthTokenResponse = await response.json();

      // Calculate new expiration timestamp
      const expiresAt = tokenResponse.expires_in
        ? Date.now() + (tokenResponse.expires_in * 1000)
        : currentToken.expires_at; // Keep old expiration if not provided

      // Build new token data
      const newTokenData: OAuthTokenData = {
        access_token: tokenResponse.access_token,
        // Some servers return new refresh token, some don't - use new if available
        refresh_token: tokenResponse.refresh_token || currentToken.refresh_token,
        expires_at: expiresAt,
        scope: tokenResponse.scope || currentToken.scope,
        token_type: tokenResponse.token_type,
        // Preserve metadata for future refreshes
        metadata: currentToken.metadata
      };

      // Save refreshed tokens
      await mcpOAuthTokenManager.saveToken(serverId, newTokenData);

      logger.mcp.info('OAuth token refreshed successfully', {
        serverId,
        hasNewRefreshToken: !!tokenResponse.refresh_token,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : 'never'
      });

      return newTokenData;

    } catch (error) {
      logger.mcp.error('Token refresh failed', {
        serverId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Revoke OAuth token for a server
   *
   * @param serverId - Server ID
   */
  async revokeToken(serverId: string): Promise<void> {
    try {
      logger.mcp.info('Revoking OAuth token', { serverId });

      // Delete token from storage
      await mcpOAuthTokenManager.deleteToken(serverId);

      // TODO: Call revocation_endpoint if available in metadata
      // This would properly revoke the token on the authorization server

      logger.mcp.info('OAuth token revoked successfully', { serverId });

    } catch (error) {
      logger.mcp.error('Token revocation failed', {
        serverId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get current token for a server (if valid)
   *
   * @param serverId - Server ID
   * @returns Token data or null if no valid token
   */
  async getValidToken(serverId: string): Promise<OAuthTokenData | null> {
    const isValid = await mcpOAuthTokenManager.isTokenValid(serverId);
    if (!isValid) {
      return null;
    }

    return await mcpOAuthTokenManager.getToken(serverId);
  }

  /**
   * Check if server has a valid OAuth token
   *
   * @param serverId - Server ID
   * @returns True if server has valid token
   */
  async hasValidToken(serverId: string): Promise<boolean> {
    return await mcpOAuthTokenManager.isTokenValid(serverId);
  }
}

// Singleton instance
export const mcpOAuthService = new MCPOAuthService();
