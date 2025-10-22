import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AddMCPTabs } from './AddMCPTabs';
import { useMCPStore } from '@/stores/mcpStore';
import { useTranslation } from 'react-i18next';

interface JSONEditorPanelProps {
  serverId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function JSONEditorPanel({ serverId, isOpen, onClose }: JSONEditorPanelProps) {
  const { t } = useTranslation('mcp');
  const { getServerById, getRegistryEntryById } = useMCPStore();

  const isCustomNewServer = serverId === 'new-custom-server';
  const server = serverId && !isCustomNewServer ? getServerById(serverId) : null;
  const registryEntry = serverId && !isCustomNewServer ? getRegistryEntryById(serverId) : null;
  const isNewServer = !server;

  const serverName = isCustomNewServer
    ? t('config.new_server_name')
    : (registryEntry?.name || serverId || 'MCP Server');

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[900px] sm:max-w-[90vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isNewServer ? t('config.configure') : t('config.edit')} {serverName}
          </SheetTitle>
        </SheetHeader>

        <div className="py-6">
          <AddMCPTabs serverId={serverId} onClose={onClose} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
