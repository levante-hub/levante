import { Setting } from '../../entities/Setting';
import { Timestamp } from '../../value-objects/Timestamp';
import { BaseRepository, RepositoryResult, PaginatedResult, QueryOptions } from './BaseRepository';

export interface SettingSearchFilters {
  namespace?: string;
  type?: 'string' | 'number' | 'boolean' | 'json';
  isDefault?: boolean;
  isRequired?: boolean;
  isReadOnly?: boolean;
  updatedAfter?: Date;
  updatedBefore?: Date;
  keyPattern?: string;
}

export interface SettingCreateInput {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  value: any;
}

export interface SettingUpdateInput {
  value: any;
}

export interface SettingWithHistory extends Setting {
  history: SettingHistoryEntry[];
  changeCount: number;
  lastChangedBy?: string;
}

export interface SettingHistoryEntry {
  id: string;
  settingKey: string;
  oldValue: any;
  newValue: any;
  changedAt: Timestamp;
  changedBy?: string;
  reason?: string;
}

export interface SettingStatistics {
  totalSettings: number;
  settingsByType: Record<string, number>;
  settingsByNamespace: Record<string, number>;
  defaultSettings: number;
  customSettings: number;
  readOnlySettings: number;
  requiredSettings: number;
  recentlyChangedSettings: number;
  oldestSetting: Date | null;
  newestSetting: Date | null;
}

export interface SettingValidationReport {
  settingKey: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  currentValue: any;
  defaultValue: any;
  expectedType: string;
}

export interface SettingRepository extends BaseRepository<Setting, string> {
  /**
   * Find all settings
   */
  findAll(): Promise<RepositoryResult<Setting[]>>;

  /**
   * Create a new setting
   */
  create(input: SettingCreateInput): Promise<RepositoryResult<Setting>>;

  /**
   * Update an existing setting
   */
  update(key: string, updates: SettingUpdateInput): Promise<RepositoryResult<Setting>>;

  /**
   * Find setting by key
   */
  findByKey(key: string): Promise<RepositoryResult<Setting | null>>;

