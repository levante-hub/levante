import type { MCPServerConfig } from '../../../types/mcp';

interface ServerInfoPanelProps {
  config: Partial<MCPServerConfig>;
}

export function ServerInfoPanel({ config }: ServerInfoPanelProps) {
  const getDisplayCommand = () => {
    if (config.transport === 'stdio') {
      const args = config.args?.join(' ') || '';
      return `${config.command} ${args}`.trim();
    }
    if (config.transport === 'http' || config.transport === 'sse') {
      return config.baseUrl || 'N/A';
    }
    return 'N/A';
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">Server Information</h3>
      <div className="bg-muted/50 rounded-lg p-4 space-y-2 border border-border">
        <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
          <span className="text-muted-foreground">Name:</span>
          <span className="font-medium text-foreground">{config.name || 'N/A'}</span>
        </div>
        <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
          <span className="text-muted-foreground">Transport:</span>
          <span className="font-mono text-foreground">{config.transport || 'N/A'}</span>
        </div>
        <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
          <span className="text-muted-foreground">
            {config.transport === 'stdio' ? 'Command:' : 'URL:'}
          </span>
          <span className="font-mono text-foreground break-all">{getDisplayCommand()}</span>
        </div>
      </div>
    </div>
  );
}
