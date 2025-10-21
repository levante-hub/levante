import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wrench } from 'lucide-react';
import { MCPTool } from '@/types/mcp';
import { MCPToolSchema } from './mcp-tool-schema';

interface MCPToolsListProps {
  tools: MCPTool[];
  isLoading: boolean;
}

export function MCPToolsList({ tools, isLoading }: MCPToolsListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        <span className="text-sm">Loading tools...</span>
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Wrench className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p className="text-sm">No tools available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <Wrench className="w-4 h-4" />
          Tools ({tools.length})
        </h4>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {tools.map((tool) => (
          <AccordionItem key={tool.name} value={tool.name} className="border-b">
            <AccordionTrigger className="hover:no-underline py-3">
              <div className="flex flex-col items-start text-left gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{tool.name}</span>
                  {tool.inputSchema?.required && tool.inputSchema.required.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {tool.inputSchema.required.length} required
                    </Badge>
                  )}
                </div>
                {tool.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {tool.description}
                  </p>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-2">
              <div className="pl-4 space-y-3">
                {tool.description && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Description:</span>
                    <p className="text-sm mt-1">{tool.description}</p>
                  </div>
                )}
                <MCPToolSchema schema={tool.inputSchema} />
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
