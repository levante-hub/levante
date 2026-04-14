import type { MCPContentItem } from "../../../types/mcp";

export interface NormalizedToolResult {
  content: MCPContentItem[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
}

export function normalizeToolResult(result: {
  content?: unknown;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
}): NormalizedToolResult {
  let content: MCPContentItem[];

  if (Array.isArray(result.content)) {
    content = result.content as MCPContentItem[];
  } else if (result.content !== undefined && result.content !== null) {
    content = [{
      type: "text",
      text: typeof result.content === "string"
        ? result.content
        : JSON.stringify(result.content),
    }];
  } else if (result.structuredContent) {
    content = [{
      type: "text",
      text: JSON.stringify(result.structuredContent, null, 2),
    }];
  } else {
    content = [];
  }

  return {
    content,
    structuredContent: result.structuredContent,
    _meta: result._meta,
    isError: result.isError,
  };
}
