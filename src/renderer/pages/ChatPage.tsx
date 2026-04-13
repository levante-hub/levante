/**
 * ChatPage - Refactored for AI SDK v5 (Simplified Architecture)
 *
 * This component uses the native useChat hook from @ai-sdk/react
 * without remounting when sessions change.
 *
 * Key changes:
 * - Single component, no remounting
 * - Uses setMessages to load session history
 * - Direct message sending on first message
 * - Simple session switching with useEffect
 * - File attachments extracted to useFileAttachments hook
 * - Message rendering extracted to ChatMessageItem component
 */

import { Message, MessageContent } from '@/components/ai-elements/message';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useProjectStore } from '@/stores/projectStore';
import { LEVANTE_PLATFORM_URL } from '@/lib/platformConstants';
import { StreamingProvider, useStreamingContext } from '@/contexts/StreamingContext';
import { SidebarSections } from '@/components/sidebar/SidebarSections';
import { WelcomeScreen } from '@/components/chat/WelcomeScreen';
import { ChatPromptInput } from '@/components/chat/ChatPromptInput';
import { ChatMessageItem } from '@/components/chat/ChatMessageItem';
import { ChatModeTabs } from '@/components/chat/ChatModeTabs';
import { useTranslation } from 'react-i18next';
import { BreathingLogo } from '@/components/ai-elements/breathing-logo';
import { getRendererLogger } from '@/services/logger';
import { cn } from '@/lib/utils';
import { useMCPResources } from '@/hooks/useMCPResources';
import { useFileAttachments } from '@/hooks/useFileAttachments';
import { useModelSelection, isInferenceModel } from '@/hooks/useModelSelection';
import { usePreference } from '@/hooks/usePreferences';
import { useToolAutoApproval } from '@/hooks/useToolAutoApproval';
import { SidePanel } from '@/components/chat/SidePanel';
import { WebPreviewToast } from '@/components/chat/WebPreviewToast';
import { useSidePanelStore } from '@/stores/sidePanelStore';
import { getWidgetTabsFromMessage, getWidgetTabIdsFromMessages } from '@/lib/widgetTabs';
import { useWebPreview } from '@/hooks/useWebPreview';
import type { FileMentionPayload } from '@/components/chat/lexical/FileMentionNode';
import { toast } from 'sonner';
import { shouldAutoSendAfterApproval } from '@/utils/toolApprovalAutoSend';
import { ContextUsageIndicator, type ContextUsageData } from '@/components/chat/ContextUsageIndicator';
import { InlineTodoList } from '@/components/chat/TodoPanel';
import { useTodoDerivation } from '@/hooks/useTodoDerivation';
import { useTodoStore } from '@/stores/todoStore';
import type { TokenUsage, ContextBudgetEstimate } from '../../preload/types';

// AI SDK v5 imports
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from '@ai-sdk/react';
import { createElectronChatTransport } from '@/transports/ElectronChatTransport';

const logger = getRendererLogger();

const COMPACTION_MARKER = '[COMPACTION_SUMMARY]';
const CHARS_PER_TOKEN = 4;

function extractTextFromMessage(message: UIMessage): string {
  if (!Array.isArray(message.parts)) return '';
  return message.parts
    .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
    .map((p: any) => p.text)
    .join('\n')
    .trim();
}

function getActiveContextMessages(messages: UIMessage[]): UIMessage[] {
  let index = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'system') continue;
    const text = extractTextFromMessage(msg);
    if (text.startsWith(COMPACTION_MARKER)) {
      index = i;
      break;
    }
  }
  return index >= 0 ? messages.slice(index) : messages;
}

function estimateTokens(text: string): number {
  return Math.max(0, Math.round((text || '').length / CHARS_PER_TOKEN));
}

const RESPONSE_RESERVE_TOKENS = 2000;

function calculateContextUsage(
  messages: UIMessage[],
  contextLength: number,
  overheadInfo?: {
    staticOverheadTokens: number;
    overheadEMA: number | null;
    toolCount: number;
  } | null
): ContextUsageData | null {
  if (!messages.length) return null;

  const scoped = getActiveContextMessages(messages);
  if (!scoped.length) return null;

  const estimatedAll = scoped.reduce((sum, msg) => sum + estimateTokens(extractTextFromMessage(msg)), 0);

  let activeMessageTokens = estimatedAll;
  let isEstimate = true;

  // Use real usage data when available for more accurate message token count
  let latestRealIndex = -1;
  let latestReal = 0;
  scoped.forEach((msg, idx) => {
    const usage = (msg as any).tokenUsage as TokenUsage | undefined;
    if (usage && typeof usage.totalTokens === 'number' && usage.totalTokens > 0) {
      latestRealIndex = idx;
      latestReal = usage.totalTokens;
    }
  });

  if (latestRealIndex >= 0) {
    const tailEstimate = scoped
      .slice(latestRealIndex + 1)
      .reduce((sum, msg) => sum + estimateTokens(extractTextFromMessage(msg)), 0);
    activeMessageTokens = Math.max(0, latestReal + tailEstimate);
    isEstimate = tailEstimate > 0;
  }

  // Include overhead (system prompt + tools + skills + provider slack)
  let effectiveOverhead = 0;
  if (overheadInfo) {
    effectiveOverhead =
      overheadInfo.overheadEMA !== null
        ? Math.round(overheadInfo.overheadEMA)
        : overheadInfo.staticOverheadTokens;
    isEstimate = isEstimate || overheadInfo.overheadEMA === null;
  }

  const used = activeMessageTokens + effectiveOverhead + RESPONSE_RESERVE_TOKENS;
  const percentage =
    contextLength > 0
      ? Math.min(100, Math.max(0, Math.round((used / contextLength) * 100)))
      : 0;

  return {
    used,
    contextLength,
    percentage,
    isEstimate,
    activeMessageTokens,
    overheadTokens: effectiveOverhead,
    responseReserveTokens: RESPONSE_RESERVE_TOKENS,
    isLearnedOverhead: overheadInfo?.overheadEMA !== null && overheadInfo?.overheadEMA !== undefined,
  };
}

