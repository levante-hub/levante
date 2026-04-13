/**
 * PanelContextBar
 *
 * Secondary context line under tabs:
 * - Server: URL + status
 * - File: relative path + copy button
 */

import { Server, FileCode, FileText, Puzzle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PanelTab } from '@/stores/sidePanelStore';
import { useFileBrowserStore } from '@/stores/fileBrowserStore';
import { getWidgetProtocolLabel } from '@/lib/widgetTabs';

interface PanelContextBarProps {
  tab: PanelTab | undefined;
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/');
}

function toRelativePath(filePath: string, workingDirectory: string | null): string {
  if (!workingDirectory) return filePath;

  const normalizedFile = normalizePath(filePath);
  const normalizedRoot = normalizePath(workingDirectory).replace(/\/+$/, '');

  if (normalizedFile === normalizedRoot) return '';
  if (normalizedFile.startsWith(`${normalizedRoot}/`)) {
    return normalizedFile.slice(normalizedRoot.length + 1);
  }

  return filePath;
}

export function PanelContextBar({ tab }: PanelContextBarProps) {
  const workingDirectory = useFileBrowserStore((state) => state.workingDirectory);
  const contextBarClassName =
    'flex items-center gap-2 px-2 py-1 shrink-0 border-b border-[hsl(var(--panel-border))] bg-[hsl(var(--panel-background))]';

  if (!tab) return null;

  switch (tab.type) {
    case 'server':
      return (
        <div className={contextBarClassName}>
          <Server size={11} className="text-muted-foreground shrink-0" />
          <span className="text-xs font-mono text-muted-foreground truncate">{tab.url}</span>
          {!tab.isAlive && (
            <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4 shrink-0">
              offline
            </Badge>
          )}
        </div>
      );

    case 'file': {
      const relativePath = toRelativePath(tab.filePath, workingDirectory);

      return (
        <div className={contextBarClassName}>
          <FileCode size={11} className="text-muted-foreground shrink-0" />
          <span className="text-xs font-mono text-muted-foreground truncate flex-1">{relativePath}</span>

          {tab.isTruncated && (
            <Badge variant="outline" className="text-[9px] py-0 px-1 h-3.5 shrink-0">
              truncated
            </Badge>
          )}

        </div>
      );
    }

    case 'pdf':
      return (
        <div className={contextBarClassName}>
          <FileText size={11} className="text-muted-foreground shrink-0" />
          <span className="text-xs font-mono text-muted-foreground truncate flex-1">{tab.fileName}</span>
          <span className="text-xs text-muted-foreground">Page {tab.currentPage} / {tab.totalPages}</span>
        </div>
      );

    case 'doc':
      return (
        <div className={contextBarClassName}>
          <FileText size={11} className="text-muted-foreground shrink-0" />
          <span className="text-xs font-mono text-muted-foreground truncate flex-1">{tab.fileName}</span>
        </div>
      );

    case 'widget':
      return (
        <div className="flex items-center gap-2 px-2 py-1 border-b bg-muted/20 shrink-0">
          <Puzzle size={11} className="text-amber-500 shrink-0" />
          <span className="text-xs font-mono text-muted-foreground truncate flex-1">
            {tab.title}
          </span>
          <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 shrink-0">
            {getWidgetProtocolLabel(tab.resource)}
          </Badge>
        </div>
      );

    default:
      return null;
  }
}
