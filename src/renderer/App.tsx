import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import ChatPage from '@/pages/ChatPage'
import SettingsPage from '@/pages/SettingsPage'
import ModelPage from '@/pages/ModelPage'
import StorePage from '@/pages/StorePage'
import SkillsPage from '@/pages/SkillsPage'
import { OnboardingWizard } from '@/pages/OnboardingWizard'
import { MCPDeepLinkModal } from '@/components/mcp/deep-link/MCPDeepLinkModal'
import { AnnouncementModal } from '@/components/announcements/AnnouncementModal'
import { useChatStore, initializeChatStore } from '@/stores/chatStore'
import { logger } from '@/services/logger'
import { modelService } from '@/services/modelService'
import { setupMermaidValidationHandler } from '@/services/mermaidValidationService'

import { useTranslation } from 'react-i18next'
import { toast, Toaster } from 'sonner'
import '@/i18n/config' // Initialize i18n
import type { DeepLinkAction } from '@preload/preload'
import type { MCPServerConfig } from '@/types/mcp'
import type { Announcement } from '@preload/types'

function App() {
  const [currentPage, setCurrentPage] = useState('chat')
  const [wizardCompleted, setWizardCompleted] = useState<boolean | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const { i18n } = useTranslation()

  // MCP Deep Link Modal state
  const [mcpModalOpen, setMcpModalOpen] = useState(false)
  const [mcpModalConfig, setMcpModalConfig] = useState<{
    config: Partial<MCPServerConfig> | null;
    name: string;
    sourceUrl?: string;
    inputs?: Record<string, any>;
  }>({ config: null, name: '' })

  // Announcement Modal state
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false)
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Announcement | null>(null)

  // Load theme and language from ui-preferences.json
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const themeResult = await window.levante.preferences.get('theme');
        if (themeResult?.data) {
          setTheme(themeResult.data);
        }

        // Only apply language preference once the wizard is completed to avoid
        // overriding the user's selection in the onboarding flow.
        if (wizardCompleted) {
          const languageResult = await window.levante.preferences.get('language');
          if (languageResult?.data) {
            i18n.changeLanguage(languageResult.data);
            logger.core.info('Language loaded from preferences', { language: languageResult.data });
          }
        }
      } catch (error) {
        logger.core.error('Failed to load user preferences', {
          error: error instanceof Error ? error.message : error
        });
      }
    };

    loadUserPreferences();
  }, [i18n, wizardCompleted]);

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

      // Initialize mermaid validation handler
      try {
        setupMermaidValidationHandler();
        logger.core.info('Mermaid validation handler initialized');
      } catch (error) {
        logger.core.error('Failed to initialize Mermaid validation handler', { error });
      }

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

  // Check for announcements after wizard is completed
  useEffect(() => {
    if (!wizardCompleted) return;

    const checkAnnouncements = async () => {
      try {
        const result = await window.levante.announcements.check();
        if (result.success && result.data) {
          setCurrentAnnouncement(result.data);
          setAnnouncementModalOpen(true);
          logger.core.info('New announcement found', {
            id: result.data.id,
            category: result.data.category
          });
        }
      } catch (error) {
        logger.core.error('Failed to check announcements', {
          error: error instanceof Error ? error.message : error
        });
      }
    };

    checkAnnouncements();
  }, [wizardCompleted]);

  // Chat management for sidebar - using Zustand selectors
  const currentSession = useChatStore((state) => state.currentSession)
  const sessions = useChatStore((state) => state.sessions)
  const startNewChat = useChatStore((state) => state.startNewChat)
  const loadSession = useChatStore((state) => state.loadSession)
  const deleteSession = useChatStore((state) => state.deleteSession)
  const updateSessionTitle = useChatStore((state) => state.updateSessionTitle)
  const setPendingPrompt = useChatStore((state) => state.setPendingPrompt)

  // Handle deep links
  useEffect(() => {
    const cleanup = window.levante.onDeepLink(async (action: DeepLinkAction) => {
      logger.core.info('Received deep link action', { type: action.type, data: action.data });

      try {
        if (action.type === 'mcp-add') {
          // Navigate to Store page for MCP management
          setCurrentPage('store');

          // Extract MCP server data from deep link
          const { name, config, inputs } = action.data as {
            name: string;
            config: any;
            inputs?: Record<string, any>;
          };
          if (config && config.id) {
            logger.core.info('Opening MCP confirmation modal from deep link', {
              serverId: config.id,
              hasInputs: !!inputs,
              inputCount: inputs ? Object.keys(inputs).length : 0
            });

            // Open confirmation modal instead of adding directly
            setMcpModalConfig({
              config,
              name: name || 'MCP Server',
              sourceUrl: undefined, // Could be extracted from deep link if needed
              inputs
            });
            setMcpModalOpen(true);
          } else {
            toast.error('Invalid MCP server configuration', {
              description: 'The deep link did not contain valid server configuration',
              duration: 5000
            });
          }
        } else if (action.type === 'mcp-configure') {
          // Handle MCP configure deep link (from discovery tool)
          const { serverId } = action.data as { serverId: string };

          logger.core.info('Handling MCP configure from discovery', { serverId });

          // Fetch the server entry from registry (modal opens in current page context)
          const result = await window.levante.mcp.providers.getEntry(serverId);

          if (result.success && result.data) {
            const entry = result.data;

            logger.core.info('Found registry entry for MCP configure', {
              serverId: entry.id,
              name: entry.name,
              transport: entry.transport.type
            });

            // Build the config from registry entry template
            const config: Partial<MCPServerConfig> = {
              id: entry.id,
              name: entry.name,
              transport: entry.transport.type,
              ...(entry.configuration.template || {})
            };

            // Convert fields to inputs format for the modal
            const inputs: Record<string, any> = {};
            if (entry.configuration.fields && entry.configuration.fields.length > 0) {
              for (const field of entry.configuration.fields) {
                inputs[field.key] = {
                  label: field.label,
                  required: field.required,
                  type: field.type,
                  default: field.defaultValue,
                  description: field.description
                };
              }
            }

            // Open the modal
            setMcpModalConfig({
              config,
              name: entry.name,
              sourceUrl: entry.metadata?.homepage || entry.metadata?.repository,
              inputs: Object.keys(inputs).length > 0 ? inputs : undefined
            });
            setMcpModalOpen(true);
          } else {
            logger.core.error('Failed to find MCP server in registry', { serverId, error: result.error });
            toast.error('MCP server not found', {
              description: `Could not find server: ${serverId}`,
              duration: 5000
            });
          }
        } else if (action.type === 'chat-new') {
          const { prompt, autoSend } = action.data as { prompt: string; autoSend: boolean };

          logger.core.info('Creating new chat from deep link', {
            promptLength: prompt.length,
            autoSend
          });

          // Navigate to chat page
          setCurrentPage('chat');

          // Start a new chat session
          startNewChat();

          // Set the pending prompt in the store (ChatPage will pick it up)
          if (!autoSend && prompt) {
            setPendingPrompt(prompt);
            toast.success('New chat created', {
              description: 'Your message has been pre-filled in the chat input',
              duration: 3000
            });
          }

          // If autoSend is true, send the message automatically
          if (autoSend && prompt) {
            toast.info('Starting new chat...', {
              description: 'Sending your message automatically',
              duration: 3000
            });

            // Wait a bit for the chat to be ready
            setTimeout(async () => {
              try {
                // Get available models
                const models = await modelService.getAvailableModels();
                const defaultModel = models.length > 0 ? models[0].id : undefined;

                if (!defaultModel) {
                  logger.core.error('No model available to send deep link message');
                  toast.error('No model available', {
                    description: 'Please select a model in the Model page first',
                    duration: 5000
                  });
                  return;
                }

                logger.core.info('Setting pending prompt from deep link', {
                  promptLength: prompt.length
                });

                // Set the pending prompt - ChatPage will handle sending the message
                setPendingPrompt(prompt);

                logger.core.info('Pending prompt set successfully from deep link');
              } catch (error) {
                logger.core.error('Failed to send message from deep link', {
                  error: error instanceof Error ? error.message : error
                });
                toast.error('Failed to send message', {
                  description: error instanceof Error ? error.message : 'An unknown error occurred',
                  duration: 5000
                });
              }
            }, 500);
          }
        }
      } catch (error) {
        logger.core.error('Error handling deep link action', {
          type: action.type,
          error: error instanceof Error ? error.message : error
        });
        toast.error('Deep link error', {
          description: error instanceof Error ? error.message : 'Failed to process deep link',
          duration: 5000
        });
      }
    });

    return cleanup;
  }, [startNewChat, setPendingPrompt]);

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
      case 'skills': return <SkillsPage />
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
        updateSessionTitle, // Rename chat session
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
    <>
      <Toaster position="top-right" />

      {/* MCP Deep Link Confirmation Modal */}
      <MCPDeepLinkModal
        open={mcpModalOpen}
        onOpenChange={setMcpModalOpen}
        config={mcpModalConfig.config}
        serverName={mcpModalConfig.name}
        sourceUrl={mcpModalConfig.sourceUrl}
        inputs={mcpModalConfig.inputs}
      />

      {/* Announcement Modal */}
      <AnnouncementModal
        open={announcementModalOpen}
        onOpenChange={setAnnouncementModalOpen}
        announcement={currentAnnouncement}
        onNavigate={setCurrentPage}
      />

      <MainLayout
        title={getPageTitle(currentPage)}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        sidebarContent={getSidebarContent()}
        onNewChat={handleNewChat}
      >
        {renderPage()}
      </MainLayout>
    </>
  )
}

export default App
