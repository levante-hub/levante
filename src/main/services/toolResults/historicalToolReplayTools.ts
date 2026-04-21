import { jsonSchema } from "ai";
import {
  extractLegacyImages,
  isCanonicalImageRef,
  isCanonicalToolResult,
  looksLikeLegacyRichToolOutput,
} from "../../../shared/canonicalToolResult";
import { materializeToolResultForModel } from "./canonicalToolResultService";

/** Maximum number of historical image payloads re-injected per turn. */
const HISTORICAL_IMAGE_BUDGET = 2;

function resolveToolName(part: Record<string, unknown>): string | undefined {
  if (typeof part.toolName === "string" && part.toolName.length > 0) {
    return part.toolName;
  }

  if (
    typeof part.type === "string" &&
    part.type.startsWith("tool-") &&
    part.type !== "tool-invocation"
  ) {
    return part.type.slice("tool-".length);
  }

  return undefined;
}

function outputHasImages(output: unknown): boolean {
  if (isCanonicalToolResult(output)) {
    return (
      output.modelOutput.type === "content" &&
      output.modelOutput.value.some(isCanonicalImageRef)
    );
  }
  if (looksLikeLegacyRichToolOutput(output)) {
    return extractLegacyImages(output as Record<string, unknown>).length > 0;
  }
  return false;
}

function countHistoricalImages(
  messages: Array<{ role: string; parts?: unknown[] }>,
): number {
  let count = 0;
  for (const message of messages) {
    if (!Array.isArray(message.parts)) continue;
    for (const rawPart of message.parts) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as Record<string, unknown>;
      if (part.state !== "output-available") continue;
      if (outputHasImages(part.output)) count++;
    }
  }
  return count;
}

export async function buildHistoricalReplayTools(params: {
  messages: Array<{ role: string; parts?: unknown[] }>;
  liveTools: Record<string, any>;
  supportsVision: boolean;
}): Promise<Record<string, any>> {
  const tools = { ...params.liveTools };

  // Track how many image-bearing historical results to degrade (oldest first).
  // This prevents O(turns²) image re-injection when a tool is called repeatedly.
  const totalImages = countHistoricalImages(params.messages);
  let imagesToSkip = Math.max(0, totalImages - HISTORICAL_IMAGE_BUDGET);

  for (const message of params.messages) {
    if (!Array.isArray(message.parts)) {
      continue;
    }

    for (const rawPart of message.parts) {
      if (!rawPart || typeof rawPart !== "object") {
        continue;
      }

      const part = rawPart as Record<string, unknown>;
      if (part.state !== "output-available") {
        continue;
      }

      const toolName = resolveToolName(part);
      if (!toolName || toolName in tools) {
        continue;
      }

      const output = part.output;
      if (
        !isCanonicalToolResult(output) &&
        !looksLikeLegacyRichToolOutput(output)
      ) {
        continue;
      }

      tools[toolName] = {
        type: "dynamic",
        description: "Historical tool replay adapter",
        inputSchema: jsonSchema({ type: "object", additionalProperties: true }),
        async toModelOutput({ output }: { output: unknown }) {
          // Degrade oldest image results to text to stay within the budget.
          // imagesToSkip is captured by reference and shared across all tool
          // stubs — the SDK calls toModelOutput in message order (oldest first),
          // so decrementing here keeps the NEWEST images intact.
          if (outputHasImages(output) && imagesToSkip > 0) {
            imagesToSkip--;
            return materializeToolResultForModel({ output, supportsVision: false });
          }
          return materializeToolResultForModel({
            output,
            supportsVision: params.supportsVision,
          });
        },
      };
    }
  }

  return tools;
}
