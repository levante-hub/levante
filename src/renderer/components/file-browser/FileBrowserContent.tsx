import { useEffect, useMemo, useState, useRef } from 'react';
import { FolderOpen, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileBrowserStore, type DirectoryEntry } from '@/stores/fileBrowserStore';
import { useSidePanelStore } from '@/stores/sidePanelStore';
import { FileTreeNode, getFileIcon } from './FileTreeNode';
import { AddFilesModal } from './AddFilesModal';
import { useTranslation } from 'react-i18next';

interface FileBrowserContentProps {
  searchQuery: string;
  cwd: string;
  projectId?: string | null;
}

interface FileSearchResult {
  name: string;
  path: string;
  relativePath: string;
  extension: string;
}

function isEntryVisible(
  entry: DirectoryEntry,
  normalizedQuery: string,
  allEntries: Map<string, DirectoryEntry[]>
): boolean {
  if (!normalizedQuery) return true;

  if (entry.name.toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  if (entry.type !== 'directory') {
    return false;
  }

  const children = allEntries.get(entry.path) ?? [];
  return children.some((child) => isEntryVisible(child, normalizedQuery, allEntries));
}

function getBasename(p: string): string {
  const normalized = p.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? p;
}

function FileTree({
  entries,
  allEntries,
  expandedDirs,
  depth,
  isLoadingDir,
  onItemClick,
  filterQuery,
}: {
  entries: DirectoryEntry[];
  allEntries: Map<string, DirectoryEntry[]>;
  expandedDirs: Set<string>;
  depth: number;
  isLoadingDir: string | null;
  onItemClick: (entry: DirectoryEntry) => void;
  filterQuery: string;
}) {
  const normalizedQuery = filterQuery.trim().toLowerCase();

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => isEntryVisible(entry, normalizedQuery, allEntries));
  }, [entries, normalizedQuery, allEntries]);

  if (visibleEntries.length === 0) {
    return null;
  }

  return (
    <div>
      {visibleEntries.map((entry) => {
        const forceExpandedBySearch = normalizedQuery.length > 0;
        const isExpanded = expandedDirs.has(entry.path) || forceExpandedBySearch;

        return (
          <div key={entry.path}>
            <FileTreeNode
              entry={entry}
              depth={depth}
              isExpanded={isExpanded}
              isLoading={isLoadingDir === entry.path}
              onClick={onItemClick}
            />

            {entry.type === 'directory' && isExpanded && (
              <FileTree
                entries={allEntries.get(entry.path) ?? []}
                allEntries={allEntries}
                expandedDirs={expandedDirs}
                depth={depth + 1}
                isLoadingDir={isLoadingDir}
                onItemClick={onItemClick}
                filterQuery={filterQuery}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FileBrowserContent({ searchQuery, cwd, projectId }: FileBrowserContentProps) {
  const { t } = useTranslation('chat');
  const openFileTab = useSidePanelStore((state) => state.openFileTab);
  const {
    entries,
    expandedDirs,
    isLoadingDir,
    error,
    initialize,
    toggleDirectory,
    refreshDirectory,
    applyExternalChanges,
    setError,
  } = useFileBrowserStore();

  const [addFilesModalOpen, setAddFilesModalOpen] = useState(false);

  // Backend search state
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!cwd) {
      return;
    }

    let cancelled = false;

    const unsubscribe = window.levante.fs.onFilesChanged((payload) => {
      if (payload.rootPath !== cwd || cancelled) {
        return;
      }

      applyExternalChanges(payload.changes);
    });

    void (async () => {
      await initialize(cwd);
      if (cancelled) {
        return;
      }

      const watchResult = await window.levante.fs.startWatching();

      if (!watchResult.success) {
        setError(watchResult.error ?? 'Failed to start file watcher');
        return;
      }

      setError(null);
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      void window.levante.fs.stopWatching();
    };
  }, [cwd, initialize, applyExternalChanges, setError]);

  // Debounced backend search
  useEffect(() => {
    const trimmed = searchQuery.trim();

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    debounceRef.current = setTimeout(async () => {
      const currentRequestId = ++requestIdRef.current;
      try {
        const result = await window.levante.fs.searchFiles(trimmed, { maxResults: 30 });
        if (currentRequestId !== requestIdRef.current) return;

        if (result.success && result.data) {
          setSearchResults(result.data);
        } else {
          setSearchError(result.error ?? 'Search failed');
          setSearchResults([]);
        }
      } catch (err) {
        if (currentRequestId !== requestIdRef.current) return;
        setSearchError(err instanceof Error ? err.message : 'Search failed');
        setSearchResults([]);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  const handleItemClick = (entry: DirectoryEntry) => {
    if (entry.type === 'directory') {
      toggleDirectory(entry.path);
      return;
    }

    void openFileTab(entry.path);
  };

  const rootBasename = getBasename(cwd);
  const rootEntries = entries.get(cwd) ?? [];
  const isSearchMode = searchQuery.trim().length >= 2;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground min-w-0 flex-1">
          <FolderOpen size={12} className="shrink-0" />
          <span className="truncate font-mono">/{rootBasename}</span>
        </div>

        {projectId && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            onClick={() => setAddFilesModalOpen(true)}
          >
            <Upload size={14} />
            {t('chat_list.file_browser.add_files')}
          </Button>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-destructive">
          {t('chat_list.file_browser.read_dir_error')}: {error}
        </div>
      )}

      {isSearchMode ? (
        <div className="py-1">
          {isSearching && searchResults.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('chat_list.file_browser.searching')}
            </div>
          ) : searchError ? (
            <div className="px-3 py-2 text-xs text-destructive">
              {searchError}
            </div>
          ) : searchResults.length === 0 && !isSearching ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {t('chat_list.file_browser.no_search_results')}
            </div>
          ) : (
            <div>
              {isSearching && (
                <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
              )}
              {searchResults.map((result) => (
                <button
                  key={result.path}
                  className="flex items-center gap-1.5 py-[3px] px-3 w-full text-left cursor-pointer hover:bg-accent/50 rounded-sm text-sm transition-colors"
                  onClick={() => void openFileTab(result.path)}
                  title={result.relativePath}
                >
                  {getFileIcon({
                    name: result.name,
                    path: result.path,
                    type: 'file',
                    size: 0,
                    extension: result.extension,
                    modifiedAt: 0,
                    isHidden: false,
                  })}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate text-[13px]">{result.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {result.relativePath}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {rootEntries.length === 0 && !isLoadingDir ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center flex flex-col items-center gap-2">
              <span>{t('chat_list.file_browser.empty_directory')}</span>
              {projectId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setAddFilesModalOpen(true)}
                >
                  <Upload size={14} className="mr-1.5" />
                  {t('chat_list.file_browser.add_files')}
                </Button>
              )}
            </div>
          ) : (
            <div className="py-1">
              <FileTree
                entries={rootEntries}
                allEntries={entries}
                expandedDirs={expandedDirs}
                depth={0}
                isLoadingDir={isLoadingDir}
                onItemClick={handleItemClick}
                filterQuery=""
              />
            </div>
          )}
        </>
      )}

      {projectId && (
        <AddFilesModal
          open={addFilesModalOpen}
          onClose={() => setAddFilesModalOpen(false)}
          projectId={projectId}
          onFilesAdded={() => refreshDirectory(cwd)}
        />
      )}
    </div>
  );
}
