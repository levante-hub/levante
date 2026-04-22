/**
 * Unified tool output sanitizer shared between main (mcpToolsAdapter,
 * toolMessageSanitizer) and renderer (chatStore persistence).
 *
 * This module must remain free of Node-specific APIs (fs/path/electron/logger)
 * so it can be imported from both processes.
 */

export interface ToolOutputShape {
  text?: string;
  content?: unknown[];
  uiResources?: unknown[];
  structuredContent?: Record<string, unknown>;
  images?: Array<{ data: string; mediaType: string }>;
  [key: string]: unknown;
}

/**
 * Legacy helper:
 * kept only to neutralize old raw MCP content[] image blocks.
 * New rich tool outputs must use CanonicalToolResultV1 instead.
 *
 * Deja una "lápida" (`omitted: true`) en vez del base64 para cada bloque `image`
 * dentro de `content[]`. No muta el input. Única fuente de verdad sobre cómo
 * se aligera el output de tool antes de persistir o rehidratar.
 */
export function stripInlineImagesFromContent(content: unknown[]): unknown[] {
  return content.map((item) => {
    if (
      item &&
      typeof item === "object" &&
      (item as { type?: string }).type === "image"
    ) {
      return {
        type: "image",
        mimeType: (item as { mimeType?: string }).mimeType,
        omitted: true,
      };
    }
    return item;
  });
}

/**
 * Legacy/transitional helper:
 * preserva text/uiResources/structuredContent/images y aligera `content[]`.
 * No debe usarse como formato persistido nuevo.
 */
export function sanitizeToolOutput(output: ToolOutputShape): ToolOutputShape {
  const sanitized: ToolOutputShape = { ...output };

  if (Array.isArray(output.content)) {
    sanitized.content = stripInlineImagesFromContent(output.content);
  }

  return sanitized;
}
