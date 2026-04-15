import { beforeEach, describe, expect, it, vi } from "vitest";

const { persistImageAsset, readImageAsset } = vi.hoisted(() => ({
  persistImageAsset: vi.fn(async (params: { mediaType: string; dataBase64: string }) => ({
    assetId: "asset-1",
    sha256: "asset-1",
    mediaType: params.mediaType,
    byteSize: 4,
    base64Length: params.dataBase64.length,
    width: 10,
    height: 10,
  })),
  readImageAsset: vi.fn(async () => ({
    dataBase64: "AAAA",
    mediaType: "image/png",
  })),
}));

vi.mock("../toolResultAssetStore", () => ({
  persistImageAsset,
  readImageAsset,
}));

import {
  canonicalizeRichToolOutput,
  materializeToolResultForModel,
  normalizeToolCallResultForStorage,
} from "../canonicalToolResultService";

describe("canonicalToolResultService", () => {
  beforeEach(() => {
    persistImageAsset.mockClear();
    readImageAsset.mockClear();
  });

  it("canonicalizes legacy rich outputs with images[]", async () => {
    const result = await canonicalizeRichToolOutput({
      text: "Screenshot captured",
      content: [
        { type: "text", text: "Screenshot captured" },
        { type: "image", data: "BBBB", mimeType: "image/png" },
      ],
      legacyImages: [{ data: "BBBB", mediaType: "image/png" }],
    });

    expect(result.__levanteToolResult).toBe(1);
    expect(result.modelOutput.type).toBe("content");
    expect(result.modelOutput.value).toEqual([
      { type: "text", text: "Screenshot captured" },
      expect.objectContaining({
        kind: "image-ref",
        assetId: "asset-1",
        mediaType: "image/png",
      }),
    ]);
    expect(result.content).toEqual([
      { type: "text", text: "Screenshot captured" },
      { type: "image", mimeType: "image/png", omitted: true },
    ]);
  });

  it("materializes canonical content with image-data when vision is enabled", async () => {
    const result = await materializeToolResultForModel({
      supportsVision: true,
      output: {
        __levanteToolResult: 1,
        text: "Screenshot captured",
        modelOutput: {
          type: "content",
          value: [
            { type: "text", text: "Screenshot captured" },
            {
              kind: "image-ref",
              assetId: "asset-1",
              mediaType: "image/png",
              byteSize: 4,
              base64Length: 4,
              sha256: "asset-1",
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      type: "content",
      value: [
        { type: "text", text: "Screenshot captured" },
        { type: "image-data", data: "AAAA", mediaType: "image/png" },
      ],
    });
  });

  it("degrades canonical image output to text when vision is disabled", async () => {
    const result = await materializeToolResultForModel({
      supportsVision: false,
      output: {
        __levanteToolResult: 1,
        text: "Fallback text",
        modelOutput: {
          type: "content",
          value: [
            {
              kind: "image-ref",
              assetId: "asset-1",
              mediaType: "image/png",
              byteSize: 4,
              base64Length: 4,
              sha256: "asset-1",
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      type: "text",
      value: "Fallback text",
    });
  });

  it("supports legacy inputs with images[] during materialization", async () => {
    const result = await materializeToolResultForModel({
      supportsVision: true,
      output: {
        text: "Legacy screenshot",
        images: [{ data: "BBBB", mediaType: "image/png" }],
      },
    });

    expect(result).toEqual({
      type: "content",
      value: [
        { type: "text", text: "Legacy screenshot" },
        { type: "image-data", data: "BBBB", mediaType: "image/png" },
      ],
    });
  });

  it("keeps canonical outputs unchanged when normalizing for storage", async () => {
    const canonical = {
      __levanteToolResult: 1,
      text: "Saved",
      modelOutput: {
        type: "content" as const,
        value: [
          {
            kind: "image-ref" as const,
            assetId: "asset-1",
            mediaType: "image/png",
            byteSize: 4,
            base64Length: 4,
            sha256: "asset-1",
          },
        ],
      },
    };

    const result = await normalizeToolCallResultForStorage(canonical);

    expect(result.changed).toBe(false);
    expect(result.normalized).toBe(canonical);
    expect(result.assetIds).toEqual(["asset-1"]);
  });
});
