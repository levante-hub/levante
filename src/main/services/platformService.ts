/**
 * PlatformService - Manages Levante Platform authentication and models
 *
 * Centralizes all platform-specific logic:
 * - OAuth login/logout via existing OAuthService
 * - JWT decoding for user info and allowedModels
 * - Model fetching with metadata from /api/v1/models
 */

import { jwtDecode } from 'jwt-decode';
import { getOAuthService } from './oauth';
import { userProfileService } from './userProfileService';
import { safeFetch } from '../utils/urlValidator';
import { getLogger } from './logging';
import { envConfig } from './envConfig';
import type { PlatformUser, PlatformStatus } from '../../types/userProfile';

const logger = getLogger();

// ── Platform model fetch error types ────────────────────────────────────
export type PlatformModelErrorCode =
  | 'AUTH_REQUIRED'
  | 'TOKEN_REFRESH_FAILED'
  | 'NETWORK_ERROR'
  | 'API_ERROR'
  | 'INVALID_RESPONSE';

export class PlatformModelFetchError extends Error {
  code: PlatformModelErrorCode;
  statusCode?: number;

  constructor(message: string, code: PlatformModelErrorCode, statusCode?: number) {
    super(message);
    this.name = 'PlatformModelFetchError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type FetchModelsReason = 'startup' | 'login' | 'manual' | 'foreground' | 'new-session';

const LEVANTE_PLATFORM_SERVER_ID = 'levante-platform';
const LEVANTE_PLATFORM_DEFAULT_URL = envConfig.platformUrl;

interface JWTPayload {
  sub?: string;
  email?: string;
  allowed_models?: string[];
  // Direct claims (legacy / future)
  org_id?: string;
  team_id?: string;
  // Supabase stores custom server-side data in app_metadata
  app_metadata?: {
    org_id?: string;
    organization_id?: string;
    team_id?: string;
    allowed_models?: string[];
    [key: string]: unknown;
  };
  user_metadata?: Record<string, unknown>;
  exp?: number;
  iat?: number;
}

interface ModelMetadata {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  [key: string]: any;
}

class PlatformService {
  private cachedAllowedModels: string[] = [];
  private cachedUser: PlatformUser | null = null;

  /**
   * Login to Levante Platform via OAuth
   * Reuses existing OAuthService infrastructure
   */
  async login(baseUrl?: string): Promise<PlatformStatus> {
    const effectiveBaseUrl = baseUrl || LEVANTE_PLATFORM_DEFAULT_URL;

    logger.oauth.info('Starting Levante Platform login', { baseUrl: effectiveBaseUrl });

    const oauthService = getOAuthService();
    const result = await oauthService.authorize({
      serverId: LEVANTE_PLATFORM_SERVER_ID,
      mcpServerUrl: effectiveBaseUrl,
      scopes: ['openid', 'email'],
    });

    if (!result.success) {
      throw new Error(result.error || 'OAuth authorization failed');
    }

    // Decode JWT to extract user info and allowedModels
    const status = await this.decodeTokenAndUpdateProfile();

    logger.oauth.info('Platform login - JWT decoded', {
      email: status.user?.email,
      sub: status.user?.sub,
      orgId: status.user?.orgId ?? '(not in JWT — resolved by platform)',
      teamId: status.user?.teamId,
      allowedModels: status.allowedModels,
    });
    logger.oauth.info('Levante Platform login successful', {
      email: status.user?.email,
      modelsCount: status.allowedModels.length,
    });

    return status;
  }

  /**
   * Logout from Levante Platform
   * Revokes tokens and clears platform state
   */
  async logout(): Promise<void> {
    logger.oauth.info('Logging out from Levante Platform');

    const oauthService = getOAuthService();
    await oauthService.disconnect({
      serverId: LEVANTE_PLATFORM_SERVER_ID,
      revokeTokens: true,
    });

    // Clear platform state
    this.cachedAllowedModels = [];
    this.cachedUser = null;

    await userProfileService.updateProfile({
      appMode: 'standalone',
    });
    await userProfileService.deleteKey('platformUser');

    logger.oauth.info('Levante Platform logout complete');
  }

  /**
   * Get current platform status
   * Checks token validity and returns user + allowedModels
   */
  async getStatus(): Promise<PlatformStatus> {
    try {
      const oauthService = getOAuthService();
      const tokens = await oauthService.getExistingToken(LEVANTE_PLATFORM_SERVER_ID);

      if (!tokens) {
        return { isAuthenticated: false, user: null, allowedModels: [] };
      }

      // Decode the JWT to get fresh data
      return await this.decodeTokenAndUpdateProfile();
    } catch (error) {
      logger.oauth.debug('Platform status check failed', {
        error: error instanceof Error ? error.message : error,
      });
      return { isAuthenticated: false, user: null, allowedModels: [] };
    }
  }

  /**
   * Get access token for API calls (handles auto-refresh via ensureValidToken)
   */
  async getAccessToken(): Promise<string | null> {
    try {
      const oauthService = getOAuthService();
      const tokens = await oauthService.ensureValidToken(LEVANTE_PLATFORM_SERVER_ID);
      return tokens.accessToken;
    } catch {
      return null;
    }
  }

  /**
   * Get auth headers for API calls (handles auto-refresh + 401 retry)
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const oauthService = getOAuthService();
    return oauthService.getAuthHeaders(LEVANTE_PLATFORM_SERVER_ID);
  }

  /**
   * Check if currently authenticated with Levante Platform
   */
  async isAuthenticated(): Promise<boolean> {
    const oauthService = getOAuthService();
    const tokens = await oauthService.getExistingToken(LEVANTE_PLATFORM_SERVER_ID);
    return !!tokens;
  }

  /**
   * Get allowed model IDs from the JWT
   */
  getAllowedModels(): string[] {
    return this.cachedAllowedModels;
  }

  /**
   * Get current platform user
   */
  getUser(): PlatformUser | null {
    return this.cachedUser;
  }

  /**
   * Fetch models with full metadata from /api/v1/models
   * Filters by allowedModels from JWT.
   *
   * Error contract:
   * - Returns ModelMetadata[] ONLY on real success (even if the array is empty).
   * - Throws PlatformModelFetchError with a typed code for any failure.
   */
  async fetchModelsWithMetadata(baseUrl?: string, reason?: FetchModelsReason): Promise<ModelMetadata[]> {
    const startTime = Date.now();
    const effectiveBaseUrl = baseUrl || LEVANTE_PLATFORM_DEFAULT_URL;
    const url = `${effectiveBaseUrl}/api/v1/models`;

    // ── Auth headers ────────────────────────────────────────────────────
    let authHeaders: Record<string, string>;
    try {
      authHeaders = await this.getAuthHeaders();
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.models.warn('Platform model fetch failed: no valid auth', {
        reason,
        duration,
        result: 'error',
        errorCode: 'AUTH_REQUIRED',
      });
      throw new PlatformModelFetchError(
        'No valid access token for platform model fetch',
        'AUTH_REQUIRED',
      );
    }

    // Re-decode to get latest allowedModels
    const accessToken = await this.getAccessToken();
    const allowedModels = accessToken
      ? (this.decodeJWT(accessToken).allowed_models || [])
      : [];
    this.cachedAllowedModels = allowedModels;

    try {
      let response = await safeFetch(url, {
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
      });

      // Handle 401: attempt token refresh and retry once
      if (response.status === 401) {
        logger.oauth.info('Got 401 from platform API, attempting token refresh', { reason });
        const oauthService = getOAuthService();
        const retried = await oauthService.handleUnauthorized(LEVANTE_PLATFORM_SERVER_ID, response);

        if (retried) {
          let freshHeaders: Record<string, string>;
          try {
            freshHeaders = await this.getAuthHeaders();
          } catch {
            const duration = Date.now() - startTime;
            logger.models.error('Platform model fetch: token refresh succeeded but getAuthHeaders failed', {
              reason,
              duration,
              result: 'error',
              errorCode: 'TOKEN_REFRESH_FAILED',
            });
            throw new PlatformModelFetchError(
              'Token refresh succeeded but auth headers unavailable',
              'TOKEN_REFRESH_FAILED',
              401,
            );
          }
          response = await safeFetch(url, {
            headers: {
              ...freshHeaders,
              'Content-Type': 'application/json',
            },
          });
        }

        // If still 401 after retry
        if (response.status === 401) {
          const duration = Date.now() - startTime;
          logger.models.error('Platform model fetch: 401 after token refresh', {
            reason,
            duration,
            result: 'error',
            errorCode: 'TOKEN_REFRESH_FAILED',
          });
          throw new PlatformModelFetchError(
            'Authentication failed after token refresh',
            'TOKEN_REFRESH_FAILED',
            401,
          );
        }
      }

      if (!response.ok) {
        const duration = Date.now() - startTime;
        logger.models.error('Platform API returned non-ok status', {
          reason,
          duration,
          result: 'error',
          errorCode: 'API_ERROR',
          statusCode: response.status,
        });
        throw new PlatformModelFetchError(
          `Platform API error: ${response.status} ${response.statusText}`,
          'API_ERROR',
          response.status,
        );
      }

      let data: any;
      try {
        data = await response.json();
      } catch {
        const duration = Date.now() - startTime;
        logger.models.error('Platform model fetch: invalid JSON response', {
          reason,
          duration,
          result: 'error',
          errorCode: 'INVALID_RESPONSE',
        });
        throw new PlatformModelFetchError(
          'Invalid JSON in platform API response',
          'INVALID_RESPONSE',
        );
      }

      const allModels: ModelMetadata[] = data.data || [];

      // Filter by allowedModels if present in JWT
      let result: ModelMetadata[];
      if (allowedModels.length > 0) {
        const allowedSet = new Set(allowedModels);
        result = allModels.filter((model) => allowedSet.has(model.id));
      } else {
        result = allModels;
      }

      const duration = Date.now() - startTime;
      logger.models.info('Platform model fetch completed', {
        reason,
        duration,
        result: result.length === 0 ? 'empty' : 'success',
        count: result.length,
      });

      return result;
    } catch (error) {
      // Re-throw PlatformModelFetchError as-is
      if (error instanceof PlatformModelFetchError) {
        throw error;
      }

      // Wrap unknown errors (network failures, etc.)
      const duration = Date.now() - startTime;
      logger.models.error('Failed to fetch Levante Platform models', {
        reason,
        duration,
        result: 'error',
        errorCode: 'NETWORK_ERROR',
        error: error instanceof Error ? error.message : error,
      });
      throw new PlatformModelFetchError(
        error instanceof Error ? error.message : 'Network error fetching platform models',
        'NETWORK_ERROR',
      );
    }
  }

  /**
   * Fetch the org ID for the current user on demand.
   * Only called when needed (e.g. to build billing URL), never during login/status.
   * Caches the result in cachedUser so subsequent calls are instant.
   */
  async fetchOrgId(baseUrl?: string): Promise<string | undefined> {
    // Return cached value if already known
    if (this.cachedUser?.orgId) {
      return this.cachedUser.orgId;
    }

    const effectiveBaseUrl = baseUrl || LEVANTE_PLATFORM_DEFAULT_URL;
    const profile = await this.fetchUserProfile(effectiveBaseUrl);

    if (profile?.orgId && this.cachedUser) {
      this.cachedUser = { ...this.cachedUser, orgId: profile.orgId };
    }

    return profile?.orgId;
  }

  /**
   * Fetch user profile from platform API to get org info not present in the JWT.
   * Calls GET /api/v1/me — fails silently so login/status are never blocked.
   */
  private async fetchUserProfile(baseUrl: string): Promise<{ orgId?: string } | null> {
    try {
      const authHeaders = await this.getAuthHeaders();
      const response = await safeFetch(`${baseUrl}/api/v1/me`, {
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      }, 5000);

      if (!response.ok) {
        logger.oauth.debug('Platform /api/v1/me returned non-ok status', { status: response.status });
        return null;
      }

      const data = await response.json();
      // Support common shapes: { org_id }, { organization_id }, { org: { id } }
      const orgId: string | undefined =
        data.org_id
        || data.organization_id
        || data.org?.id;

      logger.oauth.info('Fetched user profile from platform API', { orgId });
      return { orgId };
    } catch (error) {
      logger.oauth.debug('Failed to fetch platform user profile', {
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  /**
   * Decode JWT and update user profile with platform info.
   * Falls back to /api/v1/me when org_id is absent from the JWT.
   */
  private async decodeTokenAndUpdateProfile(): Promise<PlatformStatus> {
    const accessToken = await this.getAccessToken();

    if (!accessToken) {
      return { isAuthenticated: false, user: null, allowedModels: [] };
    }

    const decoded = this.decodeJWT(accessToken);

    // org_id may be a direct claim or nested inside app_metadata (Supabase pattern)
    let orgId = decoded.org_id
      || decoded.app_metadata?.org_id
      || decoded.app_metadata?.organization_id;

    const teamId = decoded.team_id || decoded.app_metadata?.team_id;

    logger.oauth.info('Platform user resolved', {
      sub: decoded.sub,
      email: decoded.email,
      orgId,
    });

    const user: PlatformUser = {
      email: decoded.email,
      sub: decoded.sub,
      orgId,
      teamId,
    };

    const allowedModels = decoded.allowed_models
      || decoded.app_metadata?.allowed_models
      || [];

    // Cache locally
    this.cachedUser = user;
    this.cachedAllowedModels = allowedModels;

    // Persist to user profile
    await userProfileService.updateProfile({
      appMode: 'platform',
      platformUser: user,
    });

    return {
      isAuthenticated: true,
      user,
      allowedModels,
    };
  }

  /**
   * Decode JWT without verification (backend handles verification)
   */
  private decodeJWT(token: string): JWTPayload {
    try {
      return jwtDecode<JWTPayload>(token);
    } catch (error) {
      logger.oauth.error('Failed to decode JWT', {
        error: error instanceof Error ? error.message : error,
      });
      return {};
    }
  }
}

// Singleton
export const platformService = new PlatformService();
