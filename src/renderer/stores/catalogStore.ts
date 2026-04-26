/**
 * CatalogStore - Unified selectable-models catalog cache
 *
 * Wraps `loadSelectableModels` with:
 * - Cache keyed by (appMode, useOtherProviders, platformModels fingerprint)
 * - In-flight dedup so concurrent `ensureLoaded` calls share the same load
 * - Explicit `invalidate(reason)` used by modelStore/platformStore after mutations
 *
 * Consumers subscribe to `result` / `loading` / `error` and call `ensureLoaded`
 * from a single useEffect with their current params. Cache misses trigger a
 * real load; hits return immediately.
 */

import { create } from 'zustand';
import { loadSelectableModels, type SelectableModelsResult } from '@/lib/selectableModels';
import { getRendererLogger } from '@/services/logger';
import type { Model } from '../../types/models';

const logger = getRendererLogger();

export type CatalogLoadParams = {
  appMode: 'platform' | 'standalone' | null;
  useOtherProviders: boolean;
  platformModels: Model[];
};

export type CatalogInvalidateReason =
  | 'preference-change'
  | 'provider-sync'
  | 'platform-models'
  | 'manual';

interface CatalogState {
  result: SelectableModelsResult | null;
  loading: boolean;
  error: string | null;
  _inflight: Promise<SelectableModelsResult> | null;
  _cacheKey: string | null;
  _lastParams: CatalogLoadParams | null;

  ensureLoaded: (params: CatalogLoadParams) => Promise<SelectableModelsResult>;
  invalidate: (reason: CatalogInvalidateReason) => void;
}

function computeCacheKey(params: CatalogLoadParams): string {
  const { appMode, useOtherProviders, platformModels } = params;
  const len = platformModels.length;
  const first = platformModels[0]?.id ?? '';
  const last = platformModels[len - 1]?.id ?? '';
  return `${appMode ?? 'null'}|${useOtherProviders ? '1' : '0'}|${len}:${first}:${last}`;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  result: null,
  loading: false,
  error: null,
  _inflight: null,
  _cacheKey: null,
  _lastParams: null,

  ensureLoaded: async (params) => {
    const nextKey = computeCacheKey(params);
    const state = get();

    if (state._cacheKey === nextKey && state.result) {
      return state.result;
    }

    if (state._inflight && state._cacheKey === nextKey) {
      return state._inflight;
    }

    set({
      loading: true,
      error: null,
      _cacheKey: nextKey,
      _lastParams: params,
    });

    let loadPromise: Promise<SelectableModelsResult> | null = null;

    const doLoad = async (): Promise<SelectableModelsResult> => {
      try {
        const result = await loadSelectableModels(params);
        if (get()._cacheKey === nextKey) {
          set({ result, loading: false, error: null });
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.models.error('Failed to load selectable models (catalogStore)', { error: message });
        if (get()._cacheKey === nextKey) {
          set({ loading: false, error: message });
        }
        throw error;
      } finally {
        if (get()._inflight === loadPromise) {
          set({ _inflight: null });
        }
      }
    };

    loadPromise = doLoad();
    set({ _inflight: loadPromise });
    return loadPromise;
  },

  invalidate: (reason) => {
    const { _lastParams } = get();
    logger.models.debug('Catalog invalidated', { reason, willReload: Boolean(_lastParams) });
    set({ result: null, _cacheKey: null, error: null });
    if (_lastParams) {
      void get().ensureLoaded(_lastParams).catch(() => {
        // ensureLoaded already logs — swallow to keep invalidate fire-and-forget.
      });
    }
  },
}));
