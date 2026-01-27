import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMCPStore } from '@/stores/mcpStore';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type { Tool } from '@/types/mcp';

interface ToolSelectorProps {
  serverId: string;
  serverName: string;
}

export function ToolSelector({ serverId, serverName }: ToolSelectorProps) {
  const { t } = useTranslation(['settings', 'common']);
  const [isOpen, setIsOpen] = useState(false);

  const {
    toolsCache,
    loadingTools,
    fetchServerTools,
    toggleTool,
    toggleAllTools,
    isToolEnabled,
    getEnabledToolsCount,
  } = useMCPStore();

  const tools = toolsCache[serverId]?.tools || [];
  const enabledCount = getEnabledToolsCount(serverId);
  const isLoading = loadingTools[serverId] || false;

  // Load tools when expanded
  useEffect(() => {
    if (isOpen && tools.length === 0) {
      fetchServerTools(serverId);
    }
  }, [isOpen, serverId, tools.length, fetchServerTools]);

  const allEnabled = tools.length > 0 && enabledCount === tools.length;
  const someEnabled = enabledCount > 0 && enabledCount < tools.length;

  const handleToggleAll = () => {
    toggleAllTools(serverId, !allEnabled);
  };

  const handleRefresh = async () => {
    await fetchServerTools(serverId);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg p-3">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="font-medium">{serverName}</span>
              <Badge variant="secondary">
                {enabledCount}/{tools.length} tools
              </Badge>
            </div>

            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t">
            {/* Toggle all */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={allEnabled}
                  data-indeterminate={someEnabled}
                  onCheckedChange={handleToggleAll}
                />
                <span className="text-sm font-medium">
                  {t('settings:mcp_tools.select_all', 'Select all')}
                </span>
              </label>
            </div>

            {/* Tool list */}
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-2">
                {t('settings:mcp_tools.loading', 'Loading tools...')}
              </div>
            ) : tools.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                {t('settings:mcp_tools.no_tools', 'No tools available')}
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {tools.map((tool: Tool) => (
                  <ToolItem
                    key={tool.name}
                    tool={tool}
                    enabled={isToolEnabled(serverId, tool.name)}
                    onToggle={(enabled) => toggleTool(serverId, tool.name, enabled)}
                  />
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface ToolItemProps {
  tool: Tool;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

function ToolItem({ tool, enabled, onToggle }: ToolItemProps) {
  return (
    <label className="flex items-start gap-2 cursor-pointer p-2 hover:bg-accent rounded">
      <Checkbox
        checked={enabled}
        onCheckedChange={(checked) => onToggle(checked === true)}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{tool.name}</div>
        {tool.description && (
          <div className="text-xs text-muted-foreground line-clamp-2">
            {tool.description}
          </div>
        )}
      </div>
    </label>
  );
}
