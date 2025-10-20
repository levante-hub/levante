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
  MessageSquare,
  Globe,
  Cloud
} from 'lucide-react';
import { MCPRegistryEntry, MCPServerConfig, MCPConnectionStatus } from '@/types/mcp';
import { ConnectionStatus } from '../connection/connection-status';

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
  'message-square': MessageSquare,
  globe: Globe,
  cloud: Cloud,
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
          <ConnectionStatus 
            serverId={server?.id || entry?.id || 'unknown'}
            status={status}
            size="sm"
            variant="indicator"
          />
          
          <Badge variant={isActive ? 'default' : 'outline'}>
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
          <ConnectionStatus 
            serverId={server?.id || entry?.id || 'unknown'}
            status="connecting"
            size="lg"
            variant="full"
            showLabel={true}
          />
        </div>
      )}
    </Card>
  );
}