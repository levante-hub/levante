import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { MCPServerConfig } from "../../types/mcp.js";
import { getLogger } from "../logging";
import { resolveCommand, detectNodePaths, getEnhancedPath } from "./commandResolver.js";
import { loadMCPRegistry } from "./registry.js";
import { preferencesService } from "../preferencesService";
import { OAuthService } from "../oauth/OAuthService";

const logger = getLogger();

/**
 * MCP Apps (SEP-1865) UI extension capabilities.
 * Declares that this client can render interactive HTML widgets.
 * Servers that support MCP Apps (e.g. FastMCP) check for this extension
 * in client capabilities before sending structuredContent with UI.
 */
const MCP_APPS_EXTENSION = {
  "io.modelcontextprotocol/ui": {
    mimeTypes: ["text/html;profile=mcp-app"],
  },
} as Record<string, object>;

/**
 * Create MCP transport with optional OAuth support
 */
export async function createTransport(config: MCPServerConfig): Promise<{
  client: Client;
  transport: any;
}> {
  const transportType = config.transport || (config as any).type;
  const baseUrl = config.baseUrl || (config as any).url;

  logger.mcp.debug("Creating transport", {
    serverId: config.id,
    transport: transportType,
    oauth: config.oauth?.enabled || false,
  });

  // Check if OAuth is enabled
  if (config.oauth?.enabled && isHttpTransport(transportType)) {
    logger.mcp.info("Creating OAuth-enabled transport", {
      serverId: config.id,
    });
    return createOAuthTransport(config, transportType, baseUrl);
  }

  // Standard transport (no OAuth)
  return createStandardTransport(config, transportType, baseUrl);
}

/**
 * Create standard transport without OAuth
 *
 * @private
 */
async function createStandardTransport(
  config: MCPServerConfig,
  transportType: string,
  baseUrl?: string
) {
  const client = new Client(
    { name: "Levante-MCP-Client", version: "1.0.0" },
    { capabilities: { sampling: {}, roots: { listChanged: true }, extensions: MCP_APPS_EXTENSION } as any }
  );

  let transport;

  switch (transportType) {
    case "stdio":
      if (!config.command) {
        throw new Error("Command is required for stdio transport");
      }

      // Resolve command and arguments
      const resolved = await resolveCommand(config.command, config.args || []);
      logger.mcp.debug("Resolved command", {
        command: resolved.command,
        args: resolved.args,
        fullCommand: `${resolved.command} ${resolved.args.join(" ")}`,
      });

      // Detect Node.js paths and set up environment
      const detectedPaths = await detectNodePaths();
      const enhancedPath = getEnhancedPath();
      const finalPath =
        detectedPaths.length > 0
          ? [enhancedPath, ...detectedPaths].join(":")
          : enhancedPath;

      const env = {
        ...process.env,
        ...config.env,
        // Ensure Node.js paths are available
        PATH: finalPath,
      };

      transport = new StdioClientTransport({
        command: resolved.command,
        args: resolved.args,
        env,
      });
      break;

    case "http":
    case "streamable-http":
      if (!baseUrl) {
        throw new Error("Base URL is required for HTTP transport");
      }

      transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
        requestInit: { headers: config.headers || {} },
      });
      break;

    case "sse":
      if (!baseUrl) {
        throw new Error("Base URL is required for SSE transport");
      }

      transport = new SSEClientTransport(new URL(baseUrl), {
        requestInit: { headers: config.headers || {} },
      });
      break;

    default:
      throw new Error(`Unsupported transport: ${transportType}`);
  }

  return { client, transport };
}

/**
 * Create OAuth-enabled transport
 *
 * @private
 */
