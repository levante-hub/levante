import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Code } from 'lucide-react';
import { AutomaticMCPConfig } from './AutomaticMCPConfig';
import { CustomMCPConfig } from './CustomMCPConfig';
import { useTranslation } from 'react-i18next';

interface AddMCPTabsProps {
  serverId: string | null;
  onClose: () => void;
}

export function AddMCPTabs({ serverId, onClose }: AddMCPTabsProps) {
  const { t } = useTranslation('mcp');
  const [activeTab, setActiveTab] = useState<'automatic' | 'custom'>('automatic');

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'automatic' | 'custom')}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="automatic" className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {t('config.add_tabs.automatic')}
        </TabsTrigger>
        <TabsTrigger value="custom" className="flex items-center gap-2">
          <Code className="h-4 w-4" />
          {t('config.add_tabs.custom')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="automatic" className="mt-6">
        <AutomaticMCPConfig
          serverId={serverId}
          onClose={onClose}
          onSwitchToCustom={(partialConfig) => {
            // TODO: Pass partial config to Custom tab
            setActiveTab('custom');
          }}
        />
      </TabsContent>

      <TabsContent value="custom" className="mt-6">
        <CustomMCPConfig serverId={serverId} onClose={onClose} />
      </TabsContent>
    </Tabs>
  );
}
