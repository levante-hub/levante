import { create } from 'zustand';
import type { LogCategory, LogLevel, LogEntryUI } from '../../main/types/logger';

/**
 * Filter state for log entries
 */
export interface FilterState {
  categories: Set<LogCategory>;
  levels: Set<LogLevel>;
  searchTerm: string;
}

/**
 * Log viewer store state and actions
 */
interface LogViewerState {
  // State
  entries: LogEntryUI[];
  isWatching: boolean;
  loading: boolean;
  error: string | null;

  // Filters
  filters: FilterState;
  autoScroll: boolean;

  // Config
  displayLimit: number; // Circular buffer size

  // Cleanup function for event listener
  cleanupListener: (() => void) | null;

  // Actions
  startWatching: () => Promise<void>;
  stopWatching: () => Promise<void>;
  syncWatchingState: () => Promise<void>;
  loadRecent: (limit?: number) => Promise<void>;
  addEntry: (entry: LogEntryUI) => void;
  updateFilters: (filters: Partial<FilterState>) => void;
  clearLogs: () => void;
  toggleAutoScroll: () => void;
  setError: (error: string | null) => void;
}

/**
 * Default categories to show
 */
const DEFAULT_CATEGORIES: LogCategory[] = ['ai-sdk', 'mcp', 'database', 'core'];

/**
 * All available log levels
 */
const ALL_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/**
 * Create the log viewer store
 */
export const useLogViewerStore = create<LogViewerState>()(
  (set, get) => ({
      // Initial state
      entries: [],
      isWatching: false,
      loading: false,
      error: null,

      filters: {
        categories: new Set(DEFAULT_CATEGORIES),
        levels: new Set(ALL_LEVELS),
        searchTerm: '',
      },
      autoScroll: true,
      displayLimit: 1000,
      cleanupListener: null,

      // Actions
      startWatching: async () => {
        const state = get();

        // Already watching
        if (state.isWatching) {
          return;
        }

        set({ loading: true, error: null });

        try {
          const result = await window.levante.logViewer.startWatching();

          if (!result.success) {
            throw new Error(result.error || 'Failed to start watching');
          }

          // Set up listener for new entries
          const cleanup = window.levante.logViewer.onNewEntry((entry) => {
            get().addEntry(entry as LogEntryUI);
          });

          set({
            isWatching: true,
            loading: false,
            cleanupListener: cleanup,
          });

          // Save user preference
          const updatedState = get();
          saveFilterPreferences(updatedState.filters, updatedState.autoScroll, true);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Unknown error',
            loading: false,
            isWatching: false,
          });
        }
      },

      stopWatching: async () => {
        const state = get();

        if (!state.isWatching) {
          return;
        }

        try {
          // Cleanup event listener
          if (state.cleanupListener) {
            state.cleanupListener();
          }

          const result = await window.levante.logViewer.stopWatching();

          if (!result.success) {
            throw new Error(result.error || 'Failed to stop watching');
          }

          set({
            isWatching: false,
            cleanupListener: null,
          });

          // Save user preference
          const updatedState = get();
          saveFilterPreferences(updatedState.filters, updatedState.autoScroll, false);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },

      /**
       * Sync watching state from main process
       */
      syncWatchingState: async () => {
        try {
          const result = await window.levante.logViewer.isWatching();

          if (!result.success || result.data === undefined) {
            return;
          }

          const currentState = get();
          const actualIsWatching = result.data;

          // Only update if there's a mismatch
          if (currentState.isWatching !== actualIsWatching) {
            // If service is watching but UI thinks it's not, set up listener
            if (actualIsWatching && !currentState.isWatching) {
              const cleanup = window.levante.logViewer.onNewEntry((entry) => {
                get().addEntry(entry as LogEntryUI);
              });

              set({
                isWatching: true,
                cleanupListener: cleanup,
              });
            }
            // If service is not watching but UI thinks it is, clean up
            else if (!actualIsWatching && currentState.isWatching) {
              if (currentState.cleanupListener) {
                currentState.cleanupListener();
              }

              set({
                isWatching: false,
                cleanupListener: null,
              });
            }
          }
        } catch (error) {
          // Silent fail - not critical
          console.error('Failed to sync watching state:', error);
        }
      },

      loadRecent: async (limit = 500) => {
        set({ loading: true, error: null });

        try {
          const result = await window.levante.logViewer.getRecent(limit);

          if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to load recent logs');
          }

          // Convert timestamp strings to Date objects
          const entries = result.data.map((entry) => ({
            ...entry,
            timestamp: new Date(entry.timestamp),
          }));

          set({ entries, loading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Unknown error',
            loading: false,
          });
        }
      },

      addEntry: (entry) => {
        set((state) => {
          // Convert timestamp to Date if it's a string
          const normalizedEntry = {
            ...entry,
            timestamp: typeof entry.timestamp === 'string'
              ? new Date(entry.timestamp)
              : entry.timestamp,
          };

          // Skip duplicate entries (can happen when loadRecent overlaps with onNewEntry)
          if (state.entries.some((e) => e.id === normalizedEntry.id)) {
            return state;
          }

          const newEntries = [...state.entries, normalizedEntry];

          // Circular buffer: keep only last N entries
          if (newEntries.length > state.displayLimit) {
            newEntries.shift();
          }

          return { entries: newEntries };
        });
      },

      updateFilters: (filters) => {
        set((state) => ({
          filters: { ...state.filters, ...filters },
        }));
      },

      clearLogs: () => {
        set({ entries: [] });
      },

      toggleAutoScroll: () => {
        set((state) => ({ autoScroll: !state.autoScroll }));
      },

      setError: (error) => {
        set({ error });
      },
  })
);

/**
 * Selector for filtered log entries
 * Use with useMemo in components for performance
 */
export const selectFilteredEntries = (state: LogViewerState): LogEntryUI[] => {
  const { entries, filters } = state;

  return entries
    .filter((entry) => filters.categories.has(entry.category))
    .filter((entry) => filters.levels.has(entry.level))
    .filter((entry) => {
      if (!filters.searchTerm) return true;
      const search = filters.searchTerm.toLowerCase();
      return (
        entry.message.toLowerCase().includes(search) ||
        entry.category.toLowerCase().includes(search) ||
        entry.level.toLowerCase().includes(search)
      );
    });
};

/**
 * Load filter preferences from localStorage
 */
export function loadFilterPreferences(): Partial<FilterState> & { userWatchingPreference?: boolean } {
  try {
    const saved = localStorage.getItem('logViewerPreferences');
    if (!saved) return {};

    const prefs = JSON.parse(saved);
    return {
      categories: prefs.filters?.categories
        ? new Set(prefs.filters.categories)
        : undefined,
      levels: prefs.filters?.levels
        ? new Set(prefs.filters.levels)
        : undefined,
      userWatchingPreference: prefs.userWatchingPreference,
    };
  } catch {
    return {};
  }
}

/**
 * Save filter preferences to localStorage
 */
export function saveFilterPreferences(
  filters: FilterState,
  autoScroll: boolean,
  userWatchingPreference?: boolean
): void {
  try {
    const saved = localStorage.getItem('logViewerPreferences');
    const existing = saved ? JSON.parse(saved) : {};

    localStorage.setItem(
      'logViewerPreferences',
      JSON.stringify({
        filters: {
          categories: Array.from(filters.categories),
          levels: Array.from(filters.levels),
        },
        autoScroll,
        userWatchingPreference:
          userWatchingPreference !== undefined
            ? userWatchingPreference
            : existing.userWatchingPreference,
      })
    );
  } catch {
    // Ignore localStorage errors
  }
}
