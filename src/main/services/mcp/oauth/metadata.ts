import { getLogger } from '../../logging';
import type { OAuthMetadata } from '../../oauth/types';

const logger = getLogger();

/**
 * OAuth metadata with required endpoints validated
 */
export interface OAuthMetadataWithEndpoints extends OAuthMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string; // DCR endpoint (RFC 7591)
  revocation_endpoint?: string;
}

/**
 * Parsed WWW-Authenticate header data
 */
export interface WWWAuthenticateData {
  realm?: string;
  scopes?: string[];
  authorizationServer?: string;
}

/**
 * Protected Resource Metadata (RFC 9728)
 * Returned from /.well-known/oauth-protected-resource
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_documentation?: string;
}

/**
 * Discover OAuth metadata from MCP server
 *
 * Strategy:
 * 1. Try RFC 8414: /.well-known/oauth-authorization-server
 * 2. Try legacy: /.well-known/oauth-authorization-server at authorization server URL
 * 3. Return null if discovery fails (caller can use manual config)
 *
 * @param baseUrl - Base URL of the MCP server (e.g., "https://api.example.com")
 * @returns OAuth metadata or null if discovery fails
 */
export async function discoverOAuthMetadata(
  baseUrl: string
): Promise<OAuthMetadataWithEndpoints | null> {
  try {
    const url = new URL(baseUrl);
    const wellKnownUrl = `${url.origin}/.well-known/oauth-authorization-server`;

    logger.mcp.debug('Discovering OAuth metadata', {
      baseUrl,
      wellKnownUrl
    });

    const response = await fetch(wellKnownUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      logger.mcp.debug('OAuth metadata discovery failed', {
        baseUrl,
        status: response.status,
        statusText: response.statusText
      });
      return null;
    }

    const metadata = await response.json();

    if (!validateOAuthMetadata(metadata)) {
      logger.mcp.warn('Invalid OAuth metadata structure', {
        baseUrl,
        metadata
      });
      return null;
    }

    logger.mcp.info('OAuth metadata discovered successfully', {
      baseUrl,
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      scopes: metadata.scopes_supported
    });

    return metadata;
  } catch (error) {
    logger.mcp.debug('OAuth metadata discovery error', {
      baseUrl,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

/**
 * Parse WWW-Authenticate header from 401 response
 *
 * Example header:
 * WWW-Authenticate: Bearer realm="https://auth.example.com", scope="read write"
 *
 * @param header - WWW-Authenticate header value
 * @returns Parsed data or null if invalid
 */
export function parseWWWAuthenticate(header: string): WWWAuthenticateData | null {
  try {
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      return null;
    }

    // Remove "Bearer " prefix
    const params = header.substring(7).trim();

    const result: WWWAuthenticateData = {};

    // Parse key="value" pairs
    const regex = /(\w+)="([^"]*)"/g;
    let match;

    while ((match = regex.exec(params)) !== null) {
      const [, key, value] = match;

      if (key === 'realm') {
        result.realm = value;
      } else if (key === 'scope') {
        result.scopes = value.split(' ').filter(s => s.length > 0);
      } else if (key === 'authorization_uri' || key === 'authorization_server') {
        result.authorizationServer = value;
      }
    }

    logger.mcp.debug('Parsed WWW-Authenticate header', {
      header: header.substring(0, 100), // Log first 100 chars
      result
    });

    return result;
  } catch (error) {
    logger.mcp.debug('Failed to parse WWW-Authenticate header', {
      header,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

/**
 * Validate OAuth metadata has required fields
 *
 * @param metadata - Metadata object to validate
 * @returns True if metadata has all required fields
 */
export function validateOAuthMetadata(metadata: any): metadata is OAuthMetadataWithEndpoints {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  // Required fields per RFC 8414
  const hasRequiredFields =
    typeof metadata.issuer === 'string' &&
    typeof metadata.authorization_endpoint === 'string' &&
    typeof metadata.token_endpoint === 'string';

  if (!hasRequiredFields) {
    logger.mcp.debug('OAuth metadata missing required fields', {
      hasIssuer: typeof metadata.issuer === 'string',
      hasAuthEndpoint: typeof metadata.authorization_endpoint === 'string',
      hasTokenEndpoint: typeof metadata.token_endpoint === 'string'
    });
    return false;
  }

  // Validate URLs
  try {
    new URL(metadata.authorization_endpoint);
    new URL(metadata.token_endpoint);
  } catch {
    logger.mcp.warn('OAuth metadata has invalid endpoint URLs', {
      authEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint
    });
    return false;
  }

  // Check PKCE support (recommended but not required)
  if (metadata.code_challenge_methods_supported) {
    const supportsPKCE = metadata.code_challenge_methods_supported.includes('S256');
    if (!supportsPKCE) {
      logger.mcp.warn('OAuth server does not support PKCE S256', {
        supportedMethods: metadata.code_challenge_methods_supported
      });
    }
  }

  return true;
}

/**
 * Discover OAuth metadata from 401 response
 *
 * When MCP server returns 401 with WWW-Authenticate header,
 * extract OAuth server info and discover metadata
 *
 * @param response - 401 HTTP response from MCP server
 * @returns OAuth metadata or null if discovery fails
 */
export async function discoverFromUnauthorizedResponse(
  response: Response
): Promise<OAuthMetadataWithEndpoints | null> {
  try {
    const wwwAuth = response.headers.get('WWW-Authenticate');

    if (!wwwAuth) {
      logger.mcp.debug('No WWW-Authenticate header in 401 response');
      return null;
    }

    const parsed = parseWWWAuthenticate(wwwAuth);

    if (!parsed?.authorizationServer && !parsed?.realm) {
      logger.mcp.debug('WWW-Authenticate header missing authorization server info');
      return null;
    }

    // Try authorization_server first, fallback to realm
    const authServerUrl = parsed.authorizationServer || parsed.realm;

    if (!authServerUrl) {
      return null;
    }

    logger.mcp.debug('Attempting OAuth discovery from 401 response', {
      authServerUrl,
      scopes: parsed.scopes
    });

    // Discover metadata from authorization server
    const metadata = await discoverOAuthMetadata(authServerUrl);

    if (metadata && parsed.scopes) {
      // Add scopes from WWW-Authenticate header if not in metadata
      if (!metadata.scopes_supported) {
        metadata.scopes_supported = parsed.scopes;
      }
    }

    return metadata;
  } catch (error) {
    logger.mcp.error('Error discovering OAuth from 401 response', {
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

/**
 * Discover Protected Resource Metadata (RFC 9728)
 *
 * Step 1 of MCP OAuth flow: Get authorization server info from protected resource
 *
 * @param baseUrl - Base URL of the MCP server (protected resource)
 * @returns Protected Resource Metadata or null if not found
 */
export async function discoverProtectedResourceMetadata(
  baseUrl: string
): Promise<ProtectedResourceMetadata | null> {
  try {
    const url = new URL(baseUrl);
    const wellKnownUrl = `${url.origin}/.well-known/oauth-protected-resource`;

    logger.mcp.debug('Discovering Protected Resource Metadata', {
      baseUrl,
      wellKnownUrl
    });

    const response = await fetch(wellKnownUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      logger.mcp.debug('Protected Resource Metadata not found', {
        baseUrl,
        status: response.status
      });
      return null;
    }

    const metadata: ProtectedResourceMetadata = await response.json();

    // Validate structure
    if (!metadata.resource || !metadata.authorization_servers || metadata.authorization_servers.length === 0) {
      logger.mcp.warn('Invalid Protected Resource Metadata structure', {
        baseUrl,
        metadata
      });
      return null;
    }

    logger.mcp.info('Protected Resource Metadata discovered', {
      baseUrl,
      resource: metadata.resource,
      authServers: metadata.authorization_servers
    });

    return metadata;

  } catch (error) {
    logger.mcp.debug('Protected Resource Metadata discovery error', {
      baseUrl,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

/**
 * Discover Authorization Server Metadata from AS URL
 *
 * Step 2 of MCP OAuth flow: Get OAuth endpoints from authorization server
 *
 * @param authServerUrl - Authorization Server URL (from protected resource metadata)
 * @returns OAuth metadata with endpoints
 */
export async function discoverAuthorizationServerMetadata(
  authServerUrl: string
): Promise<OAuthMetadataWithEndpoints | null> {
  try {
    const url = new URL(authServerUrl);
    const wellKnownUrl = `${url.origin}/.well-known/oauth-authorization-server`;

    logger.mcp.debug('Discovering Authorization Server Metadata', {
      authServerUrl,
      wellKnownUrl
    });

    const response = await fetch(wellKnownUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      logger.mcp.debug('Authorization Server Metadata not found', {
        authServerUrl,
        status: response.status
      });
      return null;
    }

    const metadata = await response.json();

    if (!validateOAuthMetadata(metadata)) {
      logger.mcp.warn('Invalid Authorization Server Metadata structure', {
        authServerUrl,
        metadata
      });
      return null;
    }

    logger.mcp.info('Authorization Server Metadata discovered', {
      authServerUrl,
      authEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint
    });

    return metadata;

  } catch (error) {
    logger.mcp.debug('Authorization Server Metadata discovery error', {
      authServerUrl,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

/**
 * Complete MCP OAuth Discovery Flow
 *
 * Implements the full MCP spec discovery:
 * 1. Try direct OAuth metadata at MCP server (/.well-known/oauth-authorization-server)
 * 2. If not found, try Protected Resource Metadata (/.well-known/oauth-protected-resource)
 * 3. Get Authorization Server(s) from protected resource
 * 4. Get OAuth metadata from Authorization Server
 *
 * @param baseUrl - Base URL of the MCP server
 * @returns OAuth metadata with endpoints or null
 */
export async function discoverMCPOAuthMetadata(
  baseUrl: string
): Promise<OAuthMetadataWithEndpoints | null> {
  logger.mcp.info('Starting MCP OAuth discovery', { baseUrl });

  // Step 1: Try direct OAuth metadata (simplest case)
  const directMetadata = await discoverOAuthMetadata(baseUrl);
  if (directMetadata) {
    logger.mcp.info('Found OAuth metadata directly at MCP server', { baseUrl });
    return directMetadata;
  }

  // Step 2: Try Protected Resource Metadata (MCP spec flow)
  logger.mcp.debug('Direct OAuth metadata not found, trying Protected Resource Metadata', { baseUrl });
  const protectedResource = await discoverProtectedResourceMetadata(baseUrl);

  if (!protectedResource) {
    logger.mcp.warn('No Protected Resource Metadata found', { baseUrl });
    return null;
  }

  // Step 3: Get Authorization Server Metadata
  // Try first authorization server (MCP servers typically have one)
  const authServerUrl = protectedResource.authorization_servers[0];
  logger.mcp.debug('Fetching Authorization Server Metadata', { authServerUrl });

  const asMetadata = await discoverAuthorizationServerMetadata(authServerUrl);

  if (!asMetadata) {
    logger.mcp.error('Failed to get Authorization Server Metadata', {
      baseUrl,
      authServerUrl
    });
    return null;
  }

  logger.mcp.info('MCP OAuth discovery completed successfully', {
    baseUrl,
    authServerUrl,
    hasRegistrationEndpoint: !!asMetadata.registration_endpoint
  });

  return asMetadata;
}
