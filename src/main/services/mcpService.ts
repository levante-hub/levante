import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  MCPServerConfig,
  Tool,
  ToolCall,
  ToolResult,
} from "../types/mcp.js";
import { spawn } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";
import { getLogger } from "./logging";

const execAsync = promisify(exec);

interface MCPRegistryEntry {
  id: string;
  name: string;
  npmPackage: string;
  status: string;
  version?: string;
}

interface MCPDeprecatedEntry {
  id: string;
  name: string;
  npmPackage: string;
  reason: string;
  alternative: string;
}

interface MCPRegistry {
  version: string;
  lastUpdated: string;
  entries: MCPRegistryEntry[];
  deprecated: MCPDeprecatedEntry[];
}

// Cache for the registry to avoid reading the file multiple times
let registryCache: MCPRegistry | null = null;

async function loadMCPRegistry(): Promise<MCPRegistry> {
  if (registryCache) {
    return registryCache;
  }

  try {
    const registryPath = path.join(
      __dirname,
      "../../src/renderer/data/mcpRegistry.json"
    );
    const registryContent = await fs.readFile(registryPath, "utf-8");
    registryCache = JSON.parse(registryContent);
    return registryCache!;
  } catch (error) {
    console.warn(
      "[MCP] Failed to load MCP registry, using fallback data:",
      error
    );
    // Fallback registry
    return {
      version: "1.0.0",
      lastUpdated: "2025-01-14",
      entries: [
        {
          id: "filesystem-local",
          name: "Local File System",
          npmPackage: "@modelcontextprotocol/server-filesystem",
          status: "active",
          version: "2025.8.21",
        },
        {
          id: "memory",
          name: "Memory Storage",
          npmPackage: "@modelcontextprotocol/server-memory",
          status: "active",
          version: "2025.8.4",
        },
        {
          id: "sequential-thinking",
          name: "Sequential Thinking",
          npmPackage: "@modelcontextprotocol/server-sequential-thinking",
          status: "active",
          version: "2025.7.1",
        },
      ],
      deprecated: [
        {
          id: "sqlite",
          name: "SQLite Database",
          npmPackage: "@modelcontextprotocol/server-sqlite",
          reason: "Package never existed.",
          alternative:
            "@modelcontextprotocol/server-memory or @modelcontextprotocol/server-filesystem",
        },
      ],
    };
  }
}

export class MCPService {
  private logger = getLogger();
  private clients: Map<string, Client> = new Map();

  /**
   * Resolve the command and arguments for MCP server execution
   * Handles npx commands and PATH resolution for Electron environments
   */
  private async resolveCommand(
    command: string,
    args: string[] = []
  ): Promise<{ command: string; args: string[] }> {
    // If command starts with npx, we need to resolve it properly
    if (command.startsWith("npx ")) {
      const parts = command.split(" ");
      const packageName = parts.slice(1).join(" "); // Everything after 'npx'

      try {
        // First try to find npx in system
        const { stdout } = await execAsync("which npx");
        const npxPath = stdout.trim();

        if (npxPath) {
          this.logger.mcp.debug("Found npx at path", { npxPath });
          return {
            command: npxPath,
            args: [packageName, ...args],
          };
        }
      } catch {
        this.logger.mcp.warn("npx not found in system PATH, trying fallback locations");
      }

      // Try common npx locations as fallback
      const fallbackPaths = [
        "/usr/local/bin/npx",
        "/opt/homebrew/bin/npx",
        path.join(process.env.HOME || "", "n/bin/npx"),
      ];

      for (const tryPath of fallbackPaths) {
        try {
          await execAsync(`ls ${tryPath}`);
          this.logger.mcp.debug("Found npx at fallback location", { tryPath });
          return {
            command: tryPath,
            args: [packageName, ...args],
          };
        } catch {
          continue;
        }
      }

      // If we can't find npx anywhere, offer helpful error message
      this.logger.mcp.error("npx not found. Please ensure Node.js and npm are properly installed");
      throw new Error(
        `npx command not found. Please install Node.js and npm, then try again. Package: ${packageName}`
      );
    }

    // For non-npx commands, return as-is
    return { command, args };
  }

  /**
   * Diagnose system configuration for MCP server execution
   */
  async diagnoseSystem(): Promise<{
    success: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check Node.js
      await execAsync("node --version");
      console.log("[MCP] Node.js is available");
    } catch {
      issues.push("Node.js is not installed or not in PATH");
      recommendations.push("Install Node.js from https://nodejs.org/");
    }

