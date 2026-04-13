import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';

// ── Mock window.levante ──────────────────────────────────────────────────────

const mockPlatform = {
  getStatus: vi.fn(),
  getModels: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
};

const mockProfile = {
  get: vi.fn(),
  update: vi.fn(),
};

vi.stubGlobal('window', {
  levante: {
    platform: mockPlatform,
    profile: mockProfile,
  },
});

// ── Mock logger (imported by the store) ──────────────────────────────────────

vi.mock('@/services/logger', () => ({
  getRendererLogger: () => ({
    core: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }),
}));

// ── Mock oauthStore (imported by the store for logout) ───────────────────────

vi.mock('../oauthStore', () => ({
  useOAuthStore: {
    getState: () => ({
      clearServerState: vi.fn(),
    }),
  },
}));

// ── Import the store AFTER mocks are set up ──────────────────────────────────

import { usePlatformStore } from '../platformStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Initial state used to reset the store between tests */
const INITIAL_STATE = {
  appMode: null,
  isAuthenticated: false,
  user: null,
  allowedModels: [],
  isLoading: false,
  error: null,
  models: [],
  modelsLoadState: 'idle' as const,
  modelsLoading: false,
  modelsError: null,
  modelsErrorCode: null,
  lastModelsLoadedAt: null,
  hasLoadedModelsOnce: false,
};

