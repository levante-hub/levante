/**
 * TabChip
 *
 * Individual tab button for unified panel tab bar.
 */

import { X, FileCode, FileText, File, Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { PanelTab } from '@/stores/sidePanelStore';

interface TabChipProps {
  tab: PanelTab;
  isActive: boolean;
  onSelect: () => void;
  onClose?: () => void;
}

function TabIcon({ tab }: { tab: PanelTab }) {
  switch (tab.type) {
    case 'server':
      return (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            tab.isAlive ? 'bg-green-400' : 'bg-red-400'
          )}
        />
      );

    case 'file':
      if (['javascript', 'jsx', 'typescript', 'tsx', 'python', 'go', 'rust', 'java', 'ruby', 'php', 'c', 'cpp'].includes(tab.language)) {
        return <FileCode className="h-3 w-3 shrink-0" />;
      }
      if (tab.language === 'markdown') {
        return <FileText className="h-3 w-3 shrink-0" />;
      }
      return <File className="h-3 w-3 shrink-0" />;

    case 'pdf':
      return <FileText className="h-3 w-3 shrink-0 text-red-400" />;

    case 'doc':
      return <FileText className="h-3 w-3 shrink-0 text-blue-400" />;

    case 'widget':
      return <Puzzle className="h-3 w-3 shrink-0 text-amber-500" />;

    default:
      return <File className="h-3 w-3 shrink-0" />;
  }
}

function TabLabel({ tab }: { tab: PanelTab }) {
  switch (tab.type) {
    case 'server':
      return (
        <>
          <span>:{tab.port}</span>
          {!tab.isAlive && (
            <Badge variant="outline" className="text-[9px] py-0 px-1 h-3.5">
              stopped
            </Badge>
          )}
        </>
      );

    case 'file':
    case 'pdf':
    case 'doc':
      return <span className="max-w-[120px] truncate">{tab.fileName}</span>;

    case 'widget':
      return <span className="max-w-[120px] truncate">{tab.title}</span>;

    default:
      return null;
  }
}

export function TabChip({ tab, isActive, onSelect, onClose }: TabChipProps) {
  const title = tab.type === 'server'
    ? tab.command
    : tab.type === 'widget'
      ? tab.title
      : tab.filePath;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors shrink-0 group border border-transparent',
        isActive
          ? 'bg-background text-foreground border-[hsl(var(--panel-border))]'
          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
      )}
      title={title}
    >
      <TabIcon tab={tab} />
      <TabLabel tab={tab} />

      {onClose && (
        <span
          role="button"
          aria-label="Close tab"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-1 opacity-0 group-hover:opacity-100 hover:bg-primary-foreground/20 rounded-sm p-0.5 cursor-pointer"
        >
          <X size={10} />
        </span>
      )}
    </button>
  );
}
