import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPathMock, executeMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: getPathMock,
  },
}));

vi.mock("../../databaseService", () => ({
  databaseService: {
    execute: executeMock,
  },
}));

import {
  deleteImageAssetsIfUnused,
  persistImageAsset,
  readImageAsset,
} from "../toolResultAssetStore";

describe("toolResultAssetStore", () => {
  let userDataDir: string;
  let referencedAssetIds: Set<string>;
  let imageBase64: string;

  beforeEach(async () => {
    userDataDir = await mkdtemp(path.join(os.tmpdir(), "levante-tool-assets-"));
    referencedAssetIds = new Set<string>();
    imageBase64 = Buffer.from("fake-image-bytes").toString("base64");

    getPathMock.mockReturnValue(userDataDir);
    executeMock.mockImplementation(async (_sql: string, params: unknown[]) => {
      const needle = String(params[0] ?? "").replace(/%/g, "");
      return {
        rows: referencedAssetIds.has(needle) ? [[1]] : [],
      };
    });
  });

  it("persists a new asset and returns metadata", async () => {
    const asset = await persistImageAsset({
      dataBase64: imageBase64,
      mediaType: "image/png",
    });

    expect(asset.assetId).toBe(asset.sha256);
    expect(asset.byteSize).toBe(Buffer.from(imageBase64, "base64").length);
    expect(asset.base64Length).toBe(imageBase64.length);
  });

  it("reuses the same assetId for identical content", async () => {
    const first = await persistImageAsset({
      dataBase64: imageBase64,
      mediaType: "image/png",
    });
    const second = await persistImageAsset({
      dataBase64: imageBase64,
      mediaType: "image/png",
    });

    expect(first.assetId).toBe(second.assetId);

    const files = await readdir(path.join(userDataDir, "tool-result-assets", "images"));
    expect(files).toHaveLength(1);
  });

  it("rehydrates the same base64 payload", async () => {
    const asset = await persistImageAsset({
      dataBase64: imageBase64,
      mediaType: "image/png",
    });

    const restored = await readImageAsset({
      assetId: asset.assetId,
      mediaType: "image/png",
    });

    expect(restored).toEqual({
      dataBase64: imageBase64,
      mediaType: "image/png",
    });
  });

  it("does not delete an asset that is still referenced", async () => {
    const asset = await persistImageAsset({
      dataBase64: imageBase64,
      mediaType: "image/png",
    });
    referencedAssetIds.add(asset.assetId);

    await deleteImageAssetsIfUnused([asset.assetId]);

    const files = await readdir(path.join(userDataDir, "tool-result-assets", "images"));
    expect(files).toHaveLength(1);
  });

  it("deletes an asset when no reference remains", async () => {
    const asset = await persistImageAsset({
      dataBase64: imageBase64,
      mediaType: "image/png",
    });

    await deleteImageAssetsIfUnused([asset.assetId]);

    const files = await readdir(path.join(userDataDir, "tool-result-assets", "images"));
    expect(files).toHaveLength(0);
  });
});