    try {
      // Check npm
      await execAsync("npm --version");
      console.log("[MCP] npm is available");
    } catch {
      issues.push("npm is not installed or not in PATH");
      recommendations.push(
        "npm should come with Node.js. Try reinstalling Node.js."
      );
    }

    try {
      // Check npx
      await execAsync("npx --version");
      console.log("[MCP] npx is available");
    } catch {
      issues.push("npx is not installed or not in PATH");
      recommendations.push(
        "npx should come with npm 5.2.0+. Try updating npm: npm install -g npm@latest"
      );
    }

    // Check PATH
    const currentPath = process.env.PATH || "";
    if (
      !currentPath.includes("/usr/local/bin") &&
      !currentPath.includes("/opt/homebrew/bin")
    ) {
      issues.push("Common Node.js paths not in PATH environment variable");
      recommendations.push(
        "Ensure /usr/local/bin or /opt/homebrew/bin are in your PATH"
      );
    }

    return {
      success: issues.length === 0,
      issues,
      recommendations,
    };
  }

  /**
   * Detect Node.js installation paths dynamically
   */
  private async detectNodePaths(): Promise<string[]> {
    const paths: string[] = [];

    try {
      // Try to find node executable
      const { stdout } = await execAsync("which node");
      const nodePath = stdout.trim();
      if (nodePath) {
        const nodeDir = path.dirname(nodePath);
        paths.push(nodeDir);
        console.log(`[MCP] Found Node.js at: ${nodeDir}`);
      }
    } catch {
      // Node not found in PATH
    }

    try {
      // Try to find npm executable
      const { stdout } = await execAsync("which npm");
      const npmPath = stdout.trim();
      if (npmPath) {
        const npmDir = path.dirname(npmPath);
        if (!paths.includes(npmDir)) {
          paths.push(npmDir);
        }
      }
    } catch {
      // npm not found in PATH
    }

    return paths;
  }

  /**
   * Get enhanced PATH that includes common Node.js installation locations
   */
  private getEnhancedPath(): string {
    const currentPath = process.env.PATH || "";
    const additionalPaths = [
      "/usr/local/bin",
      "/opt/homebrew/bin",
      path.join(process.env.HOME || "", "n/bin"),
      "/usr/bin",
      "/bin",
    ];

    // Filter out paths that are already in PATH
    const newPaths = additionalPaths.filter((p) => !currentPath.includes(p));

    return [currentPath, ...newPaths].join(":");
  }

  async connectServer(config: MCPServerConfig): Promise<Client> {
    // Resolve command first so we can use it in error messages
    let resolved: { command: string; args: string[] };

    try {
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
      switch (config.transport) {
        case "stdio":
          if (!config.command) {
            throw new Error("Command is required for stdio transport");
          }

          // Resolve command and arguments
          resolved = await this.resolveCommand(
            config.command,
            config.args || []
          );
          console.log(
            `[MCP] Resolved command: ${resolved.command} ${resolved.args.join(
              " "
            )}`
          );

          // Detect Node.js paths and set up environment
          const detectedPaths = await this.detectNodePaths();
          const enhancedPath = this.getEnhancedPath();
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

          // console.log(`[MCP] Using PATH: ${finalPath}`);

          transport = new StdioClientTransport({
            command: resolved.command,
            args: resolved.args,
            env,
          });
          break;

        case "http":
        case "sse":
          // TODO: Implement HTTP and SSE transports in Phase 2
          throw new Error(
            `Transport type ${config.transport} not implemented yet`
          );

        default:
          throw new Error(`Unknown transport type: ${config.transport}`);
      }

      // Connect to the server with detailed error handling
      console.log(`[MCP] Attempting to connect to server: ${config.id}`);

      try {
        await client.connect(transport);
        console.log(`[MCP] Successfully connected to server: ${config.id}`);
      } catch (connectionError) {
        console.error(
          `[MCP] Connection failed for server ${config.id}:`,
          connectionError
        );

        // Provide more specific error messages
        if (connectionError instanceof Error && resolved) {
          const errorMessage = connectionError.message;

          if (errorMessage.includes("ENOENT")) {
            throw new Error(
              `Command not found: ${resolved.command}. Please ensure Node.js and npm are properly installed and accessible.`
            );
          } else if (errorMessage.includes("EACCES")) {
            throw new Error(
              `Permission denied executing: ${resolved.command}. Please check file permissions.`
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
                  throw new Error(
                    `Package not available: ${packageName}. ${deprecatedEntry.reason} Alternative: ${deprecatedEntry.alternative}`
                  );
                }

                // Check if it's a known working package
                const activeEntry = registry.entries.find(
                  (entry) =>
                    entry.npmPackage === packageName &&
                    entry.status === "active"
                );
                if (!activeEntry) {
                  const availablePackages = registry.entries
                    .filter((entry) => entry.status === "active")
                    .map((entry) => entry.npmPackage)
                    .join(", ");
                  throw new Error(
                    `Unknown MCP package: ${packageName}. Available packages: ${availablePackages}. You can also check: https://www.npmjs.com/search?q=%40modelcontextprotocol`
                  );
                }

                throw new Error(
                  `MCP package installation failed: ${packageName}. The package exists but npm couldn't install it. Please check your internet connection and try again.`
                );
              } catch (registryError) {
                // If registry loading fails, provide a generic error
                throw new Error(
                  `MCP package not found: ${packageName}. Please verify the package name and ensure it's available in the npm registry.`
                );
              }
            }
            throw new Error(
              `MCP server connection failed. The server process may have exited unexpectedly. Please check the server logs for more details.`
            );
          }
        }

        throw connectionError;
      }

      // Store the client
      this.clients.set(config.id, client);

      console.log(`Successfully connected to MCP server: ${config.id}`);
      return client;
    } catch (error) {
      console.error(`Failed to connect to MCP server ${config.id}:`, error);
      throw error;
    }
  }

  async listTools(serverId: string): Promise<Tool[]> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(
        `Client ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      const response = await client.listTools();
      return response.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema,
      }));
    } catch (error) {
      console.error(`Failed to list tools from server ${serverId}:`, error);
      throw error;
    }
  }

  async callTool(serverId: string, toolCall: ToolCall): Promise<ToolResult> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(
        `Client ${serverId} not found. Make sure to connect first.`
      );
    }

    try {
      const response = await client.callTool({
        name: toolCall.name,
        arguments: toolCall.arguments,
      });

      return {
        content: Array.isArray(response.content) ? response.content : [],
        isError: Boolean(response.isError),
      };
    } catch (error) {
      console.error(
        `Failed to call tool ${toolCall.name} on server ${serverId}:`,
        error
      );
      throw error;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.close();
        this.clients.delete(serverId);
        console.log(`Successfully disconnected from MCP server: ${serverId}`);
      } catch (error) {
        console.error(`Error disconnecting from server ${serverId}:`, error);
        // Still remove from clients map even if disconnect failed
        this.clients.delete(serverId);
      }
    }
  }

  isConnected(serverId: string): boolean {
    return this.clients.has(serverId);
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.keys()).map((serverId) =>
      this.disconnectServer(serverId)
    );

    await Promise.allSettled(disconnectPromises);
  }

  // Ping method for health checks (Phase 5)
  async ping(serverId: string): Promise<boolean> {
    const client = this.clients.get(serverId);
    if (!client) {
      return false;
    }

    try {
      // Try to list tools as a way to ping the server
      await client.listTools();
      return true;
    } catch (error) {
      return false;
    }
  }

  // Reconnect method for health checks (Phase 5)
  async reconnectServer(serverId: string): Promise<void> {
    // Implementation will depend on stored config
    console.log(`Reconnecting to server ${serverId}...`);
    // This will be implemented in Phase 5 with config persistence
  }

  // Get MCP registry information
  async getRegistry(): Promise<MCPRegistry> {
    return await loadMCPRegistry();
  }

  // Validate if a package is known and active
  async validatePackage(
    packageName: string
  ): Promise<{
    valid: boolean;
    status: string;
    message: string;
    alternative?: string;
  }> {
    try {
      const registry = await loadMCPRegistry();

      // Check if it's deprecated
      const deprecatedEntry = registry.deprecated.find(
        (entry) => entry.npmPackage === packageName
      );
      if (deprecatedEntry) {
        return {
          valid: false,
          status: "deprecated",
          message: deprecatedEntry.reason,
          alternative: deprecatedEntry.alternative,
        };
      }

      // Check if it's active
      const activeEntry = registry.entries.find(
        (entry) => entry.npmPackage === packageName && entry.status === "active"
      );
      if (activeEntry) {
        return {
          valid: true,
          status: "active",
          message: `Package ${packageName} is available (v${
            activeEntry.version || "latest"
          })`,
        };
      }

      // Unknown package
      const availablePackages = registry.entries
        .filter((entry) => entry.status === "active")
        .map((entry) => entry.npmPackage)
        .join(", ");

      return {
        valid: false,
        status: "unknown",
        message: `Unknown package. Available packages: ${availablePackages}`,
      };
    } catch (error) {
      return {
        valid: false,
        status: "error",
        message: "Unable to validate package due to registry loading error",
      };
    }
  }
}