async function createOAuthTransport(
  config: MCPServerConfig,
  transportType: string,
  baseUrl?: string
) {
  if (!baseUrl) {
    throw new Error(`Base URL is required for OAuth transport: ${transportType}`);
  }

  const oauthService = new OAuthService(preferencesService);

  try {
    // 1. Ensure valid token
    logger.mcp.debug("Ensuring valid OAuth token", {
      serverId: config.id,
    });

    const tokens = await oauthService.ensureValidToken(config.id);

    logger.mcp.debug("Valid token obtained", {
      serverId: config.id,
      expiresAt: new Date(tokens.expiresAt).toISOString(),
    });

    // 2. Create headers with Authorization
    const headers = {
      ...config.headers,
      Authorization: `${tokens.tokenType} ${tokens.accessToken}`,
    };

    logger.mcp.debug("Authorization header added", {
      serverId: config.id,
      tokenType: tokens.tokenType,
      tokenPreview: tokens.accessToken.substring(0, 8) + "...",
    });

    // 3. Create client
    const client = new Client(
      { name: "Levante-MCP-Client", version: "1.0.0" },
      { capabilities: { sampling: {}, roots: { listChanged: true }, extensions: MCP_APPS_EXTENSION } as any }
    );

    // 4. Create transport with OAuth headers
    let transport;

    switch (transportType) {
      case "http":
      case "streamable-http":
        transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
          requestInit: { headers },
        });
        break;

      case "sse":
        transport = new SSEClientTransport(new URL(baseUrl), {
          requestInit: { headers },
        });
        break;

      default:
        throw new Error(`Unsupported OAuth transport: ${transportType}`);
    }

    logger.mcp.info("OAuth transport created successfully", {
      serverId: config.id,
      transport: transportType,
    });

    return { client, transport };
  } catch (error) {
    logger.mcp.error("Failed to create OAuth transport", {
      serverId: config.id,
      error: error instanceof Error ? error.message : error,
    });

    throw new Error(
      `OAuth transport creation failed: ${error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Check if transport type supports OAuth
 *
 * @private
 */
function isHttpTransport(transport: string): boolean {
  return ["http", "sse", "streamable-http"].includes(transport);
}

export async function handleConnectionError(
  error: Error,
  config: MCPServerConfig,
  transportType: string,
  baseUrl?: string
): Promise<Error> {
  const errorMessage = error.message;

  if (transportType === "stdio") {
    if (errorMessage.includes("ENOENT")) {
      return new Error(
        `Command not found: ${config.command}. Please ensure Node.js and npm are properly installed and accessible.`
      );
    } else if (errorMessage.includes("EACCES")) {
      return new Error(
        `Permission denied executing: ${config.command}. Please check file permissions.`
      );
    } else if (
      errorMessage.includes("Connection closed") ||
      errorMessage.includes("MCP error -32000")
    ) {
      // Check if this is an npm 404 error by looking at the command
      if (config.command && config.command.includes("npx")) {
        const packageName = config.command.replace("npx ", "").trim();

        try {
          const registry = await loadMCPRegistry();

          // Check if it's a known deprecated package
          const deprecatedEntry = registry.deprecated.find(
            (entry) => entry.npmPackage === packageName
          );
          if (deprecatedEntry) {
            return new Error(
              `Package not available: ${packageName}. ${deprecatedEntry.reason} Alternative: ${deprecatedEntry.alternative}`
            );
          }

          // Check if it's a known working package
          const activeEntry = registry.entries.find(
            (entry) =>
              entry.npmPackage === packageName && entry.status === "active"
          );
          if (!activeEntry) {
            const availablePackages = registry.entries
              .filter((entry) => entry.status === "active")
              .map((entry) => entry.npmPackage)
              .join(", ");
            return new Error(
              `Unknown MCP package: ${packageName}. Available packages: ${availablePackages}. You can also check: https://www.npmjs.com/search?q=%40modelcontextprotocol`
            );
          }

          return new Error(
            `MCP package installation failed: ${packageName}. The package exists but npm couldn't install it. Please check your internet connection and try again.`
          );
        } catch (registryError) {
          // If registry loading fails, provide a generic error
          return new Error(
            `MCP package not found: ${packageName}. Please verify the package name and ensure it's available in the npm registry.`
          );
        }
      }
      return new Error(
        `MCP server connection failed. The server process may have exited unexpectedly. Please check the server logs for more details.`
      );
    }
  } else if (transportType === "http" || transportType === "sse" || transportType === "streamable-http") {
    // Basic error handling for HTTP/SSE/streamable-http transports
    if (errorMessage.includes("fetch") || errorMessage.includes("network")) {
      return new Error(
        `Network error connecting to ${transportType.toUpperCase()} server at ${baseUrl}. Please check the URL and network connection.`
      );
    } else if (errorMessage.includes("401") || errorMessage.includes("403")) {
      return new Error(
        `Authentication failed for ${transportType.toUpperCase()} server. Please check your API key and permissions.`
      );
    } else if (errorMessage.includes("404")) {
      return new Error(
        `${transportType.toUpperCase()} server not found at ${baseUrl}. Please check the URL.`
      );
    }
  }

  return error;
}
