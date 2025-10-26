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
    recommendations.push(
      "npm should come with Node.js. Try reinstalling Node.js."
    );
  }

  try {
    // Check npx
    await execAsync("npx --version");
    logger.mcp.debug("npx is available");
  } catch {
    issues.push("npx is not installed or not in PATH");
    recommendations.push(
      "npx should come with npm 5.2.0+. Try updating npm: npm install -g npm@latest"
    );
  }

  try {
    // Check Python
    const { stdout } = await execAsync("python3 --version");
    logger.mcp.debug("Python is available", { version: stdout.trim() });
  } catch {
    issues.push("Python 3 is not installed or not in PATH");
    recommendations.push(
      "Install Python 3 from https://www.python.org/ or using Homebrew: brew install python3"
    );
  }

  try {
    // Check pip
    await execAsync("pip3 --version");
    logger.mcp.debug("pip3 is available");
  } catch {
    issues.push("pip3 is not installed or not in PATH");
    recommendations.push(
      "pip3 should come with Python 3. Try reinstalling Python or install pip separately."
    );
  }

  try {
    // Check uvx (optional but recommended for Python MCP servers)
    await execAsync("uvx --version");
    logger.mcp.debug("uvx is available");
  } catch {
    // uvx is optional, so we just log this as info
    logger.mcp.debug("uvx is not available (optional)");
    recommendations.push(
      "Consider installing uv for better Python MCP server support: pip3 install uv"
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
