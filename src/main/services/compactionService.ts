import type { UIMessage } from 'ai';
import type { Message } from '../../types/database';
import { chatService } from './chatService';
import { getLogger } from './logging';
import { classifyStreamingError } from './ai/streamingErrorClassifier';

const COMPACTION_MARKER = '[COMPACTION_SUMMARY]';
const CHARS_PER_TOKEN = 4;

export interface CompactInput {
  sessionId: string;
  model: string;
}

export interface CompactResult {
  success: boolean;
  summaryMessageId?: string;
  stage?: number;
  error?: string;
  errorCategory?: string;
  exhaustedStages?: boolean;
}

export interface CompactionStage {
  stage: number;
  toolCallTokenLimit: number | null;
  contentMaxChars: number | null;
  reasoningMaxChars: number | null;
  messagePercentage: number;
}

export const COMPACTION_STAGES: CompactionStage[] = [
  { stage: 1, toolCallTokenLimit: 500,  contentMaxChars: null,  reasoningMaxChars: 1200, messagePercentage: 1.0  },
  { stage: 2, toolCallTokenLimit: 100,  contentMaxChars: 2000,  reasoningMaxChars: 600,  messagePercentage: 1.0  },
  { stage: 3, toolCallTokenLimit: null, contentMaxChars: 600,   reasoningMaxChars: 300,  messagePercentage: 1.0  },
  { stage: 4, toolCallTokenLimit: null, contentMaxChars: 300,   reasoningMaxChars: null, messagePercentage: 0.5  },
  { stage: 5, toolCallTokenLimit: null, contentMaxChars: 200,   reasoningMaxChars: null, messagePercentage: 0.25 },
];

export class CompactionService {
  private logger = getLogger();

  private estimateTokens(text: string): number {
    return Math.max(0, Math.round((text || '').length / CHARS_PER_TOKEN));
  }

  truncateContent(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;

    const headSize = Math.floor(maxChars * 0.66);
    const tailSize = maxChars - headSize;
    const truncated = content.length - maxChars;

    const head = content.slice(0, headSize);
    const tail = content.slice(content.length - tailSize);

    return `${head}\n[... ${truncated} characters truncated ...]\n${tail}`;
  }

  isCompactionSummaryMessage(message: Message): boolean {
    return (
      message.role === 'system' &&
      typeof message.content === 'string' &&
      message.content.startsWith(COMPACTION_MARKER)
    );
  }

  applyStage(messages: Message[], stage: CompactionStage): Message[] {
    // 1. Detect anchor
    let anchorMessage: Message | null = null;
    let rest: Message[];

    if (messages.length > 0 && this.isCompactionSummaryMessage(messages[0])) {
      anchorMessage = messages[0];
      rest = messages.slice(1);
    } else {
      rest = [...messages];
    }

    // 2. Apply messagePercentage to rest
    if (stage.messagePercentage < 1.0) {
      const targetCount = Math.max(
        anchorMessage ? 1 : 2,
        Math.ceil(rest.length * stage.messagePercentage),
      );
      // Keep the last N messages (most recent)
      rest = rest.slice(rest.length - targetCount);
    }

    // 3. Guarantee minimums
    if (anchorMessage && rest.length === 0 && messages.length > 1) {
      rest = [messages[messages.length - 1]];
    }
    if (!anchorMessage && rest.length < 2 && messages.length >= 2) {
      rest = messages.slice(messages.length - 2);
    }

    // 4. Apply reduction to each message
    const reduced = rest.map((m) => this.reduceMessage(m, stage));

    // 5. Rebuild with anchor
    if (anchorMessage) {
      return [anchorMessage, ...reduced];
    }
    return reduced;
  }

  private reduceMessage(message: Message, stage: CompactionStage): Message {
    const result = { ...message };

    // tool_calls reduction
    if (result.tool_calls) {
      if (stage.toolCallTokenLimit === null) {
        result.tool_calls = undefined;
      } else {
        const toolTokens = this.estimateTokens(result.tool_calls);
        if (toolTokens > stage.toolCallTokenLimit) {
          result.tool_calls = JSON.stringify([{ summary: `[Tool output truncated: ~${toolTokens} tokens]` }]);
        }
      }
    }

    // content reduction
    if (result.content && stage.contentMaxChars !== null) {
      result.content = this.truncateContent(result.content, stage.contentMaxChars);
    }

    // reasoningText reduction
    if (stage.reasoningMaxChars === null) {
      result.reasoningText = undefined;
    } else if (result.reasoningText && result.reasoningText.length > stage.reasoningMaxChars) {
      result.reasoningText = this.truncateContent(result.reasoningText, stage.reasoningMaxChars);
    }

    return result;
  }

