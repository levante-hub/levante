'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  LexicalComposer,
  type InitialConfigType,
} from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import {
  type LexicalEditor,
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  $isElementNode,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_HIGH,
  type EditorState,
  type LexicalNode,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { FileMentionNode, type FileMentionPayload } from '@/components/chat/lexical/FileMentionNode';
import { FileMentionPlugin, replaceTriggerWithFileMention, insertFileMentionAtSelection } from '@/components/chat/lexical/FileMentionPlugin';
import { FileAutocomplete } from '@/components/chat/FileAutocomplete';
import { useFileBrowserStore, type DirectoryEntry } from '@/stores/fileBrowserStore';
import { toPosixPath } from '@/lib/utils';
import path from 'path-browserify';

// ============================================================================
// Types
// ============================================================================

export interface PromptInputEditorProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  maxHeight?: number;
  disabled?: boolean;
  onPaste?: (e: ClipboardEvent) => void;
  focusRef?: React.MutableRefObject<(() => void) | null>;

  // Phase 2+
  coworkMode?: boolean;
  effectiveCwd?: string | null;
  onMentionsChange?: (mentions: FileMentionPayload[]) => void;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_RESULTS = 8;
const MAX_MENTIONS_PER_MESSAGE = 10;

function countFileMentionNodes(node: LexicalNode): number {
  let count = 0;

  if (node instanceof FileMentionNode) {
    return 1;
  }

  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      count += countFileMentionNodes(child);
    }
  }

  return count;
}

// ============================================================================
// Plugins
// ============================================================================

/**
 * ChatKeymapPlugin - Handles Enter/Shift+Enter/IME keybindings
 */
function ChatKeymapPlugin({ pickerOpen }: { pickerOpen: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event) return false;

        // If mention picker is open, don't handle enter here
        if (pickerOpen) return false;

        // Don't submit if IME composition is in progress
        if (event.isComposing) return false;

        // Shift+Enter allows newline
        if (event.shiftKey) return false;

        // Enter submits form
        event.preventDefault();
        const rootElement = editor.getRootElement();
        const form = rootElement?.closest('form');
        if (form) {
          form.requestSubmit();
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor, pickerOpen]);

  return null;
}

/**
 * AutoHeightPlugin - Adjusts editor height based on content
 */
function AutoHeightPlugin({
  minHeight,
  maxHeight,
}: {
  minHeight: number;
  maxHeight: number;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      const rootElement = editor.getRootElement();
      if (!rootElement) return;

      rootElement.style.height = 'auto';
      const newHeight = Math.min(
        Math.max(rootElement.scrollHeight, minHeight),
        maxHeight
      );
      rootElement.style.height = `${newHeight}px`;
    });
  }, [editor, minHeight, maxHeight]);

  return null;
}

/**
 * SyncPlugin - Syncs external value with Lexical editor state
 */
function SyncPlugin({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const lastExternalValueRef = useRef(value);
  const isInternalUpdateRef = useRef(false);

  // External value -> editor
  useEffect(() => {
    if (value === lastExternalValueRef.current) return;
    lastExternalValueRef.current = value;

    isInternalUpdateRef.current = true;
    editor.update(() => {
      const root = $getRoot();
      const currentText = root.getTextContent();
      if (currentText === value) {
        isInternalUpdateRef.current = false;
        return;
      }
      root.clear();
      const paragraph = $createParagraphNode();
      if (value) {
        paragraph.append($createTextNode(value));
      }
      root.append(paragraph);
    });
    isInternalUpdateRef.current = false;
  }, [editor, value]);

  // Editor -> external value
  const handleChange = useCallback(
    (editorState: EditorState) => {
      if (isInternalUpdateRef.current) return;
      editorState.read(() => {
        const text = $getRoot().getTextContent();
        if (text !== lastExternalValueRef.current) {
          lastExternalValueRef.current = text;
          onChange(text);
        }
      });
    },
    [onChange]
  );

  return <OnChangePlugin onChange={handleChange} ignoreSelectionChange />;
}

/**
 * PastePlugin - Forwards paste events to parent
 */
function PastePlugin({ onPaste }: { onPaste?: (e: ClipboardEvent) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onPaste) return;

    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    const handler = (e: Event) => {
      onPaste(e as ClipboardEvent);
    };

    rootElement.addEventListener('paste', handler);
    return () => rootElement.removeEventListener('paste', handler);
  }, [editor, onPaste]);

  return null;
}

