import { describe, it, expect, vi, beforeEach } from "vitest";

const { isEnabledMock, debugMock, infoMock } = vi.hoisted(() => ({
  isEnabledMock: vi.fn(),
  debugMock: vi.fn(),
  infoMock: vi.fn(),
}));

vi.mock("../logging", () => ({
  getLogger: () => ({
    isEnabled: isEnabledMock,
    aiSdk: {
      debug: debugMock,
      info: infoMock,
    },
  }),
}));

import { collectLargestStrings, collectImagePayloads, logContextDiagnostics } from "../ai/contextDiagnostics";

describe("logContextDiagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips all work when ai-sdk debug is disabled", () => {
    isEnabledMock.mockReturnValue(false);

    const deepObject = {
      a: "x".repeat(10_000),
      b: { c: "y".repeat(10_000) },
    };

    // Wrap collectLargestStrings to spy — but since guard exits early, neither
    // debugMock nor infoMock should be called and no traversal happens.
    const mockLogger = { aiSdk: { debug: debugMock, info: infoMock } } as any;
    logContextDiagnostics(mockLogger, "test", deepObject);

    expect(debugMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
  });

  it("emits via logger.aiSdk.debug (not info) when ai-sdk debug is enabled", () => {
    isEnabledMock.mockReturnValue(true);

    const payload = { text: "hello world" };
    const mockLogger = { aiSdk: { debug: debugMock, info: infoMock } } as any;

    logContextDiagnostics(mockLogger, "payload", payload);

    expect(debugMock).toHaveBeenCalledTimes(2);
    expect(debugMock).toHaveBeenCalledWith(
      "[CTX_DIAGNOSTICS] Largest strings",
      expect.objectContaining({ label: "payload" }),
    );
    expect(debugMock).toHaveBeenCalledWith(
      "[CTX_DIAGNOSTICS] Image payloads",
      expect.objectContaining({ label: "payload" }),
    );
    expect(infoMock).not.toHaveBeenCalled();
  });
});

describe("collectLargestStrings", () => {
  it("collects strings from nested objects", () => {
    const acc: any[] = [];
    collectLargestStrings({ a: "hello", b: { c: "world" } }, "root", acc);
    const paths = acc.map((e) => e.path);
    expect(paths).toContain("root.a");
    expect(paths).toContain("root.b.c");
  });

  it("collects strings from arrays", () => {
    const acc: any[] = [];
    collectLargestStrings(["foo", "bar"], "arr", acc);
    expect(acc.some((e) => e.path === "arr[0]")).toBe(true);
    expect(acc.some((e) => e.path === "arr[1]")).toBe(true);
  });
});

describe("collectImagePayloads", () => {
  it("detects file-type data URI payloads", () => {
    const acc: any[] = [];
    collectImagePayloads(
      { type: "file", url: "data:image/png;base64," + "A".repeat(100) },
      "root",
      acc,
    );
    expect(acc.length).toBeGreaterThan(0);
    expect(acc[0].kind).toBe("file-data-url");
  });

  it("detects image-data payloads", () => {
    const acc: any[] = [];
    collectImagePayloads(
      { type: "image-data", data: "A".repeat(200), mediaType: "image/png" },
      "root",
      acc,
    );
    expect(acc.length).toBe(1);
    expect(acc[0].kind).toBe("image-data");
    expect(acc[0].base64Length).toBe(200);
  });
});
