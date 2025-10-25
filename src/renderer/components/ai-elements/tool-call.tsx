import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Wrench,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ═══════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// CONFIGURACIÓN DE ESTADOS
// ═══════════════════════════════════════════════════════

const statusConfig = {
  pending: {
    icon: Clock,
    label: 'Pendiente',
    className: 'text-muted-foreground'
  },
  running: {
    icon: Clock,
    label: 'Ejecutando...',
    className: 'text-muted-foreground animate-pulse'
  },
  success: {
    icon: CheckCircle2,
    label: 'Completado',
    className: 'text-muted-foreground'
  },
  error: {
    icon: XCircle,
    label: 'Error',
    className: 'text-muted-foreground'
  }
};

// ═══════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════

/**
 * ToolCall - Componente de visualización de llamadas a herramientas
 *
 * Diseño: Desplegable sutil que se integra en el flujo del mensaje
 * Patrón: Similar a reasoning.tsx (Collapsible)
 *
 * Estados:
 * - Colapsado (default): Solo icono + nombre en gris
 * - Expandido: Muestra argumentos, resultado y metadata
 * - Running: Indicador "Ejecutando..." con pulse
 * - Error: Indicador sutil, detalles en content
 *
 * @param toolCall - Datos de la tool call (ver ToolCallData)
 */
export function ToolCall({ toolCall, className }: ToolCallProps) {
  const [isOpen, setIsOpen] = useState(false);
  const statusInfo = statusConfig[toolCall.status];
  const StatusIcon = statusInfo.icon;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('not-prose my-2', className)}
    >
      {/* TRIGGER: Línea sutil colapsable */}
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-2 text-muted-foreground text-sm',
          'hover:text-foreground transition-colors',
          'w-full text-left group'
        )}
      >
        {/* Icono de herramienta */}
        <Wrench className="w-3.5 h-3.5 flex-shrink-0" />

        {/* Nombre de la tool */}
        <span className="font-medium">{toolCall.name}</span>

        {/* Indicador de estado (solo si running/error) */}
        {(toolCall.status === 'running' || toolCall.status === 'error') && (
          <span className="text-xs flex items-center gap-1">
            <StatusIcon className={cn('w-3 h-3', statusInfo.className)} />
            {statusInfo.label}
          </span>
        )}

        {/* Chevron indicador */}
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 ml-auto transition-transform',
            isOpen ? 'rotate-180' : 'rotate-0'
          )}
        />
      </CollapsibleTrigger>

      {/* CONTENT: Detalles expandibles */}
      <CollapsibleContent
        className={cn(
          'mt-2 ml-5', // Indentación para alinear con contenido
          'data-[state=closed]:fade-out-0',
          'data-[state=closed]:slide-out-to-top-2',
          'data-[state=open]:slide-in-from-top-2',
          'data-[state=closed]:animate-out',
          'data-[state=open]:animate-in'
        )}
      >
        <div className="rounded-lg bg-muted/30 p-3 space-y-3 text-sm">
          {/* Sección: Arguments */}
          <ArgumentsSection arguments={toolCall.arguments} />

          {/* Sección: Result */}
          {toolCall.result && (
            <ResultSection result={toolCall.result} />
          )}

          {/* Sección: Metadata */}
          <MetadataSection toolCall={toolCall} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ═══════════════════════════════════════════════════════
// SUB-COMPONENTES
// ═══════════════════════════════════════════════════════

function ArgumentsSection({ arguments: args }: { arguments: Record<string, any> }) {
  const argEntries = Object.entries(args);

  if (argEntries.length === 0) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(args, null, 2));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Argumentos
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyToClipboard}
          className="h-6 px-2 text-muted-foreground hover:text-foreground"
        >
          <Copy className="w-3 h-3" />
        </Button>
      </div>

      <div className="space-y-2">
        {argEntries.map(([key, value]) => (
          <div key={key} className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              {key}
            </div>
            <div className="bg-background/50 rounded border border-border/50 p-2">
              <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap overflow-x-auto">
                {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultSection({ result }: { result: NonNullable<ToolCallData['result']> }) {
  const copyToClipboard = () => {
    const content = result.success ? result.content : result.error;
    if (content) {
      navigator.clipboard.writeText(content);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {result.success ? 'Resultado' : 'Error'}
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyToClipboard}
          className="h-6 px-2 text-muted-foreground hover:text-foreground"
        >
          <Copy className="w-3 h-3" />
        </Button>
      </div>

      <div className={cn(
        'rounded border p-2',
        result.success
          ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200/50 dark:border-green-800/50'
          : 'bg-red-50/50 dark:bg-red-950/20 border-red-200/50 dark:border-red-800/50'
      )}>
        <div className="flex items-start gap-2">
          {result.success ? (
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <pre className={cn(
            'text-xs font-mono whitespace-pre-wrap flex-1 overflow-x-auto',
            result.success
              ? 'text-green-800 dark:text-green-200'
              : 'text-red-800 dark:text-red-200'
          )}>
            {result.success
              ? (typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2))
              : (typeof result.error === 'string' ? result.error : JSON.stringify(result.error, null, 2))
            }
          </pre>
        </div>
      </div>
    </div>
  );
}

function MetadataSection({ toolCall }: { toolCall: ToolCallData }) {
  const statusInfo = statusConfig[toolCall.status];
  const StatusIcon = statusInfo.icon;

  return (
    <div className="pt-2 border-t border-border/50">
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <StatusIcon className={cn('w-3 h-3', statusInfo.className)} />
          <span>Estado: {statusInfo.label}</span>
        </div>

        {toolCall.serverId && (
          <div>
            <span className="font-medium">Servidor:</span> {toolCall.serverId}
          </div>
        )}

        {toolCall.timestamp && (
          <div>
            <span className="font-medium">Ejecutado:</span>{' '}
            {new Date(toolCall.timestamp).toLocaleTimeString()}
          </div>
        )}

        <div>
          <span className="font-medium">ID:</span>{' '}
          <span className="font-mono text-[10px]">{toolCall.id.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// COMPONENTE PARA MÚLTIPLES TOOL CALLS
// ═══════════════════════════════════════════════════════

interface ToolCallsProps {
  toolCalls: ToolCallData[];
  className?: string;
}

export function ToolCalls({ toolCalls, className }: ToolCallsProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className={cn('space-y-1', className)}>
      {toolCalls.map((toolCall) => (
        <ToolCall key={toolCall.id} toolCall={toolCall} />
      ))}
    </div>
  );
}
