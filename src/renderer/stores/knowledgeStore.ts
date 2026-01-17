import { create } from 'zustand';
import type { Document } from '../../types/database';

interface DocumentStats {
  totalDocuments: number;
  processingDocuments: number;
  indexedDocuments: number;
  failedDocuments: number;
  totalChunks: number;
}

interface KnowledgeStore {
  // State
  documents: Document[];
  stats: DocumentStats | null;
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  uploadDocument: (filePath: string, filename: string) => Promise<void>;
  refreshDocuments: (query?: any) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  deleteAllDocuments: () => Promise<void>;
  getDocument: (documentId: string) => Document | undefined;
  loadStats: () => Promise<void>;
  clearError: () => void;
}

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
  // Initial state
  documents: [],
  stats: null,
  isLoading: false,
  isUploading: false,
  error: null,

  // Initialize - load documents and stats
  initialize: async () => {
    set({ isLoading: true, error: null });

    try {
      // Load documents
      await get().refreshDocuments();

      // Load stats
      await get().loadStats();

      // Set up status update listener
      window.levante.documents.onStatusUpdate((update) => {
        // Update the document in state when status changes
        set(state => ({
          documents: state.documents.map(doc =>
            doc.id === update.documentId
              ? {
                  ...doc,
                  status: update.status,
                  chunk_count: update.chunk_count || doc.chunk_count,
                  error_message: update.error_message || doc.error_message,
                  indexed_at: update.status === 'indexed' ? Date.now() : doc.indexed_at
                }
              : doc
          )
        }));

        // Refresh stats after status update
        get().loadStats();
      });
    } catch (error) {
      console.error('Failed to initialize knowledge store:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize knowledge store'
      });
    } finally {
      set({ isLoading: false });
    }
  },

  // Upload a document
  uploadDocument: async (filePath: string, filename: string) => {
    set({ isUploading: true, error: null });

    try {
      // Validate file type
      const validExtensions = ['.pdf', '.docx', '.txt', '.md', '.json'];
      const fileExtension = '.' + filename.split('.').pop()?.toLowerCase();
      if (!validExtensions.includes(fileExtension)) {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      const result = await window.levante.documents.upload({
        filePath,
        filename
      });

      if (result.success && result.document) {
        // Add document to state
        set(state => ({
          documents: [result.document!, ...state.documents]
        }));

        // Refresh stats
        await get().loadStats();
      } else {
        throw new Error(result.error || 'Failed to upload document');
      }
    } catch (error) {
      console.error('Failed to upload document:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to upload document'
      });
      throw error;
    } finally {
      set({ isUploading: false });
    }
  },

  // Refresh documents list
  refreshDocuments: async (query?: any) => {
    set({ isLoading: true, error: null });

    try {
      const result = await window.levante.documents.list(query);

      if (result.success && result.documents) {
        set({ documents: result.documents });
      } else {
        // Check if it's a "table doesn't exist" error (migration not run yet)
        const errorMsg = result.error || '';
        if (errorMsg.includes('no such table: documents')) {
          // Table doesn't exist yet - this is expected before migration runs
          // Don't set error, just keep documents empty
          set({ documents: [] });
        } else {
          throw new Error(result.error || 'Failed to load documents');
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '';

      // Silently handle "table doesn't exist" errors
      if (errorMsg.includes('no such table: documents')) {
        set({ documents: [] });
      } else {
        console.error('Failed to refresh documents:', error);
        set({
          error: error instanceof Error ? error.message : 'Failed to refresh documents'
        });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  // Delete a document
  deleteDocument: async (documentId: string) => {
    set({ isLoading: true, error: null });

    try {
      const result = await window.levante.documents.delete(documentId);

      if (result.success) {
        // Remove document from state
        set(state => ({
          documents: state.documents.filter(doc => doc.id !== documentId)
        }));

        // Refresh stats
        await get().loadStats();
      } else {
        throw new Error(result.error || 'Failed to delete document');
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to delete document'
      });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // Delete all documents
  deleteAllDocuments: async () => {
    set({ isLoading: true, error: null });

    try {
      const result = await window.levante.documents.deleteAll();

      if (result.success) {
        // Clear all documents from state
        set({ documents: [] });

        // Refresh stats
        await get().loadStats();
      } else {
        throw new Error(result.error || 'Failed to delete all documents');
      }
    } catch (error) {
      console.error('Failed to delete all documents:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to delete all documents'
      });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // Get a document by ID
  getDocument: (documentId: string) => {
    return get().documents.find(doc => doc.id === documentId);
  },

  // Load statistics
  loadStats: async () => {
    try {
      const result = await window.levante.documents.getStats();

      if (result.success && result.stats) {
        set({ stats: result.stats });
      } else {
        // Check if it's a "table doesn't exist" error
        const errorMsg = result.error || '';
        if (errorMsg.includes('no such table: documents')) {
          // Table doesn't exist yet - set empty stats
          set({
            stats: {
              totalDocuments: 0,
              processingDocuments: 0,
              indexedDocuments: 0,
              failedDocuments: 0,
              totalChunks: 0
            }
          });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '';

      // Silently handle "table doesn't exist" errors
      if (!errorMsg.includes('no such table: documents')) {
        console.error('Failed to load stats:', error);
      }
      // Don't set error state for stats loading failure
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));

// Initialize on import (only once)
let isInitialized = false;
export async function initializeKnowledgeStore(): Promise<void> {
  if (!isInitialized) {
    await useKnowledgeStore.getState().initialize();
    isInitialized = true;
  }
}
