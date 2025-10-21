import { useState, useEffect } from 'react';

/**
 * Hook to detect the current effective theme (light or dark)
 * Takes into account user preference and system theme
 */
export function useThemeDetector(): 'light' | 'dark' {
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const updateTheme = () => {
      const root = document.documentElement;
      const isDark = root.classList.contains('dark');
      setEffectiveTheme(isDark ? 'dark' : 'light');
    };

    // Initial check
    updateTheme();

    // Watch for theme changes using MutationObserver
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          updateTheme();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Listen for custom theme-changed event
    const handleThemeChange = () => {
      updateTheme();
    };
    window.addEventListener('theme-changed', handleThemeChange);

    return () => {
      observer.disconnect();
      window.removeEventListener('theme-changed', handleThemeChange);
    };
  }, []);

  return effectiveTheme;
}
