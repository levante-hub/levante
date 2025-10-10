import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useMCPStore } from '@/stores/mcpStore';
import { MCPServerConfig } from '@/types/mcp';

interface JSONEditorPanelProps {
  serverId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function JSONEditorPanel({ serverId, isOpen, onClose }: JSONEditorPanelProps) {
  const { getServerById, getRegistryEntryById, testConnection, updateServer, addServer } = useMCPStore();

  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const server = serverId ? getServerById(serverId) : null;
  const registryEntry = serverId ? getRegistryEntryById(serverId) : null;
  const isNewServer = !server;

  useEffect(() => {
    if (isOpen && serverId) {
      // Load initial JSON
      if (server) {
        // Existing server - load current config
        const config = {
          type: server.transport,
          command: server.command,
          args: server.args || [],
          env: server.env || {},
          ...(server.baseUrl && { baseUrl: server.baseUrl }),
          ...(server.headers && { headers: server.headers })
        };
        setJsonText(JSON.stringify(config, null, 2));
      } else if (registryEntry?.configuration?.template) {
        // New server - load template
        setJsonText(JSON.stringify(registryEntry.configuration.template, null, 2));
      } else {
        // Fallback empty template
        setJsonText(JSON.stringify({
          type: 'stdio',
          command: '',
          args: [],
          env: {}
        }, null, 2));
      }
      setJsonError(null);
      setTestResult(null);
    }
  }, [isOpen, serverId, server, registryEntry]);

  const validateJSON = (text: string): { valid: boolean; data?: any; error?: string } => {
    try {
      const parsed = JSON.parse(text);

      // Validate required fields
      if (!parsed.type) {
        return { valid: false, error: 'Missing required field: type' };
      }

      if (parsed.type === 'stdio' && !parsed.command) {
        return { valid: false, error: 'Missing required field: command (for stdio transport)' };
      }

      if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.baseUrl) {
        return { valid: false, error: 'Missing required field: baseUrl (for http/sse transport)' };
      }

      return { valid: true, data: parsed };
    } catch (error) {
      return { valid: false, error: 'Invalid JSON syntax' };
    }
  };

  const handleJSONChange = (text: string) => {
    setJsonText(text);
    const validation = validateJSON(text);
    setJsonError(validation.error || null);
  };

  const handleTestConnection = async () => {
    const validation = validateJSON(jsonText);
    if (!validation.valid || !validation.data) {
      setJsonError(validation.error || 'Invalid JSON');
      return;
    }

    setIsTestingConnection(true);
    setTestResult(null);

    try {
      const testConfig: MCPServerConfig = {
        id: `test-${Date.now()}`,
        name: registryEntry?.name || 'Test Server',
        transport: validation.data.type,
        command: validation.data.command,
        args: validation.data.args || [],
        env: validation.data.env || {},
        baseUrl: validation.data.baseUrl,
        headers: validation.data.headers
      };

      const success = await testConnection(testConfig);

      setTestResult({
        success,
        message: success
          ? 'Connection test successful! Server is responding correctly.'
          : 'Connection test failed. Please check your configuration.'
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Connection test failed with an unexpected error.'
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = async () => {
    const validation = validateJSON(jsonText);
    if (!validation.valid || !validation.data || !serverId) {
      setJsonError(validation.error || 'Invalid JSON');
      return;
    }

    setIsSaving(true);

    try {
      const serverConfig: MCPServerConfig = {
        id: serverId,
        name: registryEntry?.name || serverId,
        transport: validation.data.type,
        command: validation.data.command,
        args: validation.data.args || [],
        env: validation.data.env || {},
        baseUrl: validation.data.baseUrl,
        headers: validation.data.headers
      };

      if (isNewServer) {
        await addServer(serverConfig);
      } else {
        await updateServer(serverId, {
          name: serverConfig.name,
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
          transport: serverConfig.transport,
          baseUrl: serverConfig.baseUrl,
          headers: serverConfig.headers
        });
      }

      onClose();
    } catch (error) {
      setJsonError('Failed to save server configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isNewServer ? 'Configure' : 'Edit'} {registryEntry?.name || serverId}
          </SheetTitle>
        </SheetHeader>

        <div className="py-6 space-y-4">
          {/* JSON Editor */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Server Configuration (JSON)
            </label>
            <Textarea
              value={jsonText}
              onChange={(e) => handleJSONChange(e.target.value)}
              className="font-mono text-sm min-h-[400px]"
              placeholder="Enter JSON configuration..."
            />
          </div>

          {/* Validation Error */}
          {jsonError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{jsonError}</AlertDescription>
            </Alert>
          )}

          {/* Test Result */}
          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{testResult.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <SheetFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={!!jsonError || isTestingConnection || isSaving}
          >
            {isTestingConnection ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!!jsonError || isTestingConnection || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
