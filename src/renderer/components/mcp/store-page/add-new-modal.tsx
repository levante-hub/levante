import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useMCPStore } from '@/stores/mcpStore';
import { MCPServerConfig } from '@/types/mcp';

interface AddNewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddNewModal({ isOpen, onClose }: AddNewModalProps) {
  const { testConnection, addServer } = useMCPStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  
  const [config, setConfig] = useState<Partial<MCPServerConfig>>({
    transport: 'stdio',
    name: '',
    command: '',
    args: [],
    env: {}
  });

  const handleClose = () => {
    // Reset form
    setConfig({
      transport: 'stdio',
      name: '',
      command: '',
      args: [],
      env: {}
    });
    setError(null);
    setTestSuccess(false);
    setIsLoading(false);
    setIsTestingConnection(false);
    onClose();
  };

  const handleTestConnection = async () => {
    if (!config.name) {
      setError('Name is required');
      return;
    }

    if (config.transport === 'stdio' && !config.command) {
      setError('Command is required for stdio transport');
      return;
    }

    if ((config.transport === 'http' || config.transport === 'sse') && !config.baseUrl) {
      setError('Server URL is required for HTTP/SSE transport');
      return;
    }

    setIsTestingConnection(true);
    setError(null);
    setTestSuccess(false);

    try {
      const testConfig: MCPServerConfig = {
        id: `test-${Date.now()}`,
        name: config.name,
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        baseUrl: config.baseUrl,
        headers: config.headers,
        transport: config.transport || 'stdio'
      };

      const success = await testConnection(testConfig);
      
      if (success) {
        setError(null);
        setTestSuccess(true);
      } else {
        setTestSuccess(false);
        setError('Connection test failed. Please check your configuration.');
      }
    } catch (err) {
      setTestSuccess(false);
      setError('Connection test failed with an error.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = async () => {
    if (!config.name) {
      setError('Name is required');
      return;
    }

    if (config.transport === 'stdio' && !config.command) {
      setError('Command is required for stdio transport');
      return;
    }

    if ((config.transport === 'http' || config.transport === 'sse') && !config.baseUrl) {
      setError('Server URL is required for HTTP/SSE transport');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const serverConfig: MCPServerConfig = {
        id: config.name.toLowerCase().replace(/\s+/g, '-'),
        name: config.name,
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        baseUrl: config.baseUrl,
        headers: config.headers,
        transport: config.transport || 'stdio'
      };

      await addServer(serverConfig);
      handleClose();
    } catch (err) {
      setError('Failed to add server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom MCP Server</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Transport Selection */}
          <div className="space-y-2">
            <Label htmlFor="transport">Transport Type</Label>
            <Select 
              value={config.transport} 
              onValueChange={(value: 'stdio' | 'http' | 'sse') => 
                setConfig(prev => ({ ...prev, transport: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select transport type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">Local (stdio)</SelectItem>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Server Name</Label>
            <Input
              id="name"
              value={config.name || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              placeholder="My Custom Server"
            />
          </div>

          {/* Command (for stdio) */}
          {config.transport === 'stdio' && (
            <div className="space-y-2">
              <Label htmlFor="command">Command</Label>
              <Input
                id="command"
                value={config.command || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, command: e.target.value }))}
                placeholder="npx @modelcontextprotocol/server-filesystem"
              />
            </div>
          )}

          {/* Arguments */}
          {config.transport === 'stdio' && (
            <div className="space-y-2">
              <Label htmlFor="args">Arguments (comma-separated)</Label>
              <Input
                id="args"
                value={config.args?.join(', ') || ''}
                onChange={(e) => {
                  const args = e.target.value
                    .split(',')
                    .map(arg => arg.trim())
                    .filter(arg => arg.length > 0);
                  setConfig(prev => ({ ...prev, args }));
                }}
                placeholder="/path/to/directory"
              />
            </div>
          )}

          {/* URL (for http/sse) */}
          {(config.transport === 'http' || config.transport === 'sse') && (
            <>
              <div className="space-y-2">
                <Label htmlFor="baseUrl">Server URL</Label>
                <Input
                  id="baseUrl"
                  value={config.baseUrl || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="http://localhost:3000"
                />
              </div>

              {/* API Key (optional) */}
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key (optional)</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={config.headers?.['Authorization']?.replace('Bearer ', '') || ''}
                  onChange={(e) => {
                    const apiKey = e.target.value;
                    setConfig(prev => ({
                      ...prev,
                      headers: {
                        ...prev.headers,
                        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                      }
                    }));
                  }}
                  placeholder="your-api-key"
                />
              </div>

              {/* Custom Headers (optional) */}
              <div className="space-y-2">
                <Label htmlFor="customHeaders">Custom Headers (JSON format, optional)</Label>
                <Input
                  id="customHeaders"
                  value={(() => {
                    const filteredHeaders = Object.fromEntries(
                      Object.entries(config.headers || {}).filter(([key]) => key !== 'Authorization')
                    );
                    return Object.keys(filteredHeaders).length > 0 ? JSON.stringify(filteredHeaders) : '';
                  })()}
                  onChange={(e) => {
                    try {
                      const customHeaders = e.target.value ? JSON.parse(e.target.value) : {};
                      const authHeader = config.headers?.['Authorization'] ? { 'Authorization': config.headers['Authorization'] } : {};
                      setConfig(prev => ({
                        ...prev,
                        headers: { ...authHeader, ...customHeaders }
                      }));
                    } catch {
                      // Invalid JSON, ignore
                    }
                  }}
                  placeholder='{"Content-Type": "application/json"}'
                />
              </div>
            </>
          )}

          {/* Success Display */}
          {testSuccess && (
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription>Connection test successful! The server is reachable.</AlertDescription>
            </Alert>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        
        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={handleTestConnection}
            disabled={isLoading || isTestingConnection || !config.name || 
              (config.transport === 'stdio' && !config.command) ||
              ((config.transport === 'http' || config.transport === 'sse') && !config.baseUrl)}
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
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || isTestingConnection}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Adding...
              </>
            ) : (
              'Add Server'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}