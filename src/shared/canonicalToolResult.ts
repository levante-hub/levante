export const CANONICAL_TOOL_RESULT_VERSION = 1 as const;

export interface CanonicalImageAssetRef {
  kind: "image-ref";
  assetId: string;
  mediaType: string;
  byteSize: number;
  base64Length: number;
  sha256: string;
  width?: number;
  height?: number;
}

export type CanonicalToolModelPart =
  | {
      type: "text";
      text: string;
    }
  | CanonicalImageAssetRef;

export type CanonicalToolModelOutput =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "json";
      value: unknown;
    }
  | {
      type: "content";
      value: CanonicalToolModelPart[];
    };

export interface CanonicalToolResultV1 {
  __levanteToolResult: 1;
  text?: string;
  structuredContent?: Record<string, unknown>;
  uiResources?: unknown[];
  content?: unknown[];
  modelOutput: CanonicalToolModelOutput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isCanonicalImageRef(value: unknown): value is CanonicalImageAssetRef {
  if (!isRecord(value)) return false;

  return (
    value.kind === "image-ref" &&
    typeof value.assetId === "string" &&
    typeof value.mediaType === "string" &&
    typeof value.byteSize === "number" &&
    typeof value.base64Length === "number" &&
    typeof value.sha256 === "string" &&
    (value.width === undefined || typeof value.width === "number") &&
    (value.height === undefined || typeof value.height === "number")
  );
}

function isCanonicalToolModelPart(value: unknown): value is CanonicalToolModelPart {
  if (!isRecord(value)) return false;

  if (value.type === "text") {
    return typeof value.text === "string";
  }

  return isCanonicalImageRef(value);
}

function isCanonicalToolModelOutput(value: unknown): value is CanonicalToolModelOutput {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  if (value.type === "text") {
    return typeof value.value === "string";
  }

  if (value.type === "json") {
    return "value" in value;
  }

  if (value.type === "content") {
    return Array.isArray(value.value) && value.value.every(isCanonicalToolModelPart);
  }

  return false;
}

export function isCanonicalToolResult(value: unknown): value is CanonicalToolResultV1 {
  if (!isRecord(value)) return false;

  return (
    value.__levanteToolResult === CANONICAL_TOOL_RESULT_VERSION &&
    isCanonicalToolModelOutput(value.modelOutput) &&
    (value.text === undefined || typeof value.text === "string") &&
    (value.structuredContent === undefined || isRecord(value.structuredContent)) &&
    (value.uiResources === undefined || Array.isArray(value.uiResources)) &&
    (value.content === undefined || Array.isArray(value.content))
  );
}

export function looksLikeLegacyRichToolOutput(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    typeof value.text === "string" ||
    Array.isArray(value.content) ||
    Array.isArray(value.uiResources) ||
    Array.isArray(value.images) ||
    isRecord(value.structuredContent)
  );
}

export function extractLegacyImages(
  value: unknown,
): Array<{ data: string; mediaType: string }> {
  if (!isRecord(value)) return [];

  if (Array.isArray(value.images)) {
    return value.images.flatMap((image) => {
      if (!isRecord(image) || typeof image.data !== "string") {
        return [];
      }

      const mediaType =
        typeof image.mediaType === "string"
          ? image.mediaType
          : typeof image.mimeType === "string"
            ? image.mimeType
            : "image/png";

      return [{ data: image.data, mediaType }];
    });
  }

  if (!Array.isArray(value.content)) {
    return [];
  }

  return value.content.flatMap((item) => {
    if (
      !isRecord(item) ||
      item.type !== "image" ||
      typeof item.data !== "string"
    ) {
      return [];
    }

    const mediaType =
      typeof item.mediaType === "string"
        ? item.mediaType
        : typeof item.mimeType === "string"
          ? item.mimeType
          : "image/png";

    return [{ data: item.data, mediaType }];
  });
}
