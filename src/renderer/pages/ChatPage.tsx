import { Message, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  PromptInput,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { ModelSearchableSelect } from '@/components/ai-elements/model-searchable-select';
import { useState, useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { StreamingProvider, useStreamingContext } from '@/contexts/StreamingContext';
import { ChatList } from '@/components/chat/ChatList';
import { GlobeIcon, Wrench } from 'lucide-react';
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

const logger = getRendererLogger();


const ChatPageContent = () => {
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>('');
  const [webSearch, setWebSearch] = useState(false);
  const [enableMCP, setEnableMCP] = useState(false);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Using Zustand selectors for optimal performance
  const messages = useChatStore((state) => state.messages);
  const status = useChatStore((state) => state.status);
  const streamingMessage = useChatStore((state) => state.streamingMessage);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const stopStreaming = useChatStore((state) => state.stopStreaming);
  const setOnStreamFinish = useChatStore((state) => state.setOnStreamFinish);

  // Streaming context
  const { triggerMermaidProcessing } = useStreamingContext();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // If currently streaming, stop the stream
    if (status === 'streaming') {
      stopStreaming();
      return;
    }
    
    // Otherwise, send a new message
    if (input.trim()) {
      sendMessage(
        { text: input },
        {
          body: {
            model: model,
            webSearch: webSearch,
            enableMCP: enableMCP,
          },
        },
      );
      setInput('');
    }
  };

  // Connect streaming callback
  useEffect(() => {
    setOnStreamFinish(triggerMermaidProcessing);
    return () => setOnStreamFinish(undefined);
  }, [triggerMermaidProcessing, setOnStreamFinish]);

  // Load available models on component mount
  useEffect(() => {
    loadAvailableModels();
  }, []);


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
      logger.core.error('Failed to load models in ChatPage', { error: error instanceof Error ? error.message : error });
    } finally {
      setModelsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1">
        <ConversationContent className="max-w-4xl mx-auto px-4 py-4">
          {messages.map((message) => {
            return (
              <div key={message.id}>
                {message.role === 'assistant' && (
                  <Sources>
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case 'source-url':
                          return (
                            <>
                              <SourcesTrigger
                                count={
                                  message.parts.filter(
                                    (part) => part.type === 'source-url',
                                  ).length
                                }
                              />
                              <SourcesContent key={`${message.id}-${i}`}>
                                <Source
                                  key={`${message.id}-${i}`}
                                  href={part.url}
                                  title={part.url}
                                />
                              </SourcesContent>
                            </>
                          );
                      }
                    })}
                  </Sources>
                )}
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case 'text':
                          return (
                            <Response key={`${message.id}-${i}`}>
                              {part.text}
                            </Response>
                          );
                        case 'reasoning':
                          return (
                            <Reasoning
                              key={`${message.id}-${i}`}
                              className="w-full"
                              isStreaming={status === 'streaming'}
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>
                                {`${part.text || ''} `}
                              </ReasoningContent>
                            </Reasoning>
                          );
                        case 'tool-call':
                          return part.toolCall ? (
                            <ToolCall
                              key={`${message.id}-${i}`}
                              toolCall={part.toolCall}
                              className="w-full"
                            />
                          ) : null;
                        default:
                          return null;
                      }
                    })}
                  </MessageContent>
                </Message>
              </div>
            )
          })}
          {status === 'streaming' && streamingMessage && !streamingMessage.content.trim() && (
            <Message from="assistant">
              <MessageContent>
                <BreathingLogo />
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="bg-background">
        <PromptInput onSubmit={handleSubmit} className="max-w-4xl mx-auto w-full px-4 py-4">
          <PromptInputTextarea
            onChange={(e) => setInput(e.target.value)}
            value={input}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputButton
                variant={webSearch ? 'default' : 'ghost'}
                onClick={() => setWebSearch(!webSearch)}
              >
                <GlobeIcon size={16} />
                <span>Search</span>
              </PromptInputButton>
              <PromptInputButton
                variant={enableMCP ? 'default' : 'ghost'}
                onClick={() => setEnableMCP(!enableMCP)}
              >
                <Wrench size={16} />
                <span>Tools</span>
              </PromptInputButton>
              <ModelSearchableSelect
                value={model}
                onValueChange={setModel}
                models={availableModels}
                loading={modelsLoading}
                placeholder={availableModels.length === 0 ? "No models available" : "Select model..."}
              />
            </PromptInputTools>
            <PromptInputSubmit disabled={!input} status={status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
};

const ChatPage = () => {
  return (
    <StreamingProvider>
      <ChatPageContent />
    </StreamingProvider>
  );
};

// Static method to get sidebar content for chat page
ChatPage.getSidebarContent = (
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

export default ChatPage;