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
 */

import { Message, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { StreamingProvider, useStreamingContext } from '@/contexts/StreamingContext';
import { ChatList } from '@/components/chat/ChatList';
import { WelcomeScreen } from '@/components/chat/WelcomeScreen';
import { ChatPromptInput } from '@/components/chat/ChatPromptInput';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/source';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { BreathingLogo } from '@/components/ai-elements/breathing-logo';
import { ToolCall } from '@/components/ai-elements/tool-call';
import { modelService } from '@/services/modelService';
import type { Model } from '../../types/models';
import { getRendererLogger } from '@/services/logger';
import { cn } from '@/lib/utils';

// AI SDK v5 imports
import { useChat } from '@ai-sdk/react';
import { createElectronChatTransport } from '@/transports/ElectronChatTransport';

const logger = getRendererLogger();

const ChatPage = () => {
  const { t } = useTranslation('chat');
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>('');
  const [webSearch, setWebSearch] = useState(false);
  const [enableMCP, setEnableMCP] = useState(false);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [userName, setUserName] = useState<string>(t('welcome.default_user_name'));
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null);
  const [pendingMessageAfterStop, setPendingMessageAfterStop] = useState<string | null>(null);
  const [showPaidModelWarning, setShowPaidModelWarning] = useState(false);
  const [pendingMessageForWarning, setPendingMessageForWarning] = useState<string | null>(null);
  const [hasAcceptedPaidModelWarning, setHasAcceptedPaidModelWarning] = useState(false);

  // Chat store
  const currentSession = useChatStore((state) => state.currentSession);
  const persistMessage = useChatStore((state) => state.persistMessage);
  const createSession = useChatStore((state) => state.createSession);
  const loadHistoricalMessages = useChatStore((state) => state.loadHistoricalMessages);
  const pendingPrompt = useChatStore((state) => state.pendingPrompt);
  const setPendingPrompt = useChatStore((state) => state.setPendingPrompt);

  // Track previous session ID to detect changes
  const previousSessionIdRef = useRef<string | null>(null);

  // Track if we just created a new session (to avoid loading empty history)
  const justCreatedSessionRef = useRef(false);

  // Streaming context for mermaid processing
  const { triggerMermaidProcessing } = useStreamingContext();

  // Create transport with current configuration
  const transport = useMemo(
    () =>
      createElectronChatTransport({
        model: model || 'openai/gpt-4o',
        webSearch,
        enableMCP,
      }),
    [] // Keep same transport instance
  );

  // Update transport options when they change
  useEffect(() => {
    transport.updateOptions({
      model: model || 'openai/gpt-4o',
      webSearch,
      enableMCP,
    });
  }, [model, webSearch, enableMCP, transport]);

  // Use AI SDK native useChat hook
  const {
    messages,
    setMessages,
    sendMessage: sendMessageAI,
    status,
    stop,
    error: chatError,
  } = useChat({
    id: currentSession?.id || 'new-chat',
    transport,

    // Persist messages after AI finishes
    onFinish: async ({ message }) => {
      logger.aiSdk.info('AI response finished', {
        sessionId: currentSession?.id,
        messageId: message.id,
        messageRole: message.role,
        partsCount: message.parts?.length,
      });

      // Persist the AI response
      if (currentSession) {
        await persistMessage(message);
      }

      // Trigger mermaid processing
      triggerMermaidProcessing();
    },
  });

  // Handle pending message after stop
  useEffect(() => {
    if (pendingMessageAfterStop && status !== 'streaming' && status !== 'submitted') {
      const messageText = pendingMessageAfterStop;
      setPendingMessageAfterStop(null);

      // Send the message
      sendMessageAI({ text: messageText });

      // Persist user message to database
      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: messageText }],
      };
      persistMessage(userMessage).catch((err) => {
        logger.database.error('Failed to persist message after stop', { error: err });
      });
    }
  }, [pendingMessageAfterStop, status, sendMessageAI, persistMessage]);

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

    // If we just created this session, skip loading historical messages
    // (the messages are already in useChat state from sendMessageAI)
    if (justCreatedSessionRef.current) {
      logger.core.info('Session just created, skipping historical load', { sessionId: currentSessionId });
      justCreatedSessionRef.current = false;
      return;
    }

    // Load messages for the new session
    if (currentSessionId) {
      logger.core.info('Session changed, loading messages', { sessionId: currentSessionId });
      setIsLoadingMessages(true);

      loadHistoricalMessages(currentSessionId)
        .then((msgs) => {
          logger.core.info('Loaded historical messages', { count: msgs.length });
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
    }
  }, [currentSession?.id, loadHistoricalMessages, setMessages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If currently streaming
    if (status === 'streaming') {
      // If there's input, we want to stop current stream and send the new message
      if (input.trim()) {
        setPendingMessageAfterStop(input);
        setInput(''); // Clear input immediately
      }

      stop();
      return;
    }

    // Otherwise, send a new message
    if (input.trim()) {
      const messageText = input;

      // Check if we need to show the paid model warning (for non-free OpenRouter models)
      if (isSelectedModelPaidOpenRouter() && !hasAcceptedPaidModelWarning) {
        setPendingMessageForWarning(messageText);
        setInput(''); // Clear input
        setShowPaidModelWarning(true);
        return;
      }

      try {
        setInput('');

        // If no session exists, create one and save message for later
        if (!currentSession) {
          logger.core.info('Creating new session for first message', { model });

          // Mark that we're about to create a session BEFORE actually creating it
          // This prevents the useEffect from loading empty history when currentSession updates
          justCreatedSessionRef.current = true;

          const newSession = await createSession('New Chat', model || 'openai/gpt-4o');

          if (!newSession) {
            logger.core.error('Failed to create session');
            justCreatedSessionRef.current = false; // Reset flag on error
            setInput(messageText); // Restore input on error
            return;
          }

          logger.core.info('Session created, storing pending message', { sessionId: newSession.id });

          // Store message to send after re-render (when useChat has the correct ID)
          setPendingFirstMessage(messageText);

          // Don't send now - wait for component to re-render with new session ID
          return;
        }

        // Send the message for existing session
        logger.core.info('Sending message', {
          sessionId: currentSession.id,
          messageText: messageText.substring(0, 50) + '...',
        });

        sendMessageAI({ text: messageText });

        // Persist user message to database
        const userMessage = {
          id: `user-${Date.now()}`,
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: messageText }],
        };
        await persistMessage(userMessage);
      } catch (error) {
        logger.core.error('Error in handleSubmit', {
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  };

  // Handle pending first message after session creation
  useEffect(() => {
    if (pendingFirstMessage && currentSession) {
      logger.core.info('Sending pending first message', {
        sessionId: currentSession.id,
        messageLength: pendingFirstMessage.length,
      });

      const messageText = pendingFirstMessage;
      setPendingFirstMessage(null);

      // Send the message (now useChat has the correct session ID)
      sendMessageAI({ text: messageText });

      // Persist user message to database
      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: messageText }],
      };
      persistMessage(userMessage).catch((err) => {
        logger.database.error('Failed to persist pending message', { error: err });
      });
    }
  }, [pendingFirstMessage, currentSession, sendMessageAI, persistMessage]);

  // Handle pending prompt from deep link
  useEffect(() => {
    if (pendingPrompt) {
      setInput(pendingPrompt);
      setPendingPrompt(null);
      logger.core.info('Applied pending prompt from deep link', {
        promptLength: pendingPrompt.length,
      });
    }
  }, [pendingPrompt, setPendingPrompt]);

  // Load available models on component mount
  useEffect(() => {
    loadAvailableModels();
    loadUserName();
    loadPaidModelWarningPreference();
  }, []);

  const loadPaidModelWarningPreference = async () => {
    try {
      const result = await window.levante.preferences.get('hasAcceptedPaidModelWarning');
      if (result.success && result.data) {
        setHasAcceptedPaidModelWarning(true);
      }
    } catch (error) {
      logger.preferences.error('Failed to load paid model warning preference:', {
        error: error instanceof Error ? error.message : error
      });
    }
  };

  const loadUserName = async () => {
    try {
      const profile = await window.levante.profile.get();
      if (profile?.data?.personalization?.nickname) {
        setUserName(profile.data.personalization.nickname);
      }
    } catch (error) {
      logger.preferences.error('Error loading user name', {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  // Check if the selected model is a PAID OpenRouter model (not free)
  const isSelectedModelPaidOpenRouter = (): boolean => {
    const selectedModel = availableModels.find(m => m.id === model);
    if (!selectedModel) return false;

    // Return true if it's OpenRouter AND NOT free (has pricing > 0)
    return (
      selectedModel.provider === 'openrouter' &&
      selectedModel.pricing !== undefined &&
      (selectedModel.pricing.input > 0 || selectedModel.pricing.output > 0)
    );
  };

  // Handle paid model warning confirmation
  const handleConfirmPaidModel = async () => {
    try {
      // Save preference permanently
      await window.levante.preferences.set('hasAcceptedPaidModelWarning', true);
      setHasAcceptedPaidModelWarning(true);
    } catch (error) {
      logger.preferences.error('Failed to save paid model warning preference:', {
        error: error instanceof Error ? error.message : error
      });
    }

    setShowPaidModelWarning(false);

    // Send the pending message
    if (pendingMessageForWarning) {
      const messageText = pendingMessageForWarning;
      setPendingMessageForWarning(null);

      try {
        // If no session exists, create one and save message for later
        if (!currentSession) {
          logger.core.info('Creating new session for first message', { model });

          justCreatedSessionRef.current = true;

          const newSession = await createSession('New Chat', model || 'openai/gpt-4o');

          if (!newSession) {
            logger.core.error('Failed to create session');
            justCreatedSessionRef.current = false;
            setInput(messageText);
            return;
          }

          logger.core.info('Session created, storing pending message', { sessionId: newSession.id });
          setPendingFirstMessage(messageText);
          return;
        }

        // Send the message for existing session
        logger.core.info('Sending message', {
          sessionId: currentSession.id,
          messageText: messageText.substring(0, 50) + '...',
        });

        sendMessageAI({ text: messageText });

        const userMessage = {
          id: `user-${Date.now()}`,
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: messageText }],
        };
        await persistMessage(userMessage);
      } catch (error) {
        logger.core.error('Error in handleConfirmFreeModel', {
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  };

  // Handle paid model warning cancellation
  const handleCancelPaidModel = () => {
    // Restore input
    if (pendingMessageForWarning) {
      setInput(pendingMessageForWarning);
      setPendingMessageForWarning(null);
    }
    setShowPaidModelWarning(false);
  };

  const loadAvailableModels = async () => {
    try {
      setModelsLoading(true);
      await modelService.initialize();
      const models = await modelService.getAvailableModels();
      setAvailableModels(models);

      // Set default model if none selected
      if (!model && models.length > 0) {
        setModel(models[0].id);
      }
    } catch (error) {
      logger.core.error('Failed to load models in ChatPage', {
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      setModelsLoading(false);
    }
  };

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
    <div className="flex flex-col h-full">
      {/* Show error if any */}
      {chatError && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-800">
          <strong>Error:</strong> {chatError.message}
        </div>
      )}

      {isChatEmpty ? (
        // Empty state with welcome screen
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-3xl flex flex-col items-center gap-8">
            <WelcomeScreen userName={userName} />
            <div className="w-full">
              <ChatPromptInput
                input={input}
                onInputChange={setInput}
                onSubmit={handleSubmit}
                webSearch={webSearch}
                enableMCP={enableMCP}
                onWebSearchChange={setWebSearch}
                onMCPChange={setEnableMCP}
                model={model}
                onModelChange={setModel}
                availableModels={availableModels}
                modelsLoading={modelsLoading}
                status={status}
              />
            </div>
          </div>
        </div>
      ) : (
        // Chat conversation
        <>
          <Conversation className="flex-1">
            <ConversationContent className="max-w-3xl mx-auto p-0 pl-4 pr-2 py-4">
              {messages.map((message) => (
                  <div key={message.id}>
                    {/* Sources (web search results) */}
                    {message.role === 'assistant' && message.parts && (
                      <Sources>
                        {message.parts
                          .filter((part: any) => part?.value?.type === 'source-url')
                          .map((part: any, i: number) => (
                            <>
                              <SourcesTrigger
                                key={`trigger-${message.id}-${i}`}
                                count={
                                  message.parts.filter((p: any) => p.value?.type === 'source-url')
                                    .length
                                }
                              />
                              <SourcesContent key={`content-${message.id}-${i}`}>
                                <Source href={part.value.url} title={part.value.title || part.value.url} />
                              </SourcesContent>
                            </>
                          ))}
                      </Sources>
                    )}

                    {/* Message */}
                    <Message
                      from={message.role}
                      key={message.id}
                      className={cn(
                        'p-0',
                        message.role === 'user' ? 'is-user my-6' : 'is-assistant'
                      )}
                    >
                      <MessageContent
                        from={message.role}
                        className={cn(
                          '',
                          message.role === 'user' ? 'p-2 mb-0 dark:text-white' : 'px-2 py-0'
                        )}
                      >
                        {message.parts?.map((part: any, i: number) => {
                          try {
                            // Text content
                            if (part?.type === 'text' && part?.text) {
                              return (
                                <Response key={`${message.id}-${i}`}>
                                  {part.text}
                                </Response>
                              );
                            }

                            // Reasoning (data part)
                            if (part?.value?.type === 'reasoning') {
                            return (
                              <Reasoning
                                key={`${message.id}-${i}`}
                                className="w-full"
                                isStreaming={status === 'streaming'}
                              >
                                <ReasoningTrigger />
                                <ReasoningContent>
                                  {part.value.text || ''}
                                </ReasoningContent>
                              </Reasoning>
                            );
                          }

                          // Tool calls (MCP)
                          if (part?.type?.startsWith('tool-')) {
                            // Only show if output is available or there's an error
                            if (part.state === 'output-available' || part.state === 'output-error') {
                              const toolCall = {
                                id: part.toolCallId,
                                name: part.toolName,
                                arguments: part.input || {},
                                result: part.state === 'output-available' ? {
                                  success: true,
                                  content: JSON.stringify(part.output),
                                } : {
                                  success: false,
                                  error: part.errorText,
                                },
                                status: part.state === 'output-available' ? 'success' as const : 'error' as const,
                              };

                              return (
                                <ToolCall
                                  key={`${message.id}-${i}`}
                                  toolCall={toolCall}
                                  className="w-full"
                                />
                              );
                            }
                          }

                            return null;
                          } catch (error) {
                            console.error('[ChatPage] Error rendering part:', error, {
                              messageId: message.id,
                              partIndex: i,
                              part,
                            });
                            return null;
                          }
                        })}
                      </MessageContent>
                    </Message>
                  </div>
              ))}

              {/* Streaming indicator */}
              {status === 'streaming' && (
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
            <ChatPromptInput
              input={input}
              onInputChange={setInput}
              onSubmit={handleSubmit}
              webSearch={webSearch}
              enableMCP={enableMCP}
              onWebSearchChange={setWebSearch}
              onMCPChange={setEnableMCP}
              model={model}
              onModelChange={setModel}
              availableModels={availableModels}
              modelsLoading={modelsLoading}
              status={status}
            />
          </div>
        </>
      )}

      {/* Paid Model Warning Dialog */}
      <Dialog open={showPaidModelWarning} onOpenChange={setShowPaidModelWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              {t('paid_model_chat_warning.title')}
            </DialogTitle>
            <DialogDescription className="pt-4">
              {t('paid_model_chat_warning.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row !justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleCancelPaidModel}
            >
              {t('paid_model_chat_warning.cancel')}
            </Button>
            <Button
              onClick={handleConfirmPaidModel}
            >
              {t('paid_model_chat_warning.continue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  loading: boolean = false
) => {
  return (
    <ChatList
      sessions={sessions}
      currentSessionId={currentSessionId}
      onSessionSelect={onSessionSelect}
      onNewChat={onNewChat}
      onDeleteChat={onDeleteChat}
      loading={loading}
    />
  );
};

export default ChatPageWithProvider;
