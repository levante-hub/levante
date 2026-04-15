import { convertToModelMessages, type UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
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

describe("historicalToolReplayTools", () => {
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
});
