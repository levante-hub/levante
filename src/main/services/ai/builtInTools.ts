import { tool } from "ai";
import { z } from "zod";
import { getLogger } from '../logging';
import { getMermaidValidator } from './mermaidValidator';
import { mcpProviderService } from '../mcp/MCPProviderService';
import { MCPConfigurationManager } from '../mcpConfigManager';
import type { MCPProvider, MCPRegistryEntry } from '../../../renderer/types/mcp';
import mcpProvidersData from '../../../renderer/data/mcpProviders.json';

const logger = getLogger();

export interface BuiltInToolsConfig {
    mermaidValidation: boolean;
    mcpDiscovery: boolean;
}

/**
 * Result from MCP discovery search
 */
interface MCPDiscoveryResult {
    id: string;
    name: string;
    description: string;
    category: string;
    icon?: string;
    transport: string;
    configureUrl: string;
    hasApiKeyRequirement: boolean;
}

/**
 * Response from the MCP discovery tool
 */
interface MCPDiscoveryToolResponse {
    results: MCPDiscoveryResult[];
    totalMatches: number;
    message: string;
}

/**
 * Creates built-in tools that are always available to LLMs
 * Independent of MCP servers
 */
export async function getBuiltInTools(config?: BuiltInToolsConfig): Promise<Record<string, any>> {
    const tools: Record<string, any> = {};

    // Only add mermaid validation if enabled
    if (config?.mermaidValidation !== false) {
        const mermaidTool = await createMermaidValidationTool();
        if (mermaidTool) {
            tools['builtin_validate_mermaid'] = mermaidTool;
        }
    }

    // Add MCP discovery tool if enabled
    if (config?.mcpDiscovery !== false) {
        const discoveryTool = await createMCPDiscoveryTool();
        if (discoveryTool) {
            tools['mcp_discovery'] = discoveryTool;
        }
    }

    logger.aiSdk.debug('Built-in tools created', {
        toolCount: Object.keys(tools).length,
        toolNames: Object.keys(tools)
    });

    return tools;
}

async function createMermaidValidationTool() {
    const validator = getMermaidValidator();

    return tool({
        description: `Validate Mermaid diagram syntax before delivering to user.
IMPORTANT: You MUST use this tool to validate ANY Mermaid code block before including it in your response.
Returns: isValid (boolean), diagramType (if valid), and error details (if invalid).
If validation fails, fix the syntax and validate again before delivering.`,

        inputSchema: z.object({
            code: z.string().describe('The Mermaid diagram code to validate (without the ```mermaid wrapper)')
        }),

        execute: async ({ code }) => {
            const args = { code };
            try {
                logger.aiSdk.debug('Validating Mermaid code', {
                    codeLength: args.code.length,
                    codePreview: args.code.substring(0, 100)
                });

                const result = await validator.validate(args.code);

                logger.aiSdk.info('Mermaid validation result', {
                    isValid: result.isValid,
                    diagramType: result.diagramType,
                    hasError: !!result.error
                });

                return result;
            } catch (error) {
                logger.aiSdk.error('Mermaid validation failed', {
                    error: error instanceof Error ? error.message : error
                });

                return {
                    isValid: false,
                    error: error instanceof Error ? error.message : 'Validation failed',
                    suggestion: 'Check syntax and try again'
                };
            }
        },
    });
}

/**
 * Search and score MCP servers based on query
 */
