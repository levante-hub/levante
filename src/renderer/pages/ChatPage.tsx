import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { useState, useEffect, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import { ChatList } from "@/components/chat/ChatList";
import { GlobeIcon, Loader2 } from "lucide-react";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/source";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Loader } from "@/components/ai-elements/loader";
import { modelService } from "@/services/modelService";
import type { Model } from "../../types/models";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";

interface ChatPageProps {
  sidebarContent?: React.ReactNode;
}

const ChatPage = () => {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>("");
  const [webSearch, setWebSearch] = useState(false);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Using Zustand selectors for optimal performance
  const messages = useChatStore((state) => state.messages);
  const status = useChatStore((state) => state.status);
  const sendMessage = useChatStore((state) => state.sendMessage);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(
        { text: input },
        {
          body: {
            model: model,
            webSearch: webSearch,
          },
        }
      );
      setInput("");
    }
  };

  // Load available models on component mount
  useEffect(() => {
    loadAvailableModels();
  }, []);

  // Auto-scroll to bottom when messages change or status changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [messages, status]);

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
      console.error("Failed to load models:", error);
    } finally {
      setModelsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-4xl mx-auto px-4 py-4">
          {messages.map((message) => {
            return (
              <div key={message.id}>
                💦
                {message.role === "assistant" && (
                  <Sources>
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case "source-url":
                          return (
                            <>
                              <SourcesTrigger
                                count={
                                  message.parts.filter(
                                    (part) => part.type === "source-url"
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
                        case "text":
                          // Solo aplicar markdown para respuestas del asistente
                          if (message.role === "assistant") {
                            return (
                              <div
                                key={`${message.id}-${i}`}
                                className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:border prose-blockquote:border-l-4 prose-blockquote:border-border prose-blockquote:bg-muted/50 prose-blockquote:pl-4 prose-blockquote:text-muted-foreground prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground"
                              >
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    code({ className, children, ...props }) {
                                      const match = /language-(\w+)/.exec(
                                        className || ""
                                      );
                                      const language = match ? match[1] : "";
                                      const isInline = !language;

                                      if (!isInline && language) {
                                        return (
                                          <CodeBlock
                                            code={String(children).replace(
                                              /\n$/,
                                              ""
                                            )}
                                            language={language}
                                            showLineNumbers={true}
                                          >
                                            <CodeBlockCopyButton />
                                          </CodeBlock>
                                        );
                                      }

                                      return (
                                        <code
                                          className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold"
                                          {...props}
                                        >
                                          {children}
                                        </code>
                                      );
                                    },
                                    pre({ children }) {
                                      return <>{children}</>;
                                    },
                                    h1({ children }) {
                                      return (
                                        <h1 className="text-xl font-semibold text-foreground mb-4">
                                          {children}
                                        </h1>
                                      );
                                    },
                                    h2({ children }) {
                                      return (
                                        <h2 className="text-lg font-semibold text-foreground mb-3">
                                          {children}
                                        </h2>
                                      );
                                    },
                                    h3({ children }) {
                                      return (
                                        <h3 className="text-base font-semibold text-foreground mb-2">
                                          {children}
                                        </h3>
                                      );
                                    },
                                    p({ children }) {
                                      return (
                                        <p className="text-foreground mb-4 leading-relaxed">
                                          {children}
                                        </p>
                                      );
                                    },
                                    ul({ children }) {
                                      return (
                                        <ul className="list-disc pl-6 mb-4 text-foreground">
                                          {children}
                                        </ul>
                                      );
                                    },
                                    ol({ children }) {
                                      return (
                                        <ol className="list-decimal pl-6 mb-4 text-foreground">
                                          {children}
                                        </ol>
                                      );
                                    },
                                    li({ children }) {
                                      return (
                                        <li className="mb-1 text-foreground">
                                          {children}
                                        </li>
                                      );
                                    },
                                    blockquote({ children }) {
                                      return (
                                        <blockquote className="border-l-4 border-border bg-muted/50 pl-4 py-2 my-4 italic text-muted-foreground">
                                          {children}
                                        </blockquote>
                                      );
                                    },
                                    strong({ children }) {
                                      return (
                                        <strong className="font-semibold text-foreground">
                                          {children}
                                        </strong>
                                      );
                                    },
                                    em({ children }) {
                                      return (
                                        <em className="italic text-foreground">
                                          {children}
                                        </em>
                                      );
                                    },
                                    a({ href, children }) {
                                      return (
                                        <a
                                          href={href}
                                          className="text-primary underline hover:text-primary/80 transition-colors"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          {children}
                                        </a>
                                      );
                                    },
                                  }}
                                >
                                  {part.text}
                                </ReactMarkdown>
                              </div>
                            );
                          } else {
                            // Para mensajes del usuario, renderizar texto plano
                            return (
                              <div key={`${message.id}-${i}`}>{part.text}</div>
                            );
                          }
                        case "reasoning":
                          return (
                            <Reasoning
                              key={`${message.id}-${i}`}
                              className="w-full"
                              isStreaming={status === "streaming"}
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>
                                {`${part.text || ""} `}
                              </ReasoningContent>
                            </Reasoning>
                          );
                        default:
                          return null;
                      }
                    })}
                  </MessageContent>
                </Message>
              </div>
            );
          })}
          {status === "submitted" && <Loader />}
        </div>
      </div>

      <div className="bg-background">
        <PromptInput
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto w-full px-4 py-4"
        >
          <PromptInputTextarea
            onChange={(e) => setInput(e.target.value)}
            value={input}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputButton
                variant={webSearch ? "default" : "ghost"}
                onClick={() => setWebSearch(!webSearch)}
              >
                <GlobeIcon size={16} />
                <span>Search</span>
              </PromptInputButton>
              <PromptInputModelSelect
                onValueChange={(value) => {
                  setModel(value);
                }}
                value={model}
              >
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {modelsLoading ? (
                    <div className="flex items-center justify-center p-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="ml-2 text-sm">Loading models...</span>
                    </div>
                  ) : availableModels.length > 0 ? (
                    availableModels.map((modelItem) => (
                      <PromptInputModelSelectItem
                        key={modelItem.id}
                        value={modelItem.id}
                      >
                        {modelItem.name}
                      </PromptInputModelSelectItem>
                    ))
                  ) : (
                    <div className="flex items-center justify-center p-2 text-sm text-muted-foreground">
                      No models available. Configure a provider in Settings.
                    </div>
                  )}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit disabled={!input} status={status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
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
