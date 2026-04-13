import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from '../../../types/database';
import { CompactionService, COMPACTION_STAGES } from '../compactionService';

// Mock dependencies
vi.mock('../chatService', () => ({
  chatService: {
    getMessagesForContext: vi.fn(),
    createMessage: vi.fn(),
  },
}));

vi.mock('../logging', () => ({
  getLogger: () => ({
    aiSdk: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }),
}));

vi.mock('../ai/streamingErrorClassifier', () => ({
  classifyStreamingError: vi.fn((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('context_too_long')) {
      return { category: 'context_too_long', originalMessage: msg };
    }
    if (msg.includes('unauthorized')) {
      return { category: 'unauthorized', originalMessage: msg };
    }
    return { category: 'unknown', originalMessage: msg };
  }),
}));

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id || `msg-${Math.random().toString(36).slice(2)}`,
    session_id: 'session-1',
    role: overrides.role || 'user',
    content: overrides.content || 'Hello world',
    tool_calls: overrides.tool_calls,
    reasoningText: overrides.reasoningText,
    created_at: new Date().toISOString(),
    ...overrides,
  } as Message;
}

function makeAnchorMessage(): Message {
  return makeMessage({
    id: 'anchor-1',
    role: 'system',
    content: '[COMPACTION_SUMMARY]\n\nPrevious summary content here.',
  });
}

