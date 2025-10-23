import path from "path";
import fs from "fs/promises";
import { getLogger } from "../logging";

const logger = getLogger();

export interface MCPRegistryEntry {
  id: string;
  name: string;
  npmPackage: string;
  status: string;
  version?: string;
}

export interface MCPDeprecatedEntry {
  id: string;
  name: string;
  npmPackage: string;
  reason: string;
  alternative: string;
}

export interface MCPRegistry {
  version: string;
  lastUpdated: string;
  entries: MCPRegistryEntry[];
  deprecated: MCPDeprecatedEntry[];
}

// Cache for the registry to avoid reading the file multiple times
let registryCache: MCPRegistry | null = null;

/**
 * Load MCP registry from file or return fallback data
 */
export async function loadMCPRegistry(): Promise<MCPRegistry> {
  if (registryCache) {
    return registryCache;
  }

  try {
    const registryPath = path.join(__dirname, "../../src/renderer/data/mcpRegistry.json");
    const registryContent = await fs.readFile(registryPath, "utf-8");
    registryCache = JSON.parse(registryContent);
    return registryCache!;
  } catch (error) {
    logger.mcp.warn("Failed to load MCP registry, using fallback data", {
      error: error instanceof Error ? error.message : error
    });
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
          version: "2025.8.21"
        },
        {
          id: "memory",
          name: "Memory Storage",
          npmPackage: "@modelcontextprotocol/server-memory",
          status: "active",
          version: "2025.8.4"
        },
        {
          id: "sequential-thinking",
          name: "Sequential Thinking",
          npmPackage: "@modelcontextprotocol/server-sequential-thinking",
          status: "active",
          version: "2025.7.1"
        }
      ],
      deprecated: [
        {
          id: "sqlite",
          name: "SQLite Database",
          npmPackage: "@modelcontextprotocol/server-sqlite",
          reason: "Package never existed.",
          alternative:
            "@modelcontextprotocol/server-memory or @modelcontextprotocol/server-filesystem"
        }
      ]
    };
  }
}