/**
 * FocusPlugin - Exposes focus function via ref
 */
function FocusPlugin({
  focusRef,
}: {
  focusRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = () => editor.focus();
    return () => {
      focusRef.current = null;
    };
  }, [editor, focusRef]);

  return null;
}

/**
 * EditorRefPlugin - Stores editor instance for external use
 */
function EditorRefPlugin({
  editorRef,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  return null;
}

/**
 * MentionsSyncPlugin - Extracts FileMentionNodes and reports changes
 */
function MentionsSyncPlugin({
  onMentionsChange,
}: {
  onMentionsChange?: (mentions: FileMentionPayload[]) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const prevMentionsRef = useRef<string>('');

  useEffect(() => {
    if (!onMentionsChange) return;

    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot();
        const mentions: FileMentionPayload[] = [];

        const collectMentions = (node: any) => {
          if (node instanceof FileMentionNode) {
            mentions.push({
              fileName: node.getFileName(),
              filePath: node.getFilePath(),
              relativePath: node.getRelativePath(),
            });
          }
          if ('getChildren' in node) {
            for (const child of node.getChildren()) {
              collectMentions(child);
            }
          }
        };

        collectMentions(root);

        const key = mentions.map((m) => `${m.filePath}|${m.relativePath}`).join(',');
        if (key !== prevMentionsRef.current) {
          prevMentionsRef.current = key;
          onMentionsChange(mentions);
        }
      });
    });
  }, [editor, onMentionsChange]);

  return null;
}

/**
 * DropPlugin - Handles drag-and-drop of files from FileBrowser
 */
function DropPlugin({
  editorRef,
  dropTargetRef,
  effectiveCwd,
  coworkMode,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>;
  dropTargetRef: React.MutableRefObject<HTMLDivElement | null>;
  effectiveCwd?: string | null;
  coworkMode?: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!coworkMode || !effectiveCwd) return;

    const dropTarget = dropTargetRef.current;
    if (!dropTarget) return;

    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('application/levante-file')) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget && dropTarget.contains(relatedTarget)) {
        return;
      }

      setIsDragOver(false);
    };

    const handleDrop = (e: DragEvent) => {
      setIsDragOver(false);
      const data = e.dataTransfer?.getData('application/levante-file');
      if (!data) return;

      e.preventDefault();
      e.stopPropagation();

      try {
        const fileData = JSON.parse(data);
        if (!fileData.path || !effectiveCwd) return;

        // Validate path is within CWD
        // Normalize to POSIX: on Windows `fileData.path` and `effectiveCwd`
        // use `\` and path-browserify cannot handle them.
        const cwdPosix = toPosixPath(effectiveCwd);
        const filePosix = toPosixPath(fileData.path);
        const rel = path.relative(cwdPosix, filePosix);
        if (rel.startsWith('..') || path.isAbsolute(rel)) return;

        const payload: FileMentionPayload = {
          fileName: fileData.name || path.basename(filePosix),
          filePath: fileData.path,
          relativePath: rel,
        };

        if (editorRef.current) {
          editorRef.current.focus();

          const mentionCount = editorRef.current.getEditorState().read(() =>
            countFileMentionNodes($getRoot())
          );
          if (mentionCount >= MAX_MENTIONS_PER_MESSAGE) {
            return;
          }

          insertFileMentionAtSelection(editorRef.current, payload);
        }
      } catch {
        // ignore parse errors
      }
    };

    dropTarget.addEventListener('dragover', handleDragOver);
    dropTarget.addEventListener('dragleave', handleDragLeave);
    dropTarget.addEventListener('drop', handleDrop);

    return () => {
      dropTarget.removeEventListener('dragover', handleDragOver);
      dropTarget.removeEventListener('dragleave', handleDragLeave);
      dropTarget.removeEventListener('drop', handleDrop);
    };
  }, [editor, editorRef, dropTargetRef, effectiveCwd, coworkMode]);

  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;
    if (isDragOver) {
      rootElement.classList.add('ring-2', 'ring-primary/50', 'bg-primary/5');
    } else {
      rootElement.classList.remove('ring-2', 'ring-primary/50', 'bg-primary/5');
    }
  }, [editor, isDragOver]);

  return null;
}

