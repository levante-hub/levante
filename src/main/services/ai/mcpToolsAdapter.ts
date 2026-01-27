/**
 * MCP Tools Adapter
 *
 * Converts MCP (Model Context Protocol) tools to AI SDK format.
 * Handles schema sanitization for provider compatibility and widget rendering.
 */

import { tool, jsonSchema } from "ai";
import { mcpService, configManager } from "../../ipc/mcpHandlers";
import { mcpHealthService } from "../mcpHealthService";
import type { Tool, DisabledTools } from "../../types/mcp";
import { getLogger } from "../logging";

// Import from modules
import { sanitizeSchema } from "./schemaSanitizer";
import {
  injectDataIntoHtml,
  injectAppsSdkBridge,
  detectWidgetProtocol,
  type WidgetProtocol,
} from "./widgets";

const logger = getLogger();

/**
 * Get all MCP tools from connected servers and convert them to AI SDK format
 * Optimized: Connects to servers in parallel for faster initialization
 * @param disabledTools - Optional object mapping serverId to array of disabled tool names
 */
export async function getMCPTools(
  disabledTools?: DisabledTools
): Promise<Record<string, any>> {
  const startTime = Date.now();

  try {
    const config = await configManager.loadConfiguration();
    const allTools: Record<string, any> = {};
    const serverEntries = Object.entries(config.mcpServers);

    if (serverEntries.length === 0) {
      logger.aiSdk.debug("No active MCP servers configured");
      return allTools;
    }

    logger.aiSdk.info("Loading MCP tools (parallel)", {
      serverCount: serverEntries.length,
      serverIds: serverEntries.map(([id]) => id),
    });

    // PHASE 1: Connect all servers in parallel
    const serversToConnect = serverEntries.filter(
      ([serverId]) => !mcpService.isConnected(serverId)
    );

    if (serversToConnect.length > 0) {
      const connectStartTime = Date.now();

      const connectPromises = serversToConnect.map(([serverId, serverConfig]) =>
        mcpService
          .connectServer({ id: serverId, ...serverConfig })
          .then(() => ({ serverId, success: true }))
          .catch((error) => {
            logger.aiSdk.error("Failed to connect to MCP server", {
              serverId,
              error: error instanceof Error ? error.message : error,
            });
            return { serverId, success: false, error };
          })
      );

      const connectResults = await Promise.allSettled(connectPromises);

      const connectedCount = connectResults.filter(
        (r) => r.status === "fulfilled" && r.value.success
      ).length;

      logger.aiSdk.info("MCP servers connection phase complete", {
        attempted: serversToConnect.length,
        connected: connectedCount,
        durationMs: Date.now() - connectStartTime,
      });
    }

    // PHASE 2: Get tools from all connected servers in parallel
    const toolsStartTime = Date.now();

    const toolsPromises = serverEntries.map(async ([serverId]) => {
      if (!mcpService.isConnected(serverId)) {
        return { serverId, tools: [], success: false };
      }

      try {
        const tools = await mcpService.listTools(serverId);
        return { serverId, tools, success: true };
      } catch (error) {
        logger.aiSdk.error("Failed to list tools from server", {
          serverId,
          error: error instanceof Error ? error.message : error,
        });
        return { serverId, tools: [], success: false };
      }
    });

    const toolsResults = await Promise.allSettled(toolsPromises);

    logger.aiSdk.debug("MCP tools fetch phase complete", {
      durationMs: Date.now() - toolsStartTime,
    });

    // PHASE 3: Convert tools to AI SDK format
    let skippedDisabledCount = 0;

    for (const result of toolsResults) {
      if (result.status !== "fulfilled" || !result.value.success) continue;

      const { serverId, tools: serverTools } = result.value;
      const serverDisabledTools = disabledTools?.[serverId] || [];

      for (const mcpTool of serverTools) {
        if (!mcpTool.name || mcpTool.name.trim() === "") {
          logger.aiSdk.error("Invalid tool name from server", {
            serverId,
            tool: mcpTool,
          });
          continue;
        }

        // Skip disabled tools
        if (serverDisabledTools.includes(mcpTool.name)) {
          skippedDisabledCount++;
          logger.aiSdk.debug("Skipping disabled tool", {
            serverId,
            toolName: mcpTool.name,
          });
          continue;
        }

        const toolId = `${serverId}_${mcpTool.name}`;

        if (
          !toolId ||
          toolId.includes("undefined") ||
          toolId.includes("null")
        ) {
          logger.aiSdk.error("Invalid toolId detected", {
            toolId,
            tool: mcpTool,
          });
          continue;
        }

        const aiTool = createAISDKTool(serverId, mcpTool);
        if (!aiTool) {
          logger.aiSdk.error("Failed to create AI SDK tool", { toolId });
          continue;
        }

        allTools[toolId] = aiTool;
      }

      if (serverTools.length > 0) {
        logger.aiSdk.info("Loaded tools from MCP server", {
          toolCount: serverTools.length,
          serverId,
        });
      }
    }

    // Log summary
    const disabledServersCount = Object.keys(config.disabled || {}).length;
    const totalDuration = Date.now() - startTime;

    logger.aiSdk.info("MCP tools loading complete", {
      totalCount: Object.keys(allTools).length,
      activeServers: serverEntries.length,
      disabledServers: disabledServersCount,
      disabledTools: skippedDisabledCount,
      durationMs: totalDuration,
      toolNames: Object.keys(allTools),
    });

    return allTools;
  } catch (error) {
    logger.aiSdk.error("Error loading MCP tools", {
      error: error instanceof Error ? error.message : error,
      durationMs: Date.now() - startTime,
    });
    return {};
  }
}

