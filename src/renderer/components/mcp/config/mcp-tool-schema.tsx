import { Badge } from '@/components/ui/badge';
import { Code } from 'lucide-react';

interface MCPToolSchemaProps {
  schema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export function MCPToolSchema({ schema }: MCPToolSchemaProps) {
  if (!schema || !schema.properties) {
    return (
      <div className="text-xs text-muted-foreground">
        No parameters required
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Code className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Parameters:</span>
      </div>

      <div className="space-y-3">
        {Object.entries(schema.properties).map(([key, value]: [string, any]) => (
          <div key={key} className="pl-4 border-l-2 border-muted space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold">{key}</span>
              {schema.required?.includes(key) && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                  required
                </Badge>
              )}
              {value.type && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {value.type}
                </Badge>
              )}
            </div>

            {value.description && (
              <p className="text-xs text-muted-foreground">{value.description}</p>
            )}

            {value.enum && (
              <div className="text-xs">
                <span className="text-muted-foreground">Enum: </span>
                <span className="font-mono">{value.enum.join(', ')}</span>
              </div>
            )}

            {value.default !== undefined && (
              <div className="text-xs">
                <span className="text-muted-foreground">Default: </span>
                <span className="font-mono">{JSON.stringify(value.default)}</span>
              </div>
            )}

            {value.items && (
              <div className="text-xs">
                <span className="text-muted-foreground">Items: </span>
                <span className="font-mono">{value.items.type || 'any'}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
