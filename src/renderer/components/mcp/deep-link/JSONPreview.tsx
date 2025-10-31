import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MCPServerConfig } from '../../../types/mcp';

interface JSONPreviewProps {
  config: Partial<MCPServerConfig>;
}

export function JSONPreview({ config }: JSONPreviewProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(config, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Configuration JSON</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2 text-xs"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>
      <div className="bg-muted/50 rounded-lg p-4 border border-border">
        <pre className="text-xs font-mono overflow-x-auto text-foreground">
          {jsonString}
        </pre>
      </div>
    </div>
  );
}
