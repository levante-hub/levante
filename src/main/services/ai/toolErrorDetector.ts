import { getLogger } from '../logging';

const logger = getLogger();

/**
 * Detects if an error is related to the model not supporting tool use
 * Handles multiple error formats from different AI providers
 */
export function isToolUseNotSupportedError(error: unknown): boolean {
  if (!error) return false;

  // Patterns that indicate tool/function calling is not supported
  const toolUseErrorPatterns = [
    // OpenRouter
    'no endpoints found that support tool use',
    'tool use is not supported',
    'tools are not supported',
    'does not support tool',
    'tool calling is not supported',
    // OpenAI / Anthropic
    'function calling is not supported',
    'functions are not supported',
    'does not support function calling',
    // Generic patterns
    'tool_choice is not supported',
    'tools parameter is not supported',
    'model does not support tools',
    'model does not support functions',
  ];

  // Check error message (Error object)
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (toolUseErrorPatterns.some(pattern => message.includes(pattern))) {
      return true;
    }
  }

  // Check structured error data (from AI SDK APICallError)
  if (error && typeof error === 'object') {
    const statusCode = (error as any).statusCode;
    const errorData = (error as any).data;
    const responseBody = (error as any).responseBody;

    // Check if there's an error message in the data
    const nestedMessage = errorData?.error?.message;
    if (nestedMessage && typeof nestedMessage === 'string') {
      const msg = nestedMessage.toLowerCase();
      if (toolUseErrorPatterns.some(pattern => msg.includes(pattern))) {
        return true;
      }
    }

    // Check response body for error messages
    if (typeof responseBody === 'string') {
      const body = responseBody.toLowerCase();
      if (toolUseErrorPatterns.some(pattern => body.includes(pattern))) {
        return true;
      }
    }

    // Status code hints (4xx errors related to invalid parameters)
    // Combined with message patterns above for more accuracy
    if (statusCode === 404 || statusCode === 400) {
      // Already checked messages above, just log for debugging
      logger.aiSdk.debug('Received 4xx error with tools enabled', {
        statusCode,
        hasErrorMessage: !!nestedMessage
      });
    }
  }

  return false;
}