function searchMCPServers(
    entries: MCPRegistryEntry[],
    query: string,
    configuredIds: Set<string>,
    limit: number
): MCPDiscoveryResult[] {
    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/\s+/).filter(t => t.length > 0);

    // Score each entry
    const scored = entries
        .filter(entry => !configuredIds.has(entry.id)) // Exclude configured
        .map(entry => {
            let score = 0;
            const displayName = entry.displayName || entry.name;
            const searchableText = [
                displayName,
                entry.description,
                entry.category,
                entry.id
            ].join(' ').toLowerCase();

            // Exact match in name gets highest score
            if (displayName.toLowerCase().includes(queryLower)) score += 10;

            // ID match
            if (entry.id.toLowerCase().includes(queryLower)) score += 8;

            // Category match
            if (entry.category.toLowerCase().includes(queryLower)) score += 5;

            // Term matches in description
            terms.forEach(term => {
                if (searchableText.includes(term)) score += 1;
            });

            return { entry, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(limit, 10));

    return scored.map(({ entry }) => ({
        id: entry.id,
        name: entry.displayName || entry.name,
        description: entry.description,
        category: entry.category,
        icon: entry.icon,
        transport: entry.transport.type,
        configureUrl: `levante://mcp/configure/${encodeURIComponent(entry.id)}`,
        hasApiKeyRequirement: entry.configuration.fields.some(
            f => f.type === 'password' || f.key.toLowerCase().includes('key') || f.key.toLowerCase().includes('token')
        )
    }));
}

/**
 * Creates the MCP discovery tool that allows AI to search for available MCP servers
 */
async function createMCPDiscoveryTool() {
    const configManager = new MCPConfigurationManager();

    return tool({
        description: `Search for MCP (Model Context Protocol) servers in the Levante MCP Shop.

Use this tool when:
- Users ask about adding capabilities, integrations, or tools
- Users want to connect to external services (GitHub, databases, file systems, etc.)
- Users ask "Can you access X?" or "Is there a tool for Y?"
- Current tools cannot fulfill the user's request

The tool returns matching servers that are NOT already configured, with deep links to configure them.
Each result includes a configureUrl that users can click to add the MCP server.`,

        inputSchema: z.object({
            query: z.string().describe('Search query to find MCP servers (e.g., "github", "database", "file system", "email")'),
            limit: z.number().optional().default(5).describe('Maximum number of results to return (1-10, default: 5)'),
        }),

        execute: async ({ query, limit = 5 }) => {

            try {
                logger.aiSdk.info('MCP discovery search', {
                    query,
                    limit
                });

                // Get all registry entries from all enabled providers
                const providers = (mcpProvidersData.providers as MCPProvider[]).filter(p => p.enabled);
                const allEntries: MCPRegistryEntry[] = [];

                for (const provider of providers) {
                    try {
                        // Try cache first
                        let entries = await mcpProviderService.getCachedEntries(provider.id);

                        if (!entries) {
                            // Sync if no cache
                            entries = await mcpProviderService.syncProvider(provider);
                        }

                        if (entries) {
                            allEntries.push(...entries);
                        }
                    } catch (error) {
                        logger.aiSdk.warn('Failed to get entries from provider', {
                            providerId: provider.id,
                            error: error instanceof Error ? error.message : error
                        });
                    }
                }

                // Get configured server IDs
                const configuredServers = await configManager.listServers();
                const configuredIds = new Set(configuredServers.map(s => s.id));

                logger.aiSdk.debug('MCP discovery context', {
                    totalEntries: allEntries.length,
                    configuredCount: configuredIds.size
                });

                // Search and score entries
                const results = searchMCPServers(allEntries, query, configuredIds, limit);

                logger.aiSdk.info('MCP discovery results', {
                    query,
                    totalMatches: results.length,
                    resultIds: results.map(r => r.id)
                });

                if (results.length === 0) {
                    return {
                        results: [],
                        totalMatches: 0,
                        message: `No MCP servers found matching "${query}". Try different search terms like "database", "file", "api", "automation", etc.`
                    };
                }

                return {
                    results,
                    totalMatches: results.length,
                    message: `Found ${results.length} MCP server(s) matching "${query}". Show the user these options with their configure URLs.`
                };
            } catch (error) {
                logger.aiSdk.error('MCP discovery failed', {
                    query,
                    error: error instanceof Error ? error.message : error
                });

                return {
                    results: [],
                    totalMatches: 0,
                    message: `Discovery search failed: ${error instanceof Error ? error.message : 'Unknown error'}. The MCP shop may be unavailable.`
                };
            }
        },
    });
}
