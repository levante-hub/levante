import type { ToolResultOutput } from "@ai-sdk/provider-utils";
import {
  extractLegacyImages,
  isCanonicalImageRef,
  isCanonicalToolResult,
  looksLikeLegacyRichToolOutput,
  type CanonicalToolResultV1,
} from "../../../shared/canonicalToolResult";
import { stripInlineImagesFromContent } from "../../../shared/toolOutputSanitizer";
import {
  persistImageAsset,
  readImageAsset,
} from "./toolResultAssetStore";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getStructuredContent(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return isRecord(value.structuredContent)
    ? (value.structuredContent as Record<string, unknown>)
    : undefined;
}

function getContent(value: unknown): unknown[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return undefined;
  }

  return value.content;
}

function getUiResources(value: unknown): unknown[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.uiResources)) {
    return undefined;
  }

  return value.uiResources;
}

function extractTextFromContent(content: unknown[]): string | undefined {
  const texts = content
    .flatMap((item) => {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: string }).type === "text" &&
        typeof (item as { text?: string }).text === "string"
      ) {
        return [(item as { text: string }).text];
      }

      return [];
    })
    .filter((text) => text.length > 0);

  if (texts.length === 0) {
    return undefined;
  }

  return texts.join("\n");
}

function getLegacyText(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  if (typeof value.text === "string" && value.text.length > 0) {
    return value.text;
  }

  if (Array.isArray(value.content)) {
    return extractTextFromContent(value.content);
  }

  return undefined;
}

function collectCanonicalImageRefs(output: CanonicalToolResultV1) {
  if (output.modelOutput.type !== "content") {
    return [];
  }

  return output.modelOutput.value.filter(isCanonicalImageRef);
}

export function collectToolResultAssetIds(value: unknown): string[] {
  if (!isCanonicalToolResult(value)) {
    return [];
  }

  return collectCanonicalImageRefs(value).map((part) => part.assetId);
}

export async function canonicalizeRichToolOutput(params: {
  text?: string;
  structuredContent?: Record<string, unknown>;
  uiResources?: unknown[];
  content?: unknown[];
  legacyImages?: Array<{ data: string; mediaType: string }>;
}): Promise<CanonicalToolResultV1> {
  const sanitizedContent = Array.isArray(params.content)
    ? stripInlineImagesFromContent(params.content)
    : undefined;

  const text =
    params.text && params.text.length > 0
      ? params.text
      : sanitizedContent
        ? extractTextFromContent(sanitizedContent)
        : undefined;

  const imageAssets = await Promise.all(
    (params.legacyImages ?? []).map((image) =>
      persistImageAsset({
        dataBase64: image.data,
        mediaType: image.mediaType,
      }),
    ),
  );

  const modelOutput =
    imageAssets.length > 0
      ? {
          type: "content" as const,
          value: [
            ...(text ? [{ type: "text" as const, text }] : []),
            ...imageAssets.map((asset) => ({
              kind: "image-ref" as const,
              assetId: asset.assetId,
              mediaType: asset.mediaType,
              byteSize: asset.byteSize,
              base64Length: asset.base64Length,
              sha256: asset.sha256,
              ...(asset.width !== undefined ? { width: asset.width } : {}),
              ...(asset.height !== undefined ? { height: asset.height } : {}),
            })),
          ],
        }
      : params.structuredContent
        ? {
            type: "json" as const,
            value: params.structuredContent,
          }
        : {
            type: "text" as const,
            value: text ?? "",
          };

  return {
    __levanteToolResult: 1,
    ...(text ? { text } : {}),
    ...(params.structuredContent ? { structuredContent: params.structuredContent } : {}),
    ...(params.uiResources && params.uiResources.length > 0
      ? { uiResources: params.uiResources }
      : {}),
    ...(sanitizedContent ? { content: sanitizedContent } : {}),
    modelOutput,
  };
}

