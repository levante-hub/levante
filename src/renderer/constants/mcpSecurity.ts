/**
 * MCP Security Constants
 * Trusted sources and official packages for deep link validation
 */

export const TRUSTED_SOURCES = [
  'modelcontextprotocol.io',
  'github.com/modelcontextprotocol',
  'anthropic.com',
  'docs.anthropic.com'
] as const;

export const OFFICIAL_MCP_PACKAGES = [
  '@modelcontextprotocol/server-memory',
  '@modelcontextprotocol/server-filesystem',
  '@modelcontextprotocol/server-sqlite',
  '@modelcontextprotocol/server-postgres',
  '@modelcontextprotocol/server-brave-search',
  '@modelcontextprotocol/server-fetch',
  '@modelcontextprotocol/server-github',
  '@modelcontextprotocol/server-google-maps',
  '@modelcontextprotocol/server-puppeteer',
  '@modelcontextprotocol/server-slack',
  '@modelcontextprotocol/server-everything'
] as const;

export type TrustLevel = 'verified-official' | 'community' | 'unknown';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface ValidationResult {
  structureValid: boolean;
  packageExists?: boolean;
  isOfficialPackage?: boolean;
  trustLevel: TrustLevel;
  warnings: string[];
  errors: string[];
}

export interface AISecurityAnalysis {
  isAnalyzing: boolean;
  isComplete: boolean;
  riskLevel?: RiskLevel;
  analysis?: string;
  recommendations?: string[];
  error?: string;
}
