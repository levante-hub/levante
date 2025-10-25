import { promisify } from "util";
import { exec } from "child_process";
import path from "path";
import { getLogger } from "../logging";

const execAsync = promisify(exec);
const logger = getLogger();

/**
 * Official MCP packages whitelist
 * These packages are verified and safe to execute
 */
const OFFICIAL_MCP_PACKAGES = [
  '@modelcontextprotocol/server-memory',
  '@modelcontextprotocol/server-filesystem',
  '@modelcontextprotocol/server-sqlite',
  '@modelcontextprotocol/server-postgres',
  '@modelcontextprotocol/server-brave-search',
  '@modelcontextprotocol/server-fetch',
  '@modelcontextprotocol/server-github',
  '@modelcontextprotocol/server-google-maps',
  '@modelcontextprotocol/server-puppeteer',
  '@modelcontextprotocol/server-slack',
  '@modelcontextprotocol/server-everything'
] as const;

/**
 * Dangerous npx flags that allow arbitrary code execution or modify behavior unsafely
 */
const BLOCKED_NPX_FLAGS = [
  '-e',
  '--eval',
  '--call',
  '-c',
  '--shell-auto-fallback'
] as const;

/**
 * Valid npm package name regex
 * Matches: @scope/package-name or package-name
 */
const NPM_PACKAGE_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * Validates npx package name and arguments for security
 * @throws Error if validation fails
 */
function validateNpxPackage(packageName: string, args: string[]): void {
  // Extract actual package name (remove -y or other safe flags)
  const cleanPackageName = packageName.replace(/^-y\s+/, '').trim();

  // Validate package name format
  if (!NPM_PACKAGE_REGEX.test(cleanPackageName)) {
    logger.mcp.error('Invalid npm package name format', { packageName: cleanPackageName });
    throw new Error(
      `Invalid package name format: "${cleanPackageName}". ` +
      `Package names must follow npm naming conventions.`
    );
  }

  // Check if package is in official whitelist
  const isOfficial = OFFICIAL_MCP_PACKAGES.includes(cleanPackageName as any);

  if (!isOfficial) {
    // Check if it's at least from @modelcontextprotocol scope
    if (!cleanPackageName.startsWith('@modelcontextprotocol/')) {
      logger.mcp.warn('Package not in official whitelist', { packageName: cleanPackageName });
      throw new Error(
        `Package "${cleanPackageName}" is not in the official MCP packages whitelist. ` +
        `For security reasons, only verified MCP packages can be installed via deep links. ` +
        `Please install this package manually through the UI if you trust it.`
      );
    }
  }

  // Check for dangerous npx flags in arguments
  const allArgs = [packageName, ...args];
  for (const arg of allArgs) {
    for (const blockedFlag of BLOCKED_NPX_FLAGS) {
      if (arg === blockedFlag || arg.startsWith(`${blockedFlag}=`)) {
        logger.mcp.error('Blocked dangerous npx flag', { flag: blockedFlag, arg });
        throw new Error(
          `Dangerous npx flag "${blockedFlag}" is not allowed. ` +
          `This flag can execute arbitrary code and poses a security risk.`
        );
      }
    }
  }

  logger.mcp.info('Package validation passed', {
    packageName: cleanPackageName,
    isOfficial,
    argsCount: args.length
  });
}

/**
 * Resolve the command and arguments for MCP server execution
 * Handles npx commands and PATH resolution for Electron environments
 *
 * Security: Validates npx packages against whitelist and blocks dangerous flags
 */
export async function resolveCommand(
  command: string,
  args: string[] = []
): Promise<{ command: string; args: string[] }> {
  // If command starts with npx, we need to resolve it properly
  if (command.startsWith("npx ")) {
    const parts = command.split(" ");
    const packageName = parts.slice(1).join(" "); // Everything after 'npx'

    // Security: Validate package name and arguments
    validateNpxPackage(packageName, args);

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

  // Handle case where command is just "npx" (without space, from deep links)
  if (command === "npx" && args.length > 0) {
    // First arg should be the package name
    const packageName = args[0];
    const remainingArgs = args.slice(1);

    // Security: Validate package name and arguments
    validateNpxPackage(packageName, remainingArgs);

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

    throw new Error(
      `npx command not found. Please install Node.js and npm, then try again. Package: ${packageName}`
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
