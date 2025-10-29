import { create } from 'zustand';
import { modelService } from '@/services/modelService';
import type { ProviderConfig, Model } from '../../types/models';

interface ModelState {
  // State
  providers: ProviderConfig[];
  activeProvider: ProviderConfig | null;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  success: string | null;

  // Actions
  initialize: () => Promise<void>;
  setActiveProvider: (providerId: string) => Promise<void>;
  updateProvider: (providerId: string, updates: Partial<ProviderConfig>) => Promise<void>;
  syncProviderModels: (providerId: string) => Promise<void>;
  toggleModelSelection: (providerId: string, modelId: string, selected: boolean) => Promise<void>;
  setModelSelections: (providerId: string, selections: { [modelId: string]: boolean }) => Promise<void>;
  setError: (error: string | null) => void;
  setSuccess: (message: string | null) => void;
  clearMessages: () => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  // Initial state
  providers: [],
  activeProvider: null,
  loading: false,
  syncing: false,
  error: null,
  success: null,

  // Initialize the store
  initialize: async () => {
    try {
      set({ loading: true, error: null });
      await modelService.initialize();
      const providers = modelService.getProviders();
      const activeProvider = await modelService.getActiveProvider();
      set({ providers, activeProvider });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize model service';
      set({ error: errorMessage });
    } finally {
      set({ loading: false });
    }
  },

  // Set active provider
  setActiveProvider: async (providerId: string) => {
    try {
      set({ error: null });
      await modelService.setActiveProvider(providerId);
      const providers = modelService.getProviders();
      const activeProvider = await modelService.getActiveProvider();
      set({ 
        providers, 
        activeProvider,
        success: `Switched to ${activeProvider?.name}`
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => set({ success: null }), 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to switch provider';
      set({ error: errorMessage });
    }
  },

  // Update provider configuration
  updateProvider: async (providerId: string, updates: Partial<ProviderConfig>) => {
    try {
      set({ error: null });
      await modelService.updateProvider(providerId, updates);
      const providers = modelService.getProviders();
      const activeProvider = await modelService.getActiveProvider();
      set({ 
        providers, 
        activeProvider,
        success: 'Provider updated successfully'
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => set({ success: null }), 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update provider';
      set({ error: errorMessage });
    }
  },

  // Sync provider models
  syncProviderModels: async (providerId: string) => {
    try {
      set({ syncing: true, error: null });
      await modelService.syncProviderModels(providerId);
      const providers = modelService.getProviders();
      const activeProvider = await modelService.getActiveProvider();
      set({ 
        providers, 
        activeProvider,
        success: 'Models synced successfully'
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => set({ success: null }), 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync models';
      set({ error: errorMessage });
    } finally {
      set({ syncing: false });
    }
  },

  // Toggle individual model selection
  toggleModelSelection: async (providerId: string, modelId: string, selected: boolean) => {
    try {
      set({ error: null });
      await modelService.toggleModelSelection(providerId, modelId, selected);
      const providers = modelService.getProviders();
      const activeProvider = await modelService.getActiveProvider();
      set({ providers, activeProvider });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update model selection';
      set({ error: errorMessage });
    }
  },

  // Set multiple model selections
  setModelSelections: async (providerId: string, selections: { [modelId: string]: boolean }) => {
    try {
      set({ error: null });
      await modelService.setModelSelections(providerId, selections);
      const providers = modelService.getProviders();
      const activeProvider = await modelService.getActiveProvider();
      const isSelectAll = Object.values(selections).every(selected => selected);
      const isDeselectAll = Object.values(selections).every(selected => !selected);
      
      let successMessage = 'Model selections updated';
      if (isSelectAll) successMessage = 'All models selected';
      else if (isDeselectAll) successMessage = 'All models deselected';
      
      set({ 
        providers, 
        activeProvider,
        success: successMessage
      });
      
      // Clear success message after 2 seconds
      setTimeout(() => set({ success: null }), 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update model selections';
      set({ error: errorMessage });
    }
  },

  // Utility actions
  setError: (error: string | null) => set({ error }),
  setSuccess: (message: string | null) => set({ success: message }),
  clearMessages: () => set({ error: null, success: null }),
}));

// Helper to get current state outside of React components
// Useful for imperative operations like polling
export const getModelStoreState = () => useModelStore.getState();