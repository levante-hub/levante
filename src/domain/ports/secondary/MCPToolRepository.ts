import { MCPTool } from '../../entities/MCPTool';
import { MCPToolId } from '../../value-objects/MCPToolId';
import { MCPServerId } from '../../value-objects/MCPServerId';
import { ToolSchema } from '../../value-objects/ToolSchema';
import { BaseRepository, RepositoryResult, PaginatedResult, QueryOptions } from './BaseRepository';

export interface MCPToolSearchFilters {
  serverId?: string;
  isEnabled?: boolean;
  consentRequired?: boolean;
  hasDescription?: boolean;
  nameContains?: string;
  descriptionContains?: string;
  schemaComplexity?: 'simple' | 'complex';
  lastUsedAfter?: Date;
  lastUsedBefore?: Date;
  usageCount?: {
    min?: number;
    max?: number;
  };
}

export interface MCPToolCreateInput {
  serverId: MCPServerId;
  name: string;
  schema: ToolSchema;
  description?: string;
  consentRequired?: boolean;
}

export interface MCPToolUpdateInput {
  schema?: ToolSchema;
  isEnabled?: boolean;
  consentRequired?: boolean;
  description?: string;
}

export interface MCPToolWithUsage extends MCPTool {
  usageCount: number;
  lastUsedAt: Date | null;
  successRate: number;
  averageExecutionTime: number;
  errorCount: number;
  lastError?: string;
  lastErrorAt?: Date;
}

export interface MCPToolStatistics {
  totalTools: number;
  enabledTools: number;
  toolsRequiringConsent: number;
  toolsByServer: Record<string, number>;
  mostUsedTools: Array<{
    toolId: string;
    name: string;
    serverId: string;
    usageCount: number;
  }>;
  averageUsagePerTool: number;
  toolsWithErrors: number;
  averageSuccessRate: number;
  schemaComplexityDistribution: {
    simple: number;
    complex: number;
  };
}

export interface MCPToolExecution {
  id: string;
  toolId: string;
  serverId: string;
  input: any;
  output?: any;
  error?: string;
  executionTime: number;
  success: boolean;
  timestamp: Date;
  context?: Record<string, any>;
}

export interface MCPToolPerformance {
  toolId: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  successRate: number;
  lastExecutedAt: Date | null;
  commonErrors: Array<{
    error: string;
    count: number;
  }>;
}

export interface MCPToolRepository extends BaseRepository<MCPTool, MCPToolId> {
  /**
   * Create a new MCP tool
   */
  create(input: MCPToolCreateInput): Promise<RepositoryResult<MCPTool>>;

  /**
   * Update an existing MCP tool
   */
  update(id: MCPToolId, updates: MCPToolUpdateInput): Promise<RepositoryResult<MCPTool>>;