const ChatPage = () => {
  const { t } = useTranslation('chat');
  const { t: tErrors } = useTranslation('errors');
  const [input, setInput] = useState('');
  const [enableMCP, setEnableMCP] = usePreference('enableMCP');
  const [enableSkills, setEnableSkills] = usePreference('enableSkills');
  const [coworkMode, setCoworkMode] = usePreference('coworkMode');
  const [coworkModeCwd, setCoworkModeCwd] = usePreference('coworkModeCwd');
  const [userName, setUserName] = useState<string>(t('welcome.default_user_name'));
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null);
  const [pendingFirstAttachments, setPendingFirstAttachments] = useState<File[] | null>(null);
  const [pendingMessageAfterStop, setPendingMessageAfterStop] = useState<string | null>(null);
  const [pendingWidgetMessage, setPendingWidgetMessage] = useState<string | null>(null);
  const [fileMentions, setFileMentions] = useState<FileMentionPayload[]>([]);
  const [pendingMessageAfterStopMentions, setPendingMessageAfterStopMentions] = useState<FileMentionPayload[] | null>(null);
  const [pendingFirstMentions, setPendingFirstMentions] = useState<FileMentionPayload[] | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);

  // Project store (read-only for effectiveCwd / projectDescription)
  const projects = useProjectStore((state) => state.projects);
  const loadProjects = useProjectStore((state) => state.loadProjects);

  // MCP Resources hook
  const {
    selectedResources,
    selectResource,
    removeResource,
    selectedPrompts,
    selectPrompt,
    removePrompt,
    clearResources,
    getContextString,
  } = useMCPResources();

  // Tool auto-approval hook
  const {
    approveServerForSession,
    isServerAutoApproved,
    clearAutoApprovals,
  } = useToolAutoApproval();

  // Chat store
  const contextBudget = useChatStore((state) => state.contextBudget);
  const setStaticOverhead = useChatStore((state) => state.setStaticOverhead);
  const updateLearnedOverhead = useChatStore((state) => state.updateLearnedOverhead);
  const recalculateContextBudget = useChatStore((state) => state.recalculateContextBudget);
  const currentSession = useChatStore((state) => state.currentSession);
  const todosInProgress = useTodoStore((s) => s.todos.some((t) => t.status === 'in_progress'));
  const persistMessage = useChatStore((state) => state.persistMessage);
  const editMessage = useChatStore((state) => state.editMessage); // ← NEW
  const createSession = useChatStore((state) => state.createSession);
  const loadSession = useChatStore((state) => state.loadSession);
  const loadHistoricalMessages = useChatStore((state) => state.loadHistoricalMessages);
  const updateSessionModel = useChatStore((state) => state.updateSessionModel);
  const pendingPrompt = useChatStore((state) => state.pendingPrompt);
  const pendingPromptMode = useChatStore((state) => state.pendingPromptMode);
  const setPendingPrompt = useChatStore((state) => state.setPendingPrompt);
  const skipNextHistoricalLoad = useChatStore((state) => state.skipNextHistoricalLoad);
  const setSkipNextHistoricalLoad = useChatStore((state) => state.setSkipNextHistoricalLoad);

  // Widget panel store
  const openWidgetTab = useSidePanelStore((state) => state.openWidgetTab);
  const clearWidgetTabs = useSidePanelStore((state) => state.clearWidgetTabs);
  const seenWidgetIdsRef = useRef<Set<string>>(new Set());

  // Track previous session ID to detect changes
  const previousSessionIdRef = useRef<string | null>(null);

  // Track if we just created a new session (to avoid loading empty history)
  const justCreatedSessionRef = useRef(false);
  const [sessionCwdOverrides, setSessionCwdOverrides] = useState<Record<string, string>>({});

  const editorFocusRef = useRef<(() => void) | null>(null);

  // Streaming context for mermaid processing
  const { triggerMermaidProcessing } = useStreamingContext();

  const focusPromptInput = useCallback(() => {
    requestAnimationFrame(() => {
      editorFocusRef.current?.();
    });
  }, []);

  // Load user name callback
  const loadUserName = useCallback(async () => {
    try {
      const profile = await window.levante.profile.get();
      if (profile?.data?.personalization?.nickname) {
        setUserName(profile.data.personalization.nickname);
      }
    } catch (error) {
      console.error('Failed to load user name:', error);
    }
  }, []);

  // Model selection hook
  const {
    model,
    setModel,
    availableModels,
    filteredAvailableModels,
    groupedModelsByProvider,
    modelsLoading,
    modelsError,
    retryModels,
    currentModelInfo,
    modelTaskType,
    handleModelChange,
  } = useModelSelection({
    currentSession,
    onLoadUserName: loadUserName,
  });

  // File attachments hook
  const {
    attachedFiles,
    isDragging,
    setAttachedFiles,
    handleFilesSelected,
    handleFileRemove,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    processAttachments,
    convertFilesToInferenceData,
    getFileAccept,
    supportsFileAttachment: enableFileAttachment,
    clearAttachments,
  } = useFileAttachments({
    modelTaskType,
    modelCapabilities: currentModelInfo?.computedCapabilities, // Use computedCapabilities, not capabilities
    isStreaming: false, // Can't use status here due to declaration order
  });

  /* 140 */   const attachFilesToLatestUserMessage = (attachments: Array<{
  /* 141 */     id: string;
  /* 142 */     type: 'image' | 'audio' | 'video' | 'document';
  /* 143 */     filename: string;
  /* 144 */     mimeType: string;
  /* 145 */     size: number;
  /* 146 */     storagePath: string;
    /* 147 */
  }>) => {
    if (!attachments || attachments.length === 0) {
      return;
    }

    setMessages((prev) => {
      const lastUserIndex = [...prev].map((m) => m.role).lastIndexOf('user');
      if (lastUserIndex === -1) {
        return prev;
      }

      const updated = [...prev];
      updated[lastUserIndex] = {
        ...(updated[lastUserIndex] as any),
        attachments
      };

      return updated;
    });
  };

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const currentSessionCwdOverride = useMemo(() => {
    if (!currentSession?.id) return null;
    return sessionCwdOverrides[currentSession.id] ?? null;
  }, [currentSession?.id, sessionCwdOverrides]);

  const currentProject = useMemo(() => {
    if (!currentSession?.project_id) return undefined;
    return projects.find((p) => p.id === currentSession.project_id);
  }, [currentSession?.project_id, projects]);

  const resolvedCoworkCwd = useMemo(() => {
    if (currentSessionCwdOverride) {
      return { cwd: currentSessionCwdOverride, source: 'session' as const };
    }

    if (currentProject?.cwd) {
      return { cwd: currentProject.cwd, source: 'project' as const };
    }

    if (coworkModeCwd) {
      return { cwd: coworkModeCwd, source: 'global' as const };
    }

    return { cwd: null, source: 'none' as const };
  }, [currentSessionCwdOverride, currentProject?.cwd, coworkModeCwd]);

  const effectiveCwd = resolvedCoworkCwd.cwd;

  // ─── File mentions helpers ───────────────────────────────────────────
  const dedupeMentionsByPath = useCallback((mentions: FileMentionPayload[]): FileMentionPayload[] => {
    const seen = new Set<string>();
    return mentions.filter((m) => {
      if (seen.has(m.filePath)) return false;
      seen.add(m.filePath);
      return true;
    });
  }, []);

  const buildFinalUserMessage = useCallback(({
    input: rawInput,
    resourceContext,
  }: {
    input: string;
    resourceContext: string;
  }): string => {
    return resourceContext ? `${resourceContext}\n\n${rawInput}` : rawInput;
  }, []);

  // Compute project description for system prompt injection
  const projectDescription = useMemo(
    () => currentProject?.description ?? undefined,
    [currentProject?.description]
  );

  const handleCoworkModeCwdChange = useCallback(async (cwd: string | null) => {
    if (currentSession?.id) {
      setSessionCwdOverrides((prev) => {
        const next = { ...prev };
        if (cwd) {
          next[currentSession.id] = cwd;
        } else {
          delete next[currentSession.id];
        }
        return next;
      });
      return;
    }

    await setCoworkModeCwd(cwd);
  }, [currentSession?.id, setCoworkModeCwd]);

  const handleResetCoworkModeCwdOverride = useCallback(async () => {
    if (!currentSession?.id) return;
    setSessionCwdOverrides((prev) => {
      const next = { ...prev };
      delete next[currentSession.id];
      return next;
    });
  }, [currentSession?.id]);

  const seedSeenWidgetIds = useCallback((nextMessages: UIMessage[]) => {
    seenWidgetIdsRef.current = getWidgetTabIdsFromMessages(nextMessages);
  }, []);

  // Web preview hook — activa la suscripción a eventos de detección de puertos
  useWebPreview();

  // Request context budget estimate when session/model/mode change
  useEffect(() => {
    if (!model) return;

    const fetchEstimate = async () => {
      try {
        const result = await window.levante.contextBudget.estimate({
          model,
          enableMCP: enableMCP ?? true,
          webSearch: false,
          projectDescription,
          projectContext: currentSession?.project_id
            ? { projectId: currentSession.project_id }
            : undefined,
          codeMode:
            coworkMode && effectiveCwd
              ? { enabled: true, cwd: effectiveCwd }
              : undefined,
        });

        if (result.success && result.data) {
          setStaticOverhead({
            staticOverheadTokens: result.data.staticOverheadTokens,
            toolCount: result.data.toolCount,
          });
          logger.aiSdk.debug('Context budget estimate received', {
            staticOverheadTokens: result.data.staticOverheadTokens,
            toolCount: result.data.toolCount,
          });
        }
      } catch (error) {
        logger.aiSdk.warn('Failed to fetch context budget estimate', {
          error: error instanceof Error ? error.message : error,
        });
      }
    };

    fetchEstimate();
  }, [model, enableMCP, coworkMode, effectiveCwd, projectDescription, currentSession?.project_id, setStaticOverhead]);

  // Create transport with current configuration
  const transport = useMemo(
    () =>
      createElectronChatTransport({
        model: model || 'openai/gpt-4o',
        enableMCP: enableMCP ?? true,
        coworkMode: coworkMode ?? false,
        coworkModeCwd: effectiveCwd,
        projectDescription,
        projectId: currentSession?.project_id ?? null,
      }),
    [] // Keep same transport instance
  );

  // Update transport options when they change
  useEffect(() => {
    transport.updateOptions({
      model: model || 'openai/gpt-4o',
      enableMCP: enableMCP ?? true,
      coworkMode: coworkMode ?? false,
      coworkModeCwd: effectiveCwd,
      projectDescription,
      projectId: currentSession?.project_id ?? null,
    });
  }, [model, enableMCP, coworkMode, effectiveCwd, projectDescription, currentSession?.project_id, transport]);

  // Use AI SDK native useChat hook
  const {
    messages,
    setMessages,
    sendMessage: sendMessageAI,
    status,
    stop,
    error: chatError,
    addToolApprovalResponse,
  } = useChat({
    id: currentSession?.id || 'new-chat',
    transport,

    sendAutomaticallyWhen: ({ messages }) => {
      return shouldAutoSendAfterApproval(messages);
    },

    // Persist messages after AI finishes
    onFinish: async ({ message }) => {
      // Detailed logging to debug message parts
      const partsDetail = message.parts?.map((p: any, i: number) => ({
        index: i,
        type: p.type,
        hasText: !!p.text,
        textPreview: p.text?.substring(0, 100),
        hasData: !!p.data,
        dataKeys: p.data ? Object.keys(p.data) : undefined,
        state: p.state,
        toolName: p.toolName,
      }));

      logger.aiSdk.info('AI response finished', {
        sessionId: currentSession?.id,
        messageId: message.id,
        messageRole: message.role,
        partsCount: message.parts?.length,
      });

      logger.aiSdk.debug('📋 Message parts detail', {
        messageId: message.id,
        parts: partsDetail,
      });

      // Persist the AI response
      if (currentSession) {
        // Check for generated attachments in data parts
        const generatedAttachments: Array<{
          id: string;
          type: 'image' | 'audio' | 'video' | 'document';
          filename: string;
          mimeType: string;
          size: number;
          storagePath: string;
        }> = [];
        if (message.parts) {
          for (const part of message.parts) {
            // Check if this is a data part with generated-attachment
            if (part.type.startsWith('data-') && (part as any).data?.type === 'generated-attachment') {
              const attachmentData = (part as any).data;
              logger.core.info('Found generated attachment', {
                type: attachmentData.attachmentType,
                filename: attachmentData.filename,
              });

              // Convert dataURL to buffer and save
              try {
                const base64Data = attachmentData.dataUrl.split(',')[1];
                const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

                const result = await window.levante.attachments.save(
                  currentSession.id,
                  message.id,
                  buffer.buffer,
                  attachmentData.filename,
                  attachmentData.mime
                );

                if (result.success && result.data) {
                  generatedAttachments.push({
                    ...result.data,
                    storagePath: result.data.path
                  });
                  logger.core.info('Generated attachment saved', {
                    attachmentId: result.data.id,
                    filename: attachmentData.filename,
                  });
                }
              } catch (error) {
                logger.core.error('Failed to save generated attachment', {
                  error: error instanceof Error ? error.message : error,
                });
              }
            }
          }
        }

        // Add generated attachments to message before persisting
        const messageWithAttachments = {
          ...message,
          attachments: generatedAttachments.length > 0 ? generatedAttachments : undefined,
        };

        logger.core.info('🚀 About to persist message', {
          messageId: message.id,
          role: message.role,
          hasAttachments: !!messageWithAttachments.attachments,
          attachmentCount: (messageWithAttachments.attachments as any)?.length || 0,
          attachments: messageWithAttachments.attachments,
        });

        const tokenUsage = transport.consumeLastTokenUsage();

        // Consume learned overhead from transport and update EMA
        const learnedOverhead = transport.consumeLastLearnedOverheadTokens();
        if (learnedOverhead !== null) {
          updateLearnedOverhead(learnedOverhead);
          logger.aiSdk.debug('Learned overhead applied to EMA', { learnedOverhead });
        }

        const persistResult = await persistMessage(messageWithAttachments, tokenUsage);

        // Track model usage (fire and forget)
        if (model && currentModelInfo) {
          window.levante.analytics?.trackModelUsage?.(model, currentModelInfo.provider).catch(() => {});
        }

        // Update the message in useChat state with token usage
        if (tokenUsage) {
          setMessages((prevMessages) =>
            prevMessages.map((m) =>
              m.id === message.id ? ({ ...m, tokenUsage } as any) : m
            )
          );
        }

        // Update the message in useChat state to include attachments and generated content
        if (generatedAttachments.length > 0) {
          logger.core.info('Updating message state with attachments', {
            messageId: message.id,
            attachmentCount: generatedAttachments.length,
            hasGeneratedContent: !!persistResult?.generatedContent,
          });

          // Find and update the message in the messages array
          setMessages((prevMessages) =>
            prevMessages.map((m) => {
              if (m.id !== message.id) return m;

              // Build updated message with attachments
              const updatedMessage: any = {
                ...m,
                attachments: generatedAttachments,
              };

              // If content was generated from attachments, add it to parts
              if (persistResult?.generatedContent) {
                const existingParts = m.parts || [];
                const hasTextPart = existingParts.some((p: any) => p.type === 'text');

                if (!hasTextPart) {
                  updatedMessage.parts = [
                    ...existingParts,
                    { type: 'text', text: persistResult.generatedContent }
                  ];
                }
              }

              return updatedMessage;
            })
          );
        }
      }

      // Trigger mermaid processing
      triggerMermaidProcessing();
    },
  });

  useTodoDerivation(messages);

  // Context usage calculation (includes overhead from system prompt + tools + skills)
  const contextUsage = useMemo(() => {
    const contextLength = currentModelInfo?.contextLength || 0;
    const overheadInfo = contextBudget
      ? {
          staticOverheadTokens: contextBudget.staticOverheadTokens,
          overheadEMA: contextBudget.overheadEMA,
          toolCount: contextBudget.toolCount ?? 0,
        }
      : null;
    return calculateContextUsage(messages as UIMessage[], contextLength, overheadInfo);
  }, [messages, currentModelInfo?.contextLength, contextBudget]);

  // Compaction handler
  const handleCompactConversation = useCallback(async () => {
    if (!currentSession) return;
    if (isCompacting) return;
    if (status === 'streaming' || status === 'submitted') return;

    setIsCompacting(true);
    try {
      const result = await window.levante.compaction.compact({
        sessionId: currentSession.id,
        model: model || currentSession.model,
      });

      if (!result.success) {
        if (result.errorCategory === 'context_too_long' && result.exhaustedStages) {
          throw new Error(t('context_usage.compact_error_context_too_long'));
        }

        throw new Error(result.error || t('context_usage.compact_error'));
      }

      const historical = await loadHistoricalMessages(currentSession.id);
      setMessages(historical);

      if (result.stage && result.stage > 1) {
        toast.success(t('context_usage.compact_success_degraded'));
      } else {
        toast.success(t('context_usage.compact_success'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('context_usage.compact_error'));
    } finally {
      setIsCompacting(false);
    }
  }, [
    currentSession,
    isCompacting,
    status,
    model,
    loadHistoricalMessages,
    setMessages,
  ]);

  // Handle pending message after stop
  useEffect(() => {
    if (pendingMessageAfterStop && status !== 'streaming' && status !== 'submitted') {
      const messageText = pendingMessageAfterStop;
      setPendingMessageAfterStop(null);
      setPendingMessageAfterStopMentions(null);

      // Persist user message to database BEFORE sending to AI (to ensure correct order)
      const messageId = `user-${Date.now()}`;
      const userMessage = {
        id: messageId,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: messageText }],
        attachments: undefined,
      };

      persistMessage(userMessage)
        .then(() => {
          // Send the message after persisting with the same ID
          sendMessageAI({
            id: messageId, // Use the same ID we persisted to DB
            role: 'user',
            parts: [{ type: 'text', text: messageText }],
          });
        })
        .catch((err) => {
          logger.database.error('Failed to persist message after stop', { error: err });
        });
    }
  }, [pendingMessageAfterStop, pendingMessageAfterStopMentions, status, sendMessageAI, persistMessage]);

  // Handle messages sent from fullscreen widgets
  useEffect(() => {
    if (pendingWidgetMessage && currentSession && status !== 'streaming' && status !== 'submitted') {
      const messageText = pendingWidgetMessage;
      setPendingWidgetMessage(null);

      // Persist user message to database BEFORE sending to AI
      const messageId = `user-${Date.now()}`;
      const userMessage = {
        id: messageId,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: messageText }],
        attachments: undefined,
      };

      persistMessage(userMessage)
        .then(() => {
          sendMessageAI({
            id: messageId, // Use the same ID we persisted to DB
            role: 'user',
            parts: [{ type: 'text', text: messageText }],
          });
        })
        .catch((err) => {
          logger.database.error('Failed to persist widget message', { error: err });
        });
    }
  }, [pendingWidgetMessage, currentSession, status, sendMessageAI, persistMessage]);

  // Callback for sending messages directly from widgets (fullscreen chat input)
  const handleSendMessage = useCallback((text: string) => {
    if (!text.trim()) return;

    if (currentSession && status !== 'streaming' && status !== 'submitted') {
      // Send immediately if we have a session and not streaming
      setPendingWidgetMessage(text);
    } else if (status === 'streaming') {
      // If streaming, queue it after stop
      setPendingMessageAfterStop(text);
      stop();
    } else {
      // No session - set input so user can send normally (will create session)
      setInput(text);
    }
  }, [currentSession, status, stop, setInput]);

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      logger.core.info('Editing message', { messageId, newContentLength: newContent.length });

      // Edit message in DB (updates content and deletes subsequent messages)
      const success = await editMessage(messageId, newContent);

      if (!success) {
        logger.core.error('Failed to edit message', { messageId });
        return;
      }

      if (currentSession) {
        // Remove the edited message and all subsequent messages from state
        // sendMessageAI() will add the updated message without duplication
        setMessages(prevMessages => {
          const editedIndex = prevMessages.findIndex(m => m.id === messageId);
          if (editedIndex === -1) return prevMessages;
          return prevMessages.slice(0, editedIndex);
        });

        logger.core.info('Messages cleaned for re-send', {
          sessionId: currentSession.id,
          messageId,
        });

        // Send the edited message to AI to get a new response
        await sendMessageAI({
          id: messageId,
          role: 'user',
          parts: [{ type: 'text', text: newContent }],
        });
      }
    },
    [editMessage, currentSession, setMessages, sendMessageAI]
  );

  // Listen for session load events from mini-chat
  useEffect(() => {
    const unsubscribe = window.levante.onSessionLoad?.((data: { sessionId: string }) => {
      void (async () => {
        logger.core.info('Loading session from mini-chat', { sessionId: data.sessionId });
        await loadSession(data.sessionId);
      })();
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [loadSession]);

  // Load messages when session changes
  useEffect(() => {
    const currentSessionId = currentSession?.id || null;
    const previousSessionId = previousSessionIdRef.current;

    // Skip if session hasn't changed
    if (currentSessionId === previousSessionId) {
      return;
    }

    // Update ref
    previousSessionIdRef.current = currentSessionId;

    // Clear attachments, MCP resources, auto-approvals, file mentions, and widget tabs when changing sessions
    clearAttachments();
    clearResources();
    clearAutoApprovals();
    clearWidgetTabs();
    seenWidgetIdsRef.current = new Set();
    setFileMentions([]);
    setPendingFirstMentions(null);
    setPendingMessageAfterStopMentions(null);

    // If external flow marked this transition, skip historical loading once
    if (currentSessionId && skipNextHistoricalLoad) {
      logger.core.info('Skipping historical load for externally-created session', { sessionId: currentSessionId });
      setSkipNextHistoricalLoad(false);
      focusPromptInput();
      return;
    }

    // If we just created this session, skip loading historical messages
    // (the messages are already in useChat state from sendMessageAI)
    if (justCreatedSessionRef.current) {
      logger.core.info('Session just created, skipping historical load', { sessionId: currentSessionId });
      justCreatedSessionRef.current = false;
      focusPromptInput();
      return;
    }

    // Load messages for the new session
    if (currentSessionId) {
      logger.core.info('Session changed, loading messages', { sessionId: currentSessionId });
      setIsLoadingMessages(true);

      loadHistoricalMessages(currentSessionId)
        .then((msgs) => {
          logger.core.info('Loaded historical messages', { count: msgs.length });
          seedSeenWidgetIds(msgs);
          setMessages(msgs);
          setIsLoadingMessages(false);
        })
        .catch((err) => {
          logger.core.error('Failed to load historical messages', { error: err });
          setMessages([]);
          setIsLoadingMessages(false);
        });
    } else {
      // No session (new chat) - clear messages
      logger.core.info('New chat started, clearing messages');
      setMessages([]);
      seedSeenWidgetIds([]);
      focusPromptInput();
    }
  }, [currentSession?.id, skipNextHistoricalLoad, loadHistoricalMessages, setMessages, clearAttachments, clearResources, clearAutoApprovals, clearWidgetTabs, seedSeenWidgetIds, focusPromptInput, setSkipNextHistoricalLoad]);

  // Auto-open new widget tabs in the side panel
  useEffect(() => {
    if (!currentSession || isLoadingMessages) return;
    if (!messages.length) return;

    const widgets = messages.flatMap((message) => getWidgetTabsFromMessage(message));
    const newWidgets = widgets.filter((widget) => !seenWidgetIdsRef.current.has(widget.id));

    if (newWidgets.length === 0) return;

    for (const widget of newWidgets) {
      seenWidgetIdsRef.current.add(widget.id);
      openWidgetTab(widget);
    }
  }, [messages, currentSession, isLoadingMessages, openWidgetTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate that a model is selected before sending
    if (!model || model.trim() === '') {
      logger.core.warn('Cannot send message: no model selected');
      toast.warning(t('model_selector.required_title'), {
        description: t('model_selector.required_description'),
        id: 'chat-model-required',
      });
      return;
    }

    // If currently streaming
    if (status === 'streaming') {
      // If there's input, we want to stop current stream and send the new message
      if (input.trim()) {
        setPendingMessageAfterStop(input);
        setPendingMessageAfterStopMentions(dedupeMentionsByPath(fileMentions).slice(0, 10));
        setInput(''); // Clear input immediately
        setFileMentions([]);
      }

      stop();
      return;
    }

    // Otherwise, send a new message
    if (input.trim() || attachedFiles.length > 0 || selectedResources.length > 0 || selectedPrompts.length > 0) {
      // DEBUG: Log attachments state at submit time
      logger.core.info('📤 handleSubmit called', {
        inputLength: input.length,
        attachedFilesCount: attachedFiles.length,
        attachedFileNames: attachedFiles.map(f => f.name),
        modelTaskType,
        enableFileAttachment,
      });

      // Build message text with MCP resource context (mentions already inline in input)
      const resourceContext = getContextString();
      const messageText = buildFinalUserMessage({
        input,
        resourceContext,
      });
      const filesToAttach = [...attachedFiles];
      const resourcesToInclude = [...selectedResources];

      try {
        setInput('');
        setFileMentions([]);
        clearAttachments(); // Clear attachments immediately
        clearResources(); // Clear MCP resources immediately

        // If no session exists, create one and save message for later
        if (!currentSession) {
          // Determine session type based on model's taskType
          // Use currentModelInfo already resolved by useModelSelection (handles qualified refs)
          const taskType = currentModelInfo?.taskType;
          const isInferenceModel = taskType && taskType !== 'chat' && taskType !== 'image-text-to-text';
          const sessionType = isInferenceModel ? 'inference' : 'chat';

          logger.core.info('Creating new session for first message', {
            model,
            taskType,
            sessionType
          });

          // Mark that we're about to create a session BEFORE actually creating it
          // This prevents the useEffect from loading empty history when currentSession updates
          justCreatedSessionRef.current = true;

          const newSession = await createSession('New Chat', model || 'openai/gpt-4o', sessionType);

          if (!newSession) {
            logger.core.error('Failed to create session');
            justCreatedSessionRef.current = false; // Reset flag on error
            setInput(messageText); // Restore input on error
            setAttachedFiles(filesToAttach); // Restore files
            return;
          }

          logger.core.info('Session created, storing pending message', {
            sessionId: newSession.id,
            sessionType: newSession.session_type
          });

          // Store message to send after re-render (when useChat has the correct ID)
          setPendingFirstMessage(messageText);
          setPendingFirstAttachments(filesToAttach.length > 0 ? filesToAttach : null);
          // Mentions already baked into messageText, no separate pending needed

          // Don't send now - wait for component to re-render with new session ID
          return;
        }

        // Generate message ID for attachments
        const messageId = `user-${Date.now()}`;

        // Process and save attachments if any
        let savedAttachments: Array<{
          id: string;
          type: 'image' | 'audio' | 'video' | 'document';
          filename: string;
          mimeType: string;
          size: number;
          storagePath: string;
        }> = [];
        // AI SDK 6: FileUIPart uses { type: 'file', mediaType, url } format
        let fileParts: Array<{ type: 'file'; mediaType: string; url: string; filename?: string }> = [];

        if (filesToAttach.length > 0) {
          logger.core.info('Processing attachments', {
            count: filesToAttach.length,
            sessionId: currentSession.id,
          });

          // Convert files to data for inference (before saving to disk)
          for (const file of filesToAttach) {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(
              new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            // AI SDK 6 FileUIPart expects url as data URL
            const dataUrl = `data:${file.type};base64,${base64}`;

            // AI SDK 6 uses { type: 'file', mediaType, url } format
            fileParts.push({
              type: 'file',
              mediaType: file.type,
              url: dataUrl,
              filename: file.name
            });
          }

          // Save attachments to disk
          const processedAttachments = await processAttachments(
            filesToAttach,
            currentSession.id,
            messageId
          );

          // Add storagePath (which comes from 'path' in DB result)
          savedAttachments = processedAttachments.map(att => ({
            ...att,
            storagePath: att.path
          }));
        }

        // Send the message with attachments passed in the body
        logger.core.info('Sending message with attachments', {
          sessionId: currentSession.id,
          messageText: messageText.substring(0, 50) + '...',
          attachmentsCount: fileParts.length,
          fileParts: fileParts.map(p => ({
            type: p.type,
            mediaType: p.mediaType,
            urlLength: p.url?.length || 0
          }))
        });

        // Persist user message to database BEFORE sending to AI (to ensure correct order)
        const userMessage = {
          id: messageId,
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: messageText }],
          attachments: savedAttachments.length > 0 ? savedAttachments : undefined,
        };
        await persistMessage(userMessage);

        // Update session model to reflect current model being used
        if (currentSession.model !== model) {
          logger.core.info('Updating session model', {
            sessionId: currentSession.id,
            oldModel: currentSession.model,
            newModel: model
          });
          await updateSessionModel(currentSession.id, model);
        }

        // Send to AI with attachments AND the same ID
        // Pass full CreateUIMessage with our custom ID so AI SDK uses it
        await sendMessageAI(
          {
            id: messageId, // Use the same ID we persisted to DB
            role: 'user',
            parts: fileParts.length > 0
              ? [
                  { type: 'text', text: messageText },
                  ...fileParts
                ]
              : [{ type: 'text', text: messageText }]
          },
          {
            body: {
              attachments: fileParts.length > 0 ? fileParts : undefined
            }
          }
        );

        if (savedAttachments.length > 0) {
          attachFilesToLatestUserMessage(savedAttachments);
        }
      } catch (error) {
        logger.core.error('Error in handleSubmit', {
          error: error instanceof Error ? error.message : error,
        });
        // Restore files on error
        setAttachedFiles(filesToAttach);
      }
    }
  };

  // Handle pending first message after session creation
  useEffect(() => {
    if (pendingFirstMessage === null || !currentSession) {
      return;
    }

    const messageText = pendingFirstMessage;
    const attachmentFiles = pendingFirstAttachments || [];
    setPendingFirstMessage(null);
    setPendingFirstAttachments(null);

    logger.core.info('Sending pending first message', {
      sessionId: currentSession.id,
      messageLength: messageText.length,
      attachmentCount: attachmentFiles.length,
    });

    const sendPendingMessage = async () => {
      try {
        const messageId = `user-${Date.now()}`;
        // AI SDK 6: FileUIPart uses { type: 'file', mediaType, url } format
        let fileParts: Array<{ type: 'file'; mediaType: string; url: string; filename?: string }> = [];
        let savedAttachments: Array<{
          id: string;
          type: 'image' | 'audio' | 'video' | 'document';
          filename: string;
          mimeType: string;
          size: number;
          storagePath: string;
        }> = [];

        if (attachmentFiles.length > 0) {
          logger.core.info('Processing pending attachments', {
            count: attachmentFiles.length,
            sessionId: currentSession.id,
          });

          for (const file of attachmentFiles) {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(
              new Uint8Array(arrayBuffer).reduce(
                (data, byte) => data + String.fromCharCode(byte),
                ''
              )
            );
            // AI SDK 6 FileUIPart expects url as data URL
            const dataUrl = `data:${file.type};base64,${base64}`;

            // AI SDK 6 uses { type: 'file', mediaType, url } format
            fileParts.push({
              type: 'file',
              mediaType: file.type,
              url: dataUrl,
              filename: file.name
            });
          }

          const processedAttachments = await processAttachments(
            attachmentFiles,
            currentSession.id,
            messageId
          );

          // Add storagePath (which comes from 'path' in DB result)
          savedAttachments = processedAttachments.map(att => ({
            ...att,
            storagePath: att.path
          }));
        }

        // Persist user message to database BEFORE sending to AI (to ensure correct order)
        const userMessage = {
          id: messageId,
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: messageText }],
          attachments: savedAttachments.length > 0 ? savedAttachments : undefined,
        };

        await persistMessage(userMessage);

        // Update session model to reflect current model being used
        if (currentSession.model !== model) {
          logger.core.info('Updating session model for pending message', {
            sessionId: currentSession.id,
            oldModel: currentSession.model,
            newModel: model
          });
          await updateSessionModel(currentSession.id, model);
        }

        // Send to AI with attachments AND the same ID
        await sendMessageAI(
          {
            id: messageId, // Use the same ID we persisted to DB
            role: 'user',
            parts: fileParts.length > 0
              ? [
                  { type: 'text', text: messageText },
                  ...fileParts
                ]
              : [{ type: 'text', text: messageText }]
          },
          {
            body: {
              attachments: fileParts.length > 0 ? fileParts : undefined
            }
          }
        );

        if (savedAttachments.length > 0) {
          attachFilesToLatestUserMessage(savedAttachments);
        }
      } catch (error) {
        logger.core.error('Failed to send pending first message', {
          error: error instanceof Error ? error.message : error,
          sessionId: currentSession.id,
        });

        setInput(messageText);
        if (attachmentFiles.length > 0) {
          setAttachedFiles(attachmentFiles);
        }
      }
    };

    void sendPendingMessage();
  }, [
    pendingFirstMessage,
    pendingFirstAttachments,
    currentSession,
    sendMessageAI,
    persistMessage
  ]);

  // Handle pending prompt from deep link or project page
  useEffect(() => {
    if (!pendingPrompt) {
      return;
    }

    if (pendingPromptMode === 'autosend') {
      if (!currentSession) {
        // Wait for the session to exist before consuming the pending prompt
        return;
      }

      setPendingFirstMessage(pendingPrompt);
      setPendingPrompt(null);
      logger.core.info('Applied pending prompt for autosend', {
        promptLength: pendingPrompt.length,
      });
      return;
    }

    // prefill mode
    setInput(pendingPrompt);
    setPendingPrompt(null);
    logger.core.info('Applied pending prompt', {
      promptLength: pendingPrompt.length,
      autoSubmit: false,
      mode: pendingPromptMode ?? 'prefill',
    });
  }, [pendingPrompt, pendingPromptMode, currentSession, setPendingPrompt]);

  // Check if chat is empty
  const isChatEmpty = messages.length === 0 && status !== 'streaming';

  // Show loading indicator while loading messages
  if (isLoadingMessages) {
    return (
      <div className="flex items-center justify-center h-full">
        <BreathingLogo />
      </div>
    );
  }

  return (
    <>
      <WebPreviewToast />
      <div
        className={cn(
          "flex flex-row h-full relative",
          isDragging && "ring-2 ring-primary ring-inset"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Área de chat */}
        <div className="flex flex-col flex-1 relative min-w-0">
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-lg font-semibold text-primary">Drop images or PDFs here</p>
                <p className="text-sm text-muted-foreground mt-1">to attach them to your message</p>
              </div>
            </div>
          )}
          {/* Show error if any */}
          {chatError && (() => {
            const category = transport.lastErrorCategory;
            const friendlyKeys: Record<string, string> = {
              insufficient_balance: 'api.insufficient_balance',
              rate_limit: 'api.rate_limit',
              quota_exceeded: 'api.quota_exceeded',
              unauthorized: 'api.unauthorized',
              model_not_available: 'api.model_not_available',
            };
            const i18nKey = category && friendlyKeys[category];
            const friendlyMessage = i18nKey ? tErrors(i18nKey) : chatError.message;

            return (
              <div className="p-4 bg-destructive/10 border border-destructive/30 text-destructive text-sm flex items-start justify-between gap-3">
                <span>{friendlyMessage}</span>
                {category === 'insufficient_balance' && (
                  <button
                    type="button"
                    className="shrink-0 underline underline-offset-2 hover:opacity-80 transition-opacity whitespace-nowrap"
                    onClick={async () => {
                      const result = await window.levante.platform.getOrgId();
                      const orgId = result.data;
                      const billingUrl = orgId
                        ? `${LEVANTE_PLATFORM_URL}/org/${orgId}/billing`
                        : `${LEVANTE_PLATFORM_URL}/billing`;
                      window.levante.openExternal(billingUrl);
                    }}
                  >
                    {t('manage_balance')}
                  </button>
                )}
                {category === 'unauthorized' && (
                  <button
                    type="button"
                    className="shrink-0 underline underline-offset-2 hover:opacity-80 transition-opacity whitespace-nowrap"
                    onClick={() => window.levante.openExternal(LEVANTE_PLATFORM_URL)}
                  >
                    {t('sign_in_again')}
                  </button>
                )}
              </div>
            );
          })()}
          {/* Mode tabs: Chat / Cowork */}
          <ChatModeTabs
            coworkMode={coworkMode ?? false}
            onCoworkModeChange={setCoworkMode}
          />
          {isChatEmpty ? (
            // Empty state with welcome screen
            (<div className="flex-1 flex flex-col items-center justify-center px-4">
              <div className="w-full max-w-3xl flex flex-col items-center gap-8">
                <WelcomeScreen userName={userName} />
                <div className="w-full">
                  <ChatPromptInput
                    input={input}
                    onInputChange={setInput}
                    onSubmit={handleSubmit}
                    enableMCP={enableMCP ?? true}
                    onMCPChange={setEnableMCP}
                    coworkMode={coworkMode ?? false}
                    onCoworkModeChange={setCoworkMode}
                    coworkModeCwd={effectiveCwd}
                    onCoworkModeCwdChange={handleCoworkModeCwdChange}
                    coworkModeCwdSource={resolvedCoworkCwd.source}
                    onResetCoworkModeCwdOverride={currentSession ? handleResetCoworkModeCwdOverride : undefined}
                    enableSkills={enableSkills ?? true}
                    onSkillsChange={setEnableSkills}
                    projectId={currentSession?.project_id ?? null}
                    model={model}
                    onModelChange={handleModelChange}
                    availableModels={filteredAvailableModels}
                    groupedModelsByProvider={groupedModelsByProvider || undefined}
                    modelsLoading={modelsLoading}
                    modelsError={modelsError}
                    onRetryModels={retryModels ?? undefined}
                    status={isCompacting ? 'submitted' : status}
                    modelTaskType={modelTaskType}
                    currentModelInfo={currentModelInfo}
                    attachedFiles={attachedFiles}
                    onFilesSelected={handleFilesSelected}
                    onFileRemove={handleFileRemove}
                    enableFileAttachment={enableFileAttachment}
                    fileAccept={getFileAccept()}
                    selectedResources={selectedResources}
                    onResourceSelected={selectResource}
                    onResourceRemove={removeResource}
                    selectedPrompts={selectedPrompts}
                    onPromptSelected={selectPrompt}
                    onPromptRemove={removePrompt}
                    editorFocusRef={editorFocusRef}
                    onMentionsChange={setFileMentions}
                  />
                </div>
              </div>
            </div>)
          ) : (
            // Chat conversation
            (<>
              <Conversation className="flex-1">
                <ConversationContent className="max-w-3xl mx-auto p-0 pl-4 pr-2 py-4">
                  {messages.map((message, index) => (
                    <ChatMessageItem
                      key={message.id}
                      message={message}
                      isStreaming={status === 'streaming' && index === messages.length - 1}
                      onPrompt={setInput}
                      onSendMessage={handleSendMessage}
                      chatMessages={messages}
                      onEditMessage={handleEditMessage}
                      addToolApprovalResponse={addToolApprovalResponse}
                      onApproveServerForSession={approveServerForSession}
                      isServerAutoApproved={isServerAutoApproved}
                    />
                  ))}

                  {/* Inline todo list */}
                  <InlineTodoList />

                  {/* Streaming indicator (hidden when todos are in progress) */}
                  {(status === 'streaming' || status === 'submitted') && !todosInProgress && (
                    <Message from="assistant">
                      <MessageContent>
                        <BreathingLogo />
                      </MessageContent>
                    </Message>
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
              {/* Input */}
              <div className="bg-transparent px-2">
                <div className="max-w-3xl mx-auto w-full">
                  <ContextUsageIndicator
                    usage={contextUsage}
                    onCompact={handleCompactConversation}
                    compactDisabled={
                      isCompacting ||
                      status === 'streaming' ||
                      status === 'submitted' ||
                      !currentSession ||
                      messages.length < 2
                    }
                    isCompacting={isCompacting}
                  />
                </div>
                <ChatPromptInput
                  input={input}
                  onInputChange={setInput}
                  onSubmit={handleSubmit}
                  enableMCP={enableMCP ?? true}
                  onMCPChange={setEnableMCP}
                  coworkMode={coworkMode ?? false}
                  onCoworkModeChange={setCoworkMode}
                  coworkModeCwd={effectiveCwd}
                  onCoworkModeCwdChange={handleCoworkModeCwdChange}
                  coworkModeCwdSource={resolvedCoworkCwd.source}
                  onResetCoworkModeCwdOverride={currentSession ? handleResetCoworkModeCwdOverride : undefined}
                  enableSkills={enableSkills ?? true}
                  onSkillsChange={setEnableSkills}
                  projectId={currentSession?.project_id ?? null}
                  model={model}
                  onModelChange={handleModelChange}
                  availableModels={filteredAvailableModels}
                  groupedModelsByProvider={groupedModelsByProvider || undefined}
                  modelsLoading={modelsLoading}
                  modelsError={modelsError}
                  onRetryModels={retryModels ?? undefined}
                  status={isCompacting ? 'submitted' : status}
                  modelTaskType={modelTaskType}
                  currentModelInfo={currentModelInfo}
                  attachedFiles={attachedFiles}
                  onFilesSelected={handleFilesSelected}
                  onFileRemove={handleFileRemove}
                  enableFileAttachment={enableFileAttachment}
                  fileAccept={getFileAccept()}
                  selectedResources={selectedResources}
                  onResourceSelected={selectResource}
                  onResourceRemove={removeResource}
                  selectedPrompts={selectedPrompts}
                  onPromptSelected={selectPrompt}
                  onPromptRemove={removePrompt}
                  editorFocusRef={editorFocusRef}
                  onMentionsChange={setFileMentions}
                />
              </div>
            </>)
          )}
        </div>

        {/* Panel lateral de preview */}
        <SidePanel
          onPrompt={setInput}
          onSendMessage={handleSendMessage}
          chatMessages={messages}
        />
      </div>
    </>
  );
};

// Wrap with StreamingProvider
const ChatPageWithProvider = () => {
  return (
    <StreamingProvider>
      <ChatPage />
    </StreamingProvider>
  );
};

// Static method to get sidebar content for chat page
ChatPageWithProvider.getSidebarContent = (
  sessions: any[],
  currentSessionId: string | undefined,
  onSessionSelect: (sessionId: string) => void,
  onNewChat: () => void,
  onDeleteChat: (sessionId: string) => void,
  onRenameChat: (sessionId: string, newTitle: string) => void,
  loading: boolean = false,
  projects?: any[],
  selectedProjectId?: string,
  selectedProjectName?: string,
  onProjectSelect?: (project: any) => void,
  onCreateProject?: () => void,
  onEditProject?: (project: any) => void,
  onDeleteProject?: (projectId: string, projectName: string, sessionCount: number, cwd?: string | null) => void,
  coworkModeEnabled: boolean = false,
  effectiveCwd: string | null = null,
  onExitProject?: () => void,
) => {
  return (
    <SidebarSections
      onNewChat={onNewChat}
      onExitProject={onExitProject}
      loading={loading}
      coworkModeEnabled={coworkModeEnabled}
      effectiveCwd={effectiveCwd}
      chatListProps={{
        sessions,
        currentSessionId,
        onSessionSelect,
        onDeleteChat,
        onRenameChat,
        loading,
        projects,
        selectedProjectId,
        selectedProjectName,
        onProjectSelect,
        onCreateProject,
        onEditProject,
        onDeleteProject,
      }}
    />
  );
};

export default ChatPageWithProvider;
