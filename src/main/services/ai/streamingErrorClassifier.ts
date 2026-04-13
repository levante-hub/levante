import { getLogger } from '../logging';

const logger = getLogger();

export type StreamingErrorCategory =
  | 'insufficient_balance'
  | 'rate_limit'
  | 'quota_exceeded'
  | 'unauthorized'
  | 'model_not_available'
  | 'context_too_long'
  | 'unknown';

export interface ClassifiedStreamingError {
  category: StreamingErrorCategory;
  originalMessage: string;
}

const ERROR_PATTERNS: Array<{ category: StreamingErrorCategory; patterns: string[]; statusCodes?: number[] }> = [
  {
    category: 'insufficient_balance',
    patterns: [
      'insufficient balance',
      'insufficient credits',
      'insufficient funds',
      'payment required',
      'out of credits',
      'no credits',
      'credit balance',
    ],
    statusCodes: [402],
  },
  {
    category: 'rate_limit',
    patterns: [
      'rate limit',
      'too many requests',
      'ratelimit',
      'rate_limit',
    ],
    statusCodes: [429],
  },
  {
    category: 'quota_exceeded',
    patterns: [
      'quota exceeded',
      'quota limit',
      'usage limit',
    ],
  },
  {
    category: 'unauthorized',
    patterns: [
      'unauthorized',
      'invalid token',
      'invalid api key',
      'session expired',
      'authentication failed',
      'invalid credentials',
    ],
    statusCodes: [401],
  },
  {
    category: 'model_not_available',
    patterns: [
      'model not found',
      'model not available',
      'no such model',
      'model does not exist',
    ],
    statusCodes: [404],
  },
  {
    category: 'context_too_long',
    patterns: [
      'maximum context length',
      'context length',
      'context window',
      'prompt is too long',
      'prompt too long',
      'input tokens exceed',
      'input is too long',
      'requested too many tokens',
      'tokens exceed',
      'too many tokens',
      'request too large',
      'request entity too large',
      'payload size exceeds',
      'content length exceeds',
      'conversation too long',
    ],
    statusCodes: [413],
  },
];

/**
 * Classifies a streaming error into a known category.
 * Inspects error message, statusCode, data, and responseBody (AI SDK APICallError fields).
 */
export function classifyStreamingError(error: unknown): ClassifiedStreamingError {
  const originalMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error occurred';

  if (!error) {
    return { category: 'unknown', originalMessage };
  }

  const statusCode = (error as any)?.statusCode as number | undefined;
  const nestedMessage: string | undefined =
    (error as any)?.data?.error?.message ||
    (error as any)?.data?.message;
  const responseBody: string | undefined =
    typeof (error as any)?.responseBody === 'string'
      ? (error as any).responseBody
      : undefined;

  const textSources = [
    originalMessage,
    nestedMessage,
    responseBody,
  ].filter(Boolean) as string[];

  for (const { category, patterns, statusCodes } of ERROR_PATTERNS) {
    // Check status code match
    if (statusCodes && statusCode && statusCodes.includes(statusCode)) {
      logger.aiSdk.debug('Classified streaming error by status code', { category, statusCode });
      return { category, originalMessage };
    }

    // Check text patterns
    for (const text of textSources) {
      const lower = text.toLowerCase();
      if (patterns.some(p => lower.includes(p))) {
        logger.aiSdk.debug('Classified streaming error by pattern', { category, pattern: text.substring(0, 80) });
        return { category, originalMessage };
      }
    }
  }

  return { category: 'unknown', originalMessage };
}
