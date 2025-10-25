/**
 * MCP Package Security Validator
 *
 * Validates npx packages and arguments to prevent command injection attacks.
 * Used by both deep link parsing and command resolution.
 */

import { getLogger } from "../logging";

const logger = getLogger();

/**
 * Official MCP packages whitelist
 * These packages are verified and safe to execute
 */
export const OFFICIAL_MCP_PACKAGES = [
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
export const BLOCKED_NPX_FLAGS = [
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
export const NPM_PACKAGE_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * Validates npx package name and arguments for security
 * @param packageName - The npm package name to validate
 * @param args - Additional arguments
 * @throws Error if validation fails
 */
export function validateNpxPackage(packageName: string, args: string[] = []): void {
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
 * Validates command and args for MCP server configuration
 * Specifically for stdio transport with npx commands
 *
 * @param command - The command to execute (e.g., "npx")
 * @param args - The arguments array
 * @throws Error if validation fails
 */
export function validateMCPCommand(command: string, args: string[] = []): void {
  // Only validate npx commands
  if (command !== 'npx' && !command.startsWith('npx ')) {
    // Non-npx commands are allowed (e.g., node, python, custom executables)
    logger.mcp.debug('Non-npx command, skipping package validation', { command });
    return;
  }

  // For "npx <package>" format
  if (command.startsWith('npx ')) {
    const parts = command.split(' ');
    const packageName = parts.slice(1).join(' ');
    validateNpxPackage(packageName, args);
    return;
  }

  // For "npx" with args format (from deep links)
  if (command === 'npx' && args.length > 0) {
    const packageName = args[0];
    const remainingArgs = args.slice(1);
    validateNpxPackage(packageName, remainingArgs);
    return;
  }

  // npx without package name
  throw new Error('npx command requires a package name');
}
