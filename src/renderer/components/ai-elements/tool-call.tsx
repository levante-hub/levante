import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ChevronDown, 
  ChevronRight, 
  Wrench, 
  CheckCircle2, 
  XCircle, 
  Clock,
  AlertCircle
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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
  const [isExpanded, setIsExpanded] = useState(false);
  const statusInfo = statusConfig[toolCall.status];
  const StatusIcon = statusInfo.icon;

  const formatArguments = (args: Record<string, any>) => {
    return Object.entries(args).map(([key, value]) => {
      // Safely format the value for display
      let displayValue: string;
      try {
        if (typeof value === 'string') {
          displayValue = `"${value}"`;
        } else if (value === null || value === undefined) {
          displayValue = String(value);
        } else {
          displayValue = JSON.stringify(value, null, 2);
        }
      } catch (error) {
        // Fallback if JSON.stringify fails (e.g., circular references)
        displayValue = `[${typeof value}]`;
      }
      
      return (
        <div key={key} className="flex gap-2">
          <span className="font-medium text-muted-foreground">{key}:</span>
          <span className="font-mono text-sm whitespace-pre-wrap">
            {displayValue}
          </span>
        </div>
      );
    });
  };

  const formatResult = (result: ToolCallData['result']) => {
    if (!result) return null;
    
    if (result.success && result.content) {
      // Ensure content is always a string for rendering
      const contentStr = typeof result.content === 'string' 
        ? result.content 
        : JSON.stringify(result.content, null, 2);
        
      return (
        <div className="space-y-2">
          <div className="text-sm font-medium text-green-700 dark:text-green-300">
            Result:
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-md">
            <pre className="text-sm whitespace-pre-wrap font-mono text-green-800 dark:text-green-200">
              {contentStr}
            </pre>
          </div>
        </div>
      );
    }

    if (!result.success && result.error) {
      // Ensure error is always a string for rendering
      const errorStr = typeof result.error === 'string' 
        ? result.error 
        : JSON.stringify(result.error, null, 2);
        
      return (
        <div className="space-y-2">
          <div className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            Error:
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
            <pre className="text-sm whitespace-pre-wrap font-mono text-red-800 dark:text-red-200">
              {errorStr}
            </pre>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className={cn("border rounded-lg bg-background", className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between p-3 h-auto text-left"
          >
            <div className="flex items-center gap-3">
              <Wrench className="w-4 h-4 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{toolCall.name}</span>
                  {toolCall.serverId && (
                    <Badge variant="outline" className="text-xs">
                      {toolCall.serverId}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusIcon 
                    className={cn(
                      "w-3 h-3", 
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
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-4">
            {/* Arguments */}
            {Object.keys(toolCall.arguments).length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Arguments:</div>
                <div className="bg-muted/50 p-3 rounded-md space-y-1 text-sm">
                  {formatArguments(toolCall.arguments)}
                </div>
              </div>
            )}

            {/* Result */}
            {formatResult(toolCall.result)}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
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