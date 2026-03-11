import { useState, useEffect, useRef, useCallback } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import ChatPage from '@/pages/ChatPage'
import { ProjectPage } from '@/pages/ProjectPage'
import SettingsPage from '@/pages/SettingsPage'
import ModelPage from '@/pages/ModelPage'
import AccountPage from '@/pages/AccountPage'
import StorePage from '@/pages/StorePage'
import LogViewerPage from '@/pages/LogViewerPage'
import { OnboardingWizard } from '@/pages/OnboardingWizard'
import { MCPDeepLinkModal } from '@/components/mcp/deep-link/MCPDeepLinkModal'
import { AnnouncementModal } from '@/components/announcements/AnnouncementModal'
import { SkillInstallDeepLinkModal } from '@/components/skills/SkillInstallDeepLinkModal'
import { useChatStore, initializeChatStore } from '@/stores/chatStore'
import { useProjectStore } from '@/stores/projectStore'
import { usePlatformStore } from '@/stores/platformStore'
import { ProjectModal } from '@/components/projects/ProjectModal'
import { useSkillsStore } from '@/stores/skillsStore'
import { logger } from '@/services/logger'
import { modelService } from '@/services/modelService'
import { setupMermaidValidationHandler } from '@/services/mermaidValidationService'
import { useMCPEvents } from '@/hooks/useMCPEvents'
import { usePreference } from '@/hooks/usePreferences'

import { useTranslation } from 'react-i18next'
import { toast, Toaster } from 'sonner'
import '@/i18n/config' // Initialize i18n
import type { DeepLinkAction } from '@preload/preload'
import type { MCPServerConfig } from '@/types/mcp'
import type { Announcement } from '@preload/types'
import type { Project, CreateProjectInput, UpdateProjectInput } from '../types/database'
import type { SkillDescriptor } from '../types/skills'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

