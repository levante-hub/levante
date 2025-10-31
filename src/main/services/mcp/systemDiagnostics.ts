import { promisify } from "util";
import { exec } from "child_process";
import { getLogger } from "../logging";

const execAsync = promisify(exec);
const logger = getLogger();

/**
 * Diagnose system configuration for MCP server execution
 */
export async function diagnoseSystem(): Promise<{
  success: boolean;
  issues: string[];
  recommendations: string[];
}> {
  const issues: string[] = [];
  const recommendations: string[] = [];

  try {
    // Check Node.js
    await execAsync("node --version");
    logger.mcp.debug("Node.js is available");
  } catch {
    issues.push("Node.js is not installed or not in PATH");
    recommendations.push("Install Node.js from https://nodejs.org/");
  }

  try {
    // Check npm
    await execAsync("npm --version");
    logger.mcp.debug("npm is available");
  } catch {
    issues.push("npm is not installed or not in PATH");
    recommendations.push("npm should come with Node.js. Try reinstalling Node.js.");
  }

  try {
    // Check npx
    await execAsync("npx --version");
    logger.mcp.debug("npx is available");
  } catch {
    issues.push("npx is not installed or not in PATH");
    recommendations.push("npx should come with npm 5.2.0+. Try updating npm: npm install -g npm@latest");
  }

  // Check PATH
  const currentPath = process.env.PATH || "";
  if (!currentPath.includes("/usr/local/bin") && !currentPath.includes("/opt/homebrew/bin")) {
    issues.push("Common Node.js paths not in PATH environment variable");
    recommendations.push("Ensure /usr/local/bin or /opt/homebrew/bin are in your PATH");
  }

  return {
    success: issues.length === 0,
    issues,
    recommendations
  };
}
