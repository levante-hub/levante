import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { MCPServerConfig } from "../../types/mcp.js";
import { getLogger } from "../logging";
import { resolveCommand, detectNodePaths, getEnhancedPath } from "./commandResolver.js";
import { loadMCPRegistry } from "./registry.js";
import { mcpOAuthTokenManager } from "./oauth/tokenManager";
import { mcpOAuthService } from "./oauth/mcpOAuthService";

const logger = getLogger();

/**
 * Inject OAuth token into config headers if available
 * Auto-refreshes token if it expires in <5 minutes
 *
 * @param config - MCP server configuration
 * @returns Modified config with OAuth token injected (if available)
 */
async function injectOAuthToken(config: MCPServerConfig): Promise<MCPServerConfig> {
  try {
    // Check if server has OAuth token
    let token = await mcpOAuthTokenManager.getToken(config.id);

    if (!token) {
      logger.mcp.debug('No OAuth token found for server', { serverId: config.id });
      return config; // No token, return config as-is
    }

    // Check if token is valid or needs refresh
    const isValid = await mcpOAuthTokenManager.isTokenValid(config.id);

    if (!isValid) {
      logger.mcp.info('OAuth token expired or expiring soon, attempting refresh', {
        serverId: config.id
      });

      try {
        // Attempt to refresh token
        token = await mcpOAuthService.refreshToken(config.id);
        logger.mcp.info('OAuth token refreshed successfully', { serverId: config.id });
      } catch (refreshError) {
        logger.mcp.warn('Token refresh failed, will need re-authorization', {
          serverId: config.id,
          error: refreshError instanceof Error ? refreshError.message : refreshError
        });
        // Return config without token - connection will fail with 401 and trigger re-auth
        return config;
      }
    }

    // Inject Authorization header
    const configWithToken = {
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Bearer ${token.access_token}`
      }
    };

    logger.mcp.debug('OAuth token injected into request headers', {
      serverId: config.id,
      hasRefreshToken: !!token.refresh_token,
      expiresAt: token.expires_at ? new Date(token.expires_at).toISOString() : 'never'
    });

    return configWithToken;

  } catch (error) {
    logger.mcp.error('Error injecting OAuth token', {
      serverId: config.id,
      error: error instanceof Error ? error.message : error
    });
    // Return original config on error
    return config;
  }
}

export async function createTransport(config: MCPServerConfig): Promise<{
  client: Client;
  transport: any;
}> {
  // Normalize config for compatibility with different MCP formats
  // Accept both "transport"/"type" and "baseUrl"/"url"
  const transportType = config.transport || (config as any).type;
  const baseUrl = config.baseUrl || (config as any).url;

  // Inject OAuth token if available (for HTTP/SSE transports)
  if (transportType === 'http' || transportType === 'sse') {
    config = await injectOAuthToken(config);
  }

  // Create client with capabilities
  const client = new Client(
    {
      name: "Levante-MCP-Client",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Create transport based on config
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
      if (!baseUrl) {
        throw new Error("Base URL is required for HTTP transport");
      }

      logger.mcp.debug("Creating HTTP transport", {
        serverId: config.id,
        baseUrl: baseUrl,
        hasHeaders: !!(config.headers && Object.keys(config.headers).length > 0),
      });

      transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
        requestInit: {
          headers: config.headers || {},
        },
      });
      break;

    case "sse":
      if (!baseUrl) {
        throw new Error("Base URL is required for SSE transport");
      }

      logger.mcp.debug("Creating SSE transport", {
        serverId: config.id,
        baseUrl: baseUrl,
        hasHeaders: !!(config.headers && Object.keys(config.headers).length > 0),
      });

      transport = new SSEClientTransport(new URL(baseUrl), {
        requestInit: {
          headers: config.headers || {},
        },
      });
      break;

    default:
      throw new Error(`Unknown transport type: ${transportType}`);
  }

  return { client, transport };
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
  } else if (transportType === "http" || transportType === "sse") {
    // Basic error handling for HTTP/SSE transports
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
