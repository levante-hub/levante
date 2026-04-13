/**
 * PlatformStore - Central source of truth for Levante Platform mode
 *
 * Manages:
 * - App mode (platform vs standalone)
 * - Platform authentication state
 * - User info from JWT
 * - Allowed models from JWT + metadata from API
 * - Catalog load state machine (idle → loading → ready | error)
 */

import { create } from 'zustand';
import type { AppMode, PlatformUser, PlatformStatus } from '../../types/userProfile';
import type { Model } from '../../types/models';
import { getRendererLogger } from '@/services/logger';
import { useOAuthStore } from './oauthStore';

const logger = getRendererLogger();

// ── Types ────────────────────────────────────────────────────────────────

export type ModelsLoadState = 'idle' | 'loading' | 'ready' | 'error';
export type ModelsLoadReason = 'startup' | 'login' | 'manual' | 'foreground' | 'new-session';

interface PlatformState {
  // Auth state
  appMode: AppMode | null;
  isAuthenticated: boolean;
  user: PlatformUser | null;
  allowedModels: string[];
  isLoading: boolean; // auth/bootstrap only
  error: string | null;

  // Catalog state
  models: Model[];
  modelsLoadState: ModelsLoadState;
  modelsLoading: boolean;
  modelsError: string | null;
  modelsErrorCode: string | null;
  lastModelsLoadedAt: number | null;
  hasLoadedModelsOnce: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (baseUrl?: string) => Promise<void>;
  logout: () => Promise<void>;
  setStandaloneMode: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  fetchModels: () => Promise<void>;
  ensureModelsLoaded: (opts?: { reason?: ModelsLoadReason; force?: boolean }) => Promise<void>;
  retryModels: () => Promise<void>;
}

// ── Retry helpers ────────────────────────────────────────────────────────

const RETRY_DELAYS: Record<ModelsLoadReason, number[]> = {
  startup: [0, 2000, 5000], // 3 attempts
  login: [0],               // 1 attempt
  manual: [0],              // 1 attempt
  foreground: [0],          // 1 attempt
  'new-session': [0],       // 1 attempt
};

const NON_RECOVERABLE_CODES = new Set(['AUTH_REQUIRED']);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Raw model mapper ─────────────────────────────────────────────────────

function mapRawModel(raw: any): Model {
  return {
    id: raw.id,
    name: raw.name || raw.id,
    provider: 'levante-platform',
    contextLength: raw.context_length || raw.contextLength || 0,
    pricing: raw.pricing
      ? {
          input: parseFloat(raw.pricing.prompt || raw.pricing.input || '0'),
          output: parseFloat(raw.pricing.completion || raw.pricing.output || '0'),
        }
      : undefined,
    description: raw.description,
    category: raw.category,
    capabilities: raw.capabilities || [],
    zeroDataRetention: raw.zero_data_retention ?? false,
    isAvailable: true,
    userDefined: false,
  };
}

// ── Store ────────────────────────────────────────────────────────────────

// Deduplication: track the in-flight promise so concurrent callers share it
let _inflight: Promise<void> | null = null;

