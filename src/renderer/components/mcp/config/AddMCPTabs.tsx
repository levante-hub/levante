import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Code, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AutomaticMCPConfig } from './AutomaticMCPConfig';
import { CustomMCPConfig } from './CustomMCPConfig';
import { SystemDiagnosticAlert } from '../SystemDiagnosticAlert';
import { useTranslation } from 'react-i18next';

interface AddMCPTabsProps {
  serverId: string | null;
  onClose: () => void;
}

interface ConfigPreview {
  id: string;
  name?: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export function AddMCPTabs({ serverId, onClose }: AddMCPTabsProps) {
  const { t } = useTranslation('mcp');
  const [activeTab, setActiveTab] = useState<'automatic' | 'custom'>('automatic');
  const [previewConfig, setPreviewConfig] = useState<ConfigPreview | null>(null);

  return (
    <div className="space-y-4">
      {/* System Diagnostic Alert */}
      <SystemDiagnosticAlert />

      <div className="grid grid-cols-2 gap-6">
        {/* Left Column: Tabs */}
        <div className="space-y-4">
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
                setActiveTab('custom');
              }}
              onConfigChange={setPreviewConfig}
            />
          </TabsContent>

          <TabsContent value="custom" className="mt-6">
            <CustomMCPConfig
              serverId={serverId}
              onClose={onClose}
              onConfigChange={setPreviewConfig}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Right Column: Preview */}
      <div className="space-y-4">
        <label className="text-sm font-medium block">
          {t('config.preview_label')}
        </label>

        {previewConfig ? (
          <Card className="border-none bg-muted/30">
            <CardContent className="pt-6 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t('config.automatic.preview_field_name')}
                </p>
                <p className="text-sm font-mono">{previewConfig.name || previewConfig.id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t('config.automatic.preview_field_type')}
                </p>
                <p className="text-sm font-mono">{previewConfig.transport}</p>
              </div>
              {previewConfig.command && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t('config.automatic.preview_field_command')}
                  </p>
                  <p className="text-sm font-mono">{previewConfig.command}</p>
                </div>
              )}
              {previewConfig.args && previewConfig.args.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t('config.automatic.preview_field_args')}
                  </p>
                  <p className="text-sm font-mono">{previewConfig.args.join(' ')}</p>
                </div>
              )}
              {previewConfig.baseUrl && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t('config.automatic.preview_field_baseurl')}
                  </p>
                  <p className="text-sm font-mono break-all">{previewConfig.baseUrl}</p>
                </div>
              )}
              {previewConfig.env && Object.keys(previewConfig.env).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t('config.automatic.preview_field_env')}
                  </p>
                  <div className="text-sm font-mono space-y-1">
                    {Object.entries(previewConfig.env).map(([key, value]) => (
                      <p key={key} className="text-xs">
                        {key}={value}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-none bg-muted/30">
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground py-12">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('config.automatic.preview_empty')}</p>
              </div>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
