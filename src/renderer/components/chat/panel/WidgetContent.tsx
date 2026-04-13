import type { UIMessage } from '@ai-sdk/react';
import { UIResourceMessage } from '../UIResourceMessage';
import type { WidgetTab } from '@/stores/sidePanelStore';
import { useSidePanelStore } from '@/stores/sidePanelStore';

interface WidgetContentProps {
  tab: WidgetTab;
  onPrompt?: (prompt: string) => void;
  onSendMessage?: (text: string) => void;
  chatMessages?: UIMessage[];
}

export function WidgetContent({
  tab,
  onPrompt,
  onSendMessage,
  chatMessages,
}: WidgetContentProps) {
  const closeWidgetTab = useSidePanelStore((state) => state.closeWidgetTab);

  return (
    <UIResourceMessage
      key={`${tab.id}:${tab.reloadNonce}`}
      resource={tab.resource}
      serverId={tab.serverId}
      className="h-full w-full"
      onPrompt={onPrompt}
      onSendMessage={onSendMessage}
      chatMessages={chatMessages}
      onClose={() => closeWidgetTab(tab.id)}
      panelMode
    />
  );
}
