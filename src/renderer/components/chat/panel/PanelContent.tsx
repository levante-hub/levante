/**
 * PanelContent
 *
 * Content router by active tab type.
 */

import type { UIMessage } from '@ai-sdk/react';
import { Server } from 'lucide-react';
import type { PanelTab, ServerTab } from '@/stores/sidePanelStore';
import { FileContentRenderer } from '@/components/file-browser/FileContentRenderer';
import { PdfViewer } from '@/components/file-browser/PdfViewer';
import { HtmlViewer } from '@/components/file-browser/HtmlViewer';
import { WidgetContent } from './WidgetContent';

interface PanelContentProps {
  tab: PanelTab | undefined;
  isDragging: boolean;
  iframeKey?: number;
  onPrompt?: (prompt: string) => void;
  onSendMessage?: (text: string) => void;
  chatMessages?: UIMessage[];
}

function ServerContent({ server, iframeKey }: { server: ServerTab; iframeKey: number }) {
  if (!server.isAlive) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Server size={32} className="opacity-30" />
        <div className="text-center">
          <p className="text-sm font-medium">Server stopped</p>
          <p className="text-xs mt-1 opacity-70">The process running on :{server.port} has ended</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      key={iframeKey}
      src={server.url}
      title={`Preview :${server.port}`}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
      allow="fullscreen; clipboard-read; clipboard-write"
      className="absolute inset-0 w-full h-full border-0"
    />
  );
}

export function PanelContent({ tab, isDragging, iframeKey = 0, onPrompt, onSendMessage, chatMessages }: PanelContentProps) {
  return (
    <div className="flex-1 min-h-0 min-w-0 relative overflow-hidden">
      {isDragging && <div className="absolute inset-0 z-50 cursor-col-resize" />}

      {!tab ? (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          No tab selected
        </div>
      ) : tab.type === 'server' ? (
        <ServerContent server={tab} iframeKey={iframeKey} />
      ) : tab.type === 'file' ? (
        <FileContentRenderer tab={tab} />
      ) : tab.type === 'pdf' ? (
        <PdfViewer tab={tab} />
      ) : tab.type === 'doc' ? (
        <HtmlViewer tab={tab} />
      ) : tab.type === 'widget' ? (
        <WidgetContent
          tab={tab}
          onPrompt={onPrompt}
          onSendMessage={onSendMessage}
          chatMessages={chatMessages}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Preview not available for this file type
        </div>
      )}
    </div>
  );
}
