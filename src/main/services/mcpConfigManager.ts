import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { MCPConfiguration, MCPServerConfig } from '../types/mcp.js';
import { getLogger } from './logging';

export class MCPConfigurationManager {
  private logger = getLogger();
  private configPath: string;

  constructor() {
    this.configPath = this.getLevanteConfigPath();
  }

  private getLevanteConfigPath(): string {
    const configPath = path.join(os.homedir(), 'levante', 'mcp.json');
    const configDir = path.dirname(configPath);
    
    // Create directory if it doesn't exist (synchronously for constructor)
    try {
      require('fs').mkdirSync(configDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
    
    return configPath;
  }

  async loadConfiguration(): Promise<MCPConfiguration> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(content);
      
      // Validate configuration structure
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        this.logger.mcp.warn("Invalid MCP configuration format, using empty config", { configPath: this.configPath });
        return { mcpServers: {} };
      }
      
      return config;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // File doesn't exist, create with empty config
        const emptyConfig = { mcpServers: {} };
        await this.saveConfiguration(emptyConfig);
        return emptyConfig;
      }
      
      this.logger.mcp.error("Failed to load MCP configuration", { 
        error: error instanceof Error ? error.message : error,
        configPath: this.configPath 
      });
      // Return empty config on any other error
      return { mcpServers: {} };
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
    
    if (currentConfig.mcpServers[serverId]) {
      delete currentConfig.mcpServers[serverId];
      await this.saveConfiguration(currentConfig);
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
    
    return Object.entries(config.mcpServers).map(([id, serverConfig]) => ({
      id,
      ...serverConfig
    }));
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
      }
    };

    await this.saveConfiguration(mergedConfig);
  }

  // Export current configuration
  async exportConfiguration(): Promise<MCPConfiguration> {
    return await this.loadConfiguration();
  }
}