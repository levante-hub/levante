import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Wrench, Settings, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useMCPStore } from '@/stores/mcpStore';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ToolsWarning } from '@/components/settings/ToolsWarning';
import type { Tool } from '@/types/mcp';

interface ToolsMenuProps {
  enableMCP: boolean;
  onMCPChange: (enabled: boolean) => void;
  className?: string;
}

export function ToolsMenu({
  enableMCP,
  onMCPChange,
  className
}: ToolsMenuProps) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'enabled' | 'disabled'>('enabled');

  // MCP Store
  const {
    activeServers,
    connectionStatus,
    toolsCache,
    loadingTools,
    loadToolsCache,
    loadDisabledTools,
    fetchServerTools,
    toggleTool,
    toggleAllTools,
    isToolEnabled,
    getEnabledToolsCount,
    getEnabledToolsTotal,
    enableServer,
    disableServer,
  } = useMCPStore();

  // Load tools cache and disabled tools on mount
  useEffect(() => {
    loadToolsCache();
    loadDisabledTools();
  }, [loadToolsCache, loadDisabledTools]);

  // Separate servers into enabled and disabled
  const enabledServers = activeServers.filter(server => server.enabled !== false);
  const disabledServers = activeServers.filter(server => server.enabled === false);

  // Total enabled tools count
  const totalEnabledTools = getEnabledToolsTotal();

  // Toggle server expansion
  const toggleServerExpansion = (serverId: string) => {
    setExpandedServers(prev => ({
      ...prev,
      [serverId]: !prev[serverId]
    }));
    // Fetch tools if not already cached
    if (!toolsCache[serverId] && !loadingTools[serverId]) {
      fetchServerTools(serverId);
    }
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* 1. Settings Dropdown (Gear icon) - Only MCP toggle */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg text-muted-foreground h-8 w-8"
            type="button"
          >
            <Settings size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <div
            className="flex items-center justify-between rounded-sm px-3 py-2 hover:bg-accent cursor-pointer"
            onClick={() => onMCPChange(!enableMCP)}
          >
            <div className="flex items-center gap-2">
              <Wrench size={16} className="text-muted-foreground" />
              <span className="text-sm">{t('tools_menu.mcp_tools.label')}</span>
              {enableMCP && totalEnabledTools > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {totalEnabledTools} active
                </Badge>
              )}
            </div>
            <Switch
              checked={enableMCP}
              onCheckedChange={onMCPChange}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 2. Tools Dropdown (Wrench icon) - Only when MCP is enabled */}
      {enableMCP && (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <div className="flex items-center justify-center h-8 w-8 rounded-lg ring-1 ring-primary/50 bg-primary/10 cursor-pointer">
              <Wrench size={16} className="text-foreground" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-96 max-h-[70vh] overflow-hidden flex flex-col">
            {/* Warning */}
            <div className="px-2">
              <ToolsWarning />
            </div>

            {/* Server Tools List with Tabs */}
            {activeServers.length > 0 ? (
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'enabled' | 'disabled')} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="mx-2 grid w-auto grid-cols-2">
                  <TabsTrigger value="enabled" className="text-xs">
                    {t('tools_menu.enabled', 'Enabled')} ({enabledServers.length})
                  </TabsTrigger>
                  <TabsTrigger value="disabled" className="text-xs">
                    {t('tools_menu.disabled', 'Disabled')} ({disabledServers.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="enabled" className="flex-1 overflow-y-auto p-2 space-y-2 mt-2">
                  {enabledServers.length > 0 ? (
                    <>
                      <div className="text-xs text-muted-foreground px-2 mb-2">
                        {t('tools_menu.tool_selection', 'Select tools to use')}
                      </div>
                      {enabledServers.map((server) => (
                        <ServerToolsSection
                          key={server.id}
                          serverId={server.id}
                          serverName={server.name || server.id}
                          serverEnabled={server.enabled !== false}
                          isConnected={connectionStatus[server.id] === 'connected'}
                          onServerToggle={(enabled) => enabled ? enableServer(server.id) : disableServer(server.id)}
                          isExpanded={expandedServers[server.id] || false}
                          onToggleExpand={() => toggleServerExpansion(server.id)}
                          tools={toolsCache[server.id]?.tools || []}
                          isLoading={loadingTools[server.id] || false}
                          enabledCount={getEnabledToolsCount(server.id)}
                          isToolEnabled={(toolName) => isToolEnabled(server.id, toolName)}
                          onToggleTool={(toolName, enabled) => toggleTool(server.id, toolName, enabled)}
                          onToggleAll={(enabled) => toggleAllTools(server.id, enabled)}
                          onRefresh={() => fetchServerTools(server.id)}
                        />
                      ))}
                    </>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      {t('tools_menu.no_enabled_servers', 'No enabled servers')}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="disabled" className="flex-1 overflow-y-auto p-2 space-y-2 mt-2">
                  {disabledServers.length > 0 ? (
                    <>
                      <div className="text-xs text-muted-foreground px-2 mb-2">
                        {t('tools_menu.disabled_servers_info', 'Toggle to enable')}
                      </div>
                      {disabledServers.map((server) => (
                        <ServerToolsSection
                          key={server.id}
                          serverId={server.id}
                          serverName={server.name || server.id}
                          serverEnabled={server.enabled !== false}
                          isConnected={connectionStatus[server.id] === 'connected'}
                          onServerToggle={(enabled) => enabled ? enableServer(server.id) : disableServer(server.id)}
                          isExpanded={expandedServers[server.id] || false}
                          onToggleExpand={() => toggleServerExpansion(server.id)}
                          tools={toolsCache[server.id]?.tools || []}
                          isLoading={loadingTools[server.id] || false}
                          enabledCount={getEnabledToolsCount(server.id)}
                          isToolEnabled={(toolName) => isToolEnabled(server.id, toolName)}
                          onToggleTool={(toolName, enabled) => toggleTool(server.id, toolName, enabled)}
                          onToggleAll={(enabled) => toggleAllTools(server.id, enabled)}
                          onRefresh={() => fetchServerTools(server.id)}
                        />
                      ))}
                    </>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      {t('tools_menu.no_disabled_servers', 'No disabled servers')}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {t('tools_menu.no_servers', 'No MCP servers connected')}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// Server Tools Section Component
interface ServerToolsSectionProps {
  serverId: string;
  serverName: string;
  serverEnabled: boolean;
  isConnected: boolean;
  onServerToggle: (enabled: boolean) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  tools: Tool[];
  isLoading: boolean;
  enabledCount: number;
  isToolEnabled: (toolName: string) => boolean;
  onToggleTool: (toolName: string, enabled: boolean) => void;
  onToggleAll: (enabled: boolean) => void;
  onRefresh: () => void;
}

function ServerToolsSection({
  serverName,
  serverEnabled,
  isConnected,
  onServerToggle,
  isExpanded,
  onToggleExpand,
  tools,
  isLoading,
  enabledCount,
  isToolEnabled,
  onToggleTool,
  onToggleAll,
  onRefresh,
}: ServerToolsSectionProps) {
  const { t } = useTranslation('chat');

  const allEnabled = tools.length > 0 && enabledCount === tools.length;
  const someEnabled = enabledCount > 0 && enabledCount < tools.length;

  return (
    <Collapsible open={isExpanded && serverEnabled} onOpenChange={onToggleExpand}>
      <div className={cn("border rounded-md", !serverEnabled && "opacity-60")}>
        <div className="flex items-center justify-between p-2">
          {/* Left side - clickable to expand */}
          <CollapsibleTrigger asChild>
            <div className={cn(
              "flex items-center gap-2 flex-1 cursor-pointer hover:bg-accent rounded-md p-1 -m-1",
              !serverEnabled && "cursor-default hover:bg-transparent"
            )}>
              {serverEnabled ? (
                isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={cn("text-sm font-medium", !serverEnabled && "text-muted-foreground")}>
                {serverName}
              </span>
              {serverEnabled && isConnected && (
                <Badge variant="secondary" className="text-xs">
                  {enabledCount}/{tools.length}
                </Badge>
              )}
              {!serverEnabled && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {t('tools_menu.disabled', 'disabled')}
                </Badge>
              )}
            </div>
          </CollapsibleTrigger>

          {/* Right side - controls */}
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {serverEnabled && isConnected && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
            <Switch
              checked={serverEnabled}
              onCheckedChange={onServerToggle}
              className="scale-75"
            />
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t p-2 space-y-1">
            {/* Toggle all */}
            <div className="flex items-center gap-2 p-1 border-b pb-2 mb-1">
              <Checkbox
                checked={allEnabled}
                data-indeterminate={someEnabled}
                onCheckedChange={() => onToggleAll(!allEnabled)}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {t('tools_menu.select_all', 'Select all')}
              </span>
            </div>

            {/* Tool list */}
            {isLoading ? (
              <div className="text-xs text-muted-foreground py-2 text-center">
                {t('tools_menu.loading_tools', 'Loading tools...')}
              </div>
            ) : tools.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2 text-center">
                {t('tools_menu.no_tools', 'No tools available')}
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {tools.map((tool) => (
                  <label
                    key={tool.name}
                    className="flex items-start gap-2 p-1.5 hover:bg-accent rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={isToolEnabled(tool.name)}
                      onCheckedChange={(checked) => onToggleTool(tool.name, checked === true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{tool.name}</div>
                      {tool.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {tool.description}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
