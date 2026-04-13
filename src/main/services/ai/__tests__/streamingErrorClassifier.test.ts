import { describe, it, expect } from 'vitest';
import { classifyStreamingError } from '../streamingErrorClassifier';

describe('classifyStreamingError – context_too_long', () => {
  it('classifies OpenAI maximum context length error', () => {
    const error = new Error(
      "This model's maximum context length is 128000 tokens. However, you requested 150000 tokens"
    );
    const result = classifyStreamingError(error);
    expect(result.category).toBe('context_too_long');
  });

  it('classifies Anthropic prompt too long error', () => {
    const error = new Error(
      'The prompt is too long. Please reduce the number of messages.'
    );
    const result = classifyStreamingError(error);
    expect(result.category).toBe('context_too_long');
  });

  it('classifies HTTP 413 as context_too_long', () => {
    const error = Object.assign(new Error('Request entity too large'), {
      statusCode: 413,
    });
    const result = classifyStreamingError(error);
    expect(result.category).toBe('context_too_long');
  });

  it('classifies HTTP 400 with context-related message as context_too_long', () => {
    const error = Object.assign(new Error('maximum context length exceeded'), {
      statusCode: 400,
    });
    const result = classifyStreamingError(error);
    expect(result.category).toBe('context_too_long');
  });

  it('does NOT false-positive on HTTP 400 with unrelated message', () => {
    const error = Object.assign(new Error('Invalid request body'), {
      statusCode: 400,
    });
    const result = classifyStreamingError(error);
    expect(result.category).not.toBe('context_too_long');
  });

  it('classifies "tokens exceed" pattern', () => {
    const error = new Error('input tokens exceed the maximum allowed');
    const result = classifyStreamingError(error);
    expect(result.category).toBe('context_too_long');
  });

  it('classifies "conversation too long" pattern', () => {
    const error = new Error('conversation too long');
    const result = classifyStreamingError(error);
    expect(result.category).toBe('context_too_long');
  });

  it('classifies via nested data.error.message', () => {
    const error = {
      message: 'API error',
      data: {
        error: {
          message: "This model's maximum context length is 128000 tokens",
        },
      },
    };
    const result = classifyStreamingError(error);
    expect(result.category).toBe('context_too_long');
  });

  it('classifies via responseBody', () => {
    const error = Object.assign(new Error('Bad request'), {
      responseBody: '{"error": "prompt is too long for this model"}',
    });
    const result = classifyStreamingError(error);
    expect(result.category).toBe('context_too_long');
  });
});
