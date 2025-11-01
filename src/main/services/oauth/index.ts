/**
 * OAuth Module - Shared OAuth utilities and services
 *
 * This module provides shared OAuth functionality used by:
 * - OpenRouter OAuth (existing)
 * - MCP OAuth (future)
 * - Any other OAuth integrations
 */

export { oauthCallbackServer, OAuthCallbackServer } from './callbackServer';
export { generateCodeVerifier, generateCodeChallenge, generateState, base64UrlEncode } from './pkce';
export type {
  OAuthCallbackData,
  OAuthTokenResponse,
  OAuthTokenData,
  OAuthMetadata,
  OAuthResourceMetadata,
  PKCEParams
} from './types';
