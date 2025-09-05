import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Settings,
  FolderOpen,
  Search,
  Database,
  MessageSquare,
  Globe,
  Cloud
} from 'lucide-react';
import { useMCPStore } from '@/stores/mcpStore';
import { DynamicConfigForm } from './dynamic-config-form';
import { MCPServerConfig, MCPConfigField } from '@/types/mcp';

interface ServerConfigModalProps {
  serverId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const iconMap = {
  folder: FolderOpen,
  search: Search,
  database: Database,
  'message-square': MessageSquare,
  globe: Globe,
  cloud: Cloud,
};

const statusConfig = {
  connected: { 
    color: 'text-green-500', 
    icon: CheckCircle, 
    label: 'Connected',
    badgeVariant: 'default' as const
  },
  connecting: { 
    color: 'text-yellow-500', 
    icon: Loader2, 
    label: 'Connecting...',
    badgeVariant: 'secondary' as const
  },
  disconnected: { 
    color: 'text-gray-500', 
    icon: XCircle, 
    label: 'Disconnected',
    badgeVariant: 'outline' as const
  },
  error: { 
    color: 'text-red-500', 
    icon: AlertCircle, 
    label: 'Error',
    badgeVariant: 'destructive' as const
  }
};

export function ServerConfigModal({ serverId, isOpen, onClose }: ServerConfigModalProps) {
  const { 
    getRegistryEntryById, 
    getServerById, 
    connectionStatus,
    testConnection,
    connectServer,
    updateServer,
    addServer,
    isLoading
  } = useMCPStore();

  const [config, setConfig] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const registryEntry = serverId ? getRegistryEntryById(serverId) : null;
  const activeServer = serverId ? getServerById(serverId) : null;
  const currentStatus = serverId ? (connectionStatus[serverId] || 'disconnected') : 'disconnected';
  const statusInfo = statusConfig[currentStatus];

  useEffect(() => {
    if (isOpen && serverId) {
      // Initialize form with existing server config or defaults
      const initialConfig: Record<string, any> = {};
      
      if (activeServer) {
        // Load from active server config
        registryEntry?.configuration.fields.forEach((field: MCPConfigField) => {
          if (field.key === 'command') {
            initialConfig[field.key] = activeServer.command || field.defaultValue || '';
          } else if (field.key === 'args') {
            initialConfig[field.key] = activeServer.args?.join(', ') || '';
          } else if (activeServer.env && activeServer.env[field.key]) {
            initialConfig[field.key] = activeServer.env[field.key];
          } else if (field.defaultValue !== undefined) {
            initialConfig[field.key] = field.defaultValue;
          }
        });
      } else {
        // Load from registry defaults
        registryEntry?.configuration.fields.forEach((field: MCPConfigField) => {
          if (field.defaultValue !== undefined) {
            initialConfig[field.key] = field.defaultValue;
          }
        });
        
        // Apply registry defaults
        if (registryEntry?.configuration.defaults) {
          Object.assign(initialConfig, registryEntry.configuration.defaults);
        }
      }
      
      setConfig(initialConfig);
      setErrors({});
      setTestResult(null);
    }
  }, [isOpen, serverId, registryEntry, activeServer]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!registryEntry) return false;

    registryEntry.configuration.fields.forEach((field: MCPConfigField) => {
      if (field.required && (!config[field.key] || config[field.key].toString().trim() === '')) {
        newErrors[field.key] = `${field.label} is required`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTestConnection = async () => {
    if (!validateForm() || !serverId || !registryEntry) return;

    setIsTestingConnection(true);
    setTestResult(null);

    try {
      // Build test config
      const testConfig: MCPServerConfig = {
        id: `test-${serverId}-${Date.now()}`,
        name: registryEntry.name,
        transport: registryEntry.transport.type,
        command: config.command || '',
        args: config.args ? config.args.split(',').map((arg: string) => arg.trim()).filter((arg: string) => arg) : [],
        env: {}
      };

      // Add environment variables from form
      registryEntry.configuration.fields.forEach((field: MCPConfigField) => {
        if (field.key !== 'command' && field.key !== 'args' && config[field.key]) {
          testConfig.env![field.key] = config[field.key].toString();
        }
      });

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
    if (!validateForm() || !serverId || !registryEntry) return;

    setIsSaving(true);

    try {
      // Build server config
      const serverConfig: MCPServerConfig = {
        id: serverId,
        name: registryEntry.name,
        transport: registryEntry.transport.type,
        command: config.command || '',
        args: config.args ? config.args.split(',').map((arg: string) => arg.trim()).filter((arg: string) => arg) : [],
        env: {}
      };

      // Add environment variables from form
      registryEntry.configuration.fields.forEach((field: MCPConfigField) => {
        if (field.key !== 'command' && field.key !== 'args' && config[field.key]) {
          serverConfig.env![field.key] = config[field.key].toString();
        }
      });

      if (activeServer) {
        // Update existing server
        await updateServer(serverId, {
          name: serverConfig.name,
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
          transport: serverConfig.transport
        });
      } else {
        // Add new server
        await addServer(serverConfig);
      }

      // Auto-connect after successful save
      await connectServer(serverConfig);

      onClose();
    } catch (error) {
      console.error('Failed to save server config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setConfig({});
    setErrors({});
    setTestResult(null);
    setIsSaving(false);
    setIsTestingConnection(false);
    onClose();
  };

  if (!registryEntry) {
    return null;
  }

  const IconComponent = iconMap[registryEntry.icon as keyof typeof iconMap] || Settings;
  const StatusIcon = statusInfo.icon;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconComponent className="w-5 h-5" />
            Configure {registryEntry.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Status Display */}
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Status:</span>
            <div className="flex items-center gap-2">
              <StatusIcon 
                className={`w-4 h-4 ${statusInfo.color} ${
                  currentStatus === 'connecting' ? 'animate-spin' : ''
                }`}
              />
              <Badge variant={statusInfo.badgeVariant}>
                {statusInfo.label}
              </Badge>
            </div>
          </div>

          {/* Server Description */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              {registryEntry.description}
            </p>
            <Badge variant="outline" className="mt-2">
              {registryEntry.category}
            </Badge>
          </div>

          {/* Configuration Form */}
          <DynamicConfigForm
            fields={registryEntry.configuration.fields}
            values={config}
            onChange={setConfig}
            errors={errors}
          />

          {/* Test Result Display */}
          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertTitle>
                {testResult.success ? 'Test Successful' : 'Test Failed'}
              </AlertTitle>
              <AlertDescription>
                {testResult.message}
              </AlertDescription>
            </Alert>
          )}
        </div>
        
        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={handleTestConnection}
            disabled={isLoading || isTestingConnection || isSaving}
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
          <Button variant="outline" onClick={handleClose} disabled={isLoading || isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || isTestingConnection || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              activeServer ? 'Update & Connect' : 'Save & Connect'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}