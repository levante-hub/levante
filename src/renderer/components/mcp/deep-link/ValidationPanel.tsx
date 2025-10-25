import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { ValidationResult } from '@/constants/mcpSecurity';

interface ValidationPanelProps {
  validation: ValidationResult;
  packageExists?: boolean;
  isVerifyingPackage?: boolean;
}

export function ValidationPanel({ validation, packageExists, isVerifyingPackage }: ValidationPanelProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">Validation Results</h3>
      <div className="bg-muted/50 rounded-lg p-4 border border-border space-y-2">
        {/* Structure validation */}
        <div className="flex items-start gap-2 text-sm">
          {validation.structureValid ? (
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          )}
          <span className="text-foreground">
            Configuration structure {validation.structureValid ? 'valid' : 'invalid'}
          </span>
        </div>

        {/* Package verification */}
        {isVerifyingPackage && (
          <div className="flex items-start gap-2 text-sm">
            <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0 animate-spin" />
            <span className="text-muted-foreground">Verifying package...</span>
          </div>
        )}

        {!isVerifyingPackage && packageExists !== undefined && (
          <div className="flex items-start gap-2 text-sm">
            {packageExists ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            )}
            <span className="text-foreground">
              {packageExists ? 'Package exists on npm' : 'Package not found on npm'}
            </span>
          </div>
        )}

        {/* Official package check */}
        {validation.isOfficialPackage !== undefined && (
          <div className="flex items-start gap-2 text-sm">
            {validation.isOfficialPackage ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            )}
            <span className="text-foreground">
              {validation.isOfficialPackage ? 'Official MCP package' : 'Community package'}
            </span>
          </div>
        )}

        {/* Errors */}
        {validation.errors.map((error, idx) => (
          <div key={`error-${idx}`} className="flex items-start gap-2 text-sm">
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <span className="text-red-600 dark:text-red-400">{error}</span>
          </div>
        ))}

        {/* Warnings */}
        {validation.warnings.map((warning, idx) => (
          <div key={`warning-${idx}`} className="flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <span className="text-yellow-600 dark:text-yellow-400">{warning}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
