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
}

/**
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
 * Sanea un output de tool completo: preserva text/uiResources/structuredContent/images
 * y aligera `content[]` via `stripInlineImagesFromContent`. Usar este helper tanto
 * cuando el adapter devuelve el resultado como cuando el renderer va a persistirlo.
 */
export function sanitizeToolOutput(output: ToolOutputShape): ToolOutputShape {
  const cleanContent = Array.isArray(output.content)
    ? stripInlineImagesFromContent(output.content)
    : undefined;

  return {
    ...(output.text ? { text: output.text } : {}),
    ...(cleanContent ? { content: cleanContent } : {}),
    ...(output.uiResources ? { uiResources: output.uiResources } : {}),
    ...(output.structuredContent ? { structuredContent: output.structuredContent } : {}),
    ...(output.images ? { images: output.images } : {}),
  };
}
