import { useState, useEffect } from 'react';
import type { MCPServerConfig } from '@/types/mcp';
import type { ValidationResult, TrustLevel } from '@/constants/mcpSecurity';
import { OFFICIAL_MCP_PACKAGES } from '@/constants/mcpSecurity';

/**
 * Hook to validate MCP server configuration
 */
export function useServerValidation(config: Partial<MCPServerConfig> | null): ValidationResult {
  const [validation, setValidation] = useState<ValidationResult>({
    structureValid: false,
    trustLevel: 'unknown',
    warnings: [],
    errors: []
  });

  useEffect(() => {
    if (!config) {
      setValidation({
        structureValid: false,
        trustLevel: 'unknown',
        warnings: [],
        errors: ['No configuration provided']
      });
      return;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!config.transport) {
      errors.push('Missing transport type');
    }

    if (config.transport && !['stdio', 'http', 'sse'].includes(config.transport)) {
      errors.push('Invalid transport type');
    }

    // Validate stdio-specific fields
    if (config.transport === 'stdio') {
      if (!config.command) {
        errors.push('Missing command for stdio transport');
      }

      // Check for potentially dangerous commands
      const dangerousCommands = ['rm', 'del', 'format', 'sudo', 'curl', 'wget'];
      if (config.command && dangerousCommands.some(cmd => config.command?.includes(cmd))) {
        warnings.push('Command contains potentially dangerous operations');
      }

      // Check args for suspicious patterns
      if (config.args) {
        const suspiciousPatterns = ['&&', '||', ';', '|', '>', '<', '$'];
        const hasSuspiciousArgs = config.args.some((arg: string) =>
          suspiciousPatterns.some(pattern => arg.includes(pattern))
        );
        if (hasSuspiciousArgs) {
          warnings.push('Arguments contain shell operators - potential command injection');
        }
      }
    }

    // Validate http/sse-specific fields
    if (config.transport === 'http' || config.transport === 'sse') {
      if (!config.baseUrl) {
        errors.push('Missing URL for HTTP/SSE transport');
      } else {
        try {
          new URL(config.baseUrl);
        } catch {
          errors.push('Invalid URL format');
        }
      }
    }

    // Determine trust level
    let trustLevel: TrustLevel = 'unknown';
    let isOfficialPackage = false;

    if (config.transport === 'stdio' && config.args && config.args.length > 0) {
      const packageName = config.args[0];
      isOfficialPackage = OFFICIAL_MCP_PACKAGES.includes(packageName as any);

      if (isOfficialPackage) {
        trustLevel = 'verified-official';
      } else if (packageName.startsWith('@modelcontextprotocol/')) {
        trustLevel = 'community';
      }
    }

    // Add standard warnings
    warnings.push('This server will execute with your system permissions');
    if (trustLevel === 'unknown') {
      warnings.push('Unknown package source - verify before installing');
    }

    setValidation({
      structureValid: errors.length === 0,
      isOfficialPackage,
      trustLevel,
      warnings,
      errors
    });
  }, [config]);

  return validation;
}
