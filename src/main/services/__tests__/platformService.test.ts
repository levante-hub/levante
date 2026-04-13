import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────
const { mockGetAuthHeaders, mockGetExistingToken, mockEnsureValidToken, mockHandleUnauthorized } =
  vi.hoisted(() => ({
    mockGetAuthHeaders: vi.fn(),
    mockGetExistingToken: vi.fn(),
    mockEnsureValidToken: vi.fn(),
    mockHandleUnauthorized: vi.fn(),
  }));

const { mockSafeFetch } = vi.hoisted(() => ({
  mockSafeFetch: vi.fn(),
}));

const { mockUpdateProfile, mockDeleteKey } = vi.hoisted(() => ({
  mockUpdateProfile: vi.fn(),
  mockDeleteKey: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock('../logging', () => {
  const makeCategoryLogger = () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });
  return {
    getLogger: () => ({
      oauth: makeCategoryLogger(),
      models: makeCategoryLogger(),
      core: makeCategoryLogger(),
      ipc: makeCategoryLogger(),
      preferences: makeCategoryLogger(),
      database: makeCategoryLogger(),
    }),
  };
});

vi.mock('../oauth', () => ({
  getOAuthService: () => ({
    getAuthHeaders: mockGetAuthHeaders,
    getExistingToken: mockGetExistingToken,
    ensureValidToken: mockEnsureValidToken,
    handleUnauthorized: mockHandleUnauthorized,
  }),
}));

vi.mock('../../utils/urlValidator', () => ({
  safeFetch: mockSafeFetch,
}));

vi.mock('../userProfileService', () => ({
  userProfileService: {
    updateProfile: mockUpdateProfile,
    deleteKey: mockDeleteKey,
  },
}));

vi.mock('../envConfig', () => ({
  envConfig: {
    platformUrl: 'https://test.levante.com',
  },
}));

// jwt-decode: return an empty payload by default so decodeJWT always works
vi.mock('jwt-decode', () => ({
  jwtDecode: () => ({ allowed_models: [] }),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────
import { PlatformModelFetchError } from '../platformService';
import { platformService } from '../platformService';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a minimal Response-like object that safeFetch would return. */
function fakeResponse(
  body: unknown,
  { status = 200, ok = true, statusText = 'OK' }: { status?: number; ok?: boolean; statusText?: string } = {},
): Response {
  return {
    status,
    ok,
    statusText,
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
  } as unknown as Response;
}

/** Build a Response whose `.json()` rejects (simulates invalid JSON). */
function fakeInvalidJsonResponse(): Response {
  return {
    status: 200,
    ok: true,
    statusText: 'OK',
    json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    headers: new Headers(),
  } as unknown as Response;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('PlatformService.fetchModelsWithMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: auth succeeds with a bearer token
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer test-token' });
    // Default: ensureValidToken returns an access token that jwt-decode can handle
    mockEnsureValidToken.mockResolvedValue({ accessToken: 'test-token' });
  });

  // ─── 1. AUTH_REQUIRED when getAuthHeaders fails ──────────────────────
  it('throws PlatformModelFetchError with code AUTH_REQUIRED when getAuthHeaders fails', async () => {
    mockGetAuthHeaders.mockRejectedValue(new Error('No token available'));

    try {
      await platformService.fetchModelsWithMetadata();
      // Should never reach here
      expect.unreachable('Expected fetchModelsWithMetadata to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformModelFetchError);
      const platformError = error as PlatformModelFetchError;
      expect(platformError.code).toBe('AUTH_REQUIRED');
      expect(platformError.name).toBe('PlatformModelFetchError');
    }
  });

  // ─── 2. Returns [] on real success with empty catalog ────────────────
  it('returns an empty array only on real success with an empty catalog', async () => {
    mockSafeFetch.mockResolvedValueOnce(fakeResponse({ data: [] }));

    const result = await platformService.fetchModelsWithMetadata();

    expect(result).toEqual([]);
    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
  });

  // ─── 3. 401 retry works once then propagates error ───────────────────
  it('retries on 401, then throws TOKEN_REFRESH_FAILED if still 401', async () => {
    // First call returns 401
    const response401 = fakeResponse(null, { status: 401, ok: false, statusText: 'Unauthorized' });
    // After refresh, retry also returns 401
    const response401Again = fakeResponse(null, { status: 401, ok: false, statusText: 'Unauthorized' });

    mockSafeFetch
      .mockResolvedValueOnce(response401)    // initial request
      .mockResolvedValueOnce(response401Again); // retry after refresh

    // handleUnauthorized returns true → a retry will be attempted
    mockHandleUnauthorized.mockResolvedValueOnce(true);

    try {
      await platformService.fetchModelsWithMetadata();
      expect.unreachable('Expected fetchModelsWithMetadata to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformModelFetchError);
      const platformError = error as PlatformModelFetchError;
      expect(platformError.code).toBe('TOKEN_REFRESH_FAILED');
      expect(platformError.statusCode).toBe(401);
    }

    expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1);
    // Two fetch calls: the original + the retry
    expect(mockSafeFetch).toHaveBeenCalledTimes(2);
  });

  // ─── 4. Network errors wrapped as NETWORK_ERROR ──────────────────────
  it('wraps network errors as PlatformModelFetchError with code NETWORK_ERROR', async () => {
    mockSafeFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    try {
      await platformService.fetchModelsWithMetadata();
      expect.unreachable('Expected fetchModelsWithMetadata to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformModelFetchError);
      const platformError = error as PlatformModelFetchError;
      expect(platformError.code).toBe('NETWORK_ERROR');
      expect(platformError.message).toBe('fetch failed');
    }
  });

  // ─── 5. Invalid JSON → INVALID_RESPONSE ─────────────────────────────
  it('throws PlatformModelFetchError with code INVALID_RESPONSE on invalid JSON', async () => {
    mockSafeFetch.mockResolvedValueOnce(fakeInvalidJsonResponse());

    try {
      await platformService.fetchModelsWithMetadata();
      expect.unreachable('Expected fetchModelsWithMetadata to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformModelFetchError);
      const platformError = error as PlatformModelFetchError;
      expect(platformError.code).toBe('INVALID_RESPONSE');
    }
  });
});
