import { useState, useEffect, useCallback } from 'react';
import { UIPreferences, PreferenceKey, PreferenceChangeEvent } from '../../types/preferences';


export function usePreferences() {
  const [preferences, setPreferences] = useState<UIPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const result = await window.levante.preferences.getAll();
        
        if (result.success && result.data) {
          setPreferences(result.data);
        } else {
          setError(result.error || 'Failed to load preferences');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, []);

  // Listen for preference changes
  // Note: IPC listeners are not exposed in preload, so we'll rely on manual updates
  // The theme and other preferences will update on page change or when explicitly called
  useEffect(() => {
    // TODO: Add IPC listeners via preload if real-time updates are needed
    // For now, preferences are updated when explicitly set via setPreference
  }, []);

  // Get single preference
  const getPreference = useCallback(async <K extends PreferenceKey>(key: K): Promise<UIPreferences[K] | null> => {
    try {
      const result = await window.levante.preferences.get(key);
      
      if (result.success && result.data !== undefined) {
        return result.data;
      }
      
      console.error('[usePreferences] Failed to get preference:', result.error);
      return null;
    } catch (error) {
      console.error('[usePreferences] Error getting preference:', error);
      return null;
    }
  }, []);

  // Set single preference
  const setPreference = useCallback(async <K extends PreferenceKey>(
    key: K, 
    value: UIPreferences[K]
  ): Promise<boolean> => {
    try {
      const result = await window.levante.preferences.set(key, value);
      
      if (result.success) {
        // Update local state optimistically
        setPreferences(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            [key]: value
          };
        });
        
        return true;
      }
      
      console.error('[usePreferences] Failed to set preference:', result.error);
      setError(result.error || 'Failed to set preference');
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[usePreferences] Error setting preference:', error);
      setError(errorMessage);
      return false;
    }
  }, []);

  // Reset all preferences
  const resetPreferences = useCallback(async (): Promise<boolean> => {
    try {
      const result = await window.levante.preferences.reset();
      
      if (result.success && result.data) {
        setPreferences(result.data);
        setError(null);
        return true;
      }
      
      console.error('[usePreferences] Failed to reset preferences:', result.error);
      setError(result.error || 'Failed to reset preferences');
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[usePreferences] Error resetting preferences:', error);
      setError(errorMessage);
      return false;
    }
  }, []);

  // Export preferences
  const exportPreferences = useCallback(async (): Promise<UIPreferences | null> => {
    try {
      const result = await window.levante.preferences.export();
      
      if (result.success && result.data) {
        return result.data;
      }
      
      console.error('[usePreferences] Failed to export preferences:', result.error);
      return null;
    } catch (error) {
      console.error('[usePreferences] Error exporting preferences:', error);
      return null;
    }
  }, []);

  // Import preferences
  const importPreferences = useCallback(async (newPreferences: Partial<UIPreferences>): Promise<boolean> => {
    try {
      const result = await window.levante.preferences.import(newPreferences);
      
      if (result.success && result.data) {
        setPreferences(result.data);
        setError(null);
        return true;
      }
      
      console.error('[usePreferences] Failed to import preferences:', result.error);
      setError(result.error || 'Failed to import preferences');
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[usePreferences] Error importing preferences:', error);
      setError(errorMessage);
      return false;
    }
  }, []);

  return {
    preferences,
    loading,
    error,
    getPreference,
    setPreference,
    resetPreferences,
    exportPreferences,
    importPreferences
  };
}

// Convenience hook for getting a single preference with live updates
export function usePreference<K extends PreferenceKey>(
  key: K
): [UIPreferences[K] | null, (value: UIPreferences[K]) => Promise<boolean>, boolean] {
  const { preferences, setPreference, loading } = usePreferences();
  
  const value = preferences ? preferences[key] : null;
  
  const setValue = useCallback(
    (newValue: UIPreferences[K]) => setPreference(key, newValue),
    [key, setPreference]
  );
  
  return [value, setValue, loading];
}

// Hook for theme-specific functionality
export function useTheme() {
  const [theme, setTheme, loading] = usePreference('theme');
  
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const isLight = theme === 'light' || (theme === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  const toggleTheme = useCallback(async () => {
    const newTheme = isDark ? 'light' : 'dark';
    return await setTheme(newTheme);
  }, [isDark, setTheme]);
  
  return {
    theme,
    setTheme,
    isDark,
    isLight,
    toggleTheme,
    loading
  };
}