import { promisify } from "util";
import { exec } from "child_process";
import path from "path";
import { getLogger } from "../logging";
import { validateRuntimeSecurity } from "./packageValidator";

const execAsync = promisify(exec);
const logger = getLogger();

/**
 * Resolve the command and arguments for MCP server execution
 * Handles npx commands and PATH resolution for Electron environments
 *
 * Security: Validates dangerous patterns for ALL commands (npx, uvx, python, node, system commands)
 * Does NOT enforce whitelist - that's only for deep links
 */
export async function resolveCommand(
  command: string,
  args: string[] = []
): Promise<{ command: string; args: string[] }> {
  // Security: Validate runtime security for ALL commands
  validateRuntimeSecurity(command, args);

  // If command starts with npx, we need to resolve it properly
  if (command.startsWith("npx ")) {
    const parts = command.split(" ");
    const packageName = parts.slice(1).join(" "); // Everything after 'npx'

    try {
      // First try to find npx in system
      const { stdout } = await execAsync("which npx");
      const npxPath = stdout.trim();

      if (npxPath) {
        logger.mcp.debug("Found npx at path", { npxPath });
        return {
          command: npxPath,
          args: [packageName, ...args]
        };
      }
    } catch {
      logger.mcp.warn("npx not found in system PATH, trying fallback locations");
    }

    // Try common npx locations as fallback
    const fallbackPaths = [
      "/usr/local/bin/npx",
      "/opt/homebrew/bin/npx",
      path.join(process.env.HOME || "", "n/bin/npx")
    ];

    for (const tryPath of fallbackPaths) {
      try {
        await execAsync(`ls ${tryPath}`);
        logger.mcp.debug("Found npx at fallback location", { tryPath });
        return {
          command: tryPath,
          args: [packageName, ...args]
        };
      } catch {
        continue;
      }
    }

    // If we can't find npx anywhere, offer helpful error message
    logger.mcp.error("npx not found. Please ensure Node.js and npm are properly installed");
    throw new Error(
      `npx command not found. Please install Node.js and npm, then try again. Package: ${packageName}`
    );
  }

  // Handle case where command is just "npx" (without space)
  if (command === "npx" && args.length > 0) {
    // Security validation already done above (line 22)

    // Find npx in system
    try {
      const { stdout } = await execAsync("which npx");
      const npxPath = stdout.trim();

      if (npxPath) {
        logger.mcp.debug("Found npx at path (direct command)", { npxPath });
        return {
          command: npxPath,
          args: args  // Keep all args including package name
        };
      }
    } catch {
      logger.mcp.warn("npx not found in system PATH");
    }

    // Try fallback paths
    const fallbackPaths = [
      "/usr/local/bin/npx",
      "/opt/homebrew/bin/npx",
      path.join(process.env.HOME || "", "n/bin/npx")
    ];

    for (const tryPath of fallbackPaths) {
      try {
        await execAsync(`ls ${tryPath}`);
        logger.mcp.debug("Found npx at fallback location", { tryPath });
        return {
          command: tryPath,
          args: args
        };
      } catch {
        continue;
      }
    }

    // Extract package name for error message
    const safeFlags = ['-y', '--yes', '-q', '--quiet'];
    const packageArg = args.find(arg => !safeFlags.includes(arg) && !arg.startsWith('-')) || args[0];

    throw new Error(
      `npx command not found. Please install Node.js and npm, then try again. Package: ${packageArg}`
    );
  }

  // For non-npx commands, return as-is
  return { command, args };
}

/**
 * Detect Node.js installation paths dynamically
 */
export async function detectNodePaths(): Promise<string[]> {
  const paths: string[] = [];

  try {
    // Try to find node executable
    const { stdout } = await execAsync("which node");
    const nodePath = stdout.trim();
    if (nodePath) {
      const nodeDir = path.dirname(nodePath);
      paths.push(nodeDir);
      logger.mcp.debug("Found Node.js path", { nodeDir });
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
export function getEnhancedPath(): string {
  const currentPath = process.env.PATH || "";
  const additionalPaths = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    path.join(process.env.HOME || "", "n/bin"),
    "/usr/bin",
    "/bin"
  ];

  // Filter out paths that are already in PATH
  const newPaths = additionalPaths.filter((p) => !currentPath.includes(p));

  return [currentPath, ...newPaths].join(":");
}
