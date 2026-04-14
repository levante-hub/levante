import { describe, it, expect, vi, beforeEach } from "vitest";

const { errorMock } = vi.hoisted(() => ({ errorMock: vi.fn() }));

vi.mock("../../logging", () => ({
  getLogger: () => ({
    aiSdk: {
      warn: vi.fn(),
      info: vi.fn(),
      error: errorMock,
      debug: vi.fn(),
    },
  }),
}));

import {
  validateImagesForAPI,
  ImagePayloadTooLargeError,
} from "../imageValidation";
import { API_IMAGE_MAX_BASE64_SIZE } from "../providerImageLimits";

function bigBase64(len: number): string {
  return "A".repeat(len);
}

describe("validateImagesForAPI", () => {
  beforeEach(() => {
    errorMock.mockClear();
  });

  it("accepts small images[]", () => {
    expect(() =>
      validateImagesForAPI([
        {
          role: "tool",
          content: {
            images: [{ data: bigBase64(1000), mediaType: "image/png" }],
          },
        },
      ]),
    ).not.toThrow();

    expect(errorMock).not.toHaveBeenCalled();
  });

  it("throws on image-data block that exceeds the limit", () => {
    expect(() =>
      validateImagesForAPI([
        {
          role: "tool",
          content: [
            {
              type: "image-data",
              data: bigBase64(API_IMAGE_MAX_BASE64_SIZE + 10),
              mediaType: "image/png",
            },
          ],
        },
      ]),
    ).toThrow(ImagePayloadTooLargeError);
  });

  it("throws on file.url with oversized base64 data URL", () => {
    const url = `data:image/png;base64,${bigBase64(
      API_IMAGE_MAX_BASE64_SIZE + 50,
    )}`;

    expect(() =>
      validateImagesForAPI([
        {
          role: "user",
          content: [{ type: "file", url, mediaType: "image/png" }],
        },
      ]),
    ).toThrow(ImagePayloadTooLargeError);
  });

  it("ignores non-data-URL file URLs", () => {
    expect(() =>
      validateImagesForAPI([
        {
          role: "user",
          content: [
            {
              type: "file",
              url: "https://example.com/big.png",
            },
          ],
        },
      ]),
    ).not.toThrow();

    expect(errorMock).not.toHaveBeenCalled();
  });
});
