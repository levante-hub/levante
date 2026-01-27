import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { getLogger } from '../logging';
import type {
  MCPProvider,
  MCPRegistryEntry,
  LevanteAPIResponse,
  LevanteAPIServer,
  InputDefinition,
  MCPConfigField
} from '../../../renderer/types/mcp';
import { mcpCacheService } from './MCPCacheService';

const logger = getLogger();

// Default production host for Levante services
const DEFAULT_SERVICES_HOST = 'https://services.levanteapp.com';

export class MCPProviderService {
  /**
   * ✅ SIMPLIFICADO: Solo un método de sincronización
   */
  async syncProvider(provider: MCPProvider): Promise<MCPRegistryEntry[]> {
    logger.mcp.info(`[MCPProviderService] Syncing provider: ${provider.id}`);

    try {
      // Fetch from API
      const apiResponse = await this.fetchFromAPI(provider.endpoint);

      // Transform to internal format
      const entries = this.transformAPIResponse(apiResponse);

      // Cachear resultados
      await mcpCacheService.setCache(provider.id, entries);

      logger.mcp.info(`[MCPProviderService] Synced ${entries.length} servers from ${provider.id}`);

      return entries;
    } catch (error) {
      logger.mcp.error(`[MCPProviderService] Error syncing provider ${provider.id}:`, error as any);

      // Intentar devolver desde cache si existe
      const cachedEntries = await mcpCacheService.getCache<MCPRegistryEntry[]>(provider.id);
      if (cachedEntries) {
        logger.mcp.info(`[MCPProviderService] Returning cached data for ${provider.id}`);
        return cachedEntries;
      }

      throw error;
    }
  }

  /**
   * Gets the Levante services host from environment or uses default
   */
  private getServicesHost(): string {
    const envHost = process.env.LEVANTE_SERVICES_HOST;
    if (envHost) {
      // Remove trailing slash if present
      const host = envHost.replace(/\/$/, '');
      logger.mcp.debug(`[MCPProviderService] Using env host: ${host}`);
      return host;
    }
    return DEFAULT_SERVICES_HOST;
  }

  /**
   * Resolves the API endpoint
   * - If endpoint is a path (starts with /), combines with services host
   * - If endpoint is a full URL, uses it directly (for external APIs)
   */
  private resolveEndpoint(endpoint: string): string {
    // If endpoint is a path, combine with host
    if (endpoint.startsWith('/')) {
      const host = this.getServicesHost();
      const fullUrl = `${host}${endpoint}`;
      logger.mcp.debug(`[MCPProviderService] Resolved endpoint: ${fullUrl}`);
      return fullUrl;
    }

    // If it's already a full URL, use it directly
    return endpoint;
  }

  /**
   * Fetches data from the API endpoint
   */
  private async fetchFromAPI(endpoint: string): Promise<LevanteAPIResponse> {
    const resolvedEndpoint = this.resolveEndpoint(endpoint);
    logger.mcp.debug(`[MCPProviderService] Fetching from API: ${resolvedEndpoint}`);

    const response = await fetch(resolvedEndpoint, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Levante-MCP-Client/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data as LevanteAPIResponse;
  }

  /**
   * Transforms API response to internal registry format
   */
  private transformAPIResponse(apiResponse: LevanteAPIResponse): MCPRegistryEntry[] {
    return apiResponse.servers.map(server => this.transformServer(server));
  }

  /**
   * Transforms an individual server from API format to internal registry format
   */
  private transformServer(server: LevanteAPIServer): MCPRegistryEntry {
    // Generate configuration fields from inputs
    const fields: MCPConfigField[] = this.generateFieldsFromInputs(server.inputs || {});

    // Build template from server configuration or generate defaults
    const template = this.buildTemplate(server);

    return {
      id: server.id,
      name: server.name,
      displayName: server.displayName,
      description: server.description,
      category: server.category,
      icon: server.icon,
      logoUrl: server.logoUrl,
      source: server.source,  // "official" | "community"
      maintainer: server.maintainer,
      status: server.status || 'active',
      version: server.version,
      transport: {
        type: server.transport,
        autoDetect: true
      },
      configuration: {
        fields,
        defaults: this.extractDefaults(server),
        template: template as MCPRegistryEntry['configuration']['template']
      },
      metadata: server.metadata
    };
  }

  /**
   * Generates configuration fields from API inputs definition
   */
  private generateFieldsFromInputs(inputs: Record<string, InputDefinition>): MCPConfigField[] {
    const fields: MCPConfigField[] = [];

    for (const [key, input] of Object.entries(inputs)) {
      fields.push({
        key,
        label: input.label || key,
        type: input.type || 'string',
        required: input.required ?? true,
        description: input.description,
        placeholder: input.default || '',
        defaultValue: input.default
      });
    }

    return fields;
  }

  /**
   * Builds configuration template from server data
   * Uses API-provided template if available, otherwise generates from inputs
   */
  private buildTemplate(server: LevanteAPIServer): Record<string, unknown> {
    // If API provides a template, use it directly
    if (server.configuration?.template) {
      return {
        type: server.transport,
        ...server.configuration.template
      };
    }

    // Generate template based on transport type
    if (server.transport === 'stdio') {
      return {
        type: 'stdio',
        command: 'npx',
        args: [],
        env: this.extractInputDefaults(server.inputs || {})
      };
    }

    // For sse/streamable-http
    return {
      type: server.transport,
      url: server.metadata?.homepage || '',
      headers: {}
    };
  }

  /**
   * Extracts default values from inputs definition
   */
  private extractInputDefaults(inputs: Record<string, InputDefinition>): Record<string, string> {
    const defaults: Record<string, string> = {};

    for (const [key, input] of Object.entries(inputs)) {
      if (input.default) {
        defaults[key] = input.default;
      }
    }

    return defaults;
  }

  /**
   * Extracts defaults for UI form population
   */
  private extractDefaults(server: LevanteAPIServer): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};

    // Extract defaults from inputs
    if (server.inputs) {
      for (const [key, input] of Object.entries(server.inputs)) {
        if (input.default !== undefined) {
          defaults[key] = input.default;
        }
      }
    }

    return defaults;
  }

  /**
   * Get cached entries for a provider
   */
  async getCachedEntries(providerId: string): Promise<MCPRegistryEntry[] | null> {
    return mcpCacheService.getCache<MCPRegistryEntry[]>(providerId);
  }

  /**
   * Check if cache is valid
   */
  async isCacheValid(providerId: string, maxAgeMs?: number): Promise<boolean> {
    const defaultCacheMaxAge = 60 * 60 * 1000; // 1 hour
    return mcpCacheService.isCacheValid(providerId, maxAgeMs || defaultCacheMaxAge);
  }

  /**
   * Get cache timestamp
   */
  async getCacheTimestamp(providerId: string): Promise<number | null> {
    return mcpCacheService.getCacheTimestamp(providerId);
  }
}

export const mcpProviderService = new MCPProviderService();
