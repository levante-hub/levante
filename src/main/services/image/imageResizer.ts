import sharp from "sharp";
import { getLogger } from "../logging";
import {
  API_IMAGE_MAX_BASE64_SIZE,
  IMAGE_MAX_HEIGHT,
  IMAGE_MAX_WIDTH,
  IMAGE_TARGET_RAW_SIZE,
} from "./providerImageLimits";

const logger = getLogger();

export class ImageResizeError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ImageResizeError";
  }
}

type ImageFormat = "png" | "jpeg" | "gif" | "webp";

function base64Size(buffer: Buffer): number {
  // base64 length = ceil(n / 3) * 4
  return Math.ceil(buffer.length / 3) * 4;
}

function mimeToFormat(mime: string | undefined): ImageFormat {
  if (!mime) return "png";
  const lower = mime.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpeg";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("webp")) return "webp";
  return "png";
}

function formatToMime(format: ImageFormat): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "png":
    default:
      return "image/png";
  }
}

async function encode(
  pipeline: sharp.Sharp,
  format: ImageFormat,
  jpegQuality?: number,
  pngPalette?: boolean,
): Promise<Buffer> {
  switch (format) {
    case "jpeg":
      return pipeline.jpeg({ quality: jpegQuality ?? 80, mozjpeg: true }).toBuffer();
    case "png":
      return pipeline.png({ palette: pngPalette === true, compressionLevel: 9 }).toBuffer();
    case "gif":
      return pipeline.gif().toBuffer();
    case "webp":
      return pipeline.webp({ quality: jpegQuality ?? 80 }).toBuffer();
  }
}

export async function getImageDimensions(
  buffer: Buffer,
): Promise<{ width?: number; height?: number }> {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      ...(typeof metadata.width === "number" ? { width: metadata.width } : {}),
      ...(typeof metadata.height === "number"
        ? { height: metadata.height }
        : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Resize an image buffer to fit within API limits using a cascade strategy.
 *
 * Cascade:
 *   1. pass-through if already fits
 *   2. PNG palette mode if applicable
 *   3. JPEG quality ladder: 80 -> 60 -> 40 -> 20
 *   4. resize `inside` to 2000x2000 then repeat JPEG ladder
 *   5. last-resort: 1000px + JPEG q20
 */
export async function resizeMCPImage(
  buffer: Buffer,
  mimeType?: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!buffer || buffer.length === 0) {
    throw new ImageResizeError("Empty image buffer");
  }

  const originalFormat = mimeToFormat(mimeType);

  // 1. Pass-through if the base64 size already fits.
  if (base64Size(buffer) <= API_IMAGE_MAX_BASE64_SIZE) {
    return { buffer, mimeType: formatToMime(originalFormat) };
  }

  try {
    // 2. PNG palette mode for PNG inputs.
    if (originalFormat === "png") {
      try {
        const paletteBuf = await encode(sharp(buffer), "png", undefined, true);
        if (base64Size(paletteBuf) <= API_IMAGE_MAX_BASE64_SIZE) {
          return { buffer: paletteBuf, mimeType: formatToMime("png") };
        }
      } catch (paletteErr) {
        logger.mcp.debug("PNG palette encoding failed, trying JPEG ladder", {
          error: paletteErr instanceof Error ? paletteErr.message : String(paletteErr),
        });
      }
    }

    // 3. JPEG quality ladder on original dimensions.
    for (const q of [80, 60, 40, 20]) {
      const buf = await encode(sharp(buffer), "jpeg", q);
      if (base64Size(buf) <= API_IMAGE_MAX_BASE64_SIZE) {
        return { buffer: buf, mimeType: formatToMime("jpeg") };
      }
      if (buf.length <= IMAGE_TARGET_RAW_SIZE) {
        return { buffer: buf, mimeType: formatToMime("jpeg") };
      }
    }

    // 4. Resize inside MAX_WIDTH x MAX_HEIGHT and repeat JPEG ladder.
    for (const q of [80, 60, 40, 20]) {
      const buf = await encode(
        sharp(buffer).resize({
          width: IMAGE_MAX_WIDTH,
          height: IMAGE_MAX_HEIGHT,
          fit: "inside",
          withoutEnlargement: true,
        }),
        "jpeg",
        q,
      );
      if (base64Size(buf) <= API_IMAGE_MAX_BASE64_SIZE) {
        return { buffer: buf, mimeType: formatToMime("jpeg") };
      }
    }

    // 5. Last resort: 1000px + JPEG q20.
    const lastResort = await encode(
      sharp(buffer).resize({
        width: 1000,
        height: 1000,
        fit: "inside",
        withoutEnlargement: true,
      }),
      "jpeg",
      20,
    );
    if (base64Size(lastResort) <= API_IMAGE_MAX_BASE64_SIZE) {
      return { buffer: lastResort, mimeType: formatToMime("jpeg") };
    }

    throw new ImageResizeError(
      `Failed to compress image below API limits (last size ${lastResort.length} bytes)`,
    );
  } catch (error) {
    if (error instanceof ImageResizeError) throw error;
    // If resizing failed but the original already fits, fall back to original.
    if (base64Size(buffer) <= API_IMAGE_MAX_BASE64_SIZE) {
      logger.mcp.warn("Image resize failed, falling back to original (fits)", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { buffer, mimeType: formatToMime(originalFormat) };
    }
    throw new ImageResizeError(
      `Image resize failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

/**
 * Convenience wrapper that operates directly on an MCP `{ type: "image", data, mimeType }` block.
 * Returns a new `{ data, mediaType }` with the compressed base64.
 */
export async function resizeMCPImageBlock(input: {
  data: string;
  mimeType?: string;
}): Promise<{ data: string; mediaType: string }> {
  if (!input.data || typeof input.data !== "string") {
    throw new ImageResizeError("MCP image block has no data");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.data, "base64");
  } catch (error) {
    throw new ImageResizeError(
      `Invalid base64 in MCP image block: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }

  const { buffer: resized, mimeType } = await resizeMCPImage(buffer, input.mimeType);
  return {
    data: resized.toString("base64"),
    mediaType: mimeType,
  };
}
