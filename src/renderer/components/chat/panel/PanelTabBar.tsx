/**
 * PanelTabBar
 *
 * Unified tab bar for server/file tabs.
 */

import { Monitor } from 'lucide-react';
import { TabChip } from './TabChip';
import { PanelControls } from './PanelControls';
import type { PanelTab } from '@/stores/sidePanelStore';

interface PanelTabBarProps {
  tabs: PanelTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onClosePanel: () => void;
  activeTab: PanelTab | undefined;
  onReload?: () => void;
  onOpenExternal?: () => void;
}

export function PanelTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onClosePanel,
  activeTab,
  onReload,
  onOpenExternal,
}: PanelTabBarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 shrink-0 border-b border-[hsl(var(--panel-border))] bg-[hsl(var(--panel-muted))]">
      <Monitor size={13} className="text-muted-foreground shrink-0" />

      <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0 scrollbar-none">
        {tabs.map((tab) => (
          <TabChip
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => onSelectTab(tab.id)}
            onClose={tab.type !== 'server' ? () => onCloseTab(tab.id) : undefined}
          />
        ))}
      </div>

      <PanelControls
        tab={activeTab}
        onReload={onReload}
        onOpenExternal={onOpenExternal}
        onClose={onClosePanel}
      />
    </div>
  );
}
