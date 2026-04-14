import { describe, it, expect } from "vitest";
import { normalizeToolResult } from "../normalizeToolResult";

describe("normalizeToolResult", () => {
  it("preserves content[] when provided as array", () => {
    const content = [
      { type: "text", text: "hi" },
      { type: "image", data: "AAAA", mimeType: "image/png" },
    ];

    const result = normalizeToolResult({ content });

    expect(result.content).toBe(content);
  });

  it("wraps string content in a text block", () => {
    const result = normalizeToolResult({ content: "plain string" });

    expect(result.content).toEqual([{ type: "text", text: "plain string" }]);
  });

  it("falls back to structuredContent when content is absent", () => {
    const result = normalizeToolResult({
      structuredContent: { answer: 42 },
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect((result.content[0] as any).text).toContain("42");
  });

  it("preserves _meta and structuredContent alongside content", () => {
    const content = [{ type: "text", text: "hi" }];
    const result = normalizeToolResult({
      content,
      structuredContent: { a: 1 },
      _meta: { foo: "bar" },
    });

    expect(result.content).toBe(content);
    expect(result.structuredContent).toEqual({ a: 1 });
    expect(result._meta).toEqual({ foo: "bar" });
  });
});