function App() {
  const [currentPage, setCurrentPage] = useState('chat')
  const [wizardCompleted, setWizardCompleted] = useState<boolean | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [developerMode, setDeveloperMode] = useState(false)
  const { i18n, t: tModels } = useTranslation('models')

  // Listen for MCP events (tools/list_changed, etc.)
  useMCPEvents()

  const [coworkMode] = usePreference('coworkMode')
  const [coworkModeCwd] = usePreference('coworkModeCwd')

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

  // Skill Deep Link Modal state
  const [skillDeepLinkData, setSkillDeepLinkData] = useState<SkillDescriptor | null>(null)
  const [skillDeepLinkOpen, setSkillDeepLinkOpen] = useState(false)

  // Load theme and language from ui-preferences.json
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const themeResult = await window.levante.preferences.get('theme');
        if (themeResult?.data) {
          setTheme(themeResult.data);
        }

        const devModeResult = await window.levante.preferences.get('developerMode');
        if (devModeResult?.data !== undefined) {
          setDeveloperMode(devModeResult.data);
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

  // Listen for developer mode changes from settings
  useEffect(() => {
    const handlePreferenceChange = (event: CustomEvent) => {
      if (event.detail?.key === 'developerMode') {
        setDeveloperMode(event.detail.value);
      }
    };

    window.addEventListener('preference-changed', handlePreferenceChange as EventListener);

    return () => {
      window.removeEventListener('preference-changed', handlePreferenceChange as EventListener);
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
        modelService.initialize(),
        usePlatformStore.getState().initialize()
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

  // React to appMode changes (e.g. logout/login)
  const appMode = usePlatformStore((s) => s.appMode)
  const [showPlatformWelcome, setShowPlatformWelcome] = useState(false)
  const prevAppModeRef = useRef<string | null>(null)

  useEffect(() => {
    if (appMode === 'standalone' && currentPage === 'account') {
      setCurrentPage('model')
    }
    // Show welcome modal when user logs into platform from model page
    if (appMode === 'platform' && prevAppModeRef.current !== null && prevAppModeRef.current !== 'platform' && currentPage === 'model') {
      setShowPlatformWelcome(true)
    }
    prevAppModeRef.current = appMode
  }, [appMode, currentPage])

  // Chat management for sidebar - using Zustand selectors
  const currentSession = useChatStore((state) => state.currentSession)
  const sessions = useChatStore((state) => state.sessions)
  const startNewChat = useChatStore((state) => state.startNewChat)
  const loadSession = useChatStore((state) => state.loadSession)
  const deleteSession = useChatStore((state) => state.deleteSession)
  const updateSessionTitle = useChatStore((state) => state.updateSessionTitle)
  const setPendingPrompt = useChatStore((state) => state.setPendingPrompt)
  const setSkipNextHistoricalLoad = useChatStore((state) => state.setSkipNextHistoricalLoad)
  const createSession = useChatStore((state) => state.createSession)

  // Project management
  const projects = useProjectStore((state) => state.projects)
  const loadProjects = useProjectStore((state) => state.loadProjects)
  const createProject = useProjectStore((state) => state.createProject)
  const updateProject = useProjectStore((state) => state.updateProject)
  const deleteProject = useProjectStore((state) => state.deleteProject)

  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined)
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null)

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleProjectSave = async (input: CreateProjectInput | UpdateProjectInput) => {
    if ('id' in input) {
      await updateProject(input as UpdateProjectInput)
    } else {
      await createProject(input as CreateProjectInput)
    }
  }

  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
    setCurrentPage('project');
  };

  const resolvePreferredModel = useCallback(async (preferredModelId?: string) => {
    if (preferredModelId) {
      return preferredModelId;
    }

    const models = await modelService.getAvailableModels();
    const lastUsedResult = await window.levante.preferences.get('lastUsedModel');
    const lastUsed = lastUsedResult.data as string | undefined;

    if (lastUsed && models.some((m) => m.id === lastUsed)) {
      return lastUsed;
    }

    return models[0]?.id;
  }, []);

  const handleNewSessionInProject = async (projectId: string, initialMessage?: string, modelId?: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (project) setSelectedProject(project);
    setCurrentPage('chat');
    startNewChat();

    if (initialMessage) {
      setPendingPrompt(initialMessage, 'autosend');
      setSkipNextHistoricalLoad(true);
    }

    try {
      const resolvedModel = await resolvePreferredModel(modelId);
      const createdSession = await createSession('New Chat', resolvedModel, 'chat', projectId);

      if (!createdSession && initialMessage) {
        setSkipNextHistoricalLoad(false);
        setPendingPrompt(initialMessage, 'prefill');
      }
    } catch (error) {
      logger.core.error('Failed to create new session in project', {
        projectId,
        error: error instanceof Error ? error.message : error
      });

      if (initialMessage) {
        setSkipNextHistoricalLoad(false);
        setPendingPrompt(initialMessage, 'prefill');
      }
    }
  };

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
            const displayName = entry.displayName || entry.name;

            logger.core.info('Found registry entry for MCP configure', {
              serverId: entry.id,
              name: entry.name,
              transport: entry.transport.type
            });

            // Build the config from registry entry template
            const config: Partial<MCPServerConfig> = {
              id: entry.id,
              name: entry.name, // Use technical name for config, not displayName
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
              name: displayName,
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
            setPendingPrompt(prompt, 'prefill');
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

            try {
              const resolvedModel = await resolvePreferredModel();

              if (!resolvedModel) {
                logger.core.error('No model available to send deep link message');
                toast.error('No model available', {
                  description: 'Please select a model in the Model page first',
                  duration: 5000
                });
                return;
              }

              setPendingPrompt(prompt, 'autosend');
              setSkipNextHistoricalLoad(true);

              const createdSession = await createSession('New Chat', resolvedModel, 'chat');
              if (!createdSession) {
                setSkipNextHistoricalLoad(false);
                setPendingPrompt(prompt, 'prefill');
                toast.error('Failed to send message', {
                  description: 'Could not create a new chat session',
                  duration: 5000
                });
                return;
              }

              logger.core.info('Pending prompt set successfully from deep link', {
                promptLength: prompt.length,
                sessionId: createdSession.id
              });
            } catch (error) {
              setSkipNextHistoricalLoad(false);
              setPendingPrompt(prompt, 'prefill');
              logger.core.error('Failed to send message from deep link', {
                error: error instanceof Error ? error.message : error
              });
              toast.error('Failed to send message', {
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                duration: 5000
              });
            }
          }
        } else if (action.type === 'skill-install') {
          setCurrentPage('store')

          const { skillId } = action.data as { skillId: string }

          const store = useSkillsStore.getState()
          await Promise.all([
            store.loadCatalog(),
            store.loadInstalled({ mode: 'all-scopes' }),
          ])

          const skill = useSkillsStore.getState().catalog.find((s) => s.id === skillId)

          if (!skill) {
            toast.error('Skill not found', {
              description: `The skill ${skillId} does not exist in the current catalog`,
              duration: 5000,
            })
            return
          }

          setSkillDeepLinkData(skill)
          setSkillDeepLinkOpen(true)
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
  }, [startNewChat, setPendingPrompt, createSession, setSkipNextHistoricalLoad, resolvePreferredModel]);

  const getPageTitle = (page: string) => {
    switch (page) {
      case 'chat':
        return currentSession?.title || ''
      case 'project':
        return selectedProject?.name || ''
      case 'settings':
        return 'Settings'
      case 'model':
        return 'Model'
      case 'account':
        return 'Account'
      case 'store':
        return 'Store'
      case 'logs':
        return 'Developer Logs'
      default:
        return ''
    }
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'chat': return <ChatPage />
      case 'project':
        return selectedProject ? (
          <ProjectPage
            project={selectedProject}
            onSessionSelect={handleLoadSession}
            onNewSessionInProject={handleNewSessionInProject}
            onDeleteSession={deleteSession}
          />
        ) : <ChatPage />
      case 'settings': return <SettingsPage />
      case 'model': return <ModelPage />
      case 'account': return <AccountPage />
      case 'store': return <StorePage />
      case 'logs':
        // Only show logs if developer mode is active
        return developerMode ? <LogViewerPage /> : <ChatPage />
      default: return <ChatPage />
    }
  }

  // Handle exiting project scope back to all chats
  const handleExitProject = () => {
    setSelectedProject(null);
    setCurrentPage('chat');
  };

  // Handle new chat with navigation
  const handleNewChat = () => {
    if (selectedProject) {
      handleNewSessionInProject(selectedProject.id);
      return;
    }
    startNewChat();
    setSelectedProject(null);
    setCurrentPage('chat');
  };

  // Handle session load with navigation
  const handleLoadSession = async (sessionId: string) => {
    await loadSession(sessionId);
    const loadedSession = useChatStore.getState().currentSession;

    if (loadedSession?.id === sessionId && loadedSession.project_id) {
      const project = projects.find((p) => p.id === loadedSession.project_id) ?? null;
      setSelectedProject(project);
    } else {
      setSelectedProject(null);
    }

    setCurrentPage('chat');
  };

  const effectiveSidebarCwd = selectedProject?.cwd ?? coworkModeCwd ?? null

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
        false, // loading state
        projects,
        selectedProject?.id,
        selectedProject?.name,
        handleProjectSelect,
        () => { setEditingProject(undefined); setProjectModalOpen(true); },
        (project: Project) => { setEditingProject(project); setProjectModalOpen(true); },
        (projectId: string, projectName: string, sessionCount: number) => {
          setDeleteConfirmProject({ id: projectId, name: projectName, count: sessionCount });
        },
        Boolean(coworkMode),
        effectiveSidebarCwd,
        handleExitProject,
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

      {/* Project Modal */}
      <ProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        project={editingProject}
        onSave={handleProjectSave}
      />

      {/* Delete Project Confirmation */}
      <AlertDialog
        open={!!deleteConfirmProject}
        onOpenChange={(open) => { if (!open) setDeleteConfirmProject(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Deleting &ldquo;{deleteConfirmProject?.name}&rdquo; will permanently delete its{' '}
              {deleteConfirmProject?.count} conversations and all their history. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmProject) {
                  deleteProject(deleteConfirmProject.id);
                  setDeleteConfirmProject(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Skill Deep Link Install Modal */}
      <SkillInstallDeepLinkModal
        skill={skillDeepLinkData}
        open={skillDeepLinkOpen}
        onOpenChange={setSkillDeepLinkOpen}
      />

      {/* Platform Welcome Modal */}
      <AlertDialog
        open={showPlatformWelcome}
        onOpenChange={setShowPlatformWelcome}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tModels('platform.welcome_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tModels('platform.welcome_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowPlatformWelcome(false)
              setCurrentPage('account')
            }}>
              {tModels('platform.welcome_go_to_account')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MainLayout
        title={getPageTitle(currentPage)}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        sidebarContent={getSidebarContent()}
        onNewChat={handleNewChat}
        developerMode={developerMode}
        selectedProjectName={selectedProject?.name}
      >
        {renderPage()}
      </MainLayout>
    </>
  )
}

export default App
