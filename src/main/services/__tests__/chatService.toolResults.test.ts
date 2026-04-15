import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedToolCall } from "../../../types/database";

const {
  executeMock,
  normalizeToolCallResultForStorage,
  collectToolResultAssetIds,
  deleteImageAssetsIfUnused,
} = vi.hoisted(() => ({
  executeMock: vi.fn(),
  normalizeToolCallResultForStorage: vi.fn(),
  collectToolResultAssetIds: vi.fn(),
  deleteImageAssetsIfUnused: vi.fn(),
}));

vi.mock("../databaseService", () => ({
  databaseService: {
    execute: executeMock,
  },
}));

vi.mock("../logging", () => ({
  getLogger: () => ({
    database: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }),
}));

vi.mock("../toolResults/canonicalToolResultService", () => ({
  normalizeToolCallResultForStorage,
  collectToolResultAssetIds,
}));

vi.mock("../toolResults/toolResultAssetStore", () => ({
  deleteImageAssetsIfUnused,
}));

import { ChatService } from "../chatService";

describe("ChatService tool result persistence", () => {
  let service: ChatService;

  beforeEach(() => {
    service = new ChatService();
    vi.clearAllMocks();
  });

  it("canonicalizes tool results before createMessage persists them", async () => {
    normalizeToolCallResultForStorage.mockResolvedValue({
      normalized: { __levanteToolResult: 1, modelOutput: { type: "text", value: "ok" } },
      changed: true,
      assetIds: [],
    });
    executeMock.mockResolvedValue({ rows: [], rowsAffected: 1 });

    const toolCalls: PersistedToolCall[] = [
      {
        id: "call-1",
        name: "screenshot",
        arguments: {},
        result: { images: [{ data: "AAAA", mediaType: "image/png" }] },
        status: "success",
      },
    ];

    await service.createMessage({
      id: "msg-1",
      session_id: "session-1",
      role: "assistant",
      content: "hello",
      tool_calls: toolCalls,
    });

    expect(normalizeToolCallResultForStorage).toHaveBeenCalledWith(toolCalls[0].result);
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO messages"),
      expect.arrayContaining([
        expect.any(String),
        "session-1",
        "assistant",
        "hello",
        JSON.stringify([
          {
            ...toolCalls[0],
            result: { __levanteToolResult: 1, modelOutput: { type: "text", value: "ok" } },
          },
        ]),
      ]),
    );
  });

  it("rewrites legacy rows lazily when getMessages loads them", async () => {
    normalizeToolCallResultForStorage.mockResolvedValue({
      normalized: { __levanteToolResult: 1, modelOutput: { type: "text", value: "ok" } },
      changed: true,
      assetIds: [],
    });

    executeMock
      .mockResolvedValueOnce({ rows: [[1]] })
      .mockResolvedValueOnce({
        rows: [[
          "msg-1",
          "session-1",
          "assistant",
          "hello",
          JSON.stringify([
            {
              id: "call-1",
              name: "screenshot",
              arguments: {},
              result: { images: [{ data: "AAAA", mediaType: "image/png" }] },
              status: "success",
            },
          ]),
          100,
          null,
          null,
          null,
          null,
          null,
        ]],
      })
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

    const result = await service.getMessages({
      session_id: "session-1",
    });

    expect(result.success).toBe(true);
    expect(result.data.items[0].tool_calls).toBe(
      JSON.stringify([
        {
          id: "call-1",
          name: "screenshot",
          arguments: {},
          result: { __levanteToolResult: 1, modelOutput: { type: "text", value: "ok" } },
          status: "success",
        },
      ]),
    );
    expect(executeMock).toHaveBeenCalledWith(
      "UPDATE messages SET tool_calls = ? WHERE id = ?",
      [
        JSON.stringify([
          {
            id: "call-1",
            name: "screenshot",
            arguments: {},
            result: { __levanteToolResult: 1, modelOutput: { type: "text", value: "ok" } },
            status: "success",
          },
        ]),
        "msg-1",
      ],
    );
  });

  it("deletes orphaned image assets when updateMessage replaces tool calls", async () => {
    collectToolResultAssetIds
      .mockReturnValueOnce(["asset-old"])
      .mockReturnValueOnce(["asset-new"]);
    normalizeToolCallResultForStorage.mockResolvedValue({
      normalized: {
        __levanteToolResult: 1,
        modelOutput: {
          type: "content",
          value: [
            {
              kind: "image-ref",
              assetId: "asset-new",
              mediaType: "image/png",
              byteSize: 4,
              base64Length: 4,
              sha256: "asset-new",
            },
          ],
        },
      },
      changed: false,
      assetIds: ["asset-new"],
    });

    const oldToolCallsJson = JSON.stringify([
      {
        id: "call-1",
        name: "screenshot",
        arguments: {},
        result: {
          __levanteToolResult: 1,
          modelOutput: {
            type: "content",
            value: [
              {
                kind: "image-ref",
                assetId: "asset-old",
                mediaType: "image/png",
                byteSize: 4,
                base64Length: 4,
                sha256: "asset-old",
              },
            ],
          },
        },
        status: "success",
      },
    ]);

    const newToolCallsJson = JSON.stringify([
      {
        id: "call-1",
        name: "screenshot",
        arguments: {},
        result: {
          __levanteToolResult: 1,
          modelOutput: {
            type: "content",
            value: [
              {
                kind: "image-ref",
                assetId: "asset-new",
                mediaType: "image/png",
                byteSize: 4,
                base64Length: 4,
                sha256: "asset-new",
              },
            ],
          },
        },
        status: "success",
      },
    ]);

    executeMock
      .mockResolvedValueOnce({
        rows: [[
          "msg-1",
          "session-1",
          "assistant",
          "hello",
          oldToolCallsJson,
          100,
          null,
          null,
          null,
          null,
          null,
        ]],
      })
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1 })
      .mockResolvedValueOnce({
        rows: [[
          "msg-1",
          "session-1",
          "assistant",
          "hello",
          newToolCallsJson,
          100,
          null,
          null,
          null,
          null,
          null,
        ]],
      });

    await service.updateMessage({
      id: "msg-1",
      tool_calls: [
        {
          id: "call-1",
          name: "screenshot",
          arguments: {},
          result: { replacement: true },
          status: "success",
        },
      ],
    });

    expect(deleteImageAssetsIfUnused).toHaveBeenCalledWith(["asset-old"]);
  });
});
