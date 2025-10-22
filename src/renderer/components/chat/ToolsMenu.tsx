import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { GlobeIcon, Wrench, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface ToolsMenuProps {
  webSearch: boolean;
  enableMCP: boolean;
  onWebSearchChange: (enabled: boolean) => void;
  onMCPChange: (enabled: boolean) => void;
  className?: string;
}

export function ToolsMenu({
  webSearch,
  enableMCP,
  onWebSearchChange,
  onMCPChange,
  className
}: ToolsMenuProps) {
  const { t } = useTranslation('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);

  // Filter tools based on search
  const tools = [
    {
      id: 'web-search',
      label: t('tools_menu.web_search.label'),
      icon: GlobeIcon,
      enabled: webSearch,
      onChange: onWebSearchChange,
      keywords: t('tools_menu.web_search.keywords', { returnObjects: true }) as string[]
    },
    {
      id: 'mcp-tools',
      label: t('tools_menu.mcp_tools.label'),
      icon: Wrench,
      enabled: enableMCP,
      onChange: onMCPChange,
      keywords: t('tools_menu.mcp_tools.keywords', { returnObjects: true }) as string[]
    }
  ];

  const filteredTools = searchQuery.trim()
    ? tools.filter(tool =>
      tool.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.keywords.some(keyword => keyword.includes(searchQuery.toLowerCase()))
    )
    : tools;

  const activeCount = tools.filter(t => t.enabled).length;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'gap-1.5 rounded-lg text-muted-foreground',
            activeCount > 0 && 'text-foreground',
            className
          )}
          type="button"
        >
          <Wrench size={16} />
          <span>{t('tools_menu.button_label')}</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
              {activeCount}
            </span>
          )}
          <ChevronDown size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="font-semibold">
          {t('tools_menu.title')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Search input */}
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={14} />
            <Input
              placeholder={t('tools_menu.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Tools list */}
        <div className="p-1">
          {filteredTools.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('tools_menu.no_results')}
            </div>
          ) : (
            filteredTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <div
                  key={tool.id}
                  className="flex items-center justify-between rounded-sm px-2 py-2 hover:bg-accent cursor-pointer"
                  onClick={() => tool.onChange(!tool.enabled)}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-muted-foreground" />
                    <span className="text-sm">{tool.label}</span>
                  </div>
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={tool.onChange}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
