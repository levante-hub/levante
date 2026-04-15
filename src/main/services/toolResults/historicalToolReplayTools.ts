import { jsonSchema } from "ai";
import {
  isCanonicalToolResult,
  looksLikeLegacyRichToolOutput,
} from "../../../shared/canonicalToolResult";
import { materializeToolResultForModel } from "./canonicalToolResultService";

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

export async function buildHistoricalReplayTools(params: {
  messages: Array<{ role: string; parts?: unknown[] }>;
  liveTools: Record<string, any>;
  supportsVision: boolean;
}): Promise<Record<string, any>> {
  const tools = { ...params.liveTools };

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
