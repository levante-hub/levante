/**
 * Mini Chat Rich Message
 *
 * Adapts mini-chat messages for rich content rendering using existing Response component.
 * Handles markdown, code blocks, mermaid diagrams, and tool calls in a compact format.
 */

import React from 'react';
import { type UIMessage } from '@ai-sdk/react';
import { Response } from '@/components/ai-elements/response';
import { Wrench, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isToolHidden } from '@/constants/hiddenTools';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

interface MiniChatRichMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
}

/**
 * Helper function to extract text content from UIMessage parts (AI SDK v5)
 */
function getMessageContent(message: UIMessage): string {
  if (!message.parts) return '';
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('');
}

// Note: These interfaces are for documentation only
// Actual parts from AI SDK v5 have different structure
// Tool parts have type like 'tool-${toolName}' with toolCallId and state properties

// ═══════════════════════════════════════════════════════
// SIMPLIFIED TOOL CALL COMPONENT
// ═══════════════════════════════════════════════════════

const statusIcons = {
  pending: { icon: Clock, label: '⏳', className: 'text-muted-foreground' },
  running: { icon: Clock, label: '⚙️', className: 'text-muted-foreground animate-pulse' },
  success: { icon: CheckCircle2, label: '✅', className: 'text-green-600 dark:text-green-400' },
  error: { icon: XCircle, label: '❌', className: 'text-red-600 dark:text-red-400' },
};

function MiniChatToolCall({
  toolName,
  status = 'success',
  onClick,
  disabled = false
}: {
  toolName: string;
  status?: 'pending' | 'running' | 'success' | 'error';
  onClick?: () => void;
  disabled?: boolean;
}) {
  const statusInfo = statusIcons[status];

  return (
    <div
      className="mini-chat-tool-call"
      onClick={disabled ? undefined : onClick}
      role={onClick && !disabled ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={(e) => {
        if (!disabled && onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        cursor: onClick && !disabled ? 'pointer' : 'default',
        opacity: disabled ? 0.5 : 1
      }}
    >
      <Wrench className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="font-medium text-xs">{toolName}</span>
      <span className="ml-auto">{statusInfo.label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════

/**
 * Renders assistant messages with rich content support.
 * Falls back to simple content rendering if parts are unavailable.
 */
export function MiniChatRichMessage({ message, isStreaming }: MiniChatRichMessageProps) {
  const { parts } = message;
  const content = getMessageContent(message);

  // Filter out empty JSON objects/arrays from parts
  const isEmptyJSON = (part: any): boolean => {
    if (!part || typeof part !== 'object') return false;
    const str = JSON.stringify(part);
    return str === '{}' || str === '[]';
  };

  // Handler to open conversation in main window
  const handleOpenInMain = async () => {
    try {
      // Get mini-chat store state
      const miniChatStore = await import('@/stores/miniChatStore');
      const { selectedModel, currentSessionId } = miniChatStore.useMiniChatStore.getState();

      if (!currentSessionId) {
        return;
      }

      // Call IPC to transfer conversation
      const result = await window.levante.miniChat.openInMainWindow({
        messages: [], // Empty - not needed anymore
        model: selectedModel,
        sessionId: currentSessionId,
      });

      if (!result.success) {
        console.error('Failed to open in main window:', result.error);
      }
    } catch (error) {
      console.error('Error opening in main window:', error);
    }
  };

  // If no parts or only empty parts, fall back to simple content rendering
  if (!parts || parts.length === 0 || parts.every(isEmptyJSON)) {
    return (
      <div className="mini-chat-message-content mini-chat-response">
        <Response>{content}</Response>
        {isStreaming && <span className="mini-chat-cursor">▊</span>}
      </div>
    );
  }

  // Render parts with appropriate components
  try {
    return (
      <div className="mini-chat-message-content mini-chat-response">
        {parts.map((part, index) => {
          try {
            // Skip empty JSON objects
            if (isEmptyJSON(part)) {
              return null;
            }

            // Validate that part is an object before accessing properties
            if (!part || typeof part !== 'object') {
              return null;
            }

        // Text part - use Response component for rich markdown
        if (part.type === 'text' && part.text) {
          return (
            <Response key={`text-${index}`}>
              {part.text}
            </Response>
          );
        }

        // Tool call part - clickeable to open in main window
        // In AI SDK v5, tool parts have type like 'tool-${toolName}'
        if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
          // Hide internal housekeeping tools from the UI
          if (isToolHidden(part.type)) return null;

          const toolName = part.type.replace('tool-', '');
          const toolState = (part as any).state;

          // Determine status based on state
          let status: 'pending' | 'running' | 'success' | 'error' = 'running';
          if (toolState === 'output-available' || toolState === 'output-streaming') {
            status = 'success';
          } else if (toolState === 'error' || toolState === 'output-denied') {
            status = 'error';
          } else if (toolState === 'input-streaming') {
            status = 'running';
          }

          return (
            <MiniChatToolCall
              key={`tool-${index}`}
              toolName={toolName}
              status={status}
              onClick={handleOpenInMain}
              disabled={isStreaming}
            />
          );
        }

            // Unknown part type - skip
            return null;
          } catch (partError) {
            console.error(`[MiniChatRichMessage] Error rendering part ${index}:`, {
              error: partError,
              errorMessage: partError instanceof Error ? partError.message : String(partError),
              errorStack: partError instanceof Error ? partError.stack : undefined,
              partType: typeof part,
              partValue: part
            });
            return null;
          }
        })}

        {isStreaming && <span className="mini-chat-cursor">▊</span>}
      </div>
    );
  } catch (error) {
    console.error('[MiniChatRichMessage] Error rendering parts:', {
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      message: message,
      parts: parts
    });
    // Fallback to simple rendering
    return (
      <div className="mini-chat-message-content mini-chat-response">
        <Response>{content}</Response>
        {isStreaming && <span className="mini-chat-cursor">▊</span>}
      </div>
    );
  }
}
