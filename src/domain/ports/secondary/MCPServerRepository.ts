import { MCPServer, ServerStatus } from '../../entities/MCPServer';
import { MCPServerId } from '../../value-objects/MCPServerId';
import { ServerEndpoint } from '../../value-objects/ServerEndpoint';
import { BaseRepository, RepositoryResult, PaginatedResult, QueryOptions } from './BaseRepository';

export interface MCPServerSearchFilters {
  isEnabled?: boolean;
  isRunning?: boolean;
  hasTools?: boolean;
  hasErrors?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  nameContains?: string;
  commandContains?: string;
  healthScore?: {
    min?: number;
    max?: number;
  };
}

export interface MCPServerCreateInput {
  name: string;
  endpoint: ServerEndpoint;
  description?: string;
  version?: string;
}

export interface MCPServerUpdateInput {
  name?: string;
  endpoint?: ServerEndpoint;
  isEnabled?: boolean;
  description?: string;
  version?: string;
}

export interface MCPServerWithHealth extends MCPServer {
  healthScore: number;
  lastHealthCheck: Date;
  uptime: number;
  errorCount: number;
  toolCount: number;
  enabledToolCount: number;
}

export interface MCPServerStatistics {
  totalServers: number;
  enabledServers: number;
  runningServers: number;
  healthyServers: number;
  serversWithErrors: number;
  totalTools: number;
  enabledTools: number;
  averageHealthScore: number;
  serversNeedingAttention: number;
  uptimeStatistics: {
    average: number;
    highest: number;
    lowest: number;
  };
}

export interface MCPServerPerformance {
  serverId: string;
  averageResponseTime: number;
  successfulRequests: number;
  failedRequests: number;
  totalRequests: number;
  uptime: number;
  lastRestart: Date | null;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface MCPServerLog {
  id: string;
  serverId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
}

export interface MCPServerRepository extends BaseRepository<MCPServer, MCPServerId> {
  /**
   * Create a new MCP server
   */
  create(input: MCPServerCreateInput): Promise<RepositoryResult<MCPServer>>;

  /**
   * Update an existing MCP server
   */
  update(id: MCPServerId, updates: MCPServerUpdateInput): Promise<RepositoryResult<MCPServer>>;

