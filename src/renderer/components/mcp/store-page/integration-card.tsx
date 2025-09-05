import React from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Settings, 
  FolderOpen, 
  Search, 
  Github, 
  Database, 
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { MCPRegistryEntry, MCPServerConfig, MCPConnectionStatus } from '@/types/mcp';

interface IntegrationCardProps {
  entry?: MCPRegistryEntry;
  server?: MCPServerConfig;
  status: MCPConnectionStatus;
  isActive: boolean;
  onToggle: () => void;
  onConfigure: () => void;
}

const iconMap = {
  folder: FolderOpen,
  search: Search,
  github: Github,
  database: Database,
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

export function IntegrationCard({ 
  entry, 
  server, 
  status, 
  isActive, 
  onToggle, 
  onConfigure 
}: IntegrationCardProps) {
  const displayName = entry?.name || server?.name || server?.id || 'Unknown';
  const description = entry?.description || 'Custom MCP server integration';
  const category = entry?.category || 'custom';
  const iconName = entry?.icon || 'folder';
  
  const IconComponent = iconMap[iconName as keyof typeof iconMap] || FolderOpen;
  const statusInfo = statusConfig[status];
  const StatusIcon = statusInfo.icon;

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md">
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{displayName}</h3>
              <Badge variant="secondary" className="text-xs">
                {category}
              </Badge>
            </div>
          </div>
          <Switch 
            checked={status === 'connected'} 
            disabled={status === 'connecting'}
            onCheckedChange={onToggle}
          />
        </div>
        
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {description}
        </p>
        
        {/* Status indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon 
              className={`w-4 h-4 ${statusInfo.color} ${
                status === 'connecting' ? 'animate-spin' : ''
              }`}
            />
            <span className="text-sm text-muted-foreground">
              {statusInfo.label}
            </span>
          </div>
          
          <Badge variant={statusInfo.badgeVariant}>
            {isActive ? 'Configured' : 'Available'}
          </Badge>
        </div>
      </CardContent>
      
      <CardFooter className="p-6 pt-0">
        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onConfigure}
            disabled={status === 'connecting'}
          >
            <Settings className="w-4 h-4 mr-2" />
            {isActive ? 'Configure' : 'Set up'}
          </Button>
        </div>
      </CardFooter>
      
      {/* Connection status overlay for connecting state */}
      {status === 'connecting' && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm text-muted-foreground">Connecting...</span>
          </div>
        </div>
      )}
    </Card>
  );
}