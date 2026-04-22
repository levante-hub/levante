import { type UIMessage } from 'ai';
import { isCanonicalToolResult } from '../../../shared/canonicalToolResult';
import { stripInlineImagesFromContent } from '../../../shared/toolOutputSanitizer';

/**
 * Sanitize messages for model consumption.
 * Handles known Vercel AI SDK issues:
 * - Issue #8431: Deep clone to avoid object reference issues
 * - Issue #8061: Remove providerExecuted when null
 * - Issue #9731: Remove providerMetadata (except Google's thoughtSignature)
 * - Remove uiResources from tool results (MCP-UI specific)
 * - Normalize incomplete tool states to valid final states for convertToModelMessages
 *
 * IMPORTANT: Google's thoughtSignature MUST be preserved for Gemini 3 tool calling.
 * Without it, multi-turn tool calls fail with "function call is missing a thought_signature".
 */
export function sanitizeMessagesForModel(messages: UIMessage[]): UIMessage[] {
  // Deep clone to avoid reference issues (GitHub Issue #8431)
  // This also cleans circular references and converts to plain objects
  const clonedMessages = JSON.parse(JSON.stringify(messages));

  return clonedMessages.map((message: any) => {
    const parts = message.parts;
    if (!Array.isArray(parts)) return message;

    const sanitizedParts = parts.map((part: any) => {
      if (!part) return part;

      // Handle denied tool approvals → output-denied
      // The SDK's convertToModelMessages already supports output-denied
      // and generates a proper tool_result with error text.
      if (
        part.state === 'approval-responded' &&
        part.approval?.approved === false
      ) {
        part = {
          ...part,
          state: 'output-denied',
          approval: {
            ...part.approval,
            approved: false,
          },
        };
        delete part.output;
        delete part.errorText;
      }

      // Defensive fallback: approval-requested should never reach the backend,
      // but if it does, convert to output-denied to avoid missing tool_result.
      if (part.state === 'approval-requested') {
        part = {
          ...part,
          state: 'output-denied',
          approval: {
            id: part.approval?.id ?? `pending-${part.toolCallId ?? 'unknown'}`,
            approved: false,
            reason:
              part.approval?.reason ??
              'Tool execution did not run because approval was still pending.',
          },
        };
        delete part.output;
        delete part.errorText;
      }

      // Interrupted tools: input-available or input-streaming → output-error
      if (
        part.state === 'input-available' ||
        part.state === 'input-streaming'
      ) {
        part = {
          ...part,
          state: 'output-error',
          errorText:
            'Tool execution was interrupted before producing a result.',
        };
        delete part.output;
      }

      // Remove providerExecuted if null (GitHub Issue #8061)
      // Databases like MongoDB convert undefined to null, causing validation errors
      if ('providerExecuted' in part && part.providerExecuted === null) {
        const { providerExecuted, ...partWithoutProvider } = part;
        part = partWithoutProvider;
      }

      // Handle providerMetadata carefully (GitHub Issue #9731)
      // IMPORTANT: Google's thoughtSignature MUST be preserved for Gemini 3 tool calling
      // Without thoughtSignature, Gemini 3 fails with "function call is missing a thought_signature"
      if ('providerMetadata' in part && part.providerMetadata) {
        const metadata = part.providerMetadata as Record<string, unknown>;
        // Check if this is Google metadata with thoughtSignature - preserve it
        const googleMeta = metadata.google as Record<string, unknown> | undefined;
        const vertexMeta = metadata.vertex as Record<string, unknown> | undefined;
        const hasThoughtSignature = googleMeta?.thoughtSignature || vertexMeta?.thoughtSignature;

        if (hasThoughtSignature) {
          // Keep providerMetadata intact for Gemini 3 thought_signatures
          // The SDK needs this to maintain conversation context for multi-turn tool calls
        } else {
          // For other providers, remove providerMetadata to avoid conversion issues
          const { providerMetadata, ...partWithoutMetadata } = part;
          part = partWithoutMetadata;
        }
      }

      // Tool calls store provider metadata in `callProviderMetadata`.
      // Keep only Gemini thought signatures there; OpenAI response item ids can become
      // invalid in reconstructed histories (e.g. missing linked reasoning items).
      if ('callProviderMetadata' in part && part.callProviderMetadata) {
        const callMetadata = part.callProviderMetadata as Record<string, unknown>;
        const googleMeta = callMetadata.google as Record<string, unknown> | undefined;
        const vertexMeta = callMetadata.vertex as Record<string, unknown> | undefined;
        const hasThoughtSignature =
          googleMeta?.thoughtSignature || vertexMeta?.thoughtSignature;

        if (!hasThoughtSignature) {
          const { callProviderMetadata, ...partWithoutCallMetadata } = part;
          part = partWithoutCallMetadata;
        }
      }

      // IMPORTANT:
      // Tool output semantic conversion happens in materializeToolResultForModel()
      // via tool.toModelOutput(). This sanitizer must not duplicate image handling.
      //
      // Sanitize tool invocation outputs that contain uiResources (MCP-UI)
      // or legacy image payloads without altering canonical semantics.
      const isToolWithOutput = (
        // AI SDK format: tool-invocation with output-available state
        (// Stored format: tool-{name} with output-available state
        ((part?.type === 'tool-invocation' && part?.state === 'output-available') || (part?.type?.startsWith('tool-') && part?.type !== 'tool-invocation' && part?.state === 'output-available')))
      );
      if (isToolWithOutput && part.output) {
        const output = part.output;
        if (isCanonicalToolResult(output)) {
          return part;
        }

        if (output && typeof output === 'object') {
          const cleanOutput: Record<string, unknown> = {};

          if ((output as any).structuredContent) {
            cleanOutput.structuredContent = (output as any).structuredContent;
          }

          if (typeof (output as any).text === 'string') {
            cleanOutput.text = (output as any).text;
          }

          if (Array.isArray((output as any).content)) {
            cleanOutput.content = stripInlineImagesFromContent(
              (output as any).content as unknown[],
            );
          }

          if (Object.keys(cleanOutput).length === 0) {
            return { ...part, output: '[Widget rendered]' };
          }

          return {
            ...part,
            output: cleanOutput,
          };
        }
      }
      return part;
    });

    return {
      ...message,
      parts: sanitizedParts,
    };
  }) as UIMessage[];
}
