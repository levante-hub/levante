import { useMCPStore } from '@/stores/mcpStore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const TOOLS_WARNING_THRESHOLD = 40;
const TOOLS_LIMIT = 80;

export function ToolsWarning() {
  const { t } = useTranslation(['settings', 'common']);
  const getEnabledToolsTotal = useMCPStore(state => state.getEnabledToolsTotal);

  const totalEnabled = getEnabledToolsTotal();

  if (totalEnabled < TOOLS_WARNING_THRESHOLD) {
    return null;
  }

  const isOverLimit = totalEnabled >= TOOLS_LIMIT;

  return (
    <Alert variant={isOverLimit ? "destructive" : "default"} className={!isOverLimit ? "border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20" : ""}>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        {isOverLimit ? (
          t('settings:mcp_tools.over_limit',
            `You have {{count}} tools enabled. This exceeds the recommended limit of ${TOOLS_LIMIT} and may significantly impact performance.`,
            { count: totalEnabled }
          )
        ) : (
          t('settings:mcp_tools.warning',
            `You have {{count}} tools enabled. Consider disabling unused tools for better performance (recommended: <${TOOLS_WARNING_THRESHOLD}).`,
            { count: totalEnabled }
          )
        )}
      </AlertDescription>
    </Alert>
  );
}
