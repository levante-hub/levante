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
import { Loader2, AlertCircle } from 'lucide-react';
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
    setIsLoading(false);
    setIsTestingConnection(false);
    onClose();
  };

  const handleTestConnection = async () => {
    if (!config.name || !config.command) {
      setError('Name and command are required');
      return;
    }

    setIsTestingConnection(true);
    setError(null);

    try {
      const testConfig: MCPServerConfig = {
        id: `test-${Date.now()}`,
        name: config.name,
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        transport: config.transport || 'stdio'
      };

      const success = await testConnection(testConfig);
      
      if (success) {
        setError(null);
        // You could show a success message here
      } else {
        setError('Connection test failed. Please check your configuration.');
      }
    } catch (err) {
      setError('Connection test failed with an error.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = async () => {
    if (!config.name || !config.command) {
      setError('Name and command are required');
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
                <SelectItem value="http" disabled>HTTP (Coming Soon)</SelectItem>
                <SelectItem value="sse" disabled>SSE (Coming Soon)</SelectItem>
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
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Server URL</Label>
              <Input
                id="baseUrl"
                value={config.baseUrl || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="http://localhost:3000"
              />
            </div>
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
            disabled={isLoading || isTestingConnection || !config.name || !config.command}
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