  /**
   * Find settings by namespace
   */
  findByNamespace(namespace: string, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Setting>>>;

  /**
   * Find settings by type
   */
  findByType(type: 'string' | 'number' | 'boolean' | 'json', options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Setting>>>;

  /**
   * Search settings by key pattern or value
   */
  search(query: string, filters?: SettingSearchFilters, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Setting>>>;

  /**
   * Find all required settings
   */
  findRequired(): Promise<RepositoryResult<Setting[]>>;

  /**
   * Find all read-only settings
   */
  findReadOnly(): Promise<RepositoryResult<Setting[]>>;

  /**
   * Find settings with default values
   */
  findDefault(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Setting>>>;

  /**
   * Find settings with custom (non-default) values
   */
  findCustom(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Setting>>>;

  /**
   * Get or create setting with default value
   */
  getOrCreate(key: string, type: 'string' | 'number' | 'boolean' | 'json'): Promise<RepositoryResult<Setting>>;

  /**
   * Set setting value (create if not exists)
   */
  set(key: string, type: 'string' | 'number' | 'boolean' | 'json', value: any): Promise<RepositoryResult<Setting>>;

  /**
   * Reset setting to default value
   */
  resetToDefault(key: string): Promise<RepositoryResult<Setting>>;

  /**
   * Reset all settings in namespace to default
   */
  resetNamespaceToDefault(namespace: string): Promise<RepositoryResult<number>>;

  /**
   * Reset all settings to default
   */
  resetAllToDefault(): Promise<RepositoryResult<number>>;

  /**
   * Get setting with history
   */
  findByKeyWithHistory(key: string): Promise<RepositoryResult<SettingWithHistory | null>>;

  /**
   * Get setting history
   */
  getHistory(key: string, limit?: number): Promise<RepositoryResult<SettingHistoryEntry[]>>;

  /**
   * Record setting change
   */
  recordChange(key: string, oldValue: any, newValue: any, changedBy?: string, reason?: string): Promise<RepositoryResult<void>>;

  /**
   * Get settings statistics
   */
  getStatistics(): Promise<RepositoryResult<SettingStatistics>>;

  /**
   * Validate all settings
   */
  validateAll(): Promise<RepositoryResult<SettingValidationReport[]>>;

  /**
   * Validate specific setting
   */
  validateSetting(key: string): Promise<RepositoryResult<SettingValidationReport>>;

  /**
   * Find invalid settings
   */
  findInvalid(): Promise<RepositoryResult<Setting[]>>;

  /**
   * Find settings that have changed recently
   */
  findRecentlyChanged(hours: number): Promise<RepositoryResult<Setting[]>>;

  /**
   * Find settings by key pattern
   */
  findByKeyPattern(pattern: string): Promise<RepositoryResult<Setting[]>>;

  /**
   * Export settings by namespace
   */
  exportNamespace(namespace: string): Promise<RepositoryResult<SettingExport>>;

  /**
   * Export all settings
   */
  exportAll(): Promise<RepositoryResult<SettingExport>>;

  /**
   * Import settings
   */
  import(data: SettingImport): Promise<RepositoryResult<SettingImportResult>>;

  /**
   * Bulk update settings
   */
  bulkUpdate(updates: Array<{ key: string; value: any }>): Promise<RepositoryResult<number>>;

  /**
   * Find orphaned settings (keys that no longer exist in system)
   */
  findOrphaned(): Promise<RepositoryResult<Setting[]>>;

  /**
   * Clean up orphaned settings
   */
  cleanupOrphaned(): Promise<RepositoryResult<number>>;

  /**
   * Create system default settings
   */
  createSystemDefaults(): Promise<RepositoryResult<Setting[]>>;

  /**
   * Find missing required settings
   */
  findMissingRequired(): Promise<RepositoryResult<string[]>>;

  /**
   * Check setting dependencies
   */
  checkDependencies(key: string): Promise<RepositoryResult<SettingDependencyCheck>>;

  /**
   * Find settings that depend on a specific setting
   */
  findDependents(key: string): Promise<RepositoryResult<Setting[]>>;

  /**
   * Get setting recommendations based on usage patterns
   */
  getRecommendations(): Promise<RepositoryResult<SettingRecommendation[]>>;

  /**
   * Lock setting (prevent changes)
   */
  lock(key: string, reason?: string): Promise<RepositoryResult<void>>;

  /**
   * Unlock setting
   */
  unlock(key: string): Promise<RepositoryResult<void>>;

  /**
   * Find locked settings
   */
  findLocked(): Promise<RepositoryResult<Setting[]>>;

  /**
   * Create setting backup
   */
  createBackup(): Promise<RepositoryResult<SettingBackup>>;

  /**
   * Restore from backup
   */
  restoreFromBackup(backup: SettingBackup): Promise<RepositoryResult<SettingRestoreResult>>;

  /**
   * Get configuration schema
   */
  getConfigurationSchema(): Promise<RepositoryResult<ConfigurationSchema>>;

  /**
   * Validate against schema
   */
  validateAgainstSchema(settings: Record<string, any>): Promise<RepositoryResult<SchemaValidationResult>>;

  /**
   * Find settings with security implications
   */
  findSecuritySensitive(): Promise<RepositoryResult<Setting[]>>;

  /**
   * Audit setting access
   */
  auditAccess(key: string, action: string, user?: string): Promise<RepositoryResult<void>>;

  /**
   * Get audit log
   */
  getAuditLog(key?: string, limit?: number): Promise<RepositoryResult<SettingAuditEntry[]>>;

  /**
   * Find settings by value
   */
  findByValue(value: any, type?: 'string' | 'number' | 'boolean' | 'json'): Promise<RepositoryResult<Setting[]>>;

  /**
   * Get setting usage statistics
   */
  getUsageStatistics(key: string): Promise<RepositoryResult<SettingUsageStats>>;
}

export interface SettingExport {
  namespace?: string;
  settings: Record<string, {
    type: string;
    value: any;
    isDefault: boolean;
    isRequired: boolean;
    isReadOnly: boolean;
    updatedAt: string;
  }>;
  metadata: {
    exportedAt: string;
    exportedBy?: string;
    totalSettings: number;
    exportVersion: string;
  };
}

export interface SettingImport {
  settings: Record<string, {
    type: string;
    value: any;
  }>;
  options?: {
    overwriteExisting?: boolean;
    skipReadOnly?: boolean;
    skipRequired?: boolean;
    dryRun?: boolean;
  };
}

export interface SettingImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{
    key: string;
    error: string;
  }>;
  warnings: Array<{
    key: string;
    warning: string;
  }>;
}

export interface SettingDependencyCheck {
  key: string;
  isValid: boolean;
  dependencies: Array<{
    dependentKey: string;
    dependentValue: any;
    isValid: boolean;
    error?: string;
  }>;
  circularDependencies: string[];
}

export interface SettingRecommendation {
  key: string;
  type: 'optimize' | 'security' | 'performance' | 'feature' | 'cleanup';
  priority: 'low' | 'medium' | 'high';
  description: string;
  currentValue: any;
  recommendedValue: any;
  reason: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
}

export interface SettingBackup {
  id: string;
  createdAt: string;
  createdBy?: string;
  settings: Record<string, {
    type: string;
    value: any;
    updatedAt: string;
  }>;
  metadata: {
    totalSettings: number;
    backupVersion: string;
  };
}

export interface SettingRestoreResult {
  restored: number;
  skipped: number;
  errors: Array<{
    key: string;
    error: string;
  }>;
}

export interface ConfigurationSchema {
  namespaces: Record<string, {
    description: string;
    settings: Record<string, {
      type: string;
      description: string;
      required: boolean;
      readOnly: boolean;
      defaultValue: any;
      validation?: any;
    }>;
  }>;
}

export interface SchemaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingRequired: string[];
  unknownSettings: string[];
}

export interface SettingAuditEntry {
  id: string;
  settingKey: string;
  action: 'read' | 'write' | 'delete' | 'reset' | 'lock' | 'unlock';
  oldValue?: any;
  newValue?: any;
  user?: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface SettingUsageStats {
  settingKey: string;
  readCount: number;
  writeCount: number;
  lastRead?: Date;
  lastWrite?: Date;
  averageReadsPerDay: number;
  averageWritesPerDay: number;
  peakUsageTimes: Array<{
    hour: number;
    count: number;
  }>;
}