/**
 * Convert an MCP tool to AI SDK format
 */
function createAISDKTool(serverId: string, mcpTool: Tool) {
  logger.aiSdk.debug("Creating AI SDK tool", {
    serverId,
    toolName: mcpTool.name,
  });

  // Validate tool name
  if (!mcpTool.name || mcpTool.name.trim() === "") {
    throw new Error(
      `Invalid tool name for server ${serverId}: ${JSON.stringify(mcpTool)}`
    );
  }

  // Sanitize MCP JSON Schema for provider compatibility
  // Uses the strictest sanitization (Gemini) by default for maximum compatibility
  let inputSchema: ReturnType<typeof jsonSchema>;

  try {
    if (mcpTool.inputSchema) {
      // Sanitize schema: fix objects without properties, arrays without items,
      // and filter invalid required references
      const sanitizedSchema = sanitizeSchema(
        mcpTool.inputSchema,
        undefined,
        mcpTool.name
      );

      logger.aiSdk.debug("Sanitized MCP schema", {
        toolName: mcpTool.name,
        serverId,
        originalType: mcpTool.inputSchema.type,
        sanitizedType: sanitizedSchema.type,
        hasProperties: !!sanitizedSchema.properties,
      });

      inputSchema = jsonSchema(sanitizedSchema);
    } else {
      // Fallback to empty object schema
      inputSchema = jsonSchema({ type: "object", properties: {} });
    }
  } catch (error) {
    logger.aiSdk.warn("Failed to sanitize schema for tool, using fallback", {
      toolName: mcpTool.name,
      error,
    });
    inputSchema = jsonSchema({ type: "object", properties: {} });
  }

  const aiTool = tool({
    description: mcpTool.description || `Tool from MCP server ${serverId}`,
    inputSchema: inputSchema,
    execute: async (args: any) => {
      try {
        logger.aiSdk.debug("Executing MCP tool", {
          serverId,
          toolName: mcpTool.name,
          args,
        });

        const result = await mcpService.callTool(serverId, {
          name: mcpTool.name,
          arguments: args,
        });

        logger.aiSdk.debug("[AI-SDK] Raw MCP tool result", {
          toolName: mcpTool.name,
          serverId,
          contentLength: result.content?.length || 0,
          hasMeta: !!result._meta,
          hasWidgetMeta: !!result._meta?.["mcp-use/widget"],
          hasStructuredContent: !!result.structuredContent,
        });

        // Detect widget protocol using unified detection logic
        // Priority: mcp-use/widget > ui/resourceUri > openai/outputTemplate > embedded ui://
        const toolMeta = { ...mcpTool._meta, ...result._meta };
        const detectedProtocol = detectWidgetProtocol(toolMeta, result);

        logger.aiSdk.debug("[AI-SDK] Widget protocol detection", {
          toolName: mcpTool.name,
          detectedProtocol,
          hasUiResourceUri: !!toolMeta["ui/resourceUri"],
          hasOpenaiOutputTemplate: !!toolMeta["openai/outputTemplate"],
        });

        // Check for mcp-use widget in _meta
        const widgetMeta = result._meta?.["mcp-use/widget"];
        // Check for OpenAI Apps SDK widget format - can be in tool definition or result
        const openaiOutputTemplate =
          result._meta?.["openai/outputTemplate"] ||
          mcpTool._meta?.["openai/outputTemplate"];

        if (widgetMeta) {
          return handleMcpUseWidget(
            serverId,
            mcpTool,
            args,
            result,
            widgetMeta
          );
        }

        // Check if there are embedded UI resources in content[] first
        // According to MCP-UI docs, these are for MCP-UI hosts (not ChatGPT)
        // and should NOT have the Apps SDK adapter enabled
        const hasEmbeddedUIResource = result.content?.some((item: any) => {
          if (item.type === "resource") {
            const res = item.resource || item.data || item;
            const uri = res?.uri || "";
            const mimeType = res?.mimeType || "";
            return (
              uri.startsWith("ui://") ||
              mimeType === "text/html" ||
              mimeType.startsWith("text/html+")
            );
          }
          return false;
        });

        // Prioritize embedded resources (for MCP-UI hosts) over outputTemplate (for ChatGPT)
        if (hasEmbeddedUIResource) {
          logger.aiSdk.debug(
            "[AI-SDK] Found embedded UI resource in content[], processing directly",
            {
              toolName: mcpTool.name,
              protocol: detectedProtocol,
            }
          );
          return processToolResult(
            serverId,
            mcpTool,
            args,
            result,
            detectedProtocol
          );
        }

        // If no embedded resources but has outputTemplate, fetch the template
        if (
          openaiOutputTemplate &&
          typeof openaiOutputTemplate === "string" &&
          openaiOutputTemplate.startsWith("ui://")
        ) {
          const appsSdkResult = await handleAppsSdkWidget(
            serverId,
            mcpTool,
            args,
            result,
            openaiOutputTemplate
          );
          if (appsSdkResult) return appsSdkResult;
          // Fall through to normal processing if Apps SDK handling fails
        }

        // Check for MCP Apps (SEP-1865) widget format with ui/resourceUri
        const uiResourceUri =
          result._meta?.["ui/resourceUri"] || mcpTool._meta?.["ui/resourceUri"];
        if (
          uiResourceUri &&
          typeof uiResourceUri === "string" &&
          uiResourceUri.startsWith("ui://")
        ) {
          const mcpAppsResult = await handleMcpAppsWidget(
            serverId,
            mcpTool,
            args,
            result,
            uiResourceUri
          );
          if (mcpAppsResult) return mcpAppsResult;
          // Fall through to normal processing if MCP Apps handling fails
        }

        // Process MCP result - preserve UI resources for rendering
        return processToolResult(
          serverId,
          mcpTool,
          args,
          result,
          detectedProtocol
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Tool execution failed";

        logger.aiSdk.error("Error executing MCP tool", {
          serverId,
          toolName: mcpTool.name,
          error,
        });

        // Record failed tool call
        mcpHealthService.recordError(serverId, mcpTool.name, errorMessage);

        // For tool execution errors, throw to let the AI SDK handle it
        throw new Error(errorMessage);
      }
    },
  });

  logger.aiSdk.debug("Successfully created AI SDK tool", {
    serverId,
    toolName: mcpTool.name,
  });

  return aiTool;
}

/**
 * Handle mcp-use widget results
 * Server MUST provide HTML in widgetMeta.html - no client-side template generation
 */
function handleMcpUseWidget(
  serverId: string,
  mcpTool: Tool,
  args: any,
  result: any,
  widgetMeta: any
) {
  logger.aiSdk.info("[AI-SDK] Found mcp-use widget in _meta", {
    toolName: mcpTool.name,
    widgetName: widgetMeta.name,
    widgetType: widgetMeta.type,
    hasHtml: !!widgetMeta.html,
  });

  const widgetData = result.structuredContent || args;

  // Server MUST provide HTML - no client-side template generation
  if (!widgetMeta.html || typeof widgetMeta.html !== "string") {
    logger.aiSdk.warn(
      "[AI-SDK] Widget missing HTML content - server should provide it",
      {
        toolName: mcpTool.name,
        widgetName: widgetMeta.name,
      }
    );

    // Fall back to placeholder - NEVER include widgetData in text (may contain secrets)
    mcpHealthService.recordSuccess(serverId, mcpTool.name);
    return {
      text: `[Widget: ${widgetMeta.name}]`,
      content: result.content,
      _meta: result._meta,
      structuredContent: result.structuredContent,
    };
  }

  // Server provided the HTML template - inject the data into it
  const widgetHtml = injectDataIntoHtml(widgetMeta.html, widgetData);

  // Create UI resource with widget data in _meta
  const uiResource = {
    type: "resource",
    resource: {
      uri: `ui://widget/${widgetMeta.name}.html`,
      mimeType: "text/html",
      text: widgetHtml,
      _meta: {
        widgetName: widgetMeta.name,
        widgetType: widgetMeta.type,
        widgetData: widgetData,
        props: widgetData,
      },
    },
  };

  // Record successful tool call
  mcpHealthService.recordSuccess(serverId, mcpTool.name);

  return {
    text: `[UI Widget: ${widgetMeta.name}]`,
    content: result.content,
    uiResources: [uiResource],
    _meta: result._meta,
    structuredContent: result.structuredContent,
  };
}

/**
 * Generate a stable widget session ID
 * Uses crypto.randomUUID() for unique identifier
 */
function generateWidgetSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Extract OpenAI Apps SDK metadata from tool definition and result
 */
function extractOpenAISdkMetadata(mcpTool: Tool, result: any) {
  const toolMeta = mcpTool._meta || {};
  const resultMeta = result._meta || {};

  // Extract annotations from tool definition (standard MCP format)
  // These follow the MCP tool definition spec
  const toolAnnotations = mcpTool.annotations || {};

  // Extract user location hint (can come from tool or result metadata)
  const userLocationMeta =
    resultMeta["openai/userLocation"] || toolMeta["openai/userLocation"];

  return {
    // Session ID - generate fresh for each widget instance
    widgetSessionId: generateWidgetSessionId(),
    // Border preference
    widgetPrefersBorder:
      resultMeta["openai/widgetPrefersBorder"] ??
      toolMeta["openai/widgetPrefersBorder"] ??
      false,
    // CSP
    widgetCSP:
      resultMeta["openai/widgetCSP"] || toolMeta["openai/widgetCSP"],
    // Invocation status text
    invocationStatusText: {
      invoking:
        resultMeta["openai/invocationStatusText"]?.invoking ||
        toolMeta["openai/invocationStatusText"]?.invoking,
      invoked:
        resultMeta["openai/invocationStatusText"]?.invoked ||
        toolMeta["openai/invocationStatusText"]?.invoked,
    },
    // Tool behavior annotations
    annotations: {
      readOnlyHint: toolAnnotations.readOnlyHint,
      destructiveHint: toolAnnotations.destructiveHint,
      idempotentHint: toolAnnotations.idempotentHint,
      openWorldHint: toolAnnotations.openWorldHint,
    },
    // User location hint
    userLocation: userLocationMeta
      ? {
          city: userLocationMeta.city,
          country: userLocationMeta.country,
          region: userLocationMeta.region,
          timezone: userLocationMeta.timezone,
        }
      : undefined,
  };
}

/**
 * Handle OpenAI Apps SDK widget results
 * Widgets that use the openai/outputTemplate metadata format
 */
async function handleAppsSdkWidget(
  serverId: string,
  mcpTool: Tool,
  args: any,
  result: any,
  openaiOutputTemplate: string
): Promise<any | null> {
  // Extract all OpenAI SDK metadata
  const openaiMeta = extractOpenAISdkMetadata(mcpTool, result);

  logger.aiSdk.info("[AI-SDK] Found openai/outputTemplate widget", {
    toolName: mcpTool.name,
    templateUri: openaiOutputTemplate,
    hasWidgetCSP: !!openaiMeta.widgetCSP,
    widgetSessionId: openaiMeta.widgetSessionId,
    widgetPrefersBorder: openaiMeta.widgetPrefersBorder,
  });

  try {
    // Fetch widget HTML from the UI resource
    const resourceContent = await mcpService.readResource(
      serverId,
      openaiOutputTemplate
    );

    if (resourceContent?.contents?.[0]?.text) {
      let widgetHtml = resourceContent.contents[0].text;

      // Extract widget data from result._meta (excluding openai/* keys)
      const widgetData: Record<string, any> = {};
      if (result._meta) {
        for (const [key, value] of Object.entries(result._meta)) {
          if (!key.startsWith("openai/")) {
            widgetData[key] = value;
          }
        }
      }

      // Also include structuredContent if available
      if (result.structuredContent) {
        Object.assign(widgetData, result.structuredContent);
      }

      // For openai/outputTemplate widgets, the widget itself uses the OpenAI Apps SDK
      // client library which handles communication. We should NOT inject our bridge
      // as it would conflict with the widget's own SDK initialization.
      //
      // These widgets:
      // 1. Load external scripts that include @openai/apps-sdk
      // 2. Set up window.openai internally via the SDK
      // 3. Communicate via postMessage (openai:* events)
      //
      // We just mark them as Apps SDK widgets for the renderer to handle postMessage.
      logger.aiSdk.debug(
        "[AI-SDK] Apps SDK widget via outputTemplate - not injecting bridge",
        {
          toolName: mcpTool.name,
          templateUri: openaiOutputTemplate,
        }
      );

      // Normalize mimeType
      let mimeType = resourceContent.contents[0].mimeType || "text/html";
      if (mimeType.startsWith("text/html+")) {
        mimeType = "text/html";
      }

      // Create UI resource with Apps SDK widget
      // Include OpenAI SDK metadata for renderer
      const uiResource = {
        type: "resource",
        resource: {
          uri: openaiOutputTemplate,
          mimeType: mimeType,
          text: widgetHtml,
          _meta: {
            widgetData: widgetData,
            props: widgetData,
            isAppsSdk: true,
            // OpenAI Apps SDK metadata
            ...(openaiMeta.widgetCSP && { widgetCSP: openaiMeta.widgetCSP }),
            widgetPrefersBorder: openaiMeta.widgetPrefersBorder,
            invocationStatusText: openaiMeta.invocationStatusText,
            // Bridge options for widget proxy - provides toolInput/toolOutput to widget
            bridgeOptions: {
              toolInput: args,
              toolOutput: result.structuredContent || {},
              responseMetadata: result._meta || {},
              serverId,
              widgetSessionId: openaiMeta.widgetSessionId,
              widgetPrefersBorder: openaiMeta.widgetPrefersBorder,
              invocationStatusText: openaiMeta.invocationStatusText,
              annotations: openaiMeta.annotations,
              userLocation: openaiMeta.userLocation,
            },
          },
        },
      };

      mcpHealthService.recordSuccess(serverId, mcpTool.name);

      return {
        text: `[UI Widget from ${openaiOutputTemplate}]`,
        content: result.content,
        uiResources: [uiResource],
        _meta: result._meta,
        structuredContent: result.structuredContent,
      };
    }
  } catch (error) {
    logger.aiSdk.error("[AI-SDK] Failed to fetch Apps SDK widget", {
      toolName: mcpTool.name,
      templateUri: openaiOutputTemplate,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}

/**
 * Handle MCP Apps (SEP-1865) widget results
 * Widgets that use the ui/resourceUri metadata format
 * These use window.mcpApp API with JSON-RPC 2.0 protocol
 */
async function handleMcpAppsWidget(
  serverId: string,
  mcpTool: Tool,
  args: any,
  result: any,
  uiResourceUri: string
): Promise<any | null> {
  logger.aiSdk.info(
    "[AI-SDK] Found MCP Apps (SEP-1865) widget with ui/resourceUri",
    {
      toolName: mcpTool.name,
      resourceUri: uiResourceUri,
    }
  );

  try {
    // Fetch widget HTML from the UI resource
    const resourceContent = await mcpService.readResource(
      serverId,
      uiResourceUri
    );

    if (resourceContent?.contents?.[0]?.text) {
      const widgetHtml = resourceContent.contents[0].text;

      // Extract widget data from result content (usually JSON in text)
      let widgetData: Record<string, any> = {};

      // Try to parse JSON data from text content
      if (result.content) {
        for (const item of result.content) {
          if (item.type === "text" && item.text) {
            try {
              const parsed = JSON.parse(item.text);
              // Check for nested data structure (common pattern)
              if (parsed.data) {
                widgetData = parsed.data;
              } else {
                widgetData = parsed;
              }
              break;
            } catch {
              // Not JSON, continue
            }
          }
        }
      }

      // Also include structuredContent if available
      if (result.structuredContent) {
        Object.assign(widgetData, result.structuredContent);
      }

      logger.aiSdk.debug("[AI-SDK] MCP Apps widget data extracted", {
        toolName: mcpTool.name,
        resourceUri: uiResourceUri,
        dataKeys: Object.keys(widgetData),
        htmlLength: widgetHtml.length,
      });

      // Normalize mimeType
      let mimeType = resourceContent.contents[0].mimeType || "text/html";
      if (mimeType.startsWith("text/html+")) {
        mimeType = "text/html";
      }

      // Create UI resource with MCP Apps widget
      // Mark with protocol 'mcp-apps' so renderer uses MCP Apps bridge
      const uiResource = {
        type: "resource",
        resource: {
          uri: uiResourceUri,
          mimeType: mimeType,
          text: widgetHtml,
          _meta: {
            widgetData: widgetData,
            props: widgetData,
            widgetProtocol: "mcp-apps" as const,
            // Bridge options for MCP Apps (SEP-1865)
            bridgeOptions: {
              toolInput: args,
              toolOutput: widgetData,
              responseMetadata: result._meta || {},
              serverId,
            },
          },
        },
      };

      mcpHealthService.recordSuccess(serverId, mcpTool.name);

      return {
        text: `[MCP Apps Widget from ${uiResourceUri}]`,
        content: result.content,
        uiResources: [uiResource],
        _meta: result._meta,
        structuredContent: result.structuredContent,
      };
    }
  } catch (error) {
    logger.aiSdk.error("[AI-SDK] Failed to fetch MCP Apps widget", {
      toolName: mcpTool.name,
      resourceUri: uiResourceUri,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}

/**
 * Process standard MCP tool results
 * @param serverId - MCP server ID
 * @param mcpTool - Tool definition
 * @param args - Tool input arguments
 * @param result - Tool execution result
 * @param protocol - Detected widget protocol
 */
async function processToolResult(
  serverId: string,
  mcpTool: Tool,
  args: Record<string, unknown>,
  result: any,
  protocol: WidgetProtocol = "none"
) {
  if (result.content && Array.isArray(result.content)) {
    const textParts: string[] = [];
    const uiResources: any[] = [];

    for (const item of result.content) {
      if (item.type === "text") {
        textParts.push(item.text || "");
      } else if (item.type === "resource") {
        // Check if this is a UI resource (uri starts with ui:// or has Apps SDK mimeType)
        let resourceData = item.resource || item.data || item;
        const uri = resourceData?.uri || "";
        const mimeType = resourceData?.mimeType || "";

        // Detect Apps SDK widgets by mimeType (text/html+skybridge)
        const isAppsSdkWidget =
          mimeType === "text/html+skybridge" ||
          mimeType.startsWith("text/html+skybridge");
        // Detect UI resources: ui:// prefix, Apps SDK widget, or text/html with content
        const isHtmlResource = mimeType === "text/html" && resourceData?.text;
        const isUIResource =
          uri.startsWith("ui://") || isAppsSdkWidget || isHtmlResource;

        if (isUIResource) {
          // If UI resource has no content, fetch it via readResource
          if (!resourceData?.text && !resourceData?.blob) {
            try {
              const resourceContent = await mcpService.readResource(
                serverId,
                uri
              );
              if (resourceContent?.contents?.[0]) {
                const fetchedContent = resourceContent.contents[0];
                resourceData = {
                  ...resourceData,
                  uri: fetchedContent.uri || uri,
                  mimeType: fetchedContent.mimeType || resourceData?.mimeType,
                  text: fetchedContent.text,
                  blob: fetchedContent.blob,
                };
              }
            } catch (fetchError) {
              logger.aiSdk.error(
                "[AI-SDK] Failed to fetch UI resource content",
                {
                  serverId,
                  uri,
                  error:
                    fetchError instanceof Error
                      ? fetchError.message
                      : fetchError,
                }
              );
            }
          }

          // For Apps SDK widgets, inject the bridge and normalize mimeType
          if (isAppsSdkWidget && resourceData?.text) {
            logger.aiSdk.debug(
              "[AI-SDK] Detected Apps SDK widget via mimeType",
              {
                uri,
                mimeType: resourceData.mimeType,
              }
            );

            // Check if bridge is already injected by @mcp-ui/server
            const hasBridgeAlready =
              resourceData.text.includes("window.openai") ||
              resourceData.text.includes("window.openai =") ||
              resourceData.text.includes('window["openai"]');

            if (!hasBridgeAlready) {
              // Inject Apps SDK bridge only if not present
              logger.aiSdk.debug(
                "[AI-SDK] Injecting Apps SDK bridge for mimeType widget"
              );
              resourceData.text = injectAppsSdkBridge(resourceData.text, {
                toolInput: {},
                toolOutput: result.structuredContent || {},
                responseMetadata: result._meta || {},
                locale: "en-US",
              });
            } else {
              logger.aiSdk.debug(
                "[AI-SDK] Apps SDK bridge already present, skipping injection"
              );
            }

            // Normalize mimeType for rendering
            resourceData.mimeType = "text/html";

            // Mark as Apps SDK widget
            resourceData._meta = {
              ...resourceData._meta,
              isAppsSdk: true,
            };
          }

          // Add protocol and bridge options to resource metadata
          // This allows the renderer to pass the right options to the widget proxy
          const effectiveProtocol = resourceData._meta?.isAppsSdk
            ? "openai-sdk"
            : protocol;
          resourceData._meta = {
            ...resourceData._meta,
            widgetProtocol: effectiveProtocol,
            // Bridge options for widget proxy
            bridgeOptions: {
              toolInput: args,
              toolOutput: result.structuredContent || {},
              responseMetadata: result._meta || {},
              serverId,
            },
          };

          // Preserve UI resource structure for rendering
          uiResources.push({
            type: "resource",
            resource: resourceData,
          });
          textParts.push(`[UI Widget: ${uri || resourceData.mimeType}]`);
        } else {
          // Regular resource - stringify for model
          textParts.push(`[Resource: ${JSON.stringify(resourceData)}]`);
        }
      } else {
        // Other types - stringify
        textParts.push(`[${item.type}: ${JSON.stringify(item.data || item)}]`);
      }
    }

    // Record successful tool call
    mcpHealthService.recordSuccess(serverId, mcpTool.name);

    // Return structured result with both text and UI resources
    if (uiResources.length > 0) {
      return {
        text: textParts.join("\n"),
        content: result.content,
        uiResources: uiResources,
      };
    }

    // No UI resources - return text only
    return textParts.join("\n");
  }

  // For non-content results, return as-is
  mcpHealthService.recordSuccess(serverId, mcpTool.name);
  return result;
}
