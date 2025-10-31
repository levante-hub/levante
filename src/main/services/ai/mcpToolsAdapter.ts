import { tool } from "ai";
import { z } from "zod/v3";
import { mcpService, configManager } from "../../ipc/mcpHandlers";
import { mcpHealthService } from "../mcpHealthService";
import type { Tool } from "../../types/mcp";
import { getLogger } from '../logging';

const logger = getLogger();

/**
 * Get all MCP tools from connected servers and convert them to AI SDK format
 */
export async function getMCPTools(): Promise<Record<string, any>> {
  try {
    const config = await configManager.loadConfiguration();
    const allTools: Record<string, any> = {};

    // ONLY iterate over mcpServers (active servers)
    // Servers in "disabled" are IGNORED completely
    for (const [serverId, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      try {
        // Ensure server is connected
        if (!mcpService.isConnected(serverId)) {
          await mcpService.connectServer({
            id: serverId,
            ...serverConfig,
          });
        }

        // Get tools from this server
        const serverTools = await mcpService.listTools(serverId);

        // Convert MCP tools to AI SDK format
        for (const mcpTool of serverTools) {
          if (!mcpTool.name || mcpTool.name.trim() === "") {
            logger.aiSdk.error("Invalid tool name from server", {
              serverId,
              tool: mcpTool
            });
            continue;
          }

          const toolId = `${serverId}_${mcpTool.name}`;
          logger.aiSdk.debug("Creating tool", { toolId, originalName: mcpTool.name });

          // Additional validation before creating tool
          if (!toolId || toolId.includes('undefined') || toolId.includes('null')) {
            logger.aiSdk.error("Invalid toolId detected", { toolId, tool: mcpTool });
            continue;
          }

          const aiTool = createAISDKTool(serverId, mcpTool);
          if (!aiTool) {
            logger.aiSdk.error("Failed to create AI SDK tool", { toolId });
            continue;
          }

          allTools[toolId] = aiTool;
          logger.aiSdk.debug("Successfully registered tool", { toolId });
        }

        logger.aiSdk.info("Loaded tools from MCP server", {
          toolCount: serverTools.length,
          serverId
        });
      } catch (error) {
        logger.aiSdk.error("Error loading tools from server", {
          serverId,
          error: error instanceof Error ? error.message : error
        });
        // Continue with next server instead of failing everything
      }
    }

    // Log info about disabled servers
    const disabledCount = Object.keys(config.disabled || {}).length;
    logger.aiSdk.debug('MCP tools loaded', {
      activeServers: Object.keys(config.mcpServers).length,
      disabledServers: disabledCount,
      toolCount: Object.keys(allTools).length
    });

    logger.aiSdk.info("MCP tools summary", {
      totalCount: Object.keys(allTools).length,
      toolNames: Object.keys(allTools)
    });

    return allTools;
  } catch (error) {
    logger.aiSdk.error("Error loading MCP tools", {
      error: error instanceof Error ? error.message : error
    });
    return {};
  }
}

/**
 * Convert an MCP tool to AI SDK format
 */
function createAISDKTool(serverId: string, mcpTool: Tool) {
  logger.aiSdk.debug("Creating AI SDK tool", { serverId, toolName: mcpTool.name });

  // Validate tool name
  if (!mcpTool.name || mcpTool.name.trim() === "") {
    throw new Error(
      `Invalid tool name for server ${serverId}: ${JSON.stringify(mcpTool)}`
    );
  }

  // Create a schema from MCP tool input schema
  let inputSchema = z.object({});

  try {
    if (mcpTool.inputSchema && mcpTool.inputSchema.properties) {
      const schemaObj: Record<string, any> = {};

      for (const [propName, propDef] of Object.entries(
        mcpTool.inputSchema.properties
      )) {
        const propInfo = propDef as any;

        // Map common schema types to Zod
        switch (propInfo.type) {
          case "string":
            schemaObj[propName] = z
              .string()
              .describe(propInfo.description || "");
            break;
          case "number":
            schemaObj[propName] = z
              .number()
              .describe(propInfo.description || "");
            break;
          case "boolean":
            schemaObj[propName] = z
              .boolean()
              .describe(propInfo.description || "");
            break;
          case "array":
            schemaObj[propName] = z
              .array(z.any())
              .describe(propInfo.description || "");
            break;
          default:
            schemaObj[propName] = z
              .any()
              .describe(propInfo.description || "");
        }

        // Handle required fields
        if (!mcpTool.inputSchema.required?.includes(propName)) {
          schemaObj[propName] = schemaObj[propName].optional();
        }
      }

      inputSchema = z.object(schemaObj);
    }
  } catch (error) {
    logger.aiSdk.warn("Failed to parse schema for tool", {
      toolName: mcpTool.name,
      error
    });
  }

  const aiTool = tool({
    description: mcpTool.description || `Tool from MCP server ${serverId}`,
    inputSchema: inputSchema,
    execute: async (args: any) => {
      try {
        logger.aiSdk.debug("Executing MCP tool", {
          serverId,
          toolName: mcpTool.name,
          args
        });

        const result = await mcpService.callTool(serverId, {
          name: mcpTool.name,
          arguments: args,
        });

        logger.aiSdk.debug("Raw MCP result", { result });

        // Convert MCP result to string format for AI SDK
        if (result.content && Array.isArray(result.content)) {
          const resultText = result.content
            .map((item) => {
              if (item.type === "text") {
                return item.text || "";
              } else if (item.type === "resource") {
                return `[Resource: ${item.data}]`;
              } else {
                return `[${item.type}: ${JSON.stringify(item.data)}]`;
              }
            })
            .join("\n");

          logger.aiSdk.debug("Converted result text", { resultText });

          // Record successful tool call
          mcpHealthService.recordSuccess(serverId, mcpTool.name);

          // AI SDK expects the raw result, not wrapped in an object
          return resultText;
        }

        // For non-content results, return JSON string
        const jsonResult = JSON.stringify(result);
        logger.aiSdk.debug("Returning JSON result", { jsonResult });

        // Record successful tool call
        mcpHealthService.recordSuccess(serverId, mcpTool.name);

        return jsonResult;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Tool execution failed";

        logger.aiSdk.error("Error executing MCP tool", {
          serverId,
          toolName: mcpTool.name,
          error
        });

        // Record failed tool call
        mcpHealthService.recordError(serverId, mcpTool.name, errorMessage);

        // For tool execution errors, we should throw to let the AI SDK handle it
        // This will trigger the 'tool-error' event in the stream
        throw new Error(errorMessage);
      }
    },
  });

  logger.aiSdk.debug("Successfully created AI SDK tool", {
    serverId,
    toolName: mcpTool.name
  });

  return aiTool;
}
