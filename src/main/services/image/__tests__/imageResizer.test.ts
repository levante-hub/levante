import { describe, it, expect, vi } from "vitest";

// Stub the real winston logger so tests do not touch the file system.
vi.mock("../../logging", () => {
  const noop = vi.fn();
  const categoryLogger = { info: noop, warn: noop, error: noop, debug: noop };
  return {
    getLogger: () => ({ aiSdk: categoryLogger, mcp: categoryLogger }),
  };
});

import sharp from "sharp";
import { resizeMCPImage, getImageDimensions, ImageResizeError } from "../imageResizer";
import { API_IMAGE_MAX_BASE64_SIZE } from "../providerImageLimits";

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 128, b: 64 },
    },
  })
    .png()
    .toBuffer();
}

async function makeNoisyPng(width: number, height: number): Promise<Buffer> {
  const channels = 3;
  const pixelCount = width * height * channels;
  const raw = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    raw[i] = Math.floor(Math.random() * 256);
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

describe("getImageDimensions", () => {
  it("returns width and height for a valid PNG buffer", async () => {
    const buffer = await makePng(32, 16);
    const dims = await getImageDimensions(buffer);
    expect(dims.width).toBe(32);
    expect(dims.height).toBe(16);
  });

  it("returns {} for an invalid buffer", async () => {
    const dims = await getImageDimensions(Buffer.from("not-an-image"));
    expect(dims).toEqual({});
  });
});

describe("resizeMCPImage", () => {
  it("passes small images through unchanged", async () => {
    const small = await makePng(10, 10);

    const { buffer } = await resizeMCPImage(small, "image/png");

    expect(buffer).toBe(small);
  });

  it("compresses a large PNG below the target size", async () => {
    // Random noise compresses poorly as PNG → triggers the JPEG cascade.
    const big = await makeNoisyPng(4000, 4000);
    expect(Math.ceil(big.length / 3) * 4).toBeGreaterThan(
      API_IMAGE_MAX_BASE64_SIZE,
    );

    const { buffer } = await resizeMCPImage(big, "image/png");

    expect(Math.ceil(buffer.length / 3) * 4).toBeLessThanOrEqual(
      API_IMAGE_MAX_BASE64_SIZE,
    );
  }, 30_000);

  it("fits huge images within API limits (compression + optional resize)", async () => {
    const big = await makeNoisyPng(6000, 6000);

    const { buffer } = await resizeMCPImage(big, "image/png");
    const meta = await sharp(buffer).metadata();

    expect(Math.ceil(buffer.length / 3) * 4).toBeLessThanOrEqual(
      API_IMAGE_MAX_BASE64_SIZE,
    );
    // Dimensions are either preserved (if compression alone fit) or reduced.
    expect(meta.width!).toBeLessThanOrEqual(6000);
    expect(meta.height!).toBeLessThanOrEqual(6000);
  }, 45_000);

  it("throws ImageResizeError on empty buffer", async () => {
    await expect(resizeMCPImage(Buffer.alloc(0))).rejects.toBeInstanceOf(
      ImageResizeError,
    );
  });

  it("falls back to original when resize fails but base64 already fits", async () => {
    // Non-image bytes: sharp will fail, but the buffer is tiny so base64 fits.
    const tinyJunk = Buffer.from("not a real image");

    const { buffer } = await resizeMCPImage(tinyJunk, "image/png");

    expect(buffer).toBe(tinyJunk);
  });
});
