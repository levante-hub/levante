import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Sparkles, Code } from 'lucide-react';
import { AutomaticMCPConfig } from './AutomaticMCPConfig';
import { FullJSONEditor } from './FullJSONEditor';
import { MCPServerPreview } from './mcp-server-preview';
import { useTranslation } from 'react-i18next';
import { MCPServerConfig, MCPTool } from '@/types/mcp';

interface FullJSONEditorPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ServerTestState {
  testing: boolean;
  result: { success: boolean; message: string } | null;
  tools: MCPTool[];
}

export function FullJSONEditorPanel({ isOpen, onClose }: FullJSONEditorPanelProps) {
  const { t } = useTranslation('mcp');
  const [activeTab, setActiveTab] = useState<'automatic' | 'custom'>('automatic');
  const [mcpConfig, setMcpConfig] = useState<{ mcpServers: Record<string, any> } | null>(null);
  const [serverTests, setServerTests] = useState<Record<string, ServerTestState>>({});

  // Load current MCP configuration
  useEffect(() => {
    if (isOpen) {
      loadMCPConfiguration();
    }
  }, [isOpen]);

  const loadMCPConfiguration = async () => {
    try {
      const result = await window.levante.mcp.loadConfiguration();
      if (result.success && result.data) {
        setMcpConfig(result.data);
      }
    } catch (error) {
      console.error('Failed to load MCP configuration:', error);
    }
  };

  const handleTestServer = async (serverId: string, serverConfig: any) => {
    // Start testing
    setServerTests(prev => ({
      ...prev,
      [serverId]: { testing: true, result: null, tools: [] }
    }));

    try {
      const testConfig: MCPServerConfig = {
        id: `test-${serverId}-${Date.now()}`,
        name: serverConfig.name || serverId,
        transport: serverConfig.transport || serverConfig.type,
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: serverConfig.env || {},
        baseUrl: serverConfig.baseUrl || serverConfig.url,
        headers: serverConfig.headers
      };

      const result = await window.levante.mcp.testConnection(testConfig);

      setServerTests(prev => ({
        ...prev,
        [serverId]: {
          testing: false,
          result: {
            success: result.success,
            message: result.success
              ? t('config.test.success_message')
              : result.error || t('config.test.failed_message')
          },
          tools: result.data || []
        }
      }));
    } catch (error) {
      setServerTests(prev => ({
        ...prev,
        [serverId]: {
          testing: false,
          result: { success: false, message: (error as Error).message || t('config.test.error_message') },
          tools: []
        }
      }));
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[900px] sm:max-w-[90vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('config.full_editor.panel_title')}</SheetTitle>
        </SheetHeader>

        <div className="py-6">
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

            {/* Right Column: Active MCP Servers Preview */}
            <div className="space-y-4">
              {mcpConfig && mcpConfig.mcpServers && Object.keys(mcpConfig.mcpServers).length > 0 ? (
                <Card className="border-none">
                  <CardHeader>
                    <CardTitle className="text-lg">{t('config.preview.active_servers')}</CardTitle>
                    <CardDescription>
                      {t('config.preview.startup_note')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(mcpConfig.mcpServers).map(([id, config]: [string, any]) => {
                        const testState = serverTests[id] || {
                          testing: false,
                          result: null,
                          tools: []
                        };

                        return (
                          <MCPServerPreview
                            key={id}
                            serverName={config.name || id}
                            isValidJSON={true}
                            testResult={testState.result}
                            tools={testState.tools}
                            isTestingConnection={testState.testing}
                            isLoadingTools={testState.testing}
                            onTestConnection={() => handleTestServer(id, config)}
                          />
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-none bg-muted/30">
                  <CardContent className="pt-6">
                    <div className="text-center text-muted-foreground py-12">
                      <p className="text-sm">{t('config.preview.no_servers')}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