// ============================================================================
// Main Component
// ============================================================================

export function PromptInputEditor({
  value,
  onChange,
  placeholder = 'What would you like to know?',
  className,
  minHeight = 48,
  maxHeight = 164,
  disabled = false,
  onPaste,
  focusRef,
  coworkMode = false,
  effectiveCwd = null,
  onMentionsChange,
}: PromptInputEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<LexicalEditor | null>(null);

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAnchorRect, setMentionAnchorRect] = useState<DOMRect | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionResults, setMentionResults] = useState<DirectoryEntry[]>([]);
  const [ipcResults, setIpcResults] = useState<DirectoryEntry[]>([]);

  // File browser entries for local search
  const entries = useFileBrowserStore((s) => s.entries);

  // IPC search debounce
  const ipcRequestIdRef = useRef(0);
  const ipcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pickerOpen = mentionQuery !== null;

  // Count current mentions in the editor
  const currentMentionCount = useRef(0);

  useEffect(() => {
    return () => {
      if (ipcDebounceRef.current) {
        clearTimeout(ipcDebounceRef.current);
      }
    };
  }, []);

  // If mention feature becomes unavailable, close any stale picker state.
  useEffect(() => {
    if (coworkMode && effectiveCwd) return;
    setMentionQuery(null);
    setMentionAnchorRect(null);
    setMentionResults([]);
    setIpcResults([]);
    setMentionSelectedIndex(0);
  }, [coworkMode, effectiveCwd]);

  // Flatten file entries to searchable list
  const allFiles = useMemo(() => {
    const files: DirectoryEntry[] = [];
    for (const [, dirEntries] of entries) {
      for (const entry of dirEntries) {
        if (entry.type === 'file') {
          files.push(entry);
        }
      }
    }
    return files;
  }, [entries]);

  // Filter results based on query
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionResults([]);
      setIpcResults([]);
      setMentionSelectedIndex(0);
      return;
    }

    const query = mentionQuery.toLowerCase();

    // Local search
    const localResults = query
      ? allFiles
          .filter(
            (f) =>
              f.name.toLowerCase().includes(query) ||
              f.path.toLowerCase().includes(query)
          )
          .slice(0, MAX_RESULTS)
      : allFiles.slice(0, MAX_RESULTS);

    setMentionResults(localResults);
    setMentionSelectedIndex(0);

    // IPC fallback search
    if (query.length >= 2 && localResults.length < 3) {
      if (ipcDebounceRef.current) clearTimeout(ipcDebounceRef.current);
      ipcDebounceRef.current = setTimeout(async () => {
        const requestId = ++ipcRequestIdRef.current;
        try {
          const result = await window.levante.fs.searchFiles(query, { maxResults: MAX_RESULTS });
          if (requestId !== ipcRequestIdRef.current) return; // stale
          if (result.success && result.data) {
            const converted: DirectoryEntry[] = result.data.map((r) => ({
              name: r.name,
              path: r.path,
              type: 'file' as const,
              size: 0,
              extension: r.extension,
              modifiedAt: 0,
              isHidden: false,
            }));
            setIpcResults(converted);
          }
        } catch {
          // ignore IPC errors
        }
      }, 200);
    } else {
      setIpcResults([]);
    }
  }, [mentionQuery, allFiles]);

  // Merge local + IPC results, dedupe by path
  const mergedResults = useMemo(() => {
    const seen = new Set<string>();
    const merged: DirectoryEntry[] = [];
    for (const r of mentionResults) {
      if (!seen.has(r.path)) {
        seen.add(r.path);
        merged.push(r);
      }
    }
    for (const r of ipcResults) {
      if (!seen.has(r.path)) {
        seen.add(r.path);
        merged.push(r);
      }
    }
    return merged.slice(0, MAX_RESULTS);
  }, [mentionResults, ipcResults]);

  // Handle query change from FileMentionPlugin
  const handleQueryChange = useCallback(
    (query: string | null, anchorRect: DOMRect | null) => {
      setMentionQuery(query);
      setMentionAnchorRect(anchorRect);
      if (query !== null) {
        setMentionSelectedIndex(0);
      }
    },
    []
  );

  // Handle selection from autocomplete
  const handleSelectFile = useCallback(
    (entry: DirectoryEntry) => {
      if (!editorRef.current || !effectiveCwd) return;

      if (currentMentionCount.current >= MAX_MENTIONS_PER_MESSAGE) {
        setMentionQuery(null);
        setMentionAnchorRect(null);
        return;
      }

      const cwdPosix = toPosixPath(effectiveCwd);
      const entryPosix = toPosixPath(entry.path);
      const rel = path.relative(cwdPosix, entryPosix);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        setMentionQuery(null);
        setMentionAnchorRect(null);
        return;
      }

      const payload: FileMentionPayload = {
        fileName: entry.name,
        filePath: entry.path,
        relativePath: rel,
      };

      replaceTriggerWithFileMention(editorRef.current, payload);
      setMentionQuery(null);
      setMentionAnchorRect(null);
    },
    [effectiveCwd]
  );

  // Callbacks for keyboard navigation in the plugin
  const handleRequestSelectActive = useCallback(() => {
    if (mergedResults.length > 0 && mentionSelectedIndex < mergedResults.length) {
      handleSelectFile(mergedResults[mentionSelectedIndex]);
    }
  }, [mergedResults, mentionSelectedIndex, handleSelectFile]);

  const handleRequestMove = useCallback(
    (delta: number) => {
      setMentionSelectedIndex((prev) => {
        const len = mergedResults.length;
        if (len === 0) return 0;
        return (prev + delta + len) % len;
      });
    },
    [mergedResults.length]
  );

  // Lexical config
  const initialConfig: InitialConfigType = useMemo(
    () => ({
      namespace: 'chat-prompt-input',
      nodes: [FileMentionNode],
      editable: !disabled,
      onError: (error: Error) => {
        console.error('Lexical error:', error);
      },
      theme: {
        paragraph: 'prompt-input-paragraph',
      },
    }),
    // Only create config once
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className={cn(
                'w-full resize-none rounded-none border-none p-3 shadow-none outline-none ring-0',
                'overflow-y-auto bg-transparent dark:bg-transparent',
                'focus-visible:ring-0',
                'text-sm transition-all'
              )}
              style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }}
              aria-placeholder={placeholder}
              placeholder={
                <div className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground select-none">
                  {placeholder}
                </div>
              }
            />
          }
          ErrorBoundary={({ children }) => <>{children}</>}
        />
        <HistoryPlugin />
        <SyncPlugin value={value} onChange={onChange} />
        <ChatKeymapPlugin pickerOpen={pickerOpen} />
        <AutoHeightPlugin minHeight={minHeight} maxHeight={maxHeight} />
        <PastePlugin onPaste={onPaste} />
        <FocusPlugin focusRef={focusRef} />
        <EditorRefPlugin editorRef={editorRef} />
        <MentionsSyncPlugin
          onMentionsChange={(mentions) => {
            currentMentionCount.current = mentions.length;
            onMentionsChange?.(mentions);
          }}
        />

        {/* Mention plugins - only active in cowork mode with CWD */}
        {coworkMode && effectiveCwd && (
          <FileMentionPlugin
            onQueryChange={handleQueryChange}
            onRequestSelectActive={handleRequestSelectActive}
            onRequestMove={handleRequestMove}
            pickerOpen={pickerOpen}
          />
        )}

        {/* Drop plugin for internal file drag */}
        <DropPlugin
          editorRef={editorRef}
          dropTargetRef={containerRef}
          effectiveCwd={effectiveCwd}
          coworkMode={coworkMode}
        />
      </LexicalComposer>

      {/* Autocomplete popup */}
      {pickerOpen && coworkMode && effectiveCwd && (
        <FileAutocomplete
          query={mentionQuery || ''}
          anchorRect={mentionAnchorRect}
          results={mergedResults}
          selectedIndex={mentionSelectedIndex}
          onSelect={handleSelectFile}
          onHoverIndex={setMentionSelectedIndex}
          onClose={() => {
            setMentionQuery(null);
            setMentionAnchorRect(null);
          }}
        />
      )}
    </div>
  );
}
