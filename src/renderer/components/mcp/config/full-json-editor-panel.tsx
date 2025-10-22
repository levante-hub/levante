import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Code } from 'lucide-react';
import { AutomaticMCPConfig } from './AutomaticMCPConfig';
import { FullJSONEditor } from './FullJSONEditor';
import { useTranslation } from 'react-i18next';

interface FullJSONEditorPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FullJSONEditorPanel({ isOpen, onClose }: FullJSONEditorPanelProps) {
  const { t } = useTranslation('mcp');
  const [activeTab, setActiveTab] = useState<'automatic' | 'custom'>('automatic');

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[900px] sm:max-w-[90vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('config.full_editor.panel_title')}</SheetTitle>
        </SheetHeader>

        <div className="py-6">
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
                serverId={null}
                onClose={onClose}
                onSwitchToCustom={() => setActiveTab('custom')}
              />
            </TabsContent>

            <TabsContent value="custom" className="mt-6">
              <FullJSONEditor onClose={onClose} />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
