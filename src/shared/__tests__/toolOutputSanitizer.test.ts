import { describe, it, expect } from "vitest";
import {
  sanitizeToolOutput,
  stripInlineImagesFromContent,
} from "../toolOutputSanitizer";

describe("stripInlineImagesFromContent", () => {
  it("replaces image blocks with a tombstone and preserves text/resource blocks", () => {
    const content = [
      { type: "text", text: "hello" },
      { type: "image", data: "AAAA", mimeType: "image/png" },
      {
        type: "resource",
        resource: { uri: "ui://foo", mimeType: "text/html", text: "<p/>" },
      },
    ];

    const result = stripInlineImagesFromContent(content);

    expect(result[0]).toEqual({ type: "text", text: "hello" });
    expect(result[1]).toEqual({
      type: "image",
      mimeType: "image/png",
      omitted: true,
    });
    expect(result[2]).toEqual(content[2]);
  });

  it("does not mutate the input array", () => {
    const content = [{ type: "image", data: "AAAA", mimeType: "image/png" }];
    const snapshot = JSON.parse(JSON.stringify(content));

    stripInlineImagesFromContent(content);

    expect(content).toEqual(snapshot);
  });
});

describe("sanitizeToolOutput", () => {
  it("preserves text, uiResources, structuredContent and images as-is", () => {
    const output = {
      text: "txt",
      uiResources: [{ type: "resource" }],
      structuredContent: { a: 1 },
      images: [{ data: "AAAA", mediaType: "image/jpeg" }],
    };

    const result = sanitizeToolOutput(output);

    expect(result.text).toBe("txt");
    expect(result.uiResources).toEqual(output.uiResources);
    expect(result.structuredContent).toEqual({ a: 1 });
    expect(result.images).toEqual(output.images);
  });

  it("does not mutate the input", () => {
    const output = {
      content: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
    };
    const snapshot = JSON.parse(JSON.stringify(output));

    sanitizeToolOutput(output);

    expect(output).toEqual(snapshot);
  });

  it("returns no junk keys when input has neither content nor images", () => {
    const result = sanitizeToolOutput({});

    expect(Object.keys(result)).toEqual([]);
  });

  it("replaces image blocks inside content[] with tombstones", () => {
    const result = sanitizeToolOutput({
      content: [
        { type: "text", text: "hi" },
        { type: "image", data: "AAAA", mimeType: "image/png" },
      ],
    });

    expect(result.content).toEqual([
      { type: "text", text: "hi" },
      { type: "image", mimeType: "image/png", omitted: true },
    ]);
  });
});
