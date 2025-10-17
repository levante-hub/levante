import { Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MCPTool } from '@/types/mcp';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';

interface MCPServerPreviewProps {
  serverName: string;
  isValidJSON: boolean;
  testResult: { success: boolean; message: string } | null;
  tools: MCPTool[];
  isTestingConnection: boolean;
  isLoadingTools: boolean;
  onTestConnection: () => void;
}

export function MCPServerPreview({
  serverName,
  testResult,
  isTestingConnection,
  tools,
  onTestConnection
}: MCPServerPreviewProps) {
  // Determinar el texto y color del estado
  const getStatusText = () => {
    if (isTestingConnection) {
      return { text: 'Connecting...', className: 'text-muted-foreground' };
    }
    if (testResult?.success) {
      return { text: 'Connected', className: 'text-green-600 dark:text-green-500' };
    }
    return { text: 'Disconnected', className: 'text-muted-foreground' };
  };

  const status = getStatusText();

  // Truncar texto
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  };

  // Contar parámetros requeridos
  const getRequiredParams = (tool: MCPTool) => {
    return tool.inputSchema?.required?.length || 0;
  };

  return (
    <div className="rounded-lg bg-background">
      {/* Header con info del servidor y estado */}
      <div className="relative p-4">
        {/* Botón Test - esquina superior derecha */}
        <div className="absolute top-3 right-3">
          <Button
            onClick={onTestConnection}
            variant="outline"
            size="sm"
            disabled={isTestingConnection}
            className="h-7 px-2.5 text-xs"
          >
            {isTestingConnection ? 'Testing...' : 'Test'}
          </Button>
        </div>

        {/* Contenido principal */}
        <div className="flex items-center gap-3 pr-20">
          {/* Placeholder de icono */}
          <div className="w-11 h-11 border-2 rounded-lg flex items-center justify-center text-muted-foreground flex-shrink-0">
            <Server className="w-5 h-5" />
          </div>

          {/* Info del servidor */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{serverName}</h3>
            <p className={`text-xs font-medium ${status.className}`}>
              {status.text}
            </p>
          </div>
        </div>
      </div>

      {/* Tools list - solo si hay tools y conexión exitosa */}
      {testResult?.success && tools.length > 0 && (
        <div className="border-t">
          {/* Nivel 1: Desplegable principal de Tools */}
          <Accordion type="single" collapsible defaultValue="tools-main">
            <AccordionItem value="tools-main" className="border-none">
              <AccordionTrigger className="hover:no-underline px-4 py-2.5 hover:bg-accent/5 transition-all duration-200 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground/70">
                <span className="text-xs font-medium text-muted-foreground">
                  Tools ({tools.length})
                </span>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-3">
                {/* Nivel 2: Desplegables individuales por tool */}
                <Accordion type="single" collapsible className="space-y-0.5">
                  {tools.map((tool) => (
                    <AccordionItem
                      key={tool.name}
                      value={tool.name}
                      className="border-none"
                    >
                      <AccordionTrigger className="hover:no-underline py-1.5 px-2 hover:bg-accent/5 rounded-md transition-all duration-150 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground/60">
                        <div className="flex-1 text-left pr-2 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-mono text-[11px] font-medium truncate">
                              {tool.name}
                            </span>
                            {getRequiredParams(tool) > 0 && (
                              <span className="text-[9px] text-muted-foreground/70 flex-shrink-0">
                                {getRequiredParams(tool)} req
                              </span>
                            )}
                          </div>
                          {tool.description && (
                            <p className="text-[11px] text-muted-foreground/80 leading-snug line-clamp-1">
                              {truncateText(tool.description, 55)}
                            </p>
                          )}
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="px-2 pb-2 pt-0">
                        <div className="pl-1 space-y-2">
                          {/* Parámetros */}
                          {tool.inputSchema?.properties && (
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-medium text-muted-foreground/70">
                                Parameters ({Object.keys(tool.inputSchema.properties).length}):
                              </p>
                              <div className="space-y-1.5">
                                {Object.entries(tool.inputSchema.properties).map(
                                  ([key, value]: [string, any]) => (
                                    <div key={key} className="text-[11px]">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-mono font-medium text-[10px]">
                                          {key}
                                        </span>
                                        {value.type && (
                                          <span className="text-[9px] text-muted-foreground/70 px-1 py-0.5 bg-accent/30 rounded">
                                            {value.type}
                                          </span>
                                        )}
                                        {tool.inputSchema?.required?.includes(key) && (
                                          <span className="text-[9px] text-red-500/70 px-1 py-0.5 bg-red-50 dark:bg-red-950/30 rounded">
                                            required
                                          </span>
                                        )}
                                      </div>
                                      {value.description && (
                                        <p className="text-muted-foreground/80 mt-0.5 leading-relaxed text-[10px]">
                                          {value.description}
                                        </p>
                                      )}
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
}
