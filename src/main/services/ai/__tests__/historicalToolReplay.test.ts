import { convertToModelMessages, type UIMessage } from "ai";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { sanitizeMessagesForModel } from "../toolMessageSanitizer";
import { buildHistoricalReplayTools } from "../../toolResults/historicalToolReplayTools";

const { readImageAsset } = vi.hoisted(() => ({
  readImageAsset: vi.fn(async () => ({
    dataBase64: "AAAA",
    mediaType: "image/png",
  })),
}));

vi.mock("../../toolResults/toolResultAssetStore", () => ({
  persistImageAsset: vi.fn(),
  readImageAsset,
}));

function makeScreenshotMessage(id: string, assetId: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      {
        type: "tool-screenshot",
        toolCallId: id,
        toolName: "screenshot",
        input: {},
        state: "output-available",
        providerExecuted: true,
        output: {
          __levanteToolResult: 1,
          text: `Screenshot ${id}`,
          modelOutput: {
            type: "content",
            value: [
              { type: "text", text: `Screenshot ${id}` },
              {
                kind: "image-ref",
                assetId,
                mediaType: "image/png",
                byteSize: 4,
                base64Length: 4,
                sha256: assetId,
              },
            ],
          },
        },
      } as any,
    ],
  };
}

describe("historicalToolReplayTools", () => {
  beforeEach(() => {
    readImageAsset.mockClear();
  });

  it("replays canonical historical tool results through toModelOutput", async () => {
    const messages: UIMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-screenshot",
            toolCallId: "call-1",
            toolName: "screenshot",
            input: {},
            state: "output-available",
            providerExecuted: true,
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
          } as any,
        ],
      },
    ];

    const sanitized = sanitizeMessagesForModel(messages);
    const replayTools = await buildHistoricalReplayTools({
      messages: sanitized,
      liveTools: {},
      supportsVision: true,
    });

    const modelMessages = await convertToModelMessages(sanitized, {
      tools: replayTools,
    });

    const toolResult = (modelMessages[0] as any).content.find(
      (part: any) => part.type === "tool-result",
    );

    expect(toolResult.output.type).toBe("content");
    expect(toolResult.output.value).toEqual([
      { type: "text", text: "Screenshot captured" },
      { type: "image-data", data: "AAAA", mediaType: "image/png" },
    ]);
  });

  it("degrades oldest images beyond budget=2 to text, preserving the newest", async () => {
    // 3 screenshots: oldest → middle → newest
    const messages: UIMessage[] = [
      makeScreenshotMessage("call-old", "asset-old"),
      makeScreenshotMessage("call-mid", "asset-mid"),
      makeScreenshotMessage("call-new", "asset-new"),
    ];

    const sanitized = sanitizeMessagesForModel(messages);
    const replayTools = await buildHistoricalReplayTools({
      messages: sanitized,
      liveTools: {},
      supportsVision: true,
    });

    const modelMessages = await convertToModelMessages(sanitized, {
      tools: replayTools,
    });

    // Extract all tool-result outputs in order
    const toolResults = (modelMessages as any[]).flatMap((msg: any) =>
      Array.isArray(msg.content)
        ? msg.content.filter((p: any) => p.type === "tool-result")
        : [],
    );

    expect(toolResults).toHaveLength(3);

    // Oldest (call-old) must be degraded to text — over budget
    expect(toolResults[0].output.type).toBe("text");
    expect(toolResults[0].output.value).toContain("Screenshot call-old");

    // Middle and newest must keep image content
    expect(toolResults[1].output.type).toBe("content");
    expect(toolResults[1].output.value).toContainEqual(
      expect.objectContaining({ type: "image-data" }),
    );
    expect(toolResults[2].output.type).toBe("content");
    expect(toolResults[2].output.value).toContainEqual(
      expect.objectContaining({ type: "image-data" }),
    );
  });

  it("passes all images through when total is within budget", async () => {
    const messages: UIMessage[] = [
      makeScreenshotMessage("call-1", "asset-1"),
      makeScreenshotMessage("call-2", "asset-2"),
    ];

    const sanitized = sanitizeMessagesForModel(messages);
    const replayTools = await buildHistoricalReplayTools({
      messages: sanitized,
      liveTools: {},
      supportsVision: true,
    });

    const modelMessages = await convertToModelMessages(sanitized, {
      tools: replayTools,
    });

    const toolResults = (modelMessages as any[]).flatMap((msg: any) =>
      Array.isArray(msg.content)
        ? msg.content.filter((p: any) => p.type === "tool-result")
        : [],
    );

    expect(toolResults).toHaveLength(2);
    expect(toolResults[0].output.type).toBe("content");
    expect(toolResults[1].output.type).toBe("content");
  });
});
