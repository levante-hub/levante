import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import ChatPage from '@/pages/ChatPage'
import SettingsPage from '@/pages/SettingsPage'
import ModelPage from '@/pages/ModelPage'
import StorePage from '@/pages/StorePage'
import { OnboardingWizard } from '@/pages/OnboardingWizard'
import { useChatStore, initializeChatStore } from '@/stores/chatStore'
import { modelService } from '@/services/modelService'
import { logger } from '@/services/logger'
import { useTranslation } from 'react-i18next'
import '@/i18n/config' // Initialize i18n

function App() {
  const [currentPage, setCurrentPage] = useState('chat')
  const [wizardCompleted, setWizardCompleted] = useState<boolean | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const { i18n } = useTranslation()

  // Load theme and language from user profile
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const profile = await window.levante.profile.get();
        if (profile?.data?.theme) {
          setTheme(profile.data.theme);
        }
        if (profile?.data?.language) {
          i18n.changeLanguage(profile.data.language);
          logger.core.info('Language loaded from profile', { language: profile.data.language });
        }
      } catch (error) {
        logger.core.error('Failed to load user preferences from profile', {
          error: error instanceof Error ? error.message : error
        });
      }
    };

    loadUserPreferences();
  }, [i18n]);

  // Listen for theme changes from settings
  useEffect(() => {
    const handleThemeChange = (event: CustomEvent) => {
      const newTheme = event.detail.theme;
      setTheme(newTheme);
    };

    window.addEventListener('theme-changed', handleThemeChange as EventListener);

    return () => {
      window.removeEventListener('theme-changed', handleThemeChange as EventListener);
    };
  }, []);
  
  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = async () => {
      if (!theme || theme === 'system') {
        // For system theme, use Electron's nativeTheme for accurate detection
        try {
          const systemTheme = await window.levante.getSystemTheme();
          const systemPrefersDark = systemTheme.shouldUseDarkColors;

          root.classList.remove('light', 'dark');
          root.classList.add(systemPrefersDark ? 'dark' : 'light');

          logger.core.debug('Theme applied (system)', {
            theme,
            systemPrefersDark,
            themeSource: systemTheme.themeSource,
            appliedClass: systemPrefersDark ? 'dark' : 'light'
          });
        } catch (error) {
          logger.core.error('Failed to get system theme', {
            error: error instanceof Error ? error.message : error
          });
          // Fallback to media query
          const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          root.classList.remove('light', 'dark');
          root.classList.add(systemPrefersDark ? 'dark' : 'light');
        }
      } else {
        root.classList.remove('light', 'dark');
        root.classList.add(theme);

        logger.core.debug('Theme applied (manual)', { theme });
      }
    };

    applyTheme();
  }, [theme]);

  // Listen for system theme changes from Electron
  useEffect(() => {
    const cleanup = window.levante.onSystemThemeChanged(async (systemTheme) => {
      if (!theme || theme === 'system') {
        // Only apply if we're in system mode
        const root = document.documentElement;
        const systemPrefersDark = systemTheme.shouldUseDarkColors;

        root.classList.remove('light', 'dark');
        root.classList.add(systemPrefersDark ? 'dark' : 'light');

        logger.core.info('System theme changed', {
          shouldUseDarkColors: systemPrefersDark,
          themeSource: systemTheme.themeSource,
          appliedClass: systemPrefersDark ? 'dark' : 'light'
        });
      }
    });

    return cleanup;
  }, [theme]);

  // Check wizard status on mount
  useEffect(() => {
    const checkWizard = async () => {
      try {
        const result = await window.levante.wizard.checkStatus();
        if (result.success && result.data) {
          setWizardCompleted(result.data.isCompleted);
          logger.core.info('Wizard status checked', {
            isCompleted: result.data.isCompleted
          });
        }
      } catch (error) {
        logger.core.error('Failed to check wizard status', {
          error: error instanceof Error ? error.message : error
        });
        // Default to showing wizard on error
        setWizardCompleted(false);
      }
    };

    checkWizard();
  }, []);

  // Initialize services after component mounts
  useEffect(() => {
    const initializeServices = async () => {
      logger.core.info('Renderer application starting');
      await Promise.all([
        initializeChatStore(),
        modelService.initialize()
      ]);
      logger.core.info('Renderer services initialized successfully');
    };

    initializeServices().catch(error => {
      logger.core.error('Failed to initialize renderer services', { error: error instanceof Error ? error.message : error });
    });
  }, []);
  
  // Chat management for sidebar - using Zustand selectors
  const currentSession = useChatStore((state) => state.currentSession)
  const sessions = useChatStore((state) => state.sessions)
  const startNewChat = useChatStore((state) => state.startNewChat)
  const loadSession = useChatStore((state) => state.loadSession)
  const deleteSession = useChatStore((state) => state.deleteSession)

  const getPageTitle = (page: string) => {
    switch (page) {
      case 'chat':
        return currentSession?.title || ''
      case 'settings':
        return 'Settings'
      case 'model':
        return 'Model'
      case 'store':
        return 'Store'
      default:
        return ''
    }
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'chat': return <ChatPage />
      case 'settings': return <SettingsPage />
      case 'model': return <ModelPage />
      case 'store': return <StorePage />
      default: return <ChatPage />
    }
  }

  // Handle new chat with navigation
  const handleNewChat = () => {
    startNewChat();
    setCurrentPage('chat');
  };

  // Handle session load with navigation
  const handleLoadSession = (sessionId: string) => {
    loadSession(sessionId);
    setCurrentPage('chat');
  };

  // Get sidebar content for current page
  const getSidebarContent = () => {
    // Show ChatList sidebar in all pages
    if (typeof ChatPage.getSidebarContent === 'function') {
      return ChatPage.getSidebarContent(
        sessions,
        currentSession?.id,
        handleLoadSession, // Navigate to chat when loading session
        handleNewChat, // Navigate to chat when starting new chat
        deleteSession,
        false // loading state
      );
    }
    return null;
  }

  // Show loading state while checking wizard
  if (wizardCompleted === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          </div>
          <p className="text-muted-foreground">Loading Levante...</p>
        </div>
      </div>
    );
  }

  // Show wizard if not completed
  if (!wizardCompleted) {
    return (
      <OnboardingWizard
        onComplete={() => {
          setWizardCompleted(true);
          logger.core.info('Wizard completed, reloading app state');
        }}
      />
    );
  }

  return (
    <MainLayout
      title={getPageTitle(currentPage)}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      sidebarContent={getSidebarContent()}
      onNewChat={handleNewChat}
    >
      {renderPage()}
    </MainLayout>
  )
}

export default App