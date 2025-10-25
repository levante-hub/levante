import { MCPService } from "../../services/mcpService.js";
import { MCPConfigurationManager } from "../../services/mcpConfigManager.js";
import { getLogger } from "../../services/logging";
import { registerConnectionHandlers } from "./connection.js";
import { registerConfigurationHandlers } from "./configuration.js";
import { registerToolHandlers } from "./tools.js";
import { registerHealthHandlers } from "./health.js";
import { registerExtractionHandlers } from "./extraction.js";
import { registerRegistryHandlers } from "./registry.js";

// Create singleton instances
const mcpService = new MCPService();
const configManager = new MCPConfigurationManager();
const logger = getLogger();

export function registerMCPHandlers() {
  // Register all handler categories
  registerConnectionHandlers(mcpService, configManager);
  registerConfigurationHandlers(mcpService, configManager);
  registerToolHandlers(mcpService);
  registerHealthHandlers();
  registerExtractionHandlers(mcpService);
  registerRegistryHandlers(mcpService, configManager);

  logger.mcp.info("MCP IPC handlers registered successfully");
}

// Export the service instances for use in other parts of the main process
export { mcpService, configManager };
