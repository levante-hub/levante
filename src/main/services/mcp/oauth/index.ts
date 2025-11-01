/**
 * MCP OAuth Module
 *
 * Manages OAuth authentication for remote MCP servers
 * that require authorization (e.g., Figma MCP).
 *
 * Tokens are stored in ui-preferences.json with optional encryption
 * controlled by the security.encryptApiKeys toggle in user preferences.
 *
 * Flow:
 * 1. MCP server connection returns 401 (unauthorized)
 * 2. mcpOAuthService discovers OAuth metadata from server
 * 3. Generates PKCE parameters and opens browser for user authorization
 * 4. Receives callback with authorization code
 * 5. Exchanges code for access/refresh tokens
 * 6. Stores tokens via mcpOAuthTokenManager (encrypted)
 * 7. Returns tokens to caller for authenticated requests
 */

export { MCPOAuthTokenManager, mcpOAuthTokenManager } from './tokenManager';
export { MCPOAuthService, mcpOAuthService } from './mcpOAuthService';
export {
  discoverOAuthMetadata,
  discoverFromUnauthorizedResponse,
  parseWWWAuthenticate,
  validateOAuthMetadata,
  type OAuthMetadataWithEndpoints,
  type WWWAuthenticateData
} from './metadata';
