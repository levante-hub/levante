import { getLogger } from "../logging";

type ContextStringDiagnostic = {
  path: string;
  length: number;
  preview: string;
};

type ContextImageDiagnostic = {
  path: string;
  kind: "image-data" | "file-data-url" | "tool-images" | "tool-image-ref";
  base64Length: number;
  mediaType?: string;
};

export function collectLargestStrings(
  value: unknown,
  path: string,
  acc: ContextStringDiagnostic[],
): void {
  if (typeof value === "string") {
    acc.push({
      path,
      length: value.length,
      preview: value.slice(0, 120),
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectLargestStrings(item, `${path}[${index}]`, acc),
    );
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      collectLargestStrings(child, `${path}.${key}`, acc);
    }
  }
}

export function collectImagePayloads(
  value: unknown,
  path: string,
  acc: ContextImageDiagnostic[],
): void {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectImagePayloads(item, `${path}[${index}]`, acc),
    );
    return;
  }

  const obj = value as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : undefined;

  if (type === "image-data" && typeof obj.data === "string") {
    acc.push({
      path,
      kind: "image-data",
      base64Length: obj.data.length,
      mediaType: typeof obj.mediaType === "string" ? obj.mediaType : undefined,
    });
  }

  if (
    type === "file" &&
    typeof obj.url === "string" &&
    obj.url.startsWith("data:image/")
  ) {
    const base64 = obj.url.split(",")[1] || "";
    acc.push({
      path,
      kind: "file-data-url",
      base64Length: base64.length,
      mediaType: typeof obj.mediaType === "string" ? obj.mediaType : undefined,
    });
  }

  if (Array.isArray(obj.images)) {
    obj.images.forEach((image, index) => {
      if (image && typeof image === "object") {
        const img = image as Record<string, unknown>;
        acc.push({
          path: `${path}.images[${index}]`,
          kind: "tool-images",
          base64Length: typeof img.data === "string" ? img.data.length : 0,
          mediaType:
            typeof img.mediaType === "string" ? img.mediaType : undefined,
        });
      }
    });
  }

  if (
    obj.kind === "image-ref" &&
    typeof obj.assetId === "string" &&
    typeof obj.mediaType === "string"
  ) {
    acc.push({
      path,
      kind: "tool-image-ref",
      base64Length: 0,
      mediaType: obj.mediaType,
    });
  }

  for (const [key, child] of Object.entries(obj)) {
    if (key === "images") continue;
    collectImagePayloads(child, `${path}.${key}`, acc);
  }
}

export function logContextDiagnostics(
  logger: ReturnType<typeof getLogger>,
  label: string,
  value: unknown,
): void {
  if (!getLogger().isEnabled("ai-sdk", "debug")) return;

  const strings: ContextStringDiagnostic[] = [];
  const images: ContextImageDiagnostic[] = [];

  collectLargestStrings(value, label, strings);
  collectImagePayloads(value, label, images);

  strings.sort((a, b) => b.length - a.length);
  images.sort((a, b) => b.base64Length - a.base64Length);

  logger.aiSdk.debug("[CTX_DIAGNOSTICS] Largest strings", {
    label,
    topStrings: strings.slice(0, 20),
  });

  logger.aiSdk.debug("[CTX_DIAGNOSTICS] Image payloads", {
    label,
    imagePayloads: images.slice(0, 20),
  });
}