  /**
   * Find tools by server ID
   */
  findByServerId(serverId: MCPServerId, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<MCPTool>>>;

  /**
   * Find all enabled tools
   */
  findEnabled(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<MCPTool>>>;

  /**
   * Find tools requiring consent
   */
  findRequiringConsent(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<MCPTool>>>;

  /**
   * Search tools by name, description, or schema
   */
  search(query: string, filters?: MCPToolSearchFilters, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<MCPTool>>>;

  /**
   * Find tool by name within a server
   */
  findByNameInServer(serverId: MCPServerId, name: string): Promise<RepositoryResult<MCPTool | null>>;

  /**
   * Get tool with usage statistics
   */
  findByIdWithUsage(id: MCPToolId): Promise<RepositoryResult<MCPToolWithUsage | null>>;

  /**
   * Find tools with usage statistics
   */
  findWithUsage(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<MCPToolWithUsage>>>;

  /**
   * Enable or disable a tool
   */
  setEnabled(id: MCPToolId, enabled: boolean): Promise<RepositoryResult<MCPTool>>;

  /**
   * Set consent requirement for a tool
   */
  setConsentRequired(id: MCPToolId, required: boolean): Promise<RepositoryResult<MCPTool>>;

  /**
   * Bulk enable/disable tools
   */
  bulkSetEnabled(ids: MCPToolId[], enabled: boolean): Promise<RepositoryResult<number>>;

  /**
   * Enable all tools for a server
   */
  enableAllForServer(serverId: MCPServerId): Promise<RepositoryResult<number>>;

  /**
   * Disable all tools for a server
   */
  disableAllForServer(serverId: MCPServerId): Promise<RepositoryResult<number>>;

  /**
   * Delete all tools for a server
   */
  deleteByServerId(serverId: MCPServerId): Promise<RepositoryResult<number>>;

  /**
   * Get tools statistics
   */
  getStatistics(): Promise<RepositoryResult<MCPToolStatistics>>;

  /**
   * Find most used tools
   */
  findMostUsed(limit?: number): Promise<RepositoryResult<MCPToolWithUsage[]>>;

  /**
   * Find unused tools
   */
  findUnused(): Promise<RepositoryResult<MCPTool[]>>;

  /**
   * Find tools with errors
   */
  findWithErrors(): Promise<RepositoryResult<MCPToolWithUsage[]>>;

  /**
   * Record tool execution
   */
  recordExecution(execution: Omit<MCPToolExecution, 'id' | 'timestamp'>): Promise<RepositoryResult<MCPToolExecution>>;

  /**
   * Get tool performance metrics
   */
  getPerformanceMetrics(id: MCPToolId): Promise<RepositoryResult<MCPToolPerformance>>;

  /**
   * Get tool execution history
   */
  getExecutionHistory(id: MCPToolId, options?: { limit?: number; since?: Date }): Promise<RepositoryResult<MCPToolExecution[]>>;

  /**
   * Find tools with complex schemas
   */
  findWithComplexSchemas(): Promise<RepositoryResult<MCPTool[]>>;

  /**
   * Find tools with simple schemas
   */
  findWithSimpleSchemas(): Promise<RepositoryResult<MCPTool[]>>;

  /**
   * Validate tool input against schema
   */
  validateInput(id: MCPToolId, input: any): Promise<RepositoryResult<ToolValidationResult>>;

  /**
   * Generate example input for a tool
   */
  generateExampleInput(id: MCPToolId): Promise<RepositoryResult<any>>;

  /**
   * Find similar tools by schema or name
   */
  findSimilar(id: MCPToolId, limit?: number): Promise<RepositoryResult<MCPTool[]>>;

  /**
   * Clone tool to another server
   */
  cloneToServer(id: MCPToolId, targetServerId: MCPServerId, newName?: string): Promise<RepositoryResult<MCPTool>>;

  /**
   * Export tools from a server
   */
  exportFromServer(serverId: MCPServerId): Promise<RepositoryResult<MCPToolExport>>;

  /**
   * Import tools to a server
   */
  importToServer(serverId: MCPServerId, data: MCPToolImport): Promise<RepositoryResult<MCPTool[]>>;

  /**
   * Find tools by schema property
   */
  findBySchemaProperty(propertyName: string, propertyValue?: any): Promise<RepositoryResult<MCPTool[]>>;

  /**
   * Get tool dependency graph
   */
  getDependencyGraph(serverId?: MCPServerId): Promise<RepositoryResult<ToolDependencyGraph>>;

  /**
   * Find tools that depend on other tools
   */
  findWithDependencies(): Promise<RepositoryResult<MCPTool[]>>;

  /**
   * Update tool schema
   */
  updateSchema(id: MCPToolId, schema: ToolSchema): Promise<RepositoryResult<MCPTool>>;

  /**
   * Sync tools for a server
   */
  syncForServer(serverId: MCPServerId, toolDefinitions: MCPToolCreateInput[]): Promise<RepositoryResult<ToolSyncResult>>;

  /**
   * Find tools requiring attention
   */
  findRequiringAttention(): Promise<RepositoryResult<ToolAttentionItem[]>>;

  /**
   * Get tool usage analytics
   */
  getUsageAnalytics(period: 'day' | 'week' | 'month'): Promise<RepositoryResult<ToolUsageAnalytics>>;

  /**
   * Find tools by execution success rate
   */
  findBySuccessRate(minRate: number, maxRate?: number): Promise<RepositoryResult<MCPToolWithUsage[]>>;

  /**
   * Get recommendation for tool usage
   */
  getRecommendations(serverId?: MCPServerId): Promise<RepositoryResult<ToolRecommendation[]>>;

  /**
   * Archive unused tools
   */
  archiveUnused(unusedForDays: number): Promise<RepositoryResult<number>>;

  /**
   * Restore archived tools
   */
  restoreArchived(ids: MCPToolId[]): Promise<RepositoryResult<number>>;

  /**
   * Find archived tools
   */
  findArchived(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<MCPTool>>>;

  /**
   * Clear execution history older than specified date
   */
  clearExecutionHistory(olderThan: Date): Promise<RepositoryResult<number>>;
}

export interface ToolValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestion?: any; // Suggested corrected input
}

export interface ToolSyncResult {
  toolsAdded: number;
  toolsUpdated: number;
  toolsRemoved: number;
  enabledPreserved: number;
  consentPreserved: number;
  errors: string[];
}

export interface ToolAttentionItem {
  toolId: string;
  toolName: string;
  serverId: string;
  serverName: string;
  type: 'error' | 'performance' | 'unused' | 'schema_changed' | 'deprecated';
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
  actionRequired: boolean;
}

export interface ToolUsageAnalytics {
  period: string;
  totalExecutions: number;
  uniqueTools: number;
  averageExecutionsPerTool: number;
  successRate: number;
  mostActiveTools: Array<{
    toolId: string;
    toolName: string;
    executions: number;
  }>;
  serversUsage: Record<string, number>;
  hourlyDistribution: Record<string, number>;
  errorTrends: Array<{
    date: string;
    errorCount: number;
    totalCount: number;
  }>;
}

export interface ToolRecommendation {
  type: 'enable' | 'disable' | 'require_consent' | 'remove_consent' | 'archive' | 'update_schema';
  toolId: string;
  toolName: string;
  reason: string;
  confidence: number;
  expectedBenefit: string;
  implementationEffort: 'low' | 'medium' | 'high';
}

export interface ToolDependencyGraph {
  tools: Array<{
    id: string;
    name: string;
    serverId: string;
    dependencies: string[];
    dependents: string[];
  }>;
  cycles: string[][];
  isolatedTools: string[];
  serverGroups: Record<string, string[]>;
}

export interface MCPToolExport {
  serverId: string;
  serverName: string;
  tools: Array<{
    name: string;
    description?: string;
    schema: any;
    isEnabled: boolean;
    consentRequired: boolean;
  }>;
  metadata: {
    exportedAt: string;
    totalTools: number;
    enabledTools: number;
    exportVersion: string;
  };
}

export interface MCPToolImport {
  tools: Array<{
    name: string;
    description?: string;
    schema: any;
    isEnabled?: boolean;
    consentRequired?: boolean;
  }>;
  options?: {
    replaceExisting?: boolean;
    preserveEnabled?: boolean;
    preserveConsent?: boolean;
  };
}