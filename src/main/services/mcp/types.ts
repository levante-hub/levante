export interface MCPRegistryEntry {
  id: string;
  name: string;
  npmPackage: string;
  status: string;
  version?: string;
}

export interface MCPDeprecatedEntry {
  id: string;
  name: string;
  npmPackage: string;
  reason: string;
  alternative: string;
}

export interface MCPRegistry {
  version: string;
  lastUpdated: string;
  entries: MCPRegistryEntry[];
  deprecated: MCPDeprecatedEntry[];
}
