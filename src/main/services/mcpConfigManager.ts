import * as fs from 'fs/promises';
import * as path from 'path';
import type { MCPConfiguration, MCPServerConfig } from '../types/mcp.js';
import { getLogger } from './logging';
import { directoryService } from './directoryService';

export class MCPConfigurationManager {
  private logger = getLogger();
  private configPath: string;

  constructor() {
    this.configPath = directoryService.getMcpConfigPath();
    
    // Ensure directory exists (synchronously for constructor)
    try {
      const fs = require('fs');
      const configDir = path.dirname(this.configPath);
      fs.mkdirSync(configDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }

  async loadConfiguration(): Promise<MCPConfiguration> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(content);

      // Validate configuration structure
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        this.logger.mcp.warn("Invalid MCP configuration format, using empty config", { configPath: this.configPath });
        return { mcpServers: {}, disabled: {} };
      }

      // Ensure disabled exists
      if (!config.disabled) {
        config.disabled = {};
      }

      return config;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // File doesn't exist, create with empty config
        const emptyConfig = { mcpServers: {}, disabled: {} };
        await this.saveConfiguration(emptyConfig);
        return emptyConfig;
      }

      this.logger.mcp.error("Failed to load MCP configuration", {
        error: error instanceof Error ? error.message : error,
        configPath: this.configPath
      });
      // Return empty config on any other error
      return { mcpServers: {}, disabled: {} };
    }
  }

  async saveConfiguration(config: MCPConfiguration): Promise<void> {
    try {
      await fs.writeFile(
        this.configPath, 
        JSON.stringify(config, null, 2), 
        'utf-8'
      );
      this.logger.mcp.info("MCP configuration saved successfully", { configPath: this.configPath });
    } catch (error) {
      this.logger.mcp.error("Failed to save MCP configuration", { 
        error: error instanceof Error ? error.message : error,
        configPath: this.configPath 
      });
      throw error;
    }
  }

  async addServer(config: MCPServerConfig): Promise<void> {
    const currentConfig = await this.loadConfiguration();
    
    // Extract id and create server config without id
    const { id, ...serverConfig } = config;
    currentConfig.mcpServers[id] = serverConfig;
    
    await this.saveConfiguration(currentConfig);
  }

  async removeServer(serverId: string): Promise<void> {
    const currentConfig = await this.loadConfiguration();

    let found = false;

    if (currentConfig.mcpServers[serverId]) {
      delete currentConfig.mcpServers[serverId];
      found = true;
    }

    if (currentConfig.disabled && currentConfig.disabled[serverId]) {
      delete currentConfig.disabled[serverId];
      found = true;
    }

    if (found) {
      await this.saveConfiguration(currentConfig);
      this.logger.mcp.info("Server removed from configuration", { serverId });
    } else {
      this.logger.mcp.warn("Server not found in configuration", { serverId });
    }
  }

  async updateServer(serverId: string, config: Partial<Omit<MCPServerConfig, 'id'>>): Promise<void> {
    const currentConfig = await this.loadConfiguration();
    
    if (currentConfig.mcpServers[serverId]) {
      currentConfig.mcpServers[serverId] = {
        ...currentConfig.mcpServers[serverId],
        ...config
      };
      await this.saveConfiguration(currentConfig);
    } else {
      throw new Error(`Server ${serverId} not found in configuration`);
    }
  }

  async getServer(serverId: string): Promise<MCPServerConfig | null> {
    const config = await this.loadConfiguration();
    const serverConfig = config.mcpServers[serverId];
    
    if (!serverConfig) {
      return null;
    }
    
    return {
      id: serverId,
      ...serverConfig
    };
  }

  async listServers(): Promise<MCPServerConfig[]> {
    const config = await this.loadConfiguration();

    // Combine mcpServers (active) + disabled
    const activeServers = Object.entries(config.mcpServers).map(([id, serverConfig]) => ({
      id,
      ...serverConfig,
      enabled: true
    }));

    const disabledServers = Object.entries(config.disabled || {}).map(([id, serverConfig]) => ({
      id,
      ...serverConfig,
      enabled: false
    }));

    return [...activeServers, ...disabledServers];
  }

  getConfigPath(): string {
    return this.configPath;
  }

  // Import configuration from another file or object
  async importConfiguration(importedConfig: MCPConfiguration): Promise<void> {
    // Validate imported config
    if (!importedConfig.mcpServers || typeof importedConfig.mcpServers !== 'object') {
      throw new Error('Invalid configuration format');
    }

    // Merge with existing configuration
    const currentConfig = await this.loadConfiguration();
    const mergedConfig = {
      mcpServers: {
        ...currentConfig.mcpServers,
        ...importedConfig.mcpServers
      },
      disabled: {
        ...currentConfig.disabled,
        ...(importedConfig.disabled || {})
      }
    };

    await this.saveConfiguration(mergedConfig);
  }

  // Export current configuration
  async exportConfiguration(): Promise<MCPConfiguration> {
    return await this.loadConfiguration();
  }

  /**
   * Disable a server (move from mcpServers to disabled)
   */
  async disableServer(serverId: string): Promise<void> {
    const currentConfig = await this.loadConfiguration();

    // Verify exists in mcpServers
    if (!currentConfig.mcpServers[serverId]) {
      this.logger.mcp.warn(`Server ${serverId} not found in mcpServers, cannot disable`);
      throw new Error(`Server ${serverId} not found in mcpServers`);
    }

    // Move from mcpServers to disabled
    const serverConfig = currentConfig.mcpServers[serverId];
    currentConfig.disabled = currentConfig.disabled || {};
    currentConfig.disabled[serverId] = serverConfig;
    delete currentConfig.mcpServers[serverId];

    await this.saveConfiguration(currentConfig);
    this.logger.mcp.info("Server disabled and moved to disabled section", { serverId });
  }

  /**
   * Enable a server (move from disabled to mcpServers)
   */
  async enableServer(serverId: string): Promise<void> {
    const currentConfig = await this.loadConfiguration();

    // Verify exists in disabled
    if (!currentConfig.disabled || !currentConfig.disabled[serverId]) {
      throw new Error(`Server ${serverId} not found in disabled`);
    }

    // Move from disabled to mcpServers
    const serverConfig = currentConfig.disabled[serverId];
    currentConfig.mcpServers[serverId] = serverConfig;
    delete currentConfig.disabled[serverId];

    await this.saveConfiguration(currentConfig);
    this.logger.mcp.info("Server enabled and moved to mcpServers", { serverId });
  }

  /**
   * Migrate configuration to include disabled section
   */
  async migrateConfiguration(): Promise<void> {
    const config = await this.loadConfiguration();

    // If already has disabled, no migration needed
    if (config.disabled !== undefined) {
      this.logger.mcp.info('Configuration already migrated');
      return;
    }

    // Create disabled empty
    config.disabled = {};

    await this.saveConfiguration(config);
    this.logger.mcp.info('Configuration migrated to include disabled section');
  }
}