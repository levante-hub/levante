import React from 'react';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  Loader2, 
  XCircle, 
  AlertCircle,
  Wifi,
  WifiOff 
} from 'lucide-react';
import { MCPConnectionStatus } from '@/types/mcp';

interface ConnectionStatusProps {
  serverId: string;
  status: MCPConnectionStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showLabel?: boolean;
  variant?: 'badge' | 'indicator' | 'full';
}

const statusConfig = {
  connected: { 
    color: 'text-green-500', 
    bgColor: 'bg-green-100',
    icon: CheckCircle, 
    label: 'Connected',
    badgeVariant: 'default' as const,
    dotColor: 'bg-green-500'
  },
  connecting: { 
    color: 'text-yellow-500', 
    bgColor: 'bg-yellow-100',
    icon: Loader2, 
    label: 'Connecting...',
    badgeVariant: 'secondary' as const,
    dotColor: 'bg-yellow-500'
  },
  disconnected: { 
    color: 'text-gray-500', 
    bgColor: 'bg-gray-100',
    icon: XCircle, 
    label: 'Disconnected',
    badgeVariant: 'outline' as const,
    dotColor: 'bg-gray-500'
  },
  error: { 
    color: 'text-red-500', 
    bgColor: 'bg-red-100',
    icon: AlertCircle, 
    label: 'Error',
    badgeVariant: 'destructive' as const,
    dotColor: 'bg-red-500'
  }
};

const sizeConfig = {
  sm: { icon: 'w-3 h-3', dot: 'w-2 h-2', text: 'text-xs' },
  md: { icon: 'w-4 h-4', dot: 'w-3 h-3', text: 'text-sm' },
  lg: { icon: 'w-5 h-5', dot: 'w-4 h-4', text: 'text-base' }
};

export function ConnectionStatus({ 
  serverId, 
  status,
  size = 'md',
  showIcon = true,
  showLabel = true,
  variant = 'full'
}: ConnectionStatusProps) {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];
  const IconComponent = config.icon;

  if (variant === 'badge') {
    return (
      <Badge variant={config.badgeVariant} className={sizes.text}>
        {showIcon && (
          <IconComponent 
            className={`${sizes.icon} mr-1 ${
              status === 'connecting' ? 'animate-spin' : ''
            }`}
          />
        )}
        {showLabel && config.label}
      </Badge>
    );
  }

  if (variant === 'indicator') {
    return (
      <div className="flex items-center gap-2">
        <div className="relative">
          <div className={`${sizes.dot} rounded-full ${config.dotColor}`} />
          {status === 'connecting' && (
            <div className={`absolute inset-0 ${sizes.dot} rounded-full ${config.dotColor} opacity-75 animate-ping`} />
          )}
        </div>
        {showLabel && (
          <span className={`${sizes.text} ${config.color} font-medium`}>
            {config.label}
          </span>
        )}
      </div>
    );
  }

  // Full variant
  return (
    <div className="flex items-center gap-2">
      {showIcon && (
        <div className={`p-1.5 rounded-full ${config.bgColor}`}>
          <IconComponent 
            className={`${sizes.icon} ${config.color} ${
              status === 'connecting' ? 'animate-spin' : ''
            }`}
          />
        </div>
      )}
      {showLabel && (
        <div className="flex flex-col">
          <span className={`${sizes.text} ${config.color} font-medium`}>
            {config.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {serverId}
          </span>
        </div>
      )}
    </div>
  );
}

// Network status indicator for the overall MCP system
interface NetworkStatusProps {
  connectedCount: number;
  totalCount: number;
  size?: 'sm' | 'md' | 'lg';
}

export function NetworkStatus({ connectedCount, totalCount, size = 'md' }: NetworkStatusProps) {
  const sizes = sizeConfig[size];
  const hasConnected = connectedCount > 0;
  const allConnected = connectedCount === totalCount && totalCount > 0;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        {hasConnected ? (
          <Wifi className={`${sizes.icon} ${allConnected ? 'text-green-500' : 'text-yellow-500'}`} />
        ) : (
          <WifiOff className={`${sizes.icon} text-gray-500`} />
        )}
      </div>
      <div className="flex flex-col">
        <span className={`${sizes.text} font-medium`}>
          {connectedCount} of {totalCount} connected
        </span>
        <span className="text-xs text-muted-foreground">
          MCP Servers
        </span>
      </div>
    </div>
  );
}