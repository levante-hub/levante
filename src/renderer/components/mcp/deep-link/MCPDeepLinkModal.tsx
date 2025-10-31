import { useState, useEffect } from 'react';
import { Link2, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { MCPServerConfig } from '../../../types/mcp';
import type { AISecurityAnalysis } from '@/constants/mcpSecurity';
import { TrustBadge } from './TrustBadge';
import { ServerInfoPanel } from './ServerInfoPanel';
import { JSONPreview } from './JSONPreview';
import { ValidationPanel } from './ValidationPanel';
import { AISecurityPanel } from './AISecurityPanel';
import { SecurityWarnings } from './SecurityWarnings';
import { useServerValidation } from '@/hooks/useServerValidation';
import { usePackageVerification } from '@/hooks/usePackageVerification';
import { useMCPStore } from '@/stores/mcpStore';
import { logger } from '@/services/logger';
import { toast } from 'sonner';

interface MCPDeepLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: Partial<MCPServerConfig> | null;
  serverName: string;
  sourceUrl?: string;
}

export function MCPDeepLinkModal({
  open,
  onOpenChange,
  config,
  serverName,
  sourceUrl
}: MCPDeepLinkModalProps) {
  const [addAsDisabled, setAddAsDisabled] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AISecurityAnalysis>({
    isAnalyzing: false,
    isComplete: false
  });

  // Get MCP store to refresh active servers list
  const { loadActiveServers } = useMCPStore();

  // Validation hooks
  const validation = useServerValidation(config);
  const packageName = config?.transport === 'stdio' && config.args?.[0] ? config.args[0] : undefined;
  const packageVerification = usePackageVerification(packageName);

  // Run AI security analysis when modal opens
  useEffect(() => {
    if (open && config && validation.structureValid) {
      runAISecurityAnalysis();
    }
  }, [open, config, validation.structureValid]);

  const runAISecurityAnalysis = async () => {
    if (!config) return;

    setAiAnalysis({ isAnalyzing: true, isComplete: false });

    try {
      // Check if structured output is supported
      const supportCheck = await window.levante.mcp.checkStructuredOutputSupport();

      if (!supportCheck.success || !supportCheck.data?.supported) {
        setAiAnalysis({
          isAnalyzing: false,
          isComplete: false,
          error: 'AI analysis requires a model with structured output support'
        });
        return;
      }

      // Prepare analysis prompt
      const configJson = JSON.stringify(config, null, 2);
      const prompt = `You are a security expert analyzing an MCP server configuration for potential security threats.

CONFIGURATION TO ANALYZE:
${configJson}

CRITICAL SECURITY CHECKS:

1. DANGEROUS NPX FLAGS (IMMEDIATE HIGH RISK):
   - Check if args contain: -e, --eval, --call, -c, --shell-auto-fallback
   - These flags allow ARBITRARY CODE EXECUTION
   - Example attack: npx -e "require('child_process').exec('malicious command')"
   - If ANY of these flags are present → HIGH RISK

2. COMMAND INJECTION PATTERNS:
   - Shell operators in args: &&, ||, ;, |, >, <, $(, \`
   - Path traversal: ../,  ../../
   - Environment variable injection: $HOME, $PATH, etc.
   - If found → HIGH RISK

3. PACKAGE VERIFICATION:
   - Official MCP packages start with @modelcontextprotocol/
   - Verify package name follows npm conventions (no special chars)
   - Check if package name is randomly generated or suspicious
   - Unknown packages from untrusted scopes → MEDIUM RISK

4. NETWORK/URL VALIDATION (for http/sse):
   - Check for localhost/private IPs (could be SSRF)
   - Verify protocol is https (not http)
   - Suspicious domains or IP addresses → MEDIUM RISK

RESPONSE FORMAT:
Provide a 2-3 sentence security assessment that:
- Explicitly states if dangerous flags are present
- Mentions specific security concerns found
- Recommends whether to proceed or reject
- Uses words "DANGEROUS", "HIGH RISK", "MALICIOUS" for serious threats
- Uses "CAUTION", "SUSPICIOUS" for medium threats
- Uses "SAFE", "LOW RISK" only if no threats found`;

      // Use the extract config endpoint which uses AI
      const result = await window.levante.mcp.extractConfig(prompt);

      if (result.success) {
        // Parse AI response for risk assessment
        const analysis = result.suggestion || 'Configuration appears standard.';
        const riskLevel = analysis.toLowerCase().includes('dangerous') || analysis.toLowerCase().includes('high risk')
          ? 'high'
          : analysis.toLowerCase().includes('caution') || analysis.toLowerCase().includes('suspicious')
          ? 'medium'
          : 'low';

        setAiAnalysis({
          isAnalyzing: false,
          isComplete: true,
          analysis,
          riskLevel: riskLevel as any,
          recommendations: riskLevel === 'low' ? [] : ['Verify source before proceeding', 'Test with disabled mode first']
        });
      } else {
        setAiAnalysis({
          isAnalyzing: false,
          isComplete: false,
          error: result.error || 'Analysis failed'
        });
      }
    } catch (error) {
      logger.mcp.error('AI security analysis failed', {
        error: error instanceof Error ? error.message : error
      });
      setAiAnalysis({
        isAnalyzing: false,
        isComplete: false,
        error: 'Analysis error'
      });
    }
  };

  const handleAddServer = async () => {
    if (!config || !config.id) {
      toast.error('Invalid configuration');
      return;
    }

    setIsAdding(true);

    try {
      const loadingToast = toast.loading(`Adding ${serverName}...`);

      // Add the server
      const result = await window.levante.mcp.addServer(config as MCPServerConfig);

      toast.dismiss(loadingToast);

      if (result.success) {
        // If added as disabled, disable it
        if (addAsDisabled) {
          await window.levante.mcp.disableServer(config.id);
        }

        // Refresh the active servers list to show the new server
        await loadActiveServers();

        toast.success(`${serverName} added successfully`, {
          description: addAsDisabled
            ? 'Server added as disabled. Enable it in the Store page when ready.'
            : 'The server has been added to your configuration.',
          duration: 5000
        });

        logger.mcp.info('MCP server added via deep link', {
          serverId: config.id,
          trustLevel: validation.trustLevel,
          addedAsDisabled: addAsDisabled
        });

        onOpenChange(false);
      } else {
        toast.error(`Failed to add ${serverName}`, {
          description: result.error || 'An unknown error occurred',
          duration: 7000
        });
      }
    } catch (error) {
      toast.error('Error adding server', {
        description: error instanceof Error ? error.message : 'Unknown error',
        duration: 5000
      });
    } finally {
      setIsAdding(false);
    }
  };

  const canProceed = validation.structureValid && !validation.errors.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              <Link2 className="w-5 h-5 mt-0.5 text-muted-foreground" />
              <div>
                <DialogTitle>Add MCP Server from External Link</DialogTitle>
                <DialogDescription className="mt-1">
                  Review the server configuration before adding it to Levante
                </DialogDescription>
              </div>
            </div>
            <TrustBadge trustLevel={validation.trustLevel} />
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Server Info */}
          {config && <ServerInfoPanel config={config} />}

          {/* JSON Preview */}
          {config && <JSONPreview config={config} />}

          {/* Validation Results */}
          <ValidationPanel
            validation={validation}
            packageExists={packageVerification.exists}
            isVerifyingPackage={packageVerification.isVerifying}
          />

          {/* AI Security Analysis */}
          <AISecurityPanel analysis={aiAnalysis} />

          {/* Security Warnings */}
          <SecurityWarnings />

          {/* Source Information */}
          {sourceUrl && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <ExternalLink className="w-3 h-3" />
              <span>Source: {sourceUrl}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-3">
          <div className="flex items-center space-x-2 mr-auto">
            <Checkbox
              id="add-disabled"
              checked={addAsDisabled}
              onCheckedChange={(checked) => setAddAsDisabled(checked as boolean)}
            />
            <Label
              htmlFor="add-disabled"
              className="text-sm font-normal cursor-pointer"
            >
              Add as disabled (test later)
            </Label>
          </div>

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAdding}
          >
            Cancel
          </Button>

          <Button
            onClick={handleAddServer}
            disabled={!canProceed || isAdding || aiAnalysis.isAnalyzing}
          >
            {isAdding ? 'Adding...' : 'Validate & Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