export const usePlatformStore = create<PlatformState>((set, get) => ({
  // Initial state
  appMode: null,
  isAuthenticated: false,
  user: null,
  allowedModels: [],
  isLoading: false,
  error: null,

  // Catalog initial state
  models: [],
  modelsLoadState: 'idle',
  modelsLoading: false,
  modelsError: null,
  modelsErrorCode: null,
  lastModelsLoadedAt: null,
  hasLoadedModelsOnce: false,

  // ── Initialize ──────────────────────────────────────────────────────────

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      const profileResult = await window.levante.profile.get();
      const appMode = profileResult.data?.appMode || null;

      if (appMode === 'platform') {
        const statusResult = await window.levante.platform.getStatus();

        if (statusResult.success && statusResult.data?.isAuthenticated) {
          set({
            appMode: 'platform',
            isAuthenticated: true,
            user: statusResult.data.user,
            allowedModels: statusResult.data.allowedModels,
          });

          // AWAIT first catalog attempt (with retry) before resolving
          await get().ensureModelsLoaded({ reason: 'startup' });
        } else {
          set({
            appMode: 'platform',
            isAuthenticated: false,
            user: null,
            allowedModels: [],
            models: [],
            modelsLoadState: 'idle',
          });
        }
      } else if (appMode === 'standalone') {
        set({ appMode: 'standalone', isAuthenticated: false });
      }
    } catch (error) {
      logger.core.error('Failed to initialize platform store', {
        error: error instanceof Error ? error.message : error,
      });
      set({ error: error instanceof Error ? error.message : 'Initialization failed' });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Login ───────────────────────────────────────────────────────────────

  login: async (baseUrl?: string) => {
    try {
      set({ isLoading: true, error: null });

      const result = await window.levante.platform.login(baseUrl);

      if (!result.success) {
        throw new Error(result.error || 'Login failed');
      }

      const status = result.data as PlatformStatus;

      set({
        appMode: 'platform',
        isAuthenticated: true,
        isLoading: false,
        user: status.user,
        allowedModels: status.allowedModels,
      });

      // Non-blocking catalog fetch after login (per decision 3)
      get().ensureModelsLoaded({ reason: 'login' });
    } catch (error) {
      logger.core.error('Platform login failed', {
        error: error instanceof Error ? error.message : error,
      });
      set({ isLoading: false, error: error instanceof Error ? error.message : 'Login failed' });
      throw error;
    }
  },

  // ── Logout ──────────────────────────────────────────────────────────────

  logout: async () => {
    try {
      set({ isLoading: true, error: null });

      await window.levante.platform.logout();

      useOAuthStore.getState().clearServerState('levante-platform');

      set({
        appMode: 'standalone',
        isAuthenticated: false,
        user: null,
        allowedModels: [],
        models: [],
        isLoading: false,
        // Reset catalog state
        modelsLoadState: 'idle',
        modelsLoading: false,
        modelsError: null,
        modelsErrorCode: null,
        lastModelsLoadedAt: null,
        hasLoadedModelsOnce: false,
      });
    } catch (error) {
      logger.core.error('Platform logout failed', {
        error: error instanceof Error ? error.message : error,
      });
      set({ error: error instanceof Error ? error.message : 'Logout failed', isLoading: false });
    }
  },

  // ── Standalone mode ─────────────────────────────────────────────────────

  setStandaloneMode: async () => {
    try {
      await window.levante.profile.update({ appMode: 'standalone' });
      set({
        appMode: 'standalone',
        isAuthenticated: false,
        user: null,
        allowedModels: [],
        models: [],
        // Reset catalog state
        modelsLoadState: 'idle',
        modelsLoading: false,
        modelsError: null,
        modelsErrorCode: null,
        lastModelsLoadedAt: null,
        hasLoadedModelsOnce: false,
      });
    } catch (error) {
      logger.core.error('Failed to set standalone mode', {
        error: error instanceof Error ? error.message : error,
      });
    }
  },

  // ── Refresh status ──────────────────────────────────────────────────────

  refreshStatus: async () => {
    try {
      const result = await window.levante.platform.getStatus();

      if (result.success && result.data) {
        const wasAuthenticated = get().isAuthenticated;

        set({
          isAuthenticated: result.data.isAuthenticated,
          user: result.data.user,
          allowedModels: result.data.allowedModels,
        });

        // If session became invalid, clear catalog state
        if (wasAuthenticated && !result.data.isAuthenticated) {
          set({
            models: [],
            modelsLoadState: 'idle',
            modelsLoading: false,
            modelsError: null,
            modelsErrorCode: null,
            lastModelsLoadedAt: null,
            hasLoadedModelsOnce: false,
          });
        }
      }
    } catch (error) {
      logger.core.error('Failed to refresh platform status', {
        error: error instanceof Error ? error.message : error,
      });
    }
  },

  // ── Legacy fetchModels (redirects to ensureModelsLoaded) ────────────────

  fetchModels: async () => {
    await get().ensureModelsLoaded({ reason: 'manual', force: true });
  },

  // ── retryModels (explicit manual retry) ─────────────────────────────────

  retryModels: async () => {
    await get().ensureModelsLoaded({ reason: 'manual', force: true });
  },

  // ── ensureModelsLoaded — single abstraction for catalog loading ─────────

  ensureModelsLoaded: async (opts?: { reason?: ModelsLoadReason; force?: boolean }) => {
    const reason = opts?.reason ?? 'manual';
    const force = opts?.force ?? false;

    // If already loaded and not forcing, skip
    const state = get();
    if (!force && state.modelsLoadState === 'ready' && state.models.length > 0) {
      return;
    }

    // Deduplicate concurrent calls: if there's an in-flight request, piggyback
    if (_inflight && !force) {
      return _inflight;
    }

    const doLoad = async () => {
      const delays = RETRY_DELAYS[reason] || [0];
      const previousModels = get().models;

      set({
        modelsLoadState: 'loading',
        modelsLoading: true,
        modelsError: null,
        modelsErrorCode: null,
      });

      let lastError: { message: string; code: string } | null = null;

      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (attempt > 0) {
          await sleep(delays[attempt]);
        }

        try {
          logger.core.info('Platform catalog fetch attempt', {
            reason,
            attempt: attempt + 1,
            totalAttempts: delays.length,
          });

          const result = await window.levante.platform.getModels({ reason });

          if (result.success && result.data) {
            const models: Model[] = result.data.map(mapRawModel);

            set({
              models,
              modelsLoadState: 'ready',
              modelsLoading: false,
              modelsError: null,
              modelsErrorCode: null,
              lastModelsLoadedAt: Date.now(),
              hasLoadedModelsOnce: true,
            });

            logger.core.info('Platform catalog loaded', {
              reason,
              attempt: attempt + 1,
              count: models.length,
            });

            return; // success — exit
          }

          // IPC returned success: false
          const errorCode = (result as any).code || 'UNKNOWN';
          const errorMsg = result.error || 'Model fetch failed';
          lastError = { message: errorMsg, code: errorCode };

          logger.core.warn('Platform catalog fetch failed (IPC)', {
            reason,
            attempt: attempt + 1,
            errorCode,
            error: errorMsg,
          });

          // Don't retry non-recoverable errors
          if (NON_RECOVERABLE_CODES.has(errorCode)) {
            break;
          }
        } catch (error) {
          lastError = {
            message: error instanceof Error ? error.message : 'Unknown error',
            code: 'NETWORK_ERROR',
          };

          logger.core.warn('Platform catalog fetch exception', {
            reason,
            attempt: attempt + 1,
            error: lastError.message,
          });
        }
      }

      // All attempts exhausted — set error state
      // Keep previous models if we had a valid catalog before (Decision 4)
      const keepPreviousModels = previousModels.length > 0;

      set({
        models: keepPreviousModels ? previousModels : [],
        modelsLoadState: 'error',
        modelsLoading: false,
        modelsError: lastError?.message ?? 'Failed to load models',
        modelsErrorCode: lastError?.code ?? 'UNKNOWN',
        // Only update hasLoadedModelsOnce if we had previous models
        ...(keepPreviousModels ? {} : { hasLoadedModelsOnce: false }),
      });

      logger.core.error('Platform catalog load exhausted all retries', {
        reason,
        lastErrorCode: lastError?.code,
        lastError: lastError?.message,
        keptPreviousCatalog: keepPreviousModels,
      });
    };

    _inflight = doLoad().finally(() => {
      _inflight = null;
    });

    return _inflight;
  },
}));
