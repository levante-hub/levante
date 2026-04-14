import { describe, it, expect, vi, beforeEach } from "vitest";

const { recordSuccess, recordError } = vi.hoisted(() => ({
  recordSuccess: vi.fn(),
  recordError: vi.fn(),
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

// Stub the resizer to avoid native sharp in this unit test.
vi.mock("../../image/imageResizer.js", () => ({
  resizeMCPImageBlock: vi.fn(async (input: { data: string; mimeType?: string }) => ({
    data: input.data.slice(0, 10),
    mediaType: input.mimeType || "image/png",
  })),
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
  });

  it("transforms image blocks into images[] with placeholder text and does not serialize base64", async () => {
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

    expect(output).toHaveProperty("images");
    expect(output.images).toHaveLength(1);
    expect(output.images[0].mediaType).toBe("image/png");
    // The placeholder should be in text and the raw base64 must not leak.
    expect(output.text).toContain("[Image received from screenshot]");
    expect(output.text).not.toContain(big);
    // content[] image block is tombstoned by sanitizeToolOutput
    const imgBlock = output.content.find((c: any) => c.type === "image");
    expect(imgBlock).toMatchObject({ omitted: true });
  });

  it("applies a textual fallback when resize throws", async () => {
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

    // No images were produced, so plain text is returned.
    expect(typeof output).toBe("string");
    expect(output).toContain("could not be included");
  });
});

describe("createAISDKTool.toModelOutput", () => {
  it("returns image-data parts when supportsVision is true", () => {
    const aiTool: any = createAISDKTool("srv", baseTool as any, {
      skipApproval: true,
      supportsVision: true,
    });

    const res = aiTool.toModelOutput({
      toolCallId: "call_1",
      input: {},
      output: {
        text: "hello",
        images: [{ data: "AAAA", mediaType: "image/png" }],
      },
    });

    expect(res.type).toBe("content");
    expect(res.value).toEqual([
      { type: "text", text: "hello" },
      { type: "image-data", data: "AAAA", mediaType: "image/png" },
    ]);
  });

  it("degrades to text when supportsVision is false", () => {
    const aiTool: any = createAISDKTool("srv", baseTool as any, {
      skipApproval: true,
      supportsVision: false,
    });

    const res = aiTool.toModelOutput({
      toolCallId: "call_1",
      input: {},
      output: {
        text: "fallback text",
        images: [{ data: "AAAA", mediaType: "image/png" }],
      },
    });

    expect(res.type).toBe("text");
    expect(res.value).toBe("fallback text");
  });
});
