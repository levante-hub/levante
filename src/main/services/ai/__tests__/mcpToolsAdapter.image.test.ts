import { describe, it, expect, vi, beforeEach } from "vitest";

const { recordSuccess, recordError, persistImageAsset, readImageAsset } = vi.hoisted(() => ({
  recordSuccess: vi.fn(),
  recordError: vi.fn(),
  persistImageAsset: vi.fn(async (params: { dataBase64: string; mediaType: string }) => ({
    assetId: "asset-1",
    sha256: "asset-1",
    mediaType: params.mediaType,
    byteSize: params.dataBase64.length,
    base64Length: params.dataBase64.length,
    width: 100,
    height: 80,
  })),
  readImageAsset: vi.fn(async () => ({
    dataBase64: "AAAA",
    mediaType: "image/png",
  })),
}));

vi.mock("../../../ipc/mcpHandlers", () => ({
  mcpService: {
    callTool: vi.fn(),
    readResource: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    listTools: vi.fn().mockResolvedValue([]),
    isCodeModeEnabled: vi.fn().mockReturnValue(false),
    getCodeModePrompt: vi.fn().mockReturnValue(null),
    searchTools: vi.fn(),
    executeCode: vi.fn(),
  },
  configManager: {
    loadConfiguration: vi.fn().mockResolvedValue({ mcpServers: {}, disabled: {} }),
  },
}));

vi.mock("../../mcpHealthService", () => ({
  mcpHealthService: {
    recordSuccess,
    recordError,
  },
}));

vi.mock("../../logging", () => ({
  getLogger: () => {
    const noop = vi.fn();
    const categoryLogger = { info: noop, warn: noop, error: noop, debug: noop };
    return { aiSdk: categoryLogger, mcp: categoryLogger };
  },
}));

vi.mock("../../image/imageResizer.js", () => ({
  resizeMCPImageBlock: vi.fn(async (input: { data: string; mimeType?: string }) => ({
    data: input.data.slice(0, 10),
    mediaType: input.mimeType || "image/png",
  })),
}));

vi.mock("../../toolResults/toolResultAssetStore", () => ({
  persistImageAsset,
  readImageAsset,
}));

import {
  createAISDKTool,
  processToolResult,
} from "../mcpToolsAdapter";

const baseTool = { name: "screenshot", description: "takes screenshots" };

describe("processToolResult with image blocks", () => {
  beforeEach(() => {
    recordSuccess.mockClear();
    recordError.mockClear();
    persistImageAsset.mockClear();
    readImageAsset.mockClear();
  });

  it("returns CanonicalToolResultV1 and removes raw images[] output", async () => {
    const big = "A".repeat(2000);
    const output = (await processToolResult(
      "srv",
      baseTool as any,
      {},
      {
        content: [
          { type: "text", text: "header" },
          { type: "image", data: big, mimeType: "image/png" },
        ],
      },
    )) as any;

    expect(output.__levanteToolResult).toBe(1);
    expect(output).not.toHaveProperty("images");
    expect(output.text).toContain("[Image received from screenshot]");
    expect(output.modelOutput.type).toBe("content");
    expect(output.modelOutput.value).toEqual([
      { type: "text", text: "header\n[Image received from screenshot]" },
      expect.objectContaining({
        kind: "image-ref",
        assetId: "asset-1",
        mediaType: "image/png",
      }),
    ]);

    const imgBlock = output.content.find((c: any) => c.type === "image");
    expect(imgBlock).toMatchObject({ omitted: true });
  });

  it("falls back to canonical text when resize throws", async () => {
    const resizer = await import("../../image/imageResizer.js");
    (resizer.resizeMCPImageBlock as any).mockImplementationOnce(async () => {
      throw new Error("boom");
    });

    const output = (await processToolResult(
      "srv",
      baseTool as any,
      {},
      {
        content: [
          { type: "image", data: "AAAA", mimeType: "image/png" },
        ],
      },
    )) as any;

    expect(output.__levanteToolResult).toBe(1);
    expect(output.modelOutput).toEqual({
      type: "text",
      value: "[Image from screenshot could not be included because it exceeded API limits.]",
    });
  });
});

describe("createAISDKTool.toModelOutput", () => {
  it("returns image-data parts when supportsVision is true", async () => {
    const aiTool: any = createAISDKTool("srv", baseTool as any, {
      skipApproval: true,
      supportsVision: true,
    });

    const res = await aiTool.toModelOutput({
      toolCallId: "call_1",
      input: {},
      output: {
        __levanteToolResult: 1,
        text: "hello",
        modelOutput: {
          type: "content",
          value: [
            { type: "text", text: "hello" },
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

    expect(res.type).toBe("content");
    expect(res.value).toEqual([
      { type: "text", text: "hello" },
      { type: "image-data", data: "AAAA", mediaType: "image/png" },
    ]);
  });

  it("degrades to text when supportsVision is false", async () => {
    const aiTool: any = createAISDKTool("srv", baseTool as any, {
      skipApproval: true,
      supportsVision: false,
    });

    const res = await aiTool.toModelOutput({
      toolCallId: "call_1",
      input: {},
      output: {
        __levanteToolResult: 1,
        text: "fallback text",
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

    expect(res.type).toBe("text");
    expect(res.value).toBe("fallback text");
  });
});
