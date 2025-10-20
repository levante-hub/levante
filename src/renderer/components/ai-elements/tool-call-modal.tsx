import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  CheckCircle2, 
  XCircle, 
  Clock,
  AlertCircle,
  Copy,
  ExternalLink
} from 'lucide-react';
import { ToolCallData } from './tool-call';

interface ToolCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolCall: ToolCallData;
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

export function ToolCallModal({ isOpen, onClose, toolCall }: ToolCallModalProps) {
  const statusInfo = statusConfig[toolCall.status];
  const StatusIcon = statusInfo.icon;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatArguments = (args: Record<string, any>) => {
    return Object.entries(args).map(([key, value]) => {
      let displayValue: string;
      try {
        if (typeof value === 'string') {
          displayValue = value;
        } else if (value === null || value === undefined) {
          displayValue = String(value);
        } else {
          displayValue = JSON.stringify(value, null, 2);
        }
      } catch (error) {
        displayValue = `[${typeof value}]`;
      }
      
      return { key, value: displayValue };
    });
  };

  const getResultContent = () => {
    if (!toolCall.result) return null;
    
    if (toolCall.result.success && toolCall.result.content) {
      const contentStr = typeof toolCall.result.content === 'string' 
        ? toolCall.result.content 
        : JSON.stringify(toolCall.result.content, null, 2);
      return { type: 'success', content: contentStr };
    }

    if (!toolCall.result.success && toolCall.result.error) {
      const errorStr = typeof toolCall.result.error === 'string' 
        ? toolCall.result.error 
        : JSON.stringify(toolCall.result.error, null, 2);
      return { type: 'error', content: errorStr };
    }

    return null;
  };

  const argumentsData = formatArguments(toolCall.arguments);
  const resultContent = getResultContent();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{toolCall.name}</span>
              {toolCall.serverId && (
                <Badge variant="outline" className="text-xs">
                  {toolCall.serverId}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusIcon 
                className={cn(
                  "w-4 h-4", 
                  statusInfo.color,
                  toolCall.status === 'running' && "animate-spin"
                )} 
              />
              <Badge variant={statusInfo.badgeVariant} className="text-xs">
                {statusInfo.label}
              </Badge>
              {toolCall.timestamp && (
                <span className="text-xs text-muted-foreground">
                  {new Date(toolCall.timestamp).toLocaleString()}
                </span>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto space-y-6">
          {/* Arguments Section */}
          {argumentsData.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">Arguments</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(JSON.stringify(toolCall.arguments, null, 2))}
                  className="h-8 px-2"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                {argumentsData.map(({ key, value }) => (
                  <div key={key} className="space-y-1">
                    <div className="text-sm font-medium text-muted-foreground">{key}:</div>
                    <div className="bg-background rounded border p-3">
                      <pre className="text-sm whitespace-pre-wrap font-mono text-foreground overflow-x-auto">
                        {value}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Result Section */}
          {resultContent && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className={cn(
                  "text-sm font-semibold flex items-center gap-2",
                  resultContent.type === 'success' 
                    ? "text-green-700 dark:text-green-300"
                    : "text-red-700 dark:text-red-300"
                )}>
                  {resultContent.type === 'error' && <AlertCircle className="w-4 h-4" />}
                  {resultContent.type === 'success' ? 'Result' : 'Error'}
                </h3>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(resultContent.content)}
                    className="h-8 px-2"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                  {resultContent.content.includes('http') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const urls = resultContent.content.match(/(https?:\/\/[^\s]+)/g);
                        if (urls && urls.length > 0) {
                          window.open(urls[0], '_blank');
                        }
                      }}
                      className="h-8 px-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className={cn(
                "rounded-lg p-4",
                resultContent.type === 'success'
                  ? "bg-green-50 dark:bg-green-900/20"
                  : "bg-red-50 dark:bg-red-900/20"
              )}>
                <pre className={cn(
                  "text-sm whitespace-pre-wrap font-mono overflow-x-auto",
                  resultContent.type === 'success'
                    ? "text-green-800 dark:text-green-200"
                    : "text-red-800 dark:text-red-200"
                )}>
                  {resultContent.content}
                </pre>
              </div>
            </div>
          )}

          {/* Tool ID and Debug Info */}
          <div className="pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Tool ID: <span className="font-mono">{toolCall.id}</span></div>
              {toolCall.serverId && (
                <div>Server: <span className="font-mono">{toolCall.serverId}</span></div>
              )}
              {toolCall.timestamp && (
                <div>Executed: {new Date(toolCall.timestamp).toLocaleString()}</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}