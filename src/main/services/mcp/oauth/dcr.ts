/**
 * Dynamic Client Registration (RFC 7591)
 *
 * Implements automatic client registration for OAuth servers that support DCR.
 * This is required by the MCP spec for public OAuth servers.
 */

import { getLogger } from '../../logging';

const logger = getLogger();

/**
 * Client registration request (RFC 7591 Section 2)
 */
interface ClientRegistrationRequest {
  redirect_uris: string[];
  client_name?: string;
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
}

/**
 * Client registration response (RFC 7591 Section 3.2.1)
 */
interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}

/**
 * Register a new OAuth client dynamically
 *
 * @param registrationEndpoint - The registration endpoint from OAuth metadata
 * @param redirectUri - The redirect URI for OAuth callbacks (e.g., http://localhost:3000)
 * @param scopes - Optional scopes to request
 * @returns Client registration response with client_id
 */
export async function registerOAuthClient(
  registrationEndpoint: string,
  redirectUri: string,
  scopes?: string[]
): Promise<ClientRegistrationResponse> {
  logger.mcp.info('Registering OAuth client dynamically', {
    registrationEndpoint,
    redirectUri
  });

  const requestBody: ClientRegistrationRequest = {
    redirect_uris: [redirectUri],
    client_name: 'Levante MCP Client',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none', // Public client with PKCE
  };

  if (scopes && scopes.length > 0) {
    requestBody.scope = scopes.join(' ');
  }

  logger.mcp.debug('DCR request body', { requestBody });

  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.mcp.error('Dynamic client registration failed', {
      status: response.status,
      statusText: response.statusText,
      error: errorText
    });
    throw new Error(
      `Dynamic client registration failed: ${response.status} ${response.statusText}`
    );
  }

  const registrationResponse: ClientRegistrationResponse = await response.json();

  logger.mcp.info('OAuth client registered successfully', {
    clientId: registrationResponse.client_id,
    hasSecret: !!registrationResponse.client_secret
  });

  return registrationResponse;
}

/**
 * Storage for registered clients (in-memory cache)
 * Maps serverId -> client_id
 */
const registeredClients = new Map<string, string>();

/**
 * Get or register a client_id for a server
 *
 * @param serverId - MCP server identifier
 * @param registrationEndpoint - Registration endpoint (if available)
 * @param redirectUri - Redirect URI for callbacks
 * @param scopes - Optional scopes
 * @returns client_id to use
 */
export async function getOrRegisterClient(
  serverId: string,
  registrationEndpoint: string | undefined,
  redirectUri: string,
  scopes?: string[]
): Promise<string> {
  // Check if we already registered for this server
  const cachedClientId = registeredClients.get(serverId);
  if (cachedClientId) {
    logger.mcp.debug('Using cached client_id', { serverId, clientId: cachedClientId });
    return cachedClientId;
  }

  // If no registration endpoint, we can't do DCR
  if (!registrationEndpoint) {
    logger.mcp.warn('No registration endpoint available, cannot perform DCR', { serverId });
    throw new Error(
      'Server does not support Dynamic Client Registration. ' +
      'Please configure client_id manually in oauthMetadata.'
    );
  }

  // Register new client
  const registration = await registerOAuthClient(registrationEndpoint, redirectUri, scopes);

  // Cache the client_id
  registeredClients.set(serverId, registration.client_id);

  return registration.client_id;
}

/**
 * Clear cached client registration for a server
 *
 * @param serverId - MCP server identifier
 */
export function clearClientRegistration(serverId: string): void {
  registeredClients.delete(serverId);
  logger.mcp.debug('Cleared client registration cache', { serverId });
}