  /**
   * Find all enabled servers
   */
  findEnabled(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<MCPServer>>>;

  /**
   * Find all running servers
   */
  findRunning(): Promise<RepositoryResult<MCPServer[]>>;

  /**
   * Find servers by health status
   */
  findByHealthStatus(status: 'healthy' | 'degraded' | 'unhealthy', options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<MCPServer>>>;

  /**
   * Search servers by name, description, or command
   */
  search(query: string, filters?: MCPServerSearchFilters, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<MCPServer>>>;

  /**
   * Get server with health metrics
   */
  findByIdWithHealth(id: MCPServerId): Promise<RepositoryResult<MCPServerWithHealth | null>>;

  /**
   * Find servers with health metrics
   */
  findWithHealth(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<MCPServerWithHealth>>>;

  /**
   * Update server status
   */
  updateStatus(id: MCPServerId, status: Partial<ServerStatus>): Promise<RepositoryResult<void>>;

  /**
   * Mark server as running
   */
  markAsRunning(id: MCPServerId): Promise<RepositoryResult<void>>;

  /**
   * Mark server as stopped
   */
  markAsStopped(id: MCPServerId, error?: string): Promise<RepositoryResult<void>>;

  /**
   * Enable or disable a server
   */
  setEnabled(id: MCPServerId, enabled: boolean): Promise<RepositoryResult<MCPServer>>;

  /**
   * Get servers statistics
   */
  getStatistics(): Promise<RepositoryResult<MCPServerStatistics>>;

  /**
   * Find servers that can be started
   */
  findCanStart(): Promise<RepositoryResult<MCPServer[]>>;

  /**
   * Find servers that should be restarted (due to errors)
   */
  findNeedingRestart(): Promise<RepositoryResult<MCPServer[]>>;

  /**
   * Get server performance metrics
   */
  getPerformanceMetrics(id: MCPServerId): Promise<RepositoryResult<MCPServerPerformance>>;

  /**
   * Record server interaction
   */
  recordInteraction(id: MCPServerId, success: boolean, responseTime: number, error?: string): Promise<RepositoryResult<void>>;

  /**
   * Find servers with configuration errors
   */
  findWithConfigurationErrors(): Promise<RepositoryResult<MCPServer[]>>;

  /**
   * Validate server configuration
   */
  validateConfiguration(id: MCPServerId): Promise<RepositoryResult<ServerValidationResult>>;

  /**
   * Test server connectivity
   */
  testConnection(id: MCPServerId): Promise<RepositoryResult<ServerConnectionTest>>;

  /**
   * Find servers by endpoint pattern
   */
  findByEndpointPattern(pattern: string): Promise<RepositoryResult<MCPServer[]>>;

  /**
   * Clone server configuration
   */
  clone(id: MCPServerId, newName: string): Promise<RepositoryResult<MCPServer>>;

  /**
   * Export server configuration
   */
  export(id: MCPServerId): Promise<RepositoryResult<MCPServerExport>>;

  /**
   * Import server configuration
   */
  import(data: MCPServerImport): Promise<RepositoryResult<MCPServer>>;

  /**
   * Find servers without tools
   */
  findWithoutTools(): Promise<RepositoryResult<MCPServer[]>>;

  /**
   * Find servers with unused tools
   */
  findWithUnusedTools(): Promise<RepositoryResult<MCPServer[]>>;

  /**
   * Get server logs
   */
  getLogs(id: MCPServerId, options?: { level?: string; limit?: number; since?: Date }): Promise<RepositoryResult<MCPServerLog[]>>;

  /**
   * Add server log entry
   */
  addLogEntry(id: MCPServerId, level: string, message: string, context?: Record<string, any>): Promise<RepositoryResult<void>>;

  /**
   * Clear server logs
   */
  clearLogs(id: MCPServerId, olderThan?: Date): Promise<RepositoryResult<number>>;

  /**
   * Find servers requiring attention
   */
  findRequiringAttention(): Promise<RepositoryResult<MCPServerAttentionItem[]>>;

  /**
   * Update server health score
   */
  updateHealthScore(id: MCPServerId, score: number): Promise<RepositoryResult<void>>;

  /**
   * Find most reliable servers
   */
  findMostReliable(limit?: number): Promise<RepositoryResult<MCPServerWithHealth[]>>;

  /**
   * Find least reliable servers
   */
  findLeastReliable(limit?: number): Promise<RepositoryResult<MCPServerWithHealth[]>>;

  /**
   * Get server uptime statistics
   */
  getUptimeStatistics(id: MCPServerId, period: 'day' | 'week' | 'month'): Promise<RepositoryResult<ServerUptimeStats>>;

  /**
   * Find servers by version
   */
  findByVersion(version: string): Promise<RepositoryResult<MCPServer[]>>;

  /**
   * Find outdated servers
   */
  findOutdated(): Promise<RepositoryResult<MCPServer[]>>;

  /**
   * Bulk enable/disable servers
   */
  bulkSetEnabled(ids: MCPServerId[], enabled: boolean): Promise<RepositoryResult<number>>;

  /**
   * Restart server
   */
  restart(id: MCPServerId): Promise<RepositoryResult<void>>;

  /**
   * Get server dependency graph
   */
  getDependencyGraph(): Promise<RepositoryResult<ServerDependencyGraph>>;

  /**
   * Find servers that depend on a specific server
   */
  findDependents(id: MCPServerId): Promise<RepositoryResult<MCPServer[]>>;

  /**
   * Find server dependencies
   */
  findDependencies(id: MCPServerId): Promise<RepositoryResult<MCPServer[]>>;
}

export interface ServerValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  canStart: boolean;
  endpointValidation: {
    isExecutable: boolean;
    hasRequiredPermissions: boolean;
    commandExists: boolean;
  };
  securityChecks: {
    hasDangerousPatterns: boolean;
    usesSecureDefaults: boolean;
    issues: string[];
  };
}

export interface ServerConnectionTest {
  success: boolean;
  responseTime: number;
  error?: string;
  serverVersion?: string;
  availableTools?: string[];
  capabilities?: string[];
  testedAt: Date;
}

export interface MCPServerAttentionItem {
  serverId: string;
  serverName: string;
  type: 'error' | 'performance' | 'security' | 'update' | 'configuration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
  actionRequired: boolean;
  affectedTools?: string[];
}

export interface ServerUptimeStats {
  serverId: string;
  period: string;
  totalTime: number;
  uptime: number;
  downtime: number;
  uptimePercentage: number;
  restarts: number;
  longestUptime: number;
  longestDowntime: number;
  incidents: Array<{
    startTime: Date;
    endTime: Date;
    reason: string;
  }>;
}

export interface ServerDependencyGraph {
  servers: Array<{
    id: string;
    name: string;
    dependencies: string[];
    dependents: string[];
  }>;
  cycles: string[][];
  isolatedServers: string[];
}

export interface MCPServerExport {
  server: {
    name: string;
    endpoint: any; // ServerEndpoint serialized
    description?: string;
    version?: string;
    isEnabled: boolean;
  };
  tools: Array<{
    name: string;
    description?: string;
    schema: any;
    isEnabled: boolean;
    consentRequired: boolean;
  }>;
  metadata: {
    exportedAt: string;
    exportVersion: string;
    toolCount: number;
    healthScore: number;
  };
}

export interface MCPServerImport {
  server: {
    name: string;
    endpoint: any; // ServerEndpoint data
    description?: string;
    version?: string;
    isEnabled?: boolean;
  };
  tools?: Array<{
    name: string;
    description?: string;
    schema: any;
    isEnabled?: boolean;
    consentRequired?: boolean;
  }>;
  options?: {
    replaceExisting?: boolean;
    preserveEnabled?: boolean;
    generateNewId?: boolean;
  };
}