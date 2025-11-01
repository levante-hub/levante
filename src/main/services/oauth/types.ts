/**
 * OAuth 2.0 Shared Types
 * Used by OpenRouter OAuth, MCP OAuth, and other OAuth integrations
 */

/**
 * OAuth callback data received from authorization server
 */
export interface OAuthCallbackData {
  success: boolean;
  provider?: string;
  code?: string;
  error?: string;
  state?: string;
}

/**
 * OAuth token response (RFC 6749)
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string; // Usually "Bearer"
  expires_in?: number; // Seconds until expiration
  refresh_token?: string;
  scope?: string;
}

/**
 * OAuth token data for storage (with calculated expiration)
 */
export interface OAuthTokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number; // Unix timestamp (ms)
  scope?: string;
  token_type: string;
}

/**
 * OAuth Authorization Server Metadata (RFC 8414)
 */
export interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[]; // Should include "S256"
  token_endpoint_auth_methods_supported?: string[];
  client_id?: string; // Some servers may provide a default client_id
}

/**
 * OAuth Resource Metadata (RFC 9728)
 */
export interface OAuthResourceMetadata {
  resource: string;
  authorization_servers: string[];
}

/**
 * PKCE parameters for OAuth flow
 */
export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}
