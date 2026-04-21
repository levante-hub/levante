import { describe, it, expect, vi } from "vitest";

// Stub Electron APIs — miniChatWindow imports BrowserWindow, ipcMain, etc.
vi.mock("electron", () => ({
  BrowserWindow: class {
    isDestroyed() { return false; }
    static getAllWindows() { return []; }
  },
  screen: { getPrimaryDisplay: vi.fn(), getCursorScreenPoint: vi.fn(), getDisplayNearestPoint: vi.fn() },
  shell: { openExternal: vi.fn() },
  ipcMain: { handle: vi.fn() },
  app: {},
}));

vi.mock("../../services/logging", () => ({
  getLogger: () => ({
    core: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }),
}));

vi.mock("../../services/chatService", () => ({
  chatService: {},
}));

import { mapPartsToPersistedToolCalls } from "../miniChatWindow";

describe("mapPartsToPersistedToolCalls", () => {
  it("returns null when there are no tool parts", () => {
    const parts = [
      { type: "text", text: "hello" },
      { type: "reasoning", reasoning: "..." },
    ];
    expect(mapPartsToPersistedToolCalls(parts)).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(mapPartsToPersistedToolCalls([])).toBeNull();
  });

  it("pairs tool-call and tool-result parts by toolCallId", () => {
    const parts = [
      { type: "tool-call", toolCallId: "id-1", toolName: "bash", input: { cmd: "ls" } },
      { type: "tool-result", toolCallId: "id-1", toolName: "bash", output: "file.txt" },
    ];
    const result = mapPartsToPersistedToolCalls(parts);
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      id: "id-1",
      name: "bash",
      arguments: { cmd: "ls" },
      result: "file.txt",
      status: "success",
    });
  });

  it("preserves input and output payloads verbatim", () => {
    const input = { nested: { key: "value" }, arr: [1, 2, 3] };
    const output = { images: [{ data: "AAAA", mediaType: "image/png" }] };
    const parts = [
      { type: "tool-call", toolCallId: "id-2", toolName: "screenshot", input },
      { type: "tool-result", toolCallId: "id-2", output },
    ];
    const result = mapPartsToPersistedToolCalls(parts);
    expect(result![0].arguments).toEqual(input);
    expect(result![0].result).toEqual(output);
  });

  it("handles orphan tool-result without matching tool-call", () => {
    const parts = [
      { type: "tool-result", toolCallId: "orphan-1", toolName: "myTool", output: "data" },
    ];
    const result = mapPartsToPersistedToolCalls(parts);
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      id: "orphan-1",
      name: "myTool",
      arguments: {},
      result: "data",
      status: "success",
    });
  });

  it("handles multiple tool calls in a single message", () => {
    const parts = [
      { type: "tool-call", toolCallId: "a", toolName: "toolA", input: { x: 1 } },
      { type: "tool-call", toolCallId: "b", toolName: "toolB", input: { y: 2 } },
      { type: "tool-result", toolCallId: "a", output: "resultA" },
      { type: "tool-result", toolCallId: "b", output: "resultB" },
    ];
    const result = mapPartsToPersistedToolCalls(parts);
    expect(result).toHaveLength(2);
    const a = result!.find((r) => r.id === "a")!;
    const b = result!.find((r) => r.id === "b")!;
    expect(a.result).toBe("resultA");
    expect(b.result).toBe("resultB");
  });
});
