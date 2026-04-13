import { ArrowRight, Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidePanelStore, type WidgetTabInput } from '@/stores/sidePanelStore';

interface WidgetPlaceholderProps {
  widget: WidgetTabInput;
  className?: string;
}

export function WidgetPlaceholder({ widget, className }: WidgetPlaceholderProps) {
  const openWidgetTab = useSidePanelStore((state) => state.openWidgetTab);
  const isPanelOpen = useSidePanelStore((state) => state.isPanelOpen);
  const activeTabId = useSidePanelStore((state) => state.activeTabId);

  const isActive = isPanelOpen && activeTabId === widget.id;

  return (
    <button
      type="button"
      onClick={() => openWidgetTab(widget)}
      className={cn(
        'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg border transition-colors text-left',
        isActive
          ? 'border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20'
          : 'border-border bg-muted/30 hover:bg-muted/50',
        className
      )}
    >
      <Puzzle className="h-4 w-4 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{widget.title}</span>
        <span className="text-xs text-muted-foreground">
          {isActive ? 'Visible en panel' : 'Ver en panel lateral'}
        </span>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </button>
  );
}
