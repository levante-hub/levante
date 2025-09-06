import type { MCPServerHealth, MCPHealthReport } from '../types/mcp.js';
import { getLogger } from './logging';

export class MCPHealthService {
  private logger = getLogger();
  private healthData: Map<string, MCPServerHealth> = new Map();
  private readonly UNHEALTHY_THRESHOLD = 5; // Consecutive errors to mark as unhealthy
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

  constructor() {
    // Periodic health check cleanup (remove old data)
    setInterval(() => {
      this.cleanupOldData();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Record a successful tool call
   */
  recordSuccess(serverId: string, toolName: string): void {
    const health = this.getOrCreateServerHealth(serverId);
    
    health.successCount++;
    health.consecutiveErrors = 0;
    health.lastSuccess = Date.now();
    
    // Record tool-specific success
    if (!health.tools[toolName]) {
      health.tools[toolName] = { errorCount: 0, successCount: 0 };
    }
    health.tools[toolName].successCount++;
    
    // Update status based on recent success
    if (health.status === 'unhealthy' && health.consecutiveErrors === 0) {
      health.status = 'healthy';
      this.logger.mcp.info("Server marked as healthy after successful call", { serverId, toolName });
    }
  }

  /**
   * Record a failed tool call
   */
  recordError(serverId: string, toolName: string, error: string): void {
    const health = this.getOrCreateServerHealth(serverId);
    
    health.errorCount++;
    health.consecutiveErrors++;
    health.lastError = error;
    health.lastErrorTime = Date.now();
    
    // Record tool-specific error
    if (!health.tools[toolName]) {
      health.tools[toolName] = { errorCount: 0, successCount: 0 };
    }
    health.tools[toolName].errorCount++;
    health.tools[toolName].lastError = error;
    
    // Update status based on consecutive errors
    if (health.consecutiveErrors >= this.UNHEALTHY_THRESHOLD) {
      if (health.status !== 'unhealthy') {
        health.status = 'unhealthy';
        this.logger.mcp.warn("Server marked as unhealthy", { 
          serverId, 
          consecutiveErrors: health.consecutiveErrors,
          threshold: this.UNHEALTHY_THRESHOLD
        });
      }
    }
    
    this.logger.mcp.error("Error recorded for server tool", { serverId, toolName, error });
  }

  /**
   * Get health status for a specific server
   */
  getServerHealth(serverId: string): MCPServerHealth | undefined {
    return this.healthData.get(serverId);
  }

  /**
   * Get health report for all servers
   */
  getHealthReport(): MCPHealthReport {
    const servers: Record<string, MCPServerHealth> = {};
    
    for (const [serverId, health] of Array.from(this.healthData.entries())) {
      servers[serverId] = { ...health };
    }
    
    return {
      servers,
      lastUpdated: Date.now()
    };
  }

  /**
   * Get list of unhealthy servers
   */
  getUnhealthyServers(): string[] {
    const unhealthy: string[] = [];
    
    for (const [serverId, health] of Array.from(this.healthData.entries())) {
      if (health.status === 'unhealthy') {
        unhealthy.push(serverId);
      }
    }
    
    return unhealthy;
  }

  /**
   * Calculate success rate for a server
   */
  getServerSuccessRate(serverId: string): number {
    const health = this.healthData.get(serverId);
    if (!health) return 0;
    
    const total = health.successCount + health.errorCount;
    if (total === 0) return 1; // No calls yet, assume healthy
    
    return health.successCount / total;
  }

  /**
   * Reset health data for a server (useful when reconnecting)
   */
  resetServerHealth(serverId: string): void {
    this.healthData.delete(serverId);
    this.logger.mcp.info("Health data reset for server", { serverId });
  }

  /**
   * Check if a server should be deprioritized in UI
   */
  shouldDeprioritize(serverId: string): boolean {
    const health = this.healthData.get(serverId);
    if (!health) return false;
    
    return health.status === 'unhealthy' || 
           this.getServerSuccessRate(serverId) < 0.5; // Less than 50% success rate
  }

  private getOrCreateServerHealth(serverId: string): MCPServerHealth {
    let health = this.healthData.get(serverId);
    
    if (!health) {
      health = {
        serverId,
        status: 'unknown',
        errorCount: 0,
        successCount: 0,
        consecutiveErrors: 0,
        tools: {}
      };
      this.healthData.set(serverId, health);
    }
    
    return health;
  }

  private cleanupOldData(): void {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [serverId, health] of Array.from(this.healthData.entries())) {
      // Reset consecutive errors if last error was more than 1 hour ago
      if (health.lastErrorTime && health.lastErrorTime < oneHourAgo) {
        health.consecutiveErrors = 0;
        if (health.status === 'unhealthy' && health.successCount > 0) {
          health.status = 'healthy';
          this.logger.mcp.info("Server status reset to healthy due to age of last error", { 
            serverId,
            successCount: health.successCount 
          });
        }
      }
    }
  }
}

// Export singleton instance
export const mcpHealthService = new MCPHealthService();