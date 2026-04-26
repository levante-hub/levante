import { getLogger } from "../logging";
import { API_IMAGE_MAX_BASE64_SIZE } from "./providerImageLimits";

const logger = getLogger();

export class ImagePayloadTooLargeError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly size: number,
  ) {
    super(message);
    this.name = "ImagePayloadTooLargeError";
  }
}

function getBase64SizeFromDataUrl(url: string): number | null {
  const match = /^data:[^;]+;base64,(.*)$/.exec(url);
  return match ? match[1].length : null;
}

function b64Length(data: unknown): number | null {
  if (typeof data !== "string" || data.length === 0) return null;
  return data.length;
}

function walk(
  value: unknown,
  path: string,
  onViolation: (reason: string, size: number, where: string) => void,
): void {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], `${path}[${i}]`, onViolation);
    }
    return;
  }

  const obj = value as Record<string, unknown>;
  const type = typeof obj.type === "string" ? (obj.type as string) : undefined;

  if (type === "image-data" || type === "image") {
    const size = b64Length((obj as any).data);
    if (size !== null && size > API_IMAGE_MAX_BASE64_SIZE) {
      onViolation(
        `${type} block exceeds API limit`,
        size,
        `${path}(type=${type})`,
      );
    }
  }

  if (type === "file" && typeof (obj as any).url === "string") {
    const url = (obj as any).url as string;
    const size = getBase64SizeFromDataUrl(url);
    if (size !== null && size > API_IMAGE_MAX_BASE64_SIZE) {
      onViolation(
        "file.url data URL base64 exceeds API limit",
        size,
        `${path}(type=file)`,
      );
    }
  }

  // Tool outputs may still carry `images[]` before convertToModelMessages runs.
  if (Array.isArray((obj as any).images)) {
    const images = (obj as any).images as unknown[];
    for (let i = 0; i < images.length; i++) {
      const img = images[i] as { data?: unknown } | undefined;
      const size = b64Length(img?.data);
      if (size !== null && size > API_IMAGE_MAX_BASE64_SIZE) {
        onViolation(
          "images[].data exceeds API limit",
          size,
          `${path}.images[${i}]`,
        );
      }
    }
  }

  for (const [key, child] of Object.entries(obj)) {
    if (key === "images") continue;
    walk(child, `${path}.${key}`, onViolation);
  }
}

/**
 * Safety-net that scans sanitized messages for image payloads that still
 * exceed the base64 limit accepted by the API providers. Throws
 * `ImagePayloadTooLargeError` on the first violation so the request is never
 * forwarded to the provider with an oversized payload — the whole point of
 * this check is preventing `prompt too long`, not just logging after the fact.
 */
export function validateImagesForAPI(messages: unknown[]): void {
  if (!Array.isArray(messages)) return;

  const violations: Array<{ reason: string; size: number; where: string }> = [];

  for (let i = 0; i < messages.length; i++) {
    walk(messages[i], `messages[${i}]`, (reason, size, where) => {
      violations.push({ reason, size, where });
    });
  }

  if (violations.length > 0) {
    logger.aiSdk.error("Image payload exceeds API limit after sanitization", {
      count: violations.length,
      maxBase64Size: API_IMAGE_MAX_BASE64_SIZE,
      violations: violations.slice(0, 10),
    });

    const first = violations[0];
    throw new ImagePayloadTooLargeError(
      `Image payload at ${first.where} is ${first.size} bytes (limit ${API_IMAGE_MAX_BASE64_SIZE}): ${first.reason}`,
      first.where,
      first.size,
    );
  }
}
