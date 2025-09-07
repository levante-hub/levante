import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Wrench, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ExternalLink,
  Eye
} from 'lucide-react';
import { ToolCallModal } from './tool-call-modal';

export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: {
    success: boolean;
    content?: string;
    error?: string;
  };
  status: 'pending' | 'running' | 'success' | 'error';
  serverId?: string;
  timestamp?: number;
}

interface ToolCallProps {
  toolCall: ToolCallData;
  className?: string;
}

interface ToolCallsProps {
  toolCalls: ToolCallData[];
  className?: string;
}

const statusConfig = {
  pending: { 
    icon: Clock, 
    color: 'text-muted-foreground', 
    label: 'Pending',
    badgeVariant: 'outline' as const
  },
  running: { 
    icon: Clock, 
    color: 'text-yellow-500', 
    label: 'Running',
    badgeVariant: 'secondary' as const
  },
  success: { 
    icon: CheckCircle2, 
    color: 'text-green-500', 
    label: 'Success',
    badgeVariant: 'default' as const
  },
  error: { 
    icon: XCircle, 
    color: 'text-red-500', 
    label: 'Error',
    badgeVariant: 'destructive' as const
  }
};

export function ToolCall({ toolCall, className }: ToolCallProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const statusInfo = statusConfig[toolCall.status];
  const StatusIcon = statusInfo.icon;

  const getResultSummary = () => {
    if (!toolCall.result) return null;
    
    if (toolCall.result.success && toolCall.result.content) {
      const contentStr = typeof toolCall.result.content === 'string' 
        ? toolCall.result.content 
        : JSON.stringify(toolCall.result.content);
      
      // Show first 100 characters as preview
      const preview = contentStr.length > 100 
        ? contentStr.substring(0, 100) + '...' 
        : contentStr;
      
      return { type: 'success', preview };
    }

    if (!toolCall.result.success && toolCall.result.error) {
      const errorStr = typeof toolCall.result.error === 'string' 
        ? toolCall.result.error 
        : JSON.stringify(toolCall.result.error);
      
      // Show first 100 characters as preview
      const preview = errorStr.length > 100 
        ? errorStr.substring(0, 100) + '...' 
        : errorStr;
      
      return { type: 'error', preview };
    }

    return null;
  };

  const getArgumentsSummary = () => {
    const argCount = Object.keys(toolCall.arguments).length;
    if (argCount === 0) return null;
    
    const firstArg = Object.entries(toolCall.arguments)[0];
    if (argCount === 1) {
      let value = firstArg[1];
      if (typeof value === 'string' && value.length > 50) {
        value = value.substring(0, 50) + '...';
      }
      return `${firstArg[0]}: ${value}`;
    }
    
    return `${argCount} arguments`;
  };

  const resultSummary = getResultSummary();
  const argumentsSummary = getArgumentsSummary();

  return (
    <>
      <div className={cn("border rounded-lg bg-background hover:bg-muted/30 transition-colors cursor-pointer", className)}>
        <div
          onClick={() => setIsModalOpen(true)}
          className="w-full p-3 text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Wrench className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{toolCall.name}</span>
                  {toolCall.serverId && (
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {toolCall.serverId}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusIcon 
                    className={cn(
                      "w-3 h-3 flex-shrink-0", 
                      statusInfo.color,
                      toolCall.status === 'running' && "animate-spin"
                    )} 
                  />
                  <Badge variant={statusInfo.badgeVariant} className="text-xs">
                    {statusInfo.label}
                  </Badge>
                  {toolCall.timestamp && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(toolCall.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                
                {/* Arguments and Result Summary */}
                <div className="space-y-1 text-xs">
                  {argumentsSummary && (
                    <div className="text-muted-foreground truncate">
                      Args: {argumentsSummary}
                    </div>
                  )}
                  {resultSummary && (
                    <div className={cn(
                      "truncate",
                      resultSummary.type === 'success' 
                        ? "text-green-600 dark:text-green-400" 
                        : "text-red-600 dark:text-red-400"
                    )}>
                      {resultSummary.type === 'success' ? 'Result' : 'Error'}: {resultSummary.preview}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsModalOpen(true);
                }}
              >
                <Eye className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ToolCallModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        toolCall={toolCall}
      />
    </>
  );
}

export function ToolCalls({ toolCalls, className }: ToolCallsProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Wrench className="w-4 h-4" />
        Tool Calls ({toolCalls.length})
      </div>
      {toolCalls.map((toolCall) => (
        <ToolCall key={toolCall.id} toolCall={toolCall} />
      ))}
    </div>
  );
}