export async function normalizeToolCallResultForStorage(
  value: unknown,
): Promise<{ normalized: unknown; changed: boolean; assetIds: string[] }> {
  if (isCanonicalToolResult(value)) {
    return {
      normalized: value,
      changed: false,
      assetIds: collectToolResultAssetIds(value),
    };
  }

  if (!looksLikeLegacyRichToolOutput(value)) {
    return {
      normalized: value,
      changed: false,
      assetIds: [],
    };
  }

  const normalized = await canonicalizeRichToolOutput({
    text: getLegacyText(value),
    structuredContent: getStructuredContent(value),
    uiResources: getUiResources(value),
    content: getContent(value),
    legacyImages: extractLegacyImages(value),
  });

  return {
    normalized,
    changed: true,
    assetIds: collectToolResultAssetIds(normalized),
  };
}

async function materializeCanonicalToolResult(params: {
  output: CanonicalToolResultV1;
  supportsVision: boolean;
}): Promise<ToolResultOutput> {
  const { output, supportsVision } = params;

  if (output.modelOutput.type === "text") {
    return {
      type: "text",
      value: output.modelOutput.value,
    };
  }

  if (output.modelOutput.type === "json") {
    return {
      type: "json",
      value: output.modelOutput.value as any,
    };
  }

  if (!supportsVision) {
    return {
      type: "text",
      value:
        output.text ||
        "[Tool returned images, but the active model does not support vision.]",
    };
  }

  const value: Array<
    | { type: "text"; text: string }
    | { type: "image-data"; data: string; mediaType: string }
  > = [];

  for (const part of output.modelOutput.value) {
    if ("type" in part && part.type === "text") {
      value.push({ type: "text", text: part.text });
      continue;
    }

    if (!isCanonicalImageRef(part)) {
      continue;
    }

    const image = await readImageAsset({
      assetId: part.assetId,
      mediaType: part.mediaType,
    });

    value.push({
      type: "image-data",
      data: image.dataBase64,
      mediaType: image.mediaType,
    });
  }

  return {
    type: "content",
    value,
  };
}

async function materializeLegacyToolResult(params: {
  output: Record<string, unknown>;
  supportsVision: boolean;
}): Promise<ToolResultOutput> {
  const text = getLegacyText(params.output);
  const images = extractLegacyImages(params.output);

  if (images.length > 0) {
    if (!params.supportsVision) {
      return {
        type: "text",
        value:
          text ||
          "[Tool returned images, but the active model does not support vision.]",
      };
    }

    return {
      type: "content",
      value: [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...images.map((image) => ({
          type: "image-data" as const,
          data: image.data,
          mediaType: image.mediaType,
        })),
      ],
    };
  }

  const structuredContent = getStructuredContent(params.output);
  if (structuredContent) {
    return {
      type: "json",
      value: structuredContent as any,
    };
  }

  return {
    type: "text",
    value: text ?? "",
  };
}

export async function materializeToolResultForModel(params: {
  output: unknown;
  supportsVision: boolean;
}): Promise<ToolResultOutput> {
  if (isCanonicalToolResult(params.output)) {
    return materializeCanonicalToolResult({
      output: params.output,
      supportsVision: params.supportsVision,
    });
  }

  if (typeof params.output === "string") {
    return {
      type: "text",
      value: params.output,
    };
  }

  if (looksLikeLegacyRichToolOutput(params.output)) {
    return materializeLegacyToolResult({
      output: params.output as Record<string, unknown>,
      supportsVision: params.supportsVision,
    });
  }

  if (isRecord(params.output) && isRecord(params.output.structuredContent)) {
    return {
      type: "json",
      value: params.output.structuredContent as any,
    };
  }

  if (isRecord(params.output) && typeof params.output.text === "string") {
    return {
      type: "text",
      value: params.output.text,
    };
  }

  return {
    type: "json",
    value: (params.output ?? null) as any,
  };
}
