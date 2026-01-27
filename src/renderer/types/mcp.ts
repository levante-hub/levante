// =============================================================================
// API Response Types (from Levante MCP Store API)
// =============================================================================

import type { RuntimeType, RuntimeSource } from "../../types/runtime";

export interface LevanteAPIResponse {
  version: string;
  provider: {
    id: string;
    name: string;
    homepage?: string;
  };
  servers: LevanteAPIServer[];
}

export interface LevanteAPIServer {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  category: MCPCategory;
  icon?: string;
  logoUrl?: string;
  source: MCPSource; // "official" | "community"
  maintainer?: MCPMaintainer;
  status?: MCPStatus;
  version?: string;
  transport: "stdio" | "http" | "sse" | "streamable-http";
  inputs?: Record<string, InputDefinition>;
  configuration?: {
    template?: Record<string, unknown>;
  };
  metadata?: MCPMetadata;
}

export type MCPCategory =
  | "documentation"
  | "development"
  | "database"
  | "automation"
  | "ai"
  | "communication"
  | "productivity"
  | "other";

export type MCPSource = "official" | "community";

export type MCPStatus = "active" | "deprecated" | "experimental";

export interface MCPMaintainer {
  name: string;
  url?: string;
  github?: string;
}

export interface MCPMetadata {
  homepage?: string;
  repository?: string;
  author?: string;
  addedAt?: string;
  lastUpdated?: string;
}

export interface InputDefinition {
  label: string;
  required: boolean;
  type: "string" | "password" | "number" | "boolean";
  default?: string;
  description?: string;
}

// Legacy alias for backwards compatibility
export type EnvFieldConfig = InputDefinition;

// =============================================================================
// Internal Registry Types (transformed from API)
// =============================================================================

export interface MCPRegistryEntry {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  category: MCPCategory;
  icon?: string;
  logoUrl?: string;
  source: MCPSource; // "official" | "community" - used for filtering
  maintainer?: MCPMaintainer;
  status?: MCPStatus;
  version?: string;
  transport: {
    type: "stdio" | "http" | "sse" | "streamable-http";
    autoDetect: boolean;
  };
  configuration: {
    fields: MCPConfigField[];
    defaults?: Record<string, unknown>;
    template?: {
      type: "stdio" | "http" | "sse" | "streamable-http";
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
      baseUrl?: string; // Legacy support
      headers?: Record<string, string>;
    };
  };
  metadata?: MCPMetadata;
}

export interface MCPProvider {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: "api"; // Solo tipo API ahora
  endpoint: string;
  enabled: boolean;
  homepage?: string;
  lastSynced?: string;
  serverCount?: number;
}

export interface MCPConfigField {
  key: string;
  label: string;
  type: "string" | "password" | "number" | "boolean";
  required: boolean;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
}

export interface MCPRegistry {
  version: string;
  entries: MCPRegistryEntry[];
}

export interface MCPServerConfig {
  id: string;
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  baseUrl?: string; // Legacy support, prefer 'url'
  headers?: Record<string, string>;
  transport: "stdio" | "http" | "sse" | "streamable-http";
  enabled?: boolean; // Added by listServers(), not stored in JSON
  runtime?: {
    type?: RuntimeType;
    version?: string;
    source?: RuntimeSource | "levante";
    path?: string;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export type MCPConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "error"
  | "pending_oauth";

// Re-export tool selection types from main
export type { Tool, ServerTool, ToolsCache, DisabledTools } from '../../main/types/mcp';
