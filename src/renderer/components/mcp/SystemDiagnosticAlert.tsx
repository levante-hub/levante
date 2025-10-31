import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useMCPStore } from '@/stores/mcpStore';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

export function SystemDiagnosticAlert() {
  const { systemDiagnosis, diagnoseSystem } = useMCPStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-diagnose on mount if not checked yet
  useEffect(() => {
    if (systemDiagnosis.lastChecked === null) {
      diagnoseSystem();
    }
  }, [systemDiagnosis.lastChecked, diagnoseSystem]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await diagnoseSystem();
    setIsRefreshing(false);
  };

  // Don't show anything if everything is fine
  if (systemDiagnosis.success && systemDiagnosis.issues.length === 0) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-4 dark:border-red-900/50">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>System Configuration Issues Detected</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-6 px-2 hover:bg-red-100 dark:hover:bg-red-950"
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="ml-1 text-xs">Re-check</span>
        </Button>
      </AlertTitle>
      <AlertDescription className="dark:text-red-200">
        <div className="mt-2 space-y-3">
          {systemDiagnosis.issues.length > 0 && (
            <div>
              <p className="font-medium mb-1 dark:text-red-100">Issues:</p>
              <ul className="list-disc list-inside space-y-1 text-xs dark:text-red-200/90">
                {systemDiagnosis.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {systemDiagnosis.recommendations.length > 0 && (
            <div>
              <p className="font-medium mb-1 dark:text-red-100">Recommendations:</p>
              <ul className="list-disc list-inside space-y-1 text-xs dark:text-red-200/90">
                {systemDiagnosis.recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs opacity-75 mt-2 dark:text-red-200/80">
            MCP servers require Node.js (for npx-based servers) or Python (for uvx-based servers).
            Please install the missing dependencies to use MCP servers.
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function SystemDiagnosticSuccess() {
  const { systemDiagnosis } = useMCPStore();

  if (!systemDiagnosis.success || systemDiagnosis.issues.length > 0) {
    return null;
  }

  return (
    <Alert className="mb-4 border-green-500/50 text-green-600 dark:text-green-400">
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle>System Ready for MCP Servers</AlertTitle>
      <AlertDescription>
        <p className="text-xs">
          All required dependencies (Node.js, npm, npx, Python, pip3) are installed and available.
        </p>
      </AlertDescription>
    </Alert>
  );
}
