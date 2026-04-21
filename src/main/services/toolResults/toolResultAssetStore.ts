import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { databaseService } from "../databaseService";
import { getImageDimensions } from "../image/imageResizer";

export interface PersistedImageAsset {
  assetId: string;
  sha256: string;
  mediaType: string;
  byteSize: number;
  base64Length: number;
  width?: number;
  height?: number;
}

function getImageAssetsDirectory(): string {
  return path.join(app.getPath("userData"), "tool-result-assets", "images");
}

function extensionFromMediaType(mediaType: string): string {
  switch (mediaType) {
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/png":
    default:
      return ".png";
  }
}

function buildAssetPath(assetId: string, mediaType: string): string {
  return path.join(
    getImageAssetsDirectory(),
    `${assetId}${extensionFromMediaType(mediaType)}`,
  );
}

async function findAssetPaths(assetId: string): Promise<string[]> {
  try {
    const entries = await readdir(getImageAssetsDirectory());
    return entries
      .filter((entry) => entry === assetId || entry.startsWith(`${assetId}.`))
      .map((entry) => path.join(getImageAssetsDirectory(), entry));
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Reference check using full-table LIKE scan. assetIds are SHA-256 hex
 * (64 chars, [0-9a-f]) so they contain no SQL LIKE metacharacters.
 *
 * Acceptable for current message volumes; consider a dedicated join
 * table (message_tool_assets: message_id, asset_id) if this becomes
 * a hotspot.
 */
async function isAssetReferenced(assetId: string): Promise<boolean> {
  const result = await databaseService.execute(
    "SELECT 1 FROM messages WHERE tool_calls LIKE ? LIMIT 1",
    [`%${assetId}%`],
  );

  return result.rows.length > 0;
}

export async function persistImageAsset(params: {
  dataBase64: string;
  mediaType: string;
}): Promise<PersistedImageAsset> {
  const bytes = Buffer.from(params.dataBase64, "base64");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const assetId = sha256;
  const assetPath = buildAssetPath(assetId, params.mediaType);

  await mkdir(getImageAssetsDirectory(), { recursive: true });

  try {
    await writeFile(assetPath, bytes, { flag: "wx" });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EEXIST") {
      throw error;
    }
  }

  const dimensions = await getImageDimensions(bytes);

  return {
    assetId,
    sha256,
    mediaType: params.mediaType,
    byteSize: bytes.length,
    base64Length: params.dataBase64.length,
    ...dimensions,
  };
}

export async function readImageAsset(params: {
  assetId: string;
  mediaType: string;
}): Promise<{ dataBase64: string; mediaType: string }> {
  const preferredPath = buildAssetPath(params.assetId, params.mediaType);
  let bytes: Buffer;

  try {
    bytes = await readFile(preferredPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw error;
    }

    const fallbackPaths = await findAssetPaths(params.assetId);
    if (fallbackPaths.length === 0) {
      throw error;
    }

    bytes = await readFile(fallbackPaths[0]);
  }

  return {
    dataBase64: bytes.toString("base64"),
    mediaType: params.mediaType,
  };
}

export async function deleteImageAssetsIfUnused(assetIds: string[]): Promise<void> {
  const uniqueAssetIds = [...new Set(assetIds.filter(Boolean))];

  for (const assetId of uniqueAssetIds) {
    if (await isAssetReferenced(assetId)) {
      continue;
    }

    const assetPaths = await findAssetPaths(assetId);
    for (const assetPath of assetPaths) {
      try {
        await unlink(assetPath);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          throw error;
        }
      }
    }
  }
}
