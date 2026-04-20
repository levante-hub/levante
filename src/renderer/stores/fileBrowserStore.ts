/**
 * File Browser Store
 *
 * Holds sidebar file tree state for Fase 1.
 */

import path from 'path-browserify';
import { create } from 'zustand';

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  extension: string;
  modifiedAt: number;
  isHidden: boolean;
}

export type FileSystemChangeKind =
  | 'file-added'
  | 'file-changed'
  | 'file-removed'
  | 'directory-added'
  | 'directory-removed';

export interface FileSystemChange {
  path: string;
  parentPath: string;
  kind: FileSystemChangeKind;
}

export function pruneEntriesSubtree(
  entries: Map<string, DirectoryEntry[]>,
  subtreeRoot: string
): Map<string, DirectoryEntry[]> {
  const next = new Map(entries);
  const normalizedRoot = subtreeRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const prefix = `${normalizedRoot}/`;

  for (const key of next.keys()) {
    const normalizedKey = key.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalizedKey === normalizedRoot || normalizedKey.startsWith(prefix)) {
      next.delete(key);
    }
  }

  return next;
}

export function findNearestLoadedAncestor(
  candidatePath: string,
  loadedDirs: Set<string>,
  workingDirectory: string
): string {
  let current = candidatePath;

  while (true) {
    if (loadedDirs.has(current)) {
      return current;
    }

    if (current === workingDirectory) {
      return workingDirectory;
    }

    const parent = path.dirname(current);
    if (!parent || parent === current) {
      return workingDirectory;
    }

    current = parent;
  }
}

interface FileBrowserState {
  workingDirectory: string | null;
  entries: Map<string, DirectoryEntry[]>;
  expandedDirs: Set<string>;

  isLoadingDir: string | null;
  error: string | null;

  initialize: (cwd: string) => Promise<void>;
  loadDirectory: (dirPath: string) => Promise<void>;
  toggleDirectory: (dirPath: string) => void;
  refreshDirectory: (dirPath: string) => void;
  applyExternalChanges: (changes: FileSystemChange[]) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
}

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  workingDirectory: null,
  entries: new Map(),
  expandedDirs: new Set(),

  isLoadingDir: null,
  error: null,

  initialize: async (cwd: string) => {
    if (!cwd?.trim()) {
      set({ error: 'Missing working directory' });
      return;
    }

    const state = get();
    if (state.workingDirectory === cwd && state.entries.has(cwd)) {
      return;
    }

    set({
      workingDirectory: cwd,
      entries: new Map(),
      expandedDirs: new Set(),
      error: null,
      isLoadingDir: null,
    });

    const setDirResult = await window.levante.fs.setWorkingDir(cwd);
    if (!setDirResult.success) {
      set({
        error: setDirResult.error ?? 'Failed to set working directory',
        isLoadingDir: null,
      });
      return;
    }

    await get().loadDirectory(cwd);
  },

  loadDirectory: async (dirPath: string) => {
    set({ isLoadingDir: dirPath, error: null });

    try {
      const result = await window.levante.fs.readDir(dirPath, {
        showHidden: true,
        sortBy: 'type',
      });

      if (result.success && result.data) {
        const data = result.data;
        set((state) => {
          const nextEntries = new Map(state.entries);
          nextEntries.set(dirPath, data);
          return {
            entries: nextEntries,
            isLoadingDir: null,
          };
        });
      } else {
        set({
          error: result.error ?? 'Failed to read directory',
          isLoadingDir: null,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoadingDir: null,
      });
    }
  },

  toggleDirectory: (dirPath: string) => {
    set((state) => {
      const nextExpanded = new Set(state.expandedDirs);

      if (nextExpanded.has(dirPath)) {
        nextExpanded.delete(dirPath);
      } else {
        nextExpanded.add(dirPath);
        if (!state.entries.has(dirPath)) {
          void get().loadDirectory(dirPath);
        }
      }

      return { expandedDirs: nextExpanded };
    });
  },

  refreshDirectory: (dirPath: string) => {
    set((state) => {
      const nextEntries = new Map(state.entries);
      nextEntries.delete(dirPath);
      return { entries: nextEntries };
    });

    void get().loadDirectory(dirPath);
  },

  applyExternalChanges: (changes: FileSystemChange[]) => {
    const state = get();
    const workingDirectory = state.workingDirectory;

    if (!workingDirectory || changes.length === 0) {
      return;
    }

    const loadedDirs = new Set(state.entries.keys());
    let nextEntries = new Map(state.entries);
    const dirsToRefresh = new Set<string>();

    for (const change of changes) {
      if (change.kind === 'directory-removed') {
        nextEntries = pruneEntriesSubtree(nextEntries, change.path);
      }

      const refreshTarget = findNearestLoadedAncestor(
        change.parentPath,
        loadedDirs,
        workingDirectory
      );

      dirsToRefresh.add(refreshTarget);
    }

    set({ entries: nextEntries });

    for (const dir of dirsToRefresh) {
      void get().loadDirectory(dir);
    }
  },

  setError: (error: string | null) => {
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    set({
      workingDirectory: null,
      entries: new Map(),
      expandedDirs: new Set(),
      isLoadingDir: null,
      error: null,
    });
  },
}));
