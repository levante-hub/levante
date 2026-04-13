/**
 * Side Panel Store
 *
 * Unified store for right panel tabs:
 * - Server tabs (legacy web preview)
 * - File tabs (file browser)
 * - Future: PDF/Doc tabs
 */

import { create } from 'zustand';
import type { UIResource } from '@/types/ui-resource';

export interface ServerTab {
  type: 'server';
  id: string; // taskId
  port: number;
  url: string;
  command: string;
  description?: string;
  isAlive: boolean;
  detectedAt: number;
}

export interface FileTab {
  type: 'file';
  id: string; // normalized absolute path
  filePath: string;
  fileName: string;
  language: string;
  content: string | null;
  isLoading: boolean;
  isBinary: boolean;
  isTruncated: boolean;
  lastOpenedAt: number; // LRU
}

export interface PdfTab {
  type: 'pdf';
  id: string;
  filePath: string;
  fileName: string;
  currentPage: number;
  totalPages: number;
}

export interface DocTab {
  type: 'doc';
  id: string;
  filePath: string;
  fileName: string;
  htmlContent: string | null;
  isLoading: boolean;
  loadError: string | null;
}

export interface WidgetTab {
  type: 'widget';
  id: string;
  title: string;
  resource: UIResource;
  serverId?: string;
  messageId?: string;
  toolCallId?: string;
  createdAt: number;
  reloadNonce: number;
}

export type WidgetTabInput = Omit<WidgetTab, 'type' | 'createdAt' | 'reloadNonce'>;

export type PanelTab = ServerTab | FileTab | PdfTab | DocTab | WidgetTab;

const MAX_FILE_TABS = 10;

interface SidePanelState {
  tabs: PanelTab[];
  activeTabId: string | null;
  isPanelOpen: boolean;

  pendingToast: ServerTab | null;

  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  openPanel: (tabId?: string) => void;
  closePanel: () => void;
  clearToast: () => void;

  addServerTab: (server: Omit<ServerTab, 'type'>) => void;
  markServerDead: (taskId: string) => void;
  removeServerTab: (taskId: string) => void;

  openFileTab: (filePath: string) => Promise<void>;
  updateFileContent: (filePath: string, content: string) => void;

  openDocTab: (filePath: string) => Promise<void>;

  openPdfTab: (filePath: string) => void;
  setPdfPage: (tabId: string, page: number) => void;
  setPdfTotalPages: (tabId: string, totalPages: number) => void;

  openWidgetTab: (widget: WidgetTabInput) => void;
  closeWidgetTab: (tabId: string) => void;
  clearWidgetTabs: () => void;
  reloadWidgetTab: (tabId: string) => void;
  getWidgetTabs: () => WidgetTab[];

  getServerTabs: () => ServerTab[];
  getFileTabs: () => FileTab[];
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function getFileName(filePath: string): string {
  const normalized = normalizePath(filePath);
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? filePath;
}

function getFileExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (!fileName.includes('.')) return '';
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function detectLanguage(extension: string): string {
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    pyw: 'python',
    pyi: 'python',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    md: 'markdown',
    mdx: 'markdown',
    env: 'shell',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    graphql: 'graphql',
    rs: 'rust',
    go: 'go',
    java: 'java',
    swift: 'swift',
    kt: 'kotlin',
    rb: 'ruby',
    php: 'php',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    dockerfile: 'dockerfile',
  };
  return map[extension] ?? 'plaintext';
}