  private isContextTooLongError(error: unknown): boolean {
    const { category } = classifyStreamingError(error);
    return category === 'context_too_long';
  }

  private serializeMessage(message: Message): string {
    const isSummary =
      message.role === 'system' &&
      typeof message.content === 'string' &&
      message.content.startsWith(COMPACTION_MARKER);

    const baseContent = isSummary
      ? `PREVIOUS_SUMMARY:\n${message.content.replace(COMPACTION_MARKER, '').trim()}`
      : message.content;

    const toolPart = message.tool_calls ? `\n\n[TOOL_CALLS]\n${message.tool_calls}` : '';
    const reasoningPart = message.reasoningText ? `\n\n[REASONING]\n${message.reasoningText}` : '';

    return `[${message.role.toUpperCase()}] ${baseContent}${toolPart}${reasoningPart}`;
  }

  private buildSummaryPrompt(): string {
    return `Create a compact but actionable summary to continue the conversation safely.

Format exactly:

## Goal
- ...

## Constraints
- ...

## Decisions
- ...

## Key Context
- ...

## Pending Work
- ...

## Active Files / Topics
- ...

Rules:
- Keep critical technical details.
- Keep unresolved questions.
- Do not invent facts.
- If context was truncated, mention that clearly.`;
  }

  private async generateSummary(input: { messages: Message[]; model: string }): Promise<string> {
    const { AIService } = await import('./aiService');
    const aiService = new AIService();

    const conversationText = input.messages.map((m) => this.serializeMessage(m)).join('\n\n');
    const prompt = this.buildSummaryPrompt();

    const message: UIMessage = {
      id: `compaction-${Date.now()}`,
      role: 'user',
      parts: [
        {
          type: 'text',
          text: `${conversationText}\n\n---\n\n${prompt}`,
        } as any,
      ],
    };

    const result = await aiService.sendSingleMessage({
      messages: [message],
      model: input.model,
      webSearch: false,
      enableMCP: false,
    });

    return result.response.trim();
  }

  async compact(input: CompactInput): Promise<CompactResult> {
    this.logger.aiSdk.info('Manual compaction started', {
      sessionId: input.sessionId,
      model: input.model,
    });

    try {
      const contextResult = await chatService.getMessagesForContext(input.sessionId);
      if (!contextResult.success) {
        return {
          success: false,
          error: contextResult.error || 'Failed to load conversation context',
        };
      }

      const contextMessages = contextResult.data;
      if (!contextMessages || contextMessages.length === 0) {
        return { success: false, error: 'No messages to compact' };
      }

      for (const stageConfig of COMPACTION_STAGES) {
        this.logger.aiSdk.info('Attempting compaction stage', {
          sessionId: input.sessionId,
          stage: stageConfig.stage,
        });

        const prepared = this.applyStage(contextMessages, stageConfig);

        try {
          const summary = await this.generateSummary({
            messages: prepared,
            model: input.model,
          });

          const saved = await chatService.createMessage({
            session_id: input.sessionId,
            role: 'system',
            content: `${COMPACTION_MARKER}\n\n${summary}`,
          });

          if (!saved.success) {
            return {
              success: false,
              error: saved.error || 'Failed to persist compaction summary',
            };
          }

          this.logger.aiSdk.info('Manual compaction completed', {
            sessionId: input.sessionId,
            stage: stageConfig.stage,
            sourceMessages: contextMessages.length,
            sentToSummarizer: prepared.length,
            summaryLength: summary.length,
          });

          return {
            success: true,
            summaryMessageId: saved.data?.id,
            stage: stageConfig.stage,
          };
        } catch (error) {
          if (this.isContextTooLongError(error)) {
            this.logger.aiSdk.warn('Compaction stage failed with context_too_long, trying next stage', {
              sessionId: input.sessionId,
              stage: stageConfig.stage,
            });
            continue;
          }

          // Non-retryable error — abort immediately
          const classified = classifyStreamingError(error);
          this.logger.aiSdk.error('Compaction failed with non-retryable error', {
            sessionId: input.sessionId,
            stage: stageConfig.stage,
            errorCategory: classified.category,
            error: classified.originalMessage,
          });

          return {
            success: false,
            error: classified.originalMessage,
            errorCategory: classified.category,
            exhaustedStages: false,
          };
        }
      }

      // All stages exhausted
      this.logger.aiSdk.error('Compaction failed after all reduction stages', {
        sessionId: input.sessionId,
      });

      return {
        success: false,
        error: 'Compaction failed after all reduction stages',
        errorCategory: 'context_too_long',
        exhaustedStages: true,
      };
    } catch (error) {
      this.logger.aiSdk.error('Manual compaction failed', {
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : error,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const compactionService = new CompactionService();