/** Builds a minimal raw model payload as returned by the IPC layer */
function makeRawModel(id: string) {
  return {
    id,
    name: `Model ${id}`,
    context_length: 4096,
    pricing: { prompt: '0.001', completion: '0.002' },
    description: `Description for ${id}`,
    category: 'chat',
    capabilities: ['text'],
    zero_data_retention: false,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('platformStore', () => {
  beforeEach(() => {
    usePlatformStore.setState(INITIAL_STATE);
    vi.clearAllMocks();
  });

  // ── 1. initialize() when authenticated → modelsLoadState = 'ready' ────────

  describe('initialize()', () => {
    it('when authenticated, awaits the first catalog attempt and ends in modelsLoadState = "ready"', async () => {
      mockProfile.get.mockResolvedValue({
        data: { appMode: 'platform' },
      });

      mockPlatform.getStatus.mockResolvedValue({
        success: true,
        data: {
          isAuthenticated: true,
          user: { id: 'u1', name: 'Test User', email: 'test@example.com' },
          allowedModels: ['model-a', 'model-b'],
        },
      });

      mockPlatform.getModels.mockResolvedValue({
        success: true,
        data: [makeRawModel('model-a'), makeRawModel('model-b')],
      });

      await act(async () => {
        await usePlatformStore.getState().initialize();
      });

      const state = usePlatformStore.getState();
      expect(state.appMode).toBe('platform');
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual({ id: 'u1', name: 'Test User', email: 'test@example.com' });
      expect(state.modelsLoadState).toBe('ready');
      expect(state.models).toHaveLength(2);
      expect(state.models[0].id).toBe('model-a');
      expect(state.models[1].id).toBe('model-b');
      expect(state.modelsError).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.hasLoadedModelsOnce).toBe(true);
    });
  });

  // ── 2. fetch initial fails → modelsLoadState = 'error', modelsError != null

  describe('ensureModelsLoaded() initial failure', () => {
    it('ends in modelsLoadState = "error" and modelsError != null when fetch fails', async () => {
      // Start as authenticated with no models yet
      usePlatformStore.setState({
        appMode: 'platform',
        isAuthenticated: true,
        models: [],
      });

      mockPlatform.getModels.mockResolvedValue({
        success: false,
        error: 'Server unavailable',
        code: 'SERVER_ERROR',
      });

      await act(async () => {
        await usePlatformStore.getState().ensureModelsLoaded({ reason: 'manual' });
      });

      const state = usePlatformStore.getState();
      expect(state.modelsLoadState).toBe('error');
      expect(state.modelsError).toBe('Server unavailable');
      expect(state.modelsErrorCode).toBe('SERVER_ERROR');
      expect(state.models).toHaveLength(0);
      expect(state.hasLoadedModelsOnce).toBe(false);
    });
  });

  // ── 3. Previous catalog preserved when refresh fails ──────────────────────

  describe('ensureModelsLoaded() with previous catalog', () => {
    it('preserves previous models when a refresh fails', async () => {
      const previousModels = [
        {
          id: 'existing-model',
          name: 'Existing Model',
          provider: 'levante-platform',
          contextLength: 4096,
          isAvailable: true,
          userDefined: false,
          zeroDataRetention: false,
        },
      ];

      usePlatformStore.setState({
        appMode: 'platform',
        isAuthenticated: true,
        models: previousModels as any,
        modelsLoadState: 'ready',
        hasLoadedModelsOnce: true,
      });

      mockPlatform.getModels.mockResolvedValue({
        success: false,
        error: 'Temporary failure',
        code: 'NETWORK_ERROR',
      });

      await act(async () => {
        await usePlatformStore.getState().ensureModelsLoaded({ reason: 'manual', force: true });
      });

      const state = usePlatformStore.getState();
      expect(state.modelsLoadState).toBe('error');
      expect(state.modelsError).toBe('Temporary failure');
      // Previous models are preserved (Decision 4 in the store)
      expect(state.models).toHaveLength(1);
      expect(state.models[0].id).toBe('existing-model');
    });
  });

  // ── 4. Concurrent ensureModelsLoaded() calls are deduplicated ─────────────

  describe('ensureModelsLoaded() deduplication', () => {
    it('concurrent calls result in only one IPC call', async () => {
      usePlatformStore.setState({
        appMode: 'platform',
        isAuthenticated: true,
        models: [],
        modelsLoadState: 'idle',
      });

      // Use a deferred promise so we control when the IPC resolves
      let resolveGetModels!: (value: any) => void;
      mockPlatform.getModels.mockReturnValue(
        new Promise((resolve) => {
          resolveGetModels = resolve;
        })
      );

      // Fire three concurrent calls (none with force)
      const p1 = usePlatformStore.getState().ensureModelsLoaded({ reason: 'startup' });
      const p2 = usePlatformStore.getState().ensureModelsLoaded({ reason: 'foreground' });
      const p3 = usePlatformStore.getState().ensureModelsLoaded({ reason: 'new-session' });

      // Resolve the single IPC call
      resolveGetModels({
        success: true,
        data: [makeRawModel('model-x')],
      });

      await act(async () => {
        await Promise.all([p1, p2, p3]);
      });

      // Only one IPC call should have been made
      expect(mockPlatform.getModels).toHaveBeenCalledTimes(1);

      const state = usePlatformStore.getState();
      expect(state.modelsLoadState).toBe('ready');
      expect(state.models).toHaveLength(1);
      expect(state.models[0].id).toBe('model-x');
    });
  });

  // ── 5. logout() resets all catalog state ──────────────────────────────────

  describe('logout()', () => {
    it('resets all catalog state', async () => {
      // Set up a "fully loaded" state
      usePlatformStore.setState({
        appMode: 'platform',
        isAuthenticated: true,
        user: { id: 'u1', name: 'Test User', email: 'test@example.com' } as any,
        allowedModels: ['model-a'],
        models: [
          {
            id: 'model-a',
            name: 'Model A',
            provider: 'levante-platform',
            contextLength: 4096,
            isAvailable: true,
            userDefined: false,
            zeroDataRetention: false,
          },
        ] as any,
        modelsLoadState: 'ready',
        modelsLoading: false,
        modelsError: null,
        modelsErrorCode: null,
        lastModelsLoadedAt: Date.now(),
        hasLoadedModelsOnce: true,
      });

      mockPlatform.logout.mockResolvedValue({ success: true });

      await act(async () => {
        await usePlatformStore.getState().logout();
      });

      const state = usePlatformStore.getState();
      expect(state.appMode).toBe('standalone');
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.allowedModels).toEqual([]);
      expect(state.models).toEqual([]);
      expect(state.modelsLoadState).toBe('idle');
      expect(state.modelsLoading).toBe(false);
      expect(state.modelsError).toBeNull();
      expect(state.modelsErrorCode).toBeNull();
      expect(state.lastModelsLoadedAt).toBeNull();
      expect(state.hasLoadedModelsOnce).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  // ── 6. login() starts catalog loading ─────────────────────────────────────

  describe('login()', () => {
    it('starts catalog loading after successful login', async () => {
      mockPlatform.login.mockResolvedValue({
        success: true,
        data: {
          isAuthenticated: true,
          user: { id: 'u2', name: 'Logged In User', email: 'login@example.com' },
          allowedModels: ['model-c'],
        },
      });

      mockPlatform.getModels.mockResolvedValue({
        success: true,
        data: [makeRawModel('model-c')],
      });

      await act(async () => {
        await usePlatformStore.getState().login('https://platform.example.com');
      });

      // login() triggers ensureModelsLoaded non-blocking, so we need to wait
      // for the in-flight promise to settle
      await act(async () => {
        // Allow microtasks to flush
        await new Promise((r) => setTimeout(r, 0));
      });

      const state = usePlatformStore.getState();
      expect(state.appMode).toBe('platform');
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual({
        id: 'u2',
        name: 'Logged In User',
        email: 'login@example.com',
      });

      // getModels should have been called by the non-blocking ensureModelsLoaded
      expect(mockPlatform.getModels).toHaveBeenCalledWith({ reason: 'login' });
      expect(state.modelsLoadState).toBe('ready');
      expect(state.models).toHaveLength(1);
      expect(state.models[0].id).toBe('model-c');
    });
  });
});
