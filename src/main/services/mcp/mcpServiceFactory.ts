import type { IMCPService } from "./IMCPService.js";
import { MCPUseService } from "./mcpUseService.js";
import { MCPLegacyService } from "./mcpLegacyService.js";
import type { MCPPreferences } from "../../../types/preferences.js";
import { DEFAULT_MCP_PREFERENCES } from "../../../types/preferences.js";
import { getLogger, openSpan, closeSpan, failSpan } from "../logging";

/** Wrap an IMCPService with Logfire tracing for callTool and executeCode. */
function withMCPTracing(service: IMCPService): IMCPService {
  return new Proxy(service, {
    get(target, prop, receiver) {
      if (prop === 'callTool') {
        return async (serverId: string, toolCall: Parameters<IMCPService['callTool']>[1]) => {
          const span = openSpan('mcp.request', {
            serverId,
            toolName: (toolCall as any).name ?? '',
          });
          try {
            const result = await target.callTool(serverId, toolCall);
            closeSpan(span);
            return result;
          } catch (e) {
            failSpan(span, e);
            throw e;
          }
        };
      }
      if (prop === 'executeCode') {
        return async (code: string, timeout?: number) => {
          const span = openSpan('mcp.codeMode.execute', {
            codeLength: code.length,
            timeout: timeout ?? 30000,
          });
          try {
            const result = await target.executeCode(code, timeout);
            closeSpan(span, { hasError: result.error ? 1 : 0 });
            return result;
          } catch (e) {
            failSpan(span, e);
            throw e;
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Factory for creating MCP service instances based on user preferences.
 *
 * This factory implements the strategy pattern, allowing runtime selection
 * between mcp-use (default) and official SDK implementations.
 */
export class MCPServiceFactory {
  private static logger = getLogger();

  /**
   * Create an MCP service instance based on preferences.
   *
   * @param preferences - MCP preferences (SDK selection and code mode config)
   * @returns Configured MCP service instance
   */
  static async create(preferences?: MCPPreferences): Promise<IMCPService> {
    // Use defaults if no preferences provided
    const mcpPrefs = preferences || DEFAULT_MCP_PREFERENCES;

    this.logger.mcp.info("Creating MCP service", {
      sdk: mcpPrefs.sdk,
      codeModeEnabled: mcpPrefs.codeModeDefaults?.enabled,
      executor: mcpPrefs.codeModeDefaults?.executor,
    });

    let service: IMCPService;

    // Select implementation based on SDK preference
    if (mcpPrefs.sdk === 'official-sdk') {
      this.logger.mcp.info("Using Official MCP SDK (@modelcontextprotocol/sdk)");
      service = new MCPLegacyService();
    } else {
      // Default to mcp-use
      this.logger.mcp.info("Using mcp-use framework (default)", {
        codeMode: mcpPrefs.codeModeDefaults?.enabled ?? true,
      });
      service = new MCPUseService(mcpPrefs);
    }

    // Initialize the service (configures loggers, etc.)
    await service.initialize();

    return withMCPTracing(service);
  }

  /**
   * Create service from UI preferences object.
   * This is a convenience method for use with PreferencesService.
   *
   * @param uiPreferences - Full UI preferences object
   * @returns Configured MCP service instance
   */
  static async createFromUIPreferences(uiPreferences: any): Promise<IMCPService> {
    const mcpPrefs = uiPreferences?.mcp || DEFAULT_MCP_PREFERENCES;
    return this.create(mcpPrefs);
  }
}
