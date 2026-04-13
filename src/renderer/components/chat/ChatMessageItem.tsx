/**
 * ChatMessageItem Component
 *
 * Renders a single chat message with all its parts including:
 * - Text content
 * - Reasoning blocks
 * - Tool calls with UI resources
 * - Attachments (images, audio, video)
 * - Sources from web search
 */

import { Message, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
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
import { ToolCall } from '@/components/ai-elements/tool-call';
import { ToolApprovalInline } from '@/components/ai-elements/tool-approval';
import { DiffViewer } from '@/components/ai-elements/diff-viewer';
import { isToolHidden } from '@/constants/hiddenTools';
import { PresentedFilesCard } from './PresentedFilesCard';
import { WidgetPlaceholder } from './WidgetPlaceholder';
import { MessageAttachments } from '@/components/chat/MessageAttachments';
import { getWidgetTabsFromPart } from '@/lib/widgetTabs';
import { cn } from '@/lib/utils';
import { getRendererLogger } from '@/services/logger';
import type { UIMessage } from '@ai-sdk/react';
import { useState, useMemo } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const logger = getRendererLogger();

// ============================================================================
// Types
// ============================================================================

interface ChatMessageItemProps {
  message: UIMessage;
  isStreaming: boolean;
  onPrompt: (prompt: string) => void;
  onSendMessage?: (text: string) => void;
  chatMessages?: UIMessage[];
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
  onApproveServerForSession?: (serverId: string) => void;
  isServerAutoApproved?: (serverId: string) => boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ChatMessageItem({
  message,
  isStreaming,
  onPrompt,
  onSendMessage,
  chatMessages,
  onEditMessage,
  addToolApprovalResponse,
  onApproveServerForSession,
  isServerAutoApproved,
}: ChatMessageItemProps) {
  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const messageText = useMemo(() => {
    if (!message.parts) return '';
    const textParts = message.parts.filter((p: any) => p.type === 'text');
    return textParts.map((p: any) => p.text).join('\n');
  }, [message.parts]);

  const compactionSummary = useMemo(() => {
    if (message.role !== 'system') return null;
    const text = messageText.trim();
    if (!text.startsWith('[COMPACTION_SUMMARY]')) return null;
    return text.replace('[COMPACTION_SUMMARY]', '').trim();
  }, [message.role, messageText]);

  const collectedPresentedFiles = useMemo(() => {
    if (!isAssistant || !message.parts?.length) return [];

    const deduped = new Map<string, Record<string, unknown>>();

    for (const part of message.parts as any[]) {
      if (!part?.type?.startsWith('tool-')) continue;

      const name = (part.toolName || part.type.replace(/^tool-/, '')).trim().toLowerCase();
      if (name !== 'present_files') continue;
      if (part.state !== 'output-available') continue;

      const output = part.output;

      if (typeof output !== 'object' || output === null) continue;

      const files = Array.isArray((output as Record<string, unknown>).files)
        ? ((output as Record<string, unknown>).files as Array<Record<string, unknown>>)
        : [];

      for (const file of files) {
        const path = typeof file?.path === 'string' ? file.path : '';
        if (!path) continue;
        deduped.set(path, file);
      }
    }

    return Array.from(deduped.values());
  }, [isAssistant, message.parts]);

  if (compactionSummary !== null) {
    return (
      <div className="my-6">
        <div className="text-center text-xs text-muted-foreground mb-2">
          --- Conversacion compactada ---
        </div>
        <Collapsible>
          <CollapsibleTrigger className="text-xs underline text-muted-foreground hover:text-foreground">
            Ver resumen de compactacion
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 p-3 rounded border bg-muted/30 text-sm whitespace-pre-wrap">
            {compactionSummary}
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }

  const handleStartEdit = () => {
    setEditContent(messageText);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent('');
  };

  const handleSaveEdit = async () => {
    if (!onEditMessage || !editContent.trim()) return;

    setIsSaving(true);
    try {
      await onEditMessage(message.id, editContent.trim());
      setIsEditing(false);
    } catch (error) {
      logger.core.error('Failed to edit message', { error });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(messageText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className={cn(isUser && 'group')}>
      {/* Sources (web search results) */}
      {isAssistant && message.parts && (
        <Sources>
          {message.parts
            .filter((part: any) => part?.value?.type === 'source-url')
            .map((part: any, i: number) => (
              <>
                <SourcesTrigger
                  key={`trigger-${message.id}-${i}`}
                  count={
                    message.parts!.filter((p: any) => p.value?.type === 'source-url').length
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
          isUser ? 'is-user my-6' : 'is-assistant'
        )}
      >
        <MessageContent
          from={message.role}
          className={cn(
            '',
            isUser ? 'p-2 mb-0 dark:text-white' : 'px-2 py-0'
          )}
        >
          {isUser && isEditing ? (
            <div className="flex flex-col gap-2 w-full min-w-[500px]">
              <textarea
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  // Auto-resize textarea
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
                }}
                ref={(el) => {
                  if (el) {
                    // Initial auto-resize
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 300) + 'px';
                  }
                }}
                className="w-full min-h-[60px] max-h-[300px] p-2 rounded border border-border bg-background text-foreground resize-none outline-none focus:ring-1 focus:ring-primary/30"
                disabled={isSaving}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-3 py-1 text-sm rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editContent.trim()}
                  className="px-3 py-1 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
                >
                  {isSaving ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Render attachments if present */}
              {(message as any).attachments && (message as any).attachments.length > 0 && (
                <MessageAttachments attachments={(message as any).attachments} />
              )}

              {/* Debug: Log message structure */}
              {(() => {
                if ((message as any).attachments?.length > 0) {
                  logger.core.debug('Rendering message with attachments', {
                    messageId: message.id,
                    role: message.role,
                    attachmentCount: (message as any).attachments.length,
                    attachments: (message as any).attachments,
                    partsCount: message.parts?.length || 0,
                  });
                }
                return null;
              })()}

              {/* Render all reasoning parts as a single component */}
              {(() => {
                const reasoningParts = message.parts?.filter((p: any) => p?.type === 'data-reasoning') || [];

                if (reasoningParts.length > 0) {
                  // Combine all reasoning text from multiple blocks
                  // Filter out empty strings and empty objects like "{}"
                  const combinedReasoning = reasoningParts
                    .map((p: any) => p.data?.text || '')
                    .filter(text => {
                      // Skip empty strings, whitespace-only, and empty object representations
                      const trimmed = text.trim();
                      return trimmed.length > 0 && trimmed !== '{}' && trimmed !== '[]';
                    })
                    .join('\n\n---\n\n'); // Separate multiple reasoning blocks with a divider

                  // Only show reasoning component if there's actual content
                  if (combinedReasoning && combinedReasoning.trim().length > 0) {
                    return (
                      <Reasoning
                        key={`${message.id}-reasoning`}
                        className="w-full"
                        isStreaming={isStreaming}
                      >
                        <ReasoningTrigger />
                        <ReasoningContent>
                          {combinedReasoning}
                        </ReasoningContent>
                      </Reasoning>
                    );
                  }
                }
                return null;
              })()}

              {message.parts?.map((part: any, i: number) => {
                try {
                  // Skip reasoning parts (already rendered above)
                  if (part?.type === 'data-reasoning') {
                    return null;
                  }

                  // Text content
                  if (part?.type === 'text' && part?.text) {
                    const trimmedText = part.text.trim();

                    // Filter out empty JSON objects/arrays that some models emit
                    // (e.g., Gemini 3 with thinkingConfig outputs "{}" as text)
                    if (trimmedText === '{}' || trimmedText === '[]') {
                      logger.aiSdk.debug('🚫 Skipping empty JSON text part', {
                        messageId: message.id,
                        partIndex: i,
                        content: trimmedText,
                      });
                      return null;
                    }

                    // Debug: Log text parts that look like JSON (potential tool echo)
                    if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
                      logger.aiSdk.debug('🔍 Rendering text part that looks like JSON', {
                        messageId: message.id,
                        partIndex: i,
                        preview: trimmedText.substring(0, 200),
                        length: trimmedText.length,
                      });
                    }

                    return (
                      <Response key={`${message.id}-${i}`}>
                        {part.text}
                      </Response>
                    );
                  }

                  // Tool calls (MCP)
                  if (part?.type?.startsWith('tool-')) {
                    // Hide internal housekeeping tools from the UI
                    if (isToolHidden(part.type)) return null;

                    // Si está esperando aprobación, mostrar UI de aprobación
                    if (part.state === 'approval-requested' && addToolApprovalResponse) {
                      const toolName = part.toolName || part.type.replace(/^tool-/, '');
                      const serverId = toolName.includes('_') ? toolName.split('_')[0] : 'unknown';

                      // Si el servidor está auto-aprobado, aprobar automáticamente
                      if (isServerAutoApproved?.(serverId)) {
                        queueMicrotask(() => {
                          addToolApprovalResponse({
                            id: part.approval?.id || part.toolCallId,
                            approved: true,
                          });
                        });

                        return (
                          <div key={`${message.id}-${i}`} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Check className="w-4 h-4 text-green-500" />
                            <span>Auto-approved: {toolName.split('_').slice(1).join('_')}</span>
                            <Badge variant="outline" className="text-xs">{serverId}</Badge>
                          </div>
                        );
                      }

                      return (
                        <ToolApprovalInline
                          key={`${message.id}-${i}`}
                          toolName={toolName}
                          input={part.input || {}}
                          approvalId={part.approval?.id || part.toolCallId}
                          onApprove={() => {
                            addToolApprovalResponse({
                              id: part.approval?.id || part.toolCallId,
                              approved: true,
                            });
                          }}
                          onDeny={() => {
                            addToolApprovalResponse({
                              id: part.approval?.id || part.toolCallId,
                              approved: false,
                            });
                          }}
                          onApproveForSession={onApproveServerForSession}
                        />
                      );
                    }

                    return (
                      <ToolCallPart
                        key={`${message.id}-${i}`}
                        part={part}
                        partIndex={i}
                        messageId={message.id}
                        onPrompt={onPrompt}
                        onSendMessage={onSendMessage}
                        chatMessages={chatMessages}
                      />
                    );
                  }

                  // Check for standalone UI resource parts (data parts)
                  if (part?.value?.type === 'ui-resource' && part?.value?.resource) {
                    const standaloneWidgets = getWidgetTabsFromPart(part, message.id, i);

                    return (
                      <div key={`${message.id}-${i}`} className="my-2 space-y-2">
                        {standaloneWidgets.map((widget) => (
                          <WidgetPlaceholder
                            key={widget.id}
                            widget={widget}
                          />
                        ))}
                      </div>
                    );
                  }

                  return null;
                } catch (error) {
                  console.error('[ChatMessageItem] Error rendering part:', error, {
                    messageId: message.id,
                    partIndex: i,
                    part,
                  });
                  return null;
                }
              })}

            </>
          )}
        </MessageContent>
      </Message>

      {/* Presented files card — shown at end of message, only after streaming completes */}
      {isAssistant && !isStreaming && collectedPresentedFiles.length > 0 && (
        <div className="mt-2 w-full">
          <PresentedFilesCard files={collectedPresentedFiles as any} />
        </div>
      )}

      {/* Action buttons - appears below message on hover, outside the message container */}
      {isUser && !isStreaming && !isEditing && (
        <div className="flex justify-end gap-1 -mt-5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              isCopied
                ? "text-green-500"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title={isCopied ? "Copied!" : "Copy to clipboard"}
          >
            {isCopied ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            )}
          </button>
          {onEditMessage && (
            <button
              onClick={handleStartEdit}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Edit message"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface ToolCallPartProps {
  part: any;
  partIndex: number;
  messageId: string;
  onPrompt: (prompt: string) => void;
  onSendMessage?: (text: string) => void;
  chatMessages?: UIMessage[];
}

function ToolCallPart({ part, partIndex, messageId, onPrompt, onSendMessage, chatMessages }: ToolCallPartProps) {
  // Extract tool name from type if toolName field is not available
  // During streaming, AI SDK v5 doesn't include toolName field
  // Format: "tool-{toolName}" -> extract toolName
  const toolName = part.toolName || part.type.replace(/^tool-/, '');

  // Map part states to ToolCall status
  let status: 'pending' | 'running' | 'success' | 'error' = 'pending';
  if (part.state === 'input-start') {
    status = 'pending';
  } else if (part.state === 'input-available') {
    status = 'running';
  } else if (part.state === 'output-available') {
    status = 'success';
  } else if (part.state === 'output-error') {
    status = 'error';
  }

  const toolCall = {
    id: part.toolCallId,
    name: toolName,
    arguments: part.input || {},
    result: part.state === 'output-available' ? {
      success: true,
      content: part.output, // Keep original type (object or string)
    } : part.state === 'output-error' ? {
      success: false,
      error: part.errorText,
    } : undefined,
    status,
  };

  // Extract widget descriptors from tool output
  const widgets = getWidgetTabsFromPart(part, messageId, partIndex);

  // Inline diff rendering for write/edit tools
  const normalizedToolName = toolName.trim().toLowerCase();
  const isDiffTool = normalizedToolName === 'write' || normalizedToolName === 'edit';
  const diffContent = isDiffTool && toolCall.result?.success && toolCall.result.content
    ? (typeof toolCall.result.content === 'object' && toolCall.result.content !== null
        ? (toolCall.result.content as Record<string, unknown>)
        : null)
    : null;
  const diffText = typeof diffContent?.diff === 'string' ? diffContent.diff : '';
  const linesAdded = typeof diffContent?.linesAdded === 'number' ? diffContent.linesAdded : null;
  const linesRemoved = typeof diffContent?.linesRemoved === 'number' ? diffContent.linesRemoved : null;
  const pathValue = typeof diffContent?.path === 'string'
    ? diffContent.path
    : typeof toolCall.arguments?.file_path === 'string' ? toolCall.arguments.file_path : '';
  const hasRealChanges = (linesAdded !== null && linesRemoved !== null)
    ? (linesAdded > 0 || linesRemoved > 0)
    : /(^|\n)@@ /.test(diffText);
  const showInlineDiff = isDiffTool && diffText.trim().length > 0 && hasRealChanges;
  const shortPath = pathValue ? pathValue.split(/[/\\]/).slice(-2).join('/') : '';

  return (
    <div className="w-full">
      <ToolCall
        toolCall={toolCall}
        className="w-full"
      />
      {showInlineDiff && (
        <Collapsible defaultOpen={false} className="mt-1">
          <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors group">
            <ChevronRight className="w-3.5 h-3.5 transition-transform group-data-[state=open]:rotate-90 shrink-0" />
            {shortPath && (
              <span className="font-mono truncate">{shortPath}</span>
            )}
            {linesAdded !== null && linesAdded > 0 && (
              <span className="text-green-600 dark:text-green-400 font-medium shrink-0">+{linesAdded}</span>
            )}
            {linesRemoved !== null && linesRemoved > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium shrink-0">-{linesRemoved}</span>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            <DiffViewer diff={diffText} />
          </CollapsibleContent>
        </Collapsible>
      )}
      {widgets.length > 0 && (
        <div className="my-2 space-y-2">
          {widgets.map((widget) => (
            <WidgetPlaceholder
              key={widget.id}
              widget={widget}
            />
          ))}
        </div>
      )}
    </div>
  );
}
