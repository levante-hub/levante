import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Activity,
  Wrench,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  WrapText,
  Maximize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { useThemeDetector } from '@/hooks/useThemeDetector';

// ═══════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════

export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: {
    success: boolean;
    content?: any; // Can be object, string, number, etc.
    error?: string;
  };
  status: 'pending' | 'running' | 'background' | 'success' | 'error';
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
  background: {
    icon: Activity,
    label: 'En background',
    className: 'text-blue-500 animate-pulse'
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
 * Diseño: Título clickeable que abre un Drawer lateral con los detalles
 * Patrón: Similar a los tool results en Claude Desktop
 *
 * Estados:
 * - Running: Indicador "Ejecutando..." con pulse
 * - Success: Checkmark verde
 * - Error: X roja
 * - Click en título: Abre Drawer con argumentos, resultado y metadata
 *
 * @param toolCall - Datos de la tool call (ver ToolCallData)
 */
export function ToolCall({ toolCall, className }: ToolCallProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const statusInfo = statusConfig[toolCall.status];
  const StatusIcon = statusInfo.icon;

  return (
    <>
      {/* Título clickeable de la tool */}
      <button
        onClick={() => setIsDrawerOpen(true)}
        className={cn(
          'flex items-center gap-2 text-muted-foreground text-sm',
          'hover:text-foreground transition-colors',
          'w-full text-left group my-2 cursor-pointer',
          className
        )}
      >
        {/* Icono de herramienta */}
        <Wrench className="w-3.5 h-3.5 flex-shrink-0" />

        {/* Nombre de la tool */}
        <span className="font-medium">{toolCall.name}</span>

        {/* Indicador de estado */}
        <StatusIcon className={cn('w-3.5 h-3.5 ml-auto', statusInfo.className)} />
      </button>

      {/* Drawer lateral con detalles completos */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent side="right" className="w-[30vw] min-w-[400px] max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 pr-8">
              <Wrench className="w-5 h-5" />
              {toolCall.name}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Sección: Arguments */}
            <ArgumentsSection arguments={toolCall.arguments} />

            {/* Sección: Result */}
            {toolCall.result && (
              <ResultSection result={toolCall.result} />
            )}

            {/* Sección: Metadata */}
            <MetadataSection toolCall={toolCall} />
          </div>
        </SheetContent>
      </Sheet>
    </>
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

function ResultSection({
  result,
}: {
  result: NonNullable<ToolCallData['result']>;
}) {
  const theme = useThemeDetector();
  const [wrapEnabled, setWrapEnabled] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const content = result.success ? result.content : result.error;

  // Vista genérica original (JSON/texto)
  let isJSON = false;
  let contentString = '';

  if (typeof content === 'object' && content !== null) {
    isJSON = true;
    contentString = JSON.stringify(content, null, 2);
  } else if (typeof content === 'string') {
    const trimmed = content.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        isJSON = true;
        contentString = JSON.stringify(parsed, null, 2);
      } catch {
        isJSON = false;
        contentString = content;
      }
    } else {
      contentString = content;
    }
  } else {
    contentString = String(content || '');
  }

  const lineCount = contentString.split('\n').length;
  const adaptiveHeight = Math.min(Math.max(lineCount * 20, 300), 600);
  const fullscreenHeight = Math.min(Math.max(lineCount * 20, 600), 2000);

  const copyToClipboard = () => {
    if (contentString) {
      navigator.clipboard.writeText(contentString);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          {result.success ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
              Resultado
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              Error
            </>
          )}
        </h4>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWrapEnabled(!wrapEnabled)}
            className={cn('gap-2', wrapEnabled && 'bg-accent')}
            title={wrapEnabled ? 'Desactivar ajuste de línea' : 'Activar ajuste de línea'}
          >
            <WrapText className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFullscreenOpen(true)}
            className="gap-2"
            title="Vista completa"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
            <Copy className="w-4 h-4" />
            Copiar
          </Button>
        </div>
      </div>

      <div className="border rounded-md overflow-hidden">
        <CodeMirror
          value={contentString}
          height={`${adaptiveHeight}px`}
          extensions={
            isJSON
              ? wrapEnabled
                ? [json(), EditorView.lineWrapping]
                : [json()]
              : wrapEnabled
                ? [EditorView.lineWrapping]
                : []
          }
          theme={theme === 'dark' ? oneDark : 'light'}
          editable={false}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: false,
            highlightActiveLine: false,
            foldGutter: true,
            bracketMatching: true,
            autocompletion: false,
          }}
        />
      </div>

      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent className="max-w-[90vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  Resultado - Vista Completa
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  Error - Vista Completa
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex flex-col gap-3 overflow-auto">
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWrapEnabled(!wrapEnabled)}
                className={cn('gap-2', wrapEnabled && 'bg-accent')}
                title={wrapEnabled ? 'Desactivar ajuste de línea' : 'Activar ajuste de línea'}
              >
                <WrapText className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
                <Copy className="w-4 h-4" />
                Copiar
              </Button>
            </div>

            <div className="border rounded-md overflow-hidden">
              <CodeMirror
                value={contentString}
                height={`${fullscreenHeight}px`}
                extensions={
                  isJSON
                    ? wrapEnabled
                      ? [json(), EditorView.lineWrapping]
                      : [json()]
                    : wrapEnabled
                      ? [EditorView.lineWrapping]
                      : []
                }
                theme={theme === 'dark' ? oneDark : 'light'}
                editable={false}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: false,
                  highlightActiveLine: false,
                  foldGutter: true,
                  bracketMatching: true,
                  autocompletion: false,
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