export const useSidePanelStore = create<SidePanelState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  isPanelOpen: false,
  pendingToast: null,

  setActiveTab: (tabId) => {
    set((state) => ({
      activeTabId: tabId,
      tabs: state.tabs.map((tab) => {
        if (tab.type === 'file' && tab.id === tabId) {
          return { ...tab, lastOpenedAt: Date.now() };
        }
        return tab;
      }),
    }));
  },

  closeTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.type === 'server') return;

    set((state) => {
      const nextTabs = state.tabs.filter((t) => t.id !== tabId);
      const shouldChangeActive = state.activeTabId === tabId;

      return {
        tabs: nextTabs,
        activeTabId: shouldChangeActive ? (nextTabs[nextTabs.length - 1]?.id ?? null) : state.activeTabId,
        isPanelOpen: nextTabs.length === 0 ? false : state.isPanelOpen,
      };
    });
  },

  openPanel: (tabId) => {
    set((state) => ({
      isPanelOpen: true,
      activeTabId: tabId ?? state.activeTabId ?? state.tabs[0]?.id ?? null,
      pendingToast: null,
    }));
  },

  closePanel: () => {
    set({ isPanelOpen: false });
  },

  clearToast: () => {
    set({ pendingToast: null });
  },

  addServerTab: (server) => {
    set((state) => {
      const exists = state.tabs.some((t) => t.type === 'server' && t.id === server.id);
      if (exists) return state;

      const newTab: ServerTab = { ...server, type: 'server' };
      const nextTabs = [...state.tabs, newTab];

      return {
        tabs: nextTabs,
        pendingToast: state.isPanelOpen ? null : newTab,
        activeTabId: state.activeTabId ?? newTab.id,
      };
    });
  },

  markServerDead: (taskId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.type === 'server' && tab.id === taskId
          ? { ...tab, isAlive: false }
          : tab
      ),
    }));
  },

  removeServerTab: (taskId) => {
    set((state) => {
      const nextTabs = state.tabs.filter((tab) => !(tab.type === 'server' && tab.id === taskId));
      const nextActive =
        state.activeTabId === taskId
          ? (nextTabs[0]?.id ?? null)
          : state.activeTabId;

      return {
        tabs: nextTabs,
        activeTabId: nextActive,
        isPanelOpen: nextTabs.length === 0 ? false : state.isPanelOpen,
      };
    });
  },

  openFileTab: async (filePath) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      get().openPdfTab(filePath);
      return;
    }
    if (ext === 'html' || ext === 'htm') {
      await get().openDocTab(filePath);
      return;
    }

    const tabId = normalizePath(filePath);

    const existing = get().tabs.find((tab) => tab.type === 'file' && tab.id === tabId);
    if (existing && existing.type === 'file') {
      set((state) => ({
        isPanelOpen: true,
        activeTabId: tabId,
        tabs: state.tabs.map((tab) =>
          tab.type === 'file' && tab.id === tabId
            ? { ...tab, lastOpenedAt: Date.now() }
            : tab
        ),
      }));
      return;
    }

    const fileTabs = get().tabs.filter((tab): tab is FileTab => tab.type === 'file');
    if (fileTabs.length >= MAX_FILE_TABS) {
      const oldest = [...fileTabs].sort((a, b) => a.lastOpenedAt - b.lastOpenedAt)[0];
      set((state) => ({
        tabs: state.tabs.filter((tab) => tab.id !== oldest.id),
      }));
    }

    const fileName = getFileName(filePath);
    const extension = getFileExtension(fileName);
    const now = Date.now();

    const newTab: FileTab = {
      type: 'file',
      id: tabId,
      filePath,
      fileName,
      language: detectLanguage(extension),
      content: null,
      isLoading: true,
      isBinary: false,
      isTruncated: false,
      lastOpenedAt: now,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
      isPanelOpen: true,
    }));

    try {
      const result = await window.levante.fs.readFile(filePath);

      if (result.success && result.data) {
        const fileData = result.data;
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.type === 'file' && tab.id === tabId) {
              return {
                ...tab,
                content: fileData.content,
                language: fileData.language,
                isLoading: false,
                isBinary: fileData.isBinary,
                isTruncated: fileData.isTruncated,
              };
            }
            return tab;
          }),
        }));
      } else {
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.type === 'file' && tab.id === tabId) {
              return {
                ...tab,
                isLoading: false,
                content: `Error: ${result.error ?? 'Failed to read file'}`,
              };
            }
            return tab;
          }),
        }));
      }
    } catch (error) {
      set((state) => ({
        tabs: state.tabs.map((tab) => {
          if (tab.type === 'file' && tab.id === tabId) {
            return {
              ...tab,
              isLoading: false,
              content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }
          return tab;
        }),
      }));
    }
  },

  updateFileContent: (filePath, content) => {
    const tabId = normalizePath(filePath);
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.type === 'file' && tab.id === tabId
          ? { ...tab, content, isLoading: false }
          : tab
      ),
    }));
  },

  openDocTab: async (filePath) => {
    const tabId = `doc:${normalizePath(filePath)}`;

    const existing = get().tabs.find((tab) => tab.type === 'doc' && tab.id === tabId);
    if (existing) {
      set({ isPanelOpen: true, activeTabId: tabId });
      return;
    }

    const fileName = getFileName(filePath);
    const newTab: DocTab = {
      type: 'doc',
      id: tabId,
      filePath,
      fileName,
      htmlContent: null,
      isLoading: true,
      loadError: null,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
      isPanelOpen: true,
    }));

    const updateTab = (patch: Partial<DocTab>) => {
      set((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.type === 'doc' && tab.id === tabId ? { ...tab, ...patch } : tab
        ),
      }));
    };

    try {
      const result = await window.levante.fs.readFile(filePath);

      if (!result.success || !result.data) {
        updateTab({
          isLoading: false,
          loadError: result.error ?? 'Failed to read HTML file',
        });
        return;
      }

      const fileData = result.data;

      if (fileData.isBinary) {
        updateTab({
          isLoading: false,
          loadError: 'HTML preview is only available for text-based HTML files.',
        });
        return;
      }

      if (fileData.isTruncated) {
        updateTab({
          isLoading: false,
          loadError: 'HTML file is too large to preview in the side panel.',
        });
        return;
      }

      updateTab({
        htmlContent: fileData.content,
        isLoading: false,
        loadError: null,
      });
    } catch (error) {
      updateTab({
        isLoading: false,
        loadError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  openPdfTab: (filePath) => {
    const tabId = `pdf:${normalizePath(filePath)}`;

    const existing = get().tabs.find((tab) => tab.type === 'pdf' && tab.id === tabId);
    if (existing) {
      set({ isPanelOpen: true, activeTabId: tabId });
      return;
    }

    const fileName = getFileName(filePath);
    const newTab: PdfTab = {
      type: 'pdf',
      id: tabId,
      filePath,
      fileName,
      currentPage: 1,
      totalPages: 0,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
      isPanelOpen: true,
    }));
  },

  setPdfPage: (tabId, page) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.type === 'pdf' && tab.id === tabId
          ? { ...tab, currentPage: page }
          : tab
      ),
    }));
  },

  setPdfTotalPages: (tabId, totalPages) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.type === 'pdf' && tab.id === tabId
          ? { ...tab, totalPages }
          : tab
      ),
    }));
  },

  openWidgetTab: (widget) => {
    set((state) => {
      const existingIndex = state.tabs.findIndex(
        (tab) => tab.type === 'widget' && tab.id === widget.id
      );

      if (existingIndex >= 0) {
        return {
          tabs: state.tabs.map((tab) =>
            tab.type === 'widget' && tab.id === widget.id
              ? { ...tab, ...widget }
              : tab
          ),
          activeTabId: widget.id,
          isPanelOpen: true,
        };
      }

      const newTab: WidgetTab = {
        ...widget,
        type: 'widget',
        createdAt: Date.now(),
        reloadNonce: 0,
      };

      return {
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
        isPanelOpen: true,
      };
    });
  },

  closeWidgetTab: (tabId) => {
    set((state) => {
      const nextTabs = state.tabs.filter((t) => t.id !== tabId);
      const shouldChangeActive = state.activeTabId === tabId;

      return {
        tabs: nextTabs,
        activeTabId: shouldChangeActive
          ? (nextTabs[nextTabs.length - 1]?.id ?? null)
          : state.activeTabId,
        isPanelOpen: nextTabs.length === 0 ? false : state.isPanelOpen,
      };
    });
  },

  clearWidgetTabs: () => {
    set((state) => {
      const nextTabs = state.tabs.filter((tab) => tab.type !== 'widget');
      const activeWasWidget = state.tabs.find((tab) => tab.id === state.activeTabId)?.type === 'widget';

      return {
        tabs: nextTabs,
        activeTabId: activeWasWidget
          ? (nextTabs[nextTabs.length - 1]?.id ?? null)
          : state.activeTabId,
        isPanelOpen: nextTabs.length === 0 ? false : state.isPanelOpen,
      };
    });
  },

  reloadWidgetTab: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.type === 'widget' && tab.id === tabId
          ? { ...tab, reloadNonce: tab.reloadNonce + 1 }
          : tab
      ),
    }));
  },

  getWidgetTabs: () => get().tabs.filter((tab): tab is WidgetTab => tab.type === 'widget'),

  getServerTabs: () => get().tabs.filter((tab): tab is ServerTab => tab.type === 'server'),
  getFileTabs: () => get().tabs.filter((tab): tab is FileTab => tab.type === 'file'),
}));