describe('CompactionService', () => {
  let service: CompactionService;

  beforeEach(() => {
    service = new CompactionService();
    vi.clearAllMocks();
  });

  describe('truncateContent', () => {
    it('returns content unchanged if within limit', () => {
      expect(service.truncateContent('short', 100)).toBe('short');
    });

    it('truncates with head+tail when exceeding limit', () => {
      const content = 'a'.repeat(200);
      const result = service.truncateContent(content, 100);
      expect(result).toContain('[... 100 characters truncated ...]');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('isCompactionSummaryMessage', () => {
    it('returns true for a compaction summary message', () => {
      expect(service.isCompactionSummaryMessage(makeAnchorMessage())).toBe(true);
    });

    it('returns false for a regular message', () => {
      expect(service.isCompactionSummaryMessage(makeMessage())).toBe(false);
    });
  });

  describe('applyStage', () => {
    it('stage 1: keeps all messages and truncates large tool_calls', () => {
      const largeToolCalls = JSON.stringify({ data: 'x'.repeat(10000) });
      const messages = [
        makeMessage({ content: 'Hello' }),
        makeMessage({ role: 'assistant', content: 'World', tool_calls: largeToolCalls }),
      ];

      const result = service.applyStage(messages, COMPACTION_STAGES[0]);

      expect(result).toHaveLength(2);
      // tool_calls should be truncated (original is ~10000 chars = ~2500 tokens, limit is 500)
      expect(result[1].tool_calls).toContain('Tool output truncated');
    });

    it('stage 3: eliminates tool_calls entirely', () => {
      const messages = [
        makeMessage({ tool_calls: '{"small": true}' }),
        makeMessage({ role: 'assistant', content: 'Reply' }),
      ];

      const result = service.applyStage(messages, COMPACTION_STAGES[2]);

      expect(result[0].tool_calls).toBeUndefined();
    });

    it('stage 4: eliminates reasoningText', () => {
      const messages = [
        makeMessage({ reasoningText: 'Some reasoning here' }),
        makeMessage({ role: 'assistant', content: 'Reply', reasoningText: 'More reasoning' }),
      ];

      const result = service.applyStage(messages, COMPACTION_STAGES[3]);

      expect(result[0].reasoningText).toBeUndefined();
      expect(result[1].reasoningText).toBeUndefined();
    });

    it('preserves anchor message even with messagePercentage = 0.25', () => {
      const anchor = makeAnchorMessage();
      const messages = [
        anchor,
        makeMessage({ content: 'msg1' }),
        makeMessage({ content: 'msg2' }),
        makeMessage({ content: 'msg3' }),
        makeMessage({ content: 'msg4' }),
      ];

      const result = service.applyStage(messages, COMPACTION_STAGES[4]); // stage 5, 0.25

      expect(result[0]).toBe(anchor);
      expect(result.length).toBeGreaterThanOrEqual(2); // anchor + at least 1
      expect(service.isCompactionSummaryMessage(result[0])).toBe(true);
    });

    it('guarantees anchor + 1 message minimum', () => {
      const anchor = makeAnchorMessage();
      const messages = [anchor, makeMessage({ content: 'only one' })];

      const result = service.applyStage(messages, COMPACTION_STAGES[4]); // stage 5, 0.25

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(anchor);
    });

    it('guarantees minimum 2 messages without anchor', () => {
      const messages = [
        makeMessage({ content: 'msg1' }),
        makeMessage({ content: 'msg2' }),
      ];

      const result = service.applyStage(messages, COMPACTION_STAGES[4]); // stage 5, 0.25

      expect(result).toHaveLength(2);
    });

    it('stage 1: preserves reasoningText within limit', () => {
      const messages = [
        makeMessage({ reasoningText: 'Short reasoning' }),
      ];

      const result = service.applyStage(messages, COMPACTION_STAGES[0]); // reasoningMaxChars: 1200

      expect(result[0].reasoningText).toBe('Short reasoning');
    });

    it('stage 2: truncates reasoningText exceeding limit', () => {
      const longReasoning = 'r'.repeat(2000);
      const messages = [makeMessage({ reasoningText: longReasoning })];

      const result = service.applyStage(messages, COMPACTION_STAGES[1]); // reasoningMaxChars: 600

      expect(result[0].reasoningText!.length).toBeLessThan(longReasoning.length);
      expect(result[0].reasoningText).toContain('characters truncated');
    });
  });

  describe('compact – staged retry', () => {
    let chatService: any;

    beforeEach(async () => {
      const chatMod = await import('../chatService');
      chatService = chatMod.chatService;
    });

    it('retries through stages on context_too_long and succeeds at stage 3', async () => {
      chatService.getMessagesForContext.mockResolvedValue({
        success: true,
        data: [makeMessage(), makeMessage({ role: 'assistant', content: 'Reply' })],
      });
      chatService.createMessage.mockResolvedValue({
        success: true,
        data: { id: 'summary-1' },
      });

      let callCount = 0;
      const generateSpy = vi.spyOn(service as any, 'generateSummary').mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('context_too_long: prompt exceeds limit');
        }
        return 'Compacted summary';
      });

      const result = await service.compact({ sessionId: 'sess-1', model: 'test-model' });

      expect(result.success).toBe(true);
      expect(result.stage).toBe(3);
      expect(generateSpy).toHaveBeenCalledTimes(3);
    });

    it('returns exhaustedStages when all stages fail with context_too_long', async () => {
      chatService.getMessagesForContext.mockResolvedValue({
        success: true,
        data: [makeMessage(), makeMessage({ role: 'assistant', content: 'Reply' })],
      });

      vi.spyOn(service as any, 'generateSummary').mockRejectedValue(
        new Error('context_too_long: prompt exceeds limit')
      );

      const result = await service.compact({ sessionId: 'sess-1', model: 'test-model' });

      expect(result.success).toBe(false);
      expect(result.errorCategory).toBe('context_too_long');
      expect(result.exhaustedStages).toBe(true);
    });

    it('aborts immediately on non-retryable error without trying next stage', async () => {
      chatService.getMessagesForContext.mockResolvedValue({
        success: true,
        data: [makeMessage(), makeMessage({ role: 'assistant', content: 'Reply' })],
      });

      const generateSpy = vi.spyOn(service as any, 'generateSummary').mockRejectedValue(
        new Error('unauthorized: invalid API key')
      );

      const result = await service.compact({ sessionId: 'sess-1', model: 'test-model' });

      expect(result.success).toBe(false);
      expect(result.errorCategory).toBe('unauthorized');
      expect(result.exhaustedStages).toBe(false);
      expect(generateSpy).toHaveBeenCalledTimes(1);
    });
  });
});
