import type { Message } from '../../../types/database';
import type { ElectronMessage } from '@/hooks/useElectronChat';

/**
 * Convert DB Message to ElectronMessage format
 */
export function convertToElectronMessage(dbMessage: Message): ElectronMessage {
  const parts: Array<{
    type: 'text' | 'source-url' | 'reasoning' | 'tool-call'
    text?: string
    url?: string
    toolCall?: {
      id: string
      name: string
      arguments: Record<string, any>
      result?: {
        success: boolean
        content?: string
        error?: string
      }
      status: 'pending' | 'running' | 'success' | 'error'
      serverId?: string
      timestamp?: number
    }
  }> = [];

  // Add text content
  if (dbMessage.content) {
    parts.push({ type: 'text', text: dbMessage.content });
  }

  // Process tool calls from database
  if (dbMessage.tool_calls) {
    try {
      const toolCalls = JSON.parse(dbMessage.tool_calls);
      if (Array.isArray(toolCalls)) {
        toolCalls.forEach((toolCall) => {
          parts.push({
            type: 'tool-call',
            toolCall: {
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments || {},
              result: toolCall.result,
              status: toolCall.status || 'success',
              serverId: toolCall.serverId,
              timestamp: toolCall.timestamp
            }
          });
        });
      }
    } catch (error) {
      console.error('[convertToElectronMessage] Failed to parse tool_calls JSON:', error);
    }
  }

  return {
    id: dbMessage.id,
    role: dbMessage.role,
    content: dbMessage.content,
    parts
  };
}
