export interface MCPRegistryEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  transport: {
    type: 'stdio' | 'http' | 'sse';
    autoDetect: boolean;
  };
  configuration: {
    fields: MCPConfigField[];
    defaults?: Record<string, any>;
    template?: {
      type: 'stdio' | 'http' | 'sse';
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      baseUrl?: string;
      headers?: Record<string, string>;
    };
  };
}

export interface MCPConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'number' | 'boolean' | 'textarea';
  required: boolean;
  description: string;
  placeholder?: string;
  options?: string[];
  defaultValue?: any;
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
  baseUrl?: string;
  headers?: Record<string, string>;
  transport: 'stdio' | 'http' | 'sse';
  enabled?: boolean;  // Added by listServers(), not stored in JSON
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

export type MCPConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';