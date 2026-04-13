# Plan de Implementación: Background Conversations

**Referencia:** [PDR - Background Conversations](./background-conversations.md)  
**Fecha:** 2026-04-12  
**Estado:** Pendiente de implementación

---

## Resumen de Decisiones (Open Questions resueltas)

| Pregunta | Decisión |
|---|---|
| Límite de streams simultáneos | 3, no configurable por usuario, sí en código fuente |
| Duración de notificaciones | Duración normal (sonner default ~5s) para que el usuario pueda leerla |
| Indicador en sidebar | Solo spinner |
| Comportamiento al cerrar app | El stream se apaga, no debe continuar si la app no está abierta |
| Tool approvals en background | Aparece un indicador de pregunta en lugar de spinner, para que el usuario sepa que debe entrar a aprobar |
| Compaction/Context | Sí, cada conversación en background respeta su context budget independiente |

---

## Arquitectura General

El cambio central es **desacoplar el ciclo de vida del streaming del ciclo de vida de `ChatPage`**. Actualmente:

```
ChatPage (useChat) → ElectronChatTransport → preload/chat.ts → IPC → chatHandlers.ts → aiService.ts
```

El problema: cuando `ChatPage` cambia de sesión, `useChat` se resetea, `ElectronChatTransport` pierde sus listeners IPC, y el stream en el main process sigue enviando chunks a un listener que ya no existe.

### Solución: Buffer de chunks en Main Process + Background Stream Manager en Renderer

```
┌─────────────────────────────────────────────────────────────┐
│ MAIN PROCESS                                                │
│                                                             │
│  chatHandlers.ts                                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ activeStreams Map                                     │   │
│  │  streamId → { cancel, sessionId, chunks[], status,  │   │
│  │               completedMessage, error }              │   │
│  └──────────────────────────────────────────────────────┘   │
│  • Siempre envía chunks via IPC (como ahora)                │
│  • TAMBIÉN almacena chunks en buffer por sessionId          │
│  • Notifica estado: started, chunk, completed, error        │
│  • Persiste mensaje completo en DB al terminar              │
└─────────────────────────────────────────────────────────────┘
                          │ IPC
┌─────────────────────────────────────────────────────────────┐
│ RENDERER                                                    │
│                                                             │
│  backgroundStreamStore (nuevo Zustand store)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ activeBackgroundStreams: Map<sessionId, {            │   │
│  │   streamId, status, preview, title,                  │   │
│  │   needsApproval }> │   │
│  └──────────────────────────────────────────────────────┘   │
│  • Escucha eventos IPC globales de background streams       │
│  • Muestra spinners en sidebar                              │
│  • Muestra notificaciones toast al completar                │
│                                                             │
│  ChatPage (useChat)                                         │
│  • Al navegar a sesión con stream activo → reconecta        │
│  • Al navegar fuera de sesión con stream → no cancela       │
└─────────────────────────────────────────────────────────────┘
```

---

## Fases de Implementación

### Fase 1: Main Process — Buffer de chunks y persistencia independiente

**Objetivo:** Que el main process pueda completar un stream y persistir el resultado aunque el renderer no esté escuchando.

#### 1.1 Modificar `src/main/ipc/chatHandlers.ts`

**Cambios:**

1. **Ampliar `activeStreams` Map** para incluir metadata del stream:

```typescript
// ANTES
const activeStreams = new Map<string, { cancel: () => void }>();

// DESPUÉS
interface ActiveStream {
  cancel: () => void;
  sessionId: string;
  status: 'streaming' | 'completed' | 'error' | 'approval-needed';
  chunks: ChatStreamChunk[];         // Buffer de todos los chunks
  completedMessage: string;          // Texto completo acumulado
  error?: string;
  startedAt: number;
  toolApproval?: any;                // Datos de tool approval pendiente
}

const activeStreams = new Map<string, ActiveStream>();

// Índice inverso: sessionId → streamId (para buscar por sesión)
const sessionToStream = new Map<string, string>();

// Límite máximo de streams simultáneos
const MAX_CONCURRENT_STREAMS = 3;
```

2. **Modificar `handleChatStream`** para:
   - Recibir `sessionId` como parte del request (o como parámetro separado)
   - Almacenar chunks en buffer
   - Acumular texto completo
   - Enviar evento de estado por IPC channel dedicado
   - Persistir mensaje en DB al completar (llamando a `DatabaseService`)
   - Rechazar si ya hay `MAX_CONCURRENT_STREAMS` activos

```typescript
async function handleChatStream(
  event: IpcMainInvokeEvent,
  request: ChatRequest & { sessionId?: string }
): Promise<{ streamId: string } | { error: string }> {
  // Verificar límite de streams simultáneos
  if (activeStreams.size >= MAX_CONCURRENT_STREAMS) {
    return { error: 'max_concurrent_streams_reached' };
  }

  const streamId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const sessionId = request.sessionId || null;
  
  let isCancelled = false;

  const streamData: ActiveStream = {
    cancel: () => { isCancelled = true; },
    sessionId: sessionId || '',
    status: 'streaming',
    chunks: [],
    completedMessage: '',
    startedAt: Date.now(),
  };

  activeStreams.set(streamId, streamData);
  if (sessionId) {
    sessionToStream.set(sessionId, streamId);
  }

  // Notificar al renderer que el stream inició
  event.sender.send('levante/chat/background-stream-status', {
    streamId,
    sessionId,
    status: 'streaming',
  });

  setImmediate(async () => {
    try {
      let fullText = '';

      for await (const chunk of aiService.streamChat(request)) {
        if (isCancelled) {
          streamData.status = 'completed'; // cancelled = completed
          event.sender.send(`levante/chat/stream/${streamId}`, {
            error: 'Stream cancelled by user',
            done: true,
          });
          break;
        }

        // Almacenar chunk en buffer
        streamData.chunks.push(chunk);
        if (chunk.delta) {
          fullText += chunk.delta;
          streamData.completedMessage = fullText;
        }

        // Detectar tool approval
        if (chunk.toolApproval) {
          streamData.status = 'approval-needed';
          streamData.toolApproval = chunk.toolApproval;
          event.sender.send('levante/chat/background-stream-status', {
            streamId,
            sessionId,
            status: 'approval-needed',
            toolApproval: chunk.toolApproval,
          });
        }

        // Enviar chunk al renderer (como siempre)
        event.sender.send(`levante/chat/stream/${streamId}`, chunk);

        if (chunk.done) {
          streamData.status = 'completed';

          // Notificar que terminó
          event.sender.send('levante/chat/background-stream-status', {
            streamId,
            sessionId,
            status: 'completed',
            preview: fullText.substring(0, 100),
          });
          break;
        }
      }
    } catch (error) {
      streamData.status = 'error';
      streamData.error = error instanceof Error ? error.message : 'Stream error';

      event.sender.send(`levante/chat/stream/${streamId}`, {
        error: streamData.error,
        done: true,
      });

      event.sender.send('levante/chat/background-stream-status', {
        streamId,
        sessionId,
        status: 'error',
        error: streamData.error,
      });
    } finally {
      activeStreams.delete(streamId);
      if (sessionId) {
        sessionToStream.delete(sessionId);
      }
    }
  });

  return { streamId };
}
```

3. **Agregar nuevos IPC handlers:**

```typescript
// Consultar estado de todos los background streams activos
ipcMain.handle('levante/chat/background-streams', () => {
  const streams: Array<{
    streamId: string;
    sessionId: string;
    status: string;
    preview: string;
  }> = [];

  for (const [streamId, data] of activeStreams) {
    streams.push({
      streamId,
      sessionId: data.sessionId,
      status: data.status,
      preview: data.completedMessage.substring(0, 100),
    });
  }

  return { success: true, data: streams };
});

// Obtener chunks buffered para reconexión
ipcMain.handle('levante/chat/background-stream-chunks', 
  (_event, streamId: string) => {
    const stream = activeStreams.get(streamId);
    if (!stream) {
      return { success: false, error: 'Stream not found' };
    }
    return {
      success: true,
      data: {
        chunks: stream.chunks,
        status: stream.status,
        completedMessage: stream.completedMessage,
      },
    };
  }
);

// Buscar stream activo por sessionId
ipcMain.handle('levante/chat/stream-for-session',
  (_event, sessionId: string) => {
    const streamId = sessionToStream.get(sessionId);
    if (!streamId) {
      return { success: false };
    }
    const stream = activeStreams.get(streamId);
    return {
      success: true,
      data: {
        streamId,
        status: stream?.status,
        chunks: stream?.chunks || [],
        completedMessage: stream?.completedMessage || '',
      },
    };
  }
);
```

#### 1.2 Modificar `src/main/services/aiService.ts`

**Sin cambios directos.** El `aiService.streamChat()` ya es un async generator desacoplado. No necesita modificaciones.

---

### Fase 2: Preload — Nuevos canales IPC

#### 2.1 Modificar `src/preload/api/chat.ts`

**Agregar nuevas funciones:**

```typescript
// Nuevo: escuchar eventos de estado de background streams
onBackgroundStreamStatus: (
  callback: (status: {
    streamId: string;
    sessionId: string;
    status: 'streaming' | 'completed' | 'error' | 'approval-needed';
    preview?: string;
    error?: string;
    toolApproval?: any;
  }) => void
) => {
  const handler = (_event: any, data: any) => callback(data);
  ipcRenderer.on('levante/chat/background-stream-status', handler);
  return () => {
    ipcRenderer.removeListener('levante/chat/background-stream-status', handler);
  };
},

// Nuevo: obtener lista de background streams activos
getBackgroundStreams: () =>
  ipcRenderer.invoke('levante/chat/background-streams'),

// Nuevo: obtener chunks de un stream para reconexión
getBackgroundStreamChunks: (streamId: string) =>
  ipcRenderer.invoke('levante/chat/background-stream-chunks', streamId),

// Nuevo: buscar stream activo por sessionId
getStreamForSession: (sessionId: string) =>
  ipcRenderer.invoke('levante/chat/stream-for-session', sessionId),
```

#### 2.2 Modificar `src/preload/preload.ts`

**Exponer las nuevas APIs en `contextBridge`:**

Agregar las nuevas funciones del `chatApi` en el bloque correspondiente de `contextBridge.exposeInMainWorld`.

---

### Fase 3: Renderer — Background Stream Store

#### 3.1 Crear `src/renderer/stores/backgroundStreamStore.ts` (NUEVO)

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

export type BackgroundStreamStatus = 
  'streaming' | 'completed' | 'error' | 'approval-needed';

export interface BackgroundStream {
  streamId: string;
  sessionId: string;
  status: BackgroundStreamStatus;
  preview: string;          // Preview del texto generado (primeros ~100 chars)
  sessionTitle: string;     // Título de la sesión (para notificaciones)
  error?: string;
  startedAt: number;
}

interface BackgroundStreamStore {
  // Estado
  streams: Map<string, BackgroundStream>;
  
  // Acciones
  addStream: (stream: BackgroundStream) => void;
  updateStreamStatus: (sessionId: string, status: BackgroundStreamStatus, extra?: Partial<BackgroundStream>) => void;
  removeStream: (sessionId: string) => void;
  getStreamForSession: (sessionId: string) => BackgroundStream | undefined;
  isSessionStreaming: (sessionId: string) => boolean;
  
  // Inicialización: suscribe a eventos IPC
  initialize: () => () => void;  // Retorna cleanup function
}

export const useBackgroundStreamStore = create<BackgroundStreamStore>()(
  devtools(
    (set, get) => ({
      streams: new Map(),

      addStream: (stream) => {
        set((state) => {
          const newStreams = new Map(state.streams);
          newStreams.set(stream.sessionId, stream);
          return { streams: newStreams };
        });
      },

      updateStreamStatus: (sessionId, status, extra) => {
        set((state) => {
          const newStreams = new Map(state.streams);
          const existing = newStreams.get(sessionId);
          if (existing) {
            newStreams.set(sessionId, { ...existing, status, ...extra });
          }
          return { streams: newStreams };
        });
      },

      removeStream: (sessionId) => {
        set((state) => {
          const newStreams = new Map(state.streams);
          newStreams.delete(sessionId);
          return { streams: newStreams };
        });
      },

      getStreamForSession: (sessionId) => {
        return get().streams.get(sessionId);
      },

      isSessionStreaming: (sessionId) => {
        const stream = get().streams.get(sessionId);
        return stream?.status === 'streaming' || stream?.status === 'approval-needed';
      },

      initialize: () => {
        // Suscribirse a eventos de estado de background streams
        const cleanup = window.levante.onBackgroundStreamStatus((data) => {
          const { sessionId, status, preview, error, toolApproval } = data;

          logger.core.info('Background stream status update', { sessionId, status });

          if (status === 'streaming') {
            // Stream empezó en background — ya fue añadido por ChatPage
            return;
          }

          if (status === 'completed') {
            const stream = get().streams.get(sessionId);
            if (stream) {
              get().updateStreamStatus(sessionId, 'completed', { preview });
              
              // Mostrar notificación toast
              // (Se importa toast de sonner)
              showBackgroundCompletedToast(stream.sessionTitle, preview || '');
              
              // Limpiar después de un delay
              setTimeout(() => get().removeStream(sessionId), 10000);
            }
          }

          if (status === 'error') {
            get().updateStreamStatus(sessionId, 'error', { error });
          }

          if (status === 'approval-needed') {
            get().updateStreamStatus(sessionId, 'approval-needed');
          }
        });

        return cleanup;
      },
    }),
    { name: 'background-stream-store' }
  )
);
```

#### 3.2 Función de notificación toast

Crear un componente custom para la notificación o usar `toast.custom` de sonner:

```typescript
// En backgroundStreamStore.ts o en un archivo separado
import { toast } from 'sonner';

function showBackgroundCompletedToast(title: string, preview: string) {
  toast.success(title, {
    description: preview.length > 80 ? preview.substring(0, 80) + '...' : preview,
    duration: 5000,
    action: {
      label: 'Ver',
      onClick: () => {
        // Navegar a la sesión — disparar evento custom
        window.dispatchEvent(
          new CustomEvent('navigate-to-session', { detail: { sessionId } })
        );
      },
    },
  });
}
```

---

### Fase 4: Renderer — Modificar ChatPage para no cancelar streams al salir

#### 4.1 Modificar `src/renderer/pages/ChatPage.tsx`

**Cambio clave:** Cuando el usuario navega fuera de una sesión con stream activo, en lugar de cancelar el stream, se registra en el `backgroundStreamStore`.

**Modificaciones en el useEffect de cambio de sesión** (línea ~842):

```typescript
// Load messages when session changes
useEffect(() => {
  const currentSessionId = currentSession?.id || null;
  const previousSessionId = previousSessionIdRef.current;

  if (currentSessionId === previousSessionId) return;

  // ── NUEVO: Si la sesión anterior tenía streaming activo, moverla a background ──
  if (previousSessionId && (status === 'streaming' || status === 'submitted')) {
    const { addStream } = useBackgroundStreamStore.getState();
    const previousSession = sessions.find(s => s.id === previousSessionId);
    
    addStream({
      streamId: (globalThis as any)._currentStreamId || '',
      sessionId: previousSessionId,
      status: 'streaming',
      preview: '',
      sessionTitle: previousSession?.title || 'Untitled Chat',
      startedAt: Date.now(),
    });

    // NO cancelar el stream — dejarlo correr en background
    // NO llamar a stop()
    logger.core.info('Stream moved to background', { sessionId: previousSessionId });
  }

  // Update ref
  previousSessionIdRef.current = currentSessionId;

  // ── NUEVO: Si la nueva sesión tiene un stream activo en background, reconectar ──
  if (currentSessionId) {
    const bgStream = useBackgroundStreamStore.getState().getStreamForSession(currentSessionId);
    if (bgStream && bgStream.status === 'streaming') {
      // Reconectar: obtener chunks acumulados del main process
      reconnectToBackgroundStream(currentSessionId);
      return; // No cargar historical messages, se cargarán desde el buffer
    }
  }

  // ... resto del código existente de carga de mensajes históricos ...
}, [currentSession?.id, ...]);
```

**Nueva función de reconexión:**

```typescript
const reconnectToBackgroundStream = useCallback(async (sessionId: string) => {
  try {
    setIsLoadingMessages(true);
    
    // 1. Cargar mensajes históricos de la DB
    const historical = await loadHistoricalMessages(sessionId);
    
    // 2. Obtener chunks acumulados del background stream
    const result = await window.levante.getStreamForSession(sessionId);
    
    if (result.success && result.data) {
      // 3. Reconstruir el mensaje parcial del asistente desde los chunks
      // Los mensajes históricos incluyen todo lo persistido
      // El stream activo tiene chunks desde el último mensaje persistido
      setMessages(historical);
      
      // 4. Re-suscribir el transport al stream IPC existente
      // El stream sigue enviando chunks en el IPC channel levante/chat/stream/{streamId}
      // Necesitamos que ElectronChatTransport re-escuche ese channel
      
      // 5. Remover del backgroundStreamStore
      useBackgroundStreamStore.getState().removeStream(sessionId);
    }
    
    setIsLoadingMessages(false);
  } catch (error) {
    logger.core.error('Failed to reconnect to background stream', { error });
    setIsLoadingMessages(false);
  }
}, [loadHistoricalMessages, setMessages]);
```

#### 4.2 Modificar `src/renderer/transports/ElectronChatTransport.ts`

**Implementar `reconnectToStream`** (actualmente retorna `null`):

```typescript
/**
 * Reconecta a un stream existente que está corriendo en background.
 * Reproduce los chunks acumulados y luego escucha nuevos chunks en tiempo real.
 */
async reconnectToStream(options: {
  streamId: string;
  bufferedChunks: ChatStreamChunk[];
}): Promise<ReadableStream<UIMessageChunk> | null> {
  const { streamId, bufferedChunks } = options;

  this.hasStartedTextPart = false;
  this.currentTextPartId = `text-${Date.now()}`;
  this.lastErrorCategory = undefined;
  this.lastTokenUsage = null;

  return new ReadableStream<UIMessageChunk>({
    start: async (controller) => {
      this.currentController = controller;

      // 1. Reproducir chunks buffered
      for (const chunk of bufferedChunks) {
        for (const uiChunk of this.convertChunkToUIMessageChunks(chunk)) {
          controller.enqueue(uiChunk);
        }
        if (chunk.done) {
          controller.close();
          this.currentController = null;
          return;
        }
      }

      // 2. Suscribirse a nuevos chunks del stream en curso
      const { ipcRenderer } = window.require('electron');
      // Nota: usar window.levante para escuchar, no ipcRenderer directamente
      
      const handleChunk = (_event: any, chunk: ChatStreamChunk) => {
        try {
          if (chunk.tokenUsage) {
            this.lastTokenUsage = chunk.tokenUsage;
            return;
          }
          for (const uiChunk of this.convertChunkToUIMessageChunks(chunk)) {
            controller.enqueue(uiChunk);
          }
          if (chunk.done) {
            controller.close();
            this.currentController = null;
          }
        } catch (error) {
          controller.error(error);
          this.currentController = null;
        }
      };

      // Escuchar nuevos chunks en el channel existente
      window.levante.onStreamChunk(streamId, handleChunk);
    },
  });
}
```

#### 4.3 Modificar `src/preload/api/chat.ts`

**Eliminar la limpieza agresiva de listeners** al inicio de `streamChat`:

```typescript
// ANTES: Limpiaba todos los listeners de streams anteriores
// DESPUÉS: Solo limpiar el listener del stream que se está iniciando
streamChat: async (request: ChatRequest, onChunk: (chunk: ChatStreamChunk) => void) => {
  // NO limpiar listeners de otros streams — pueden ser background streams activos
  
  const { streamId } = await ipcRenderer.invoke('levante/chat/stream', request);
  // ...
}
```

**Agregar función para escuchar chunks de un stream específico (para reconexión):**

```typescript
onStreamChunk: (streamId: string, callback: (event: any, chunk: ChatStreamChunk) => void) => {
  ipcRenderer.on(`levante/chat/stream/${streamId}`, callback);
  return () => {
    ipcRenderer.removeListener(`levante/chat/stream/${streamId}`, callback);
  };
},
```

---

### Fase 5: UI — Spinner en Sidebar

#### 5.1 Modificar `src/renderer/components/chat/ChatListContent.tsx`

**Agregar prop para background streams y mostrar spinner:**

```typescript
// Nuevas props
export interface ChatListContentProps {
  // ... props existentes ...
  backgroundStreamSessionIds?: Set<string>; // IDs de sesiones con stream activo
  backgroundStreamStatuses?: Map<string, BackgroundStreamStatus>; // Estado por sesión
}
```

**Modificar `renderSession`** para mostrar spinner:

```typescript
const renderSession = (session: ChatSession) => {
  const isBackgroundStreaming = backgroundStreamSessionIds?.has(session.id);
  const bgStatus = backgroundStreamStatuses?.get(session.id);

  return (
    <div key={session.id} className={cn(/* ... */)}>
      <div className="flex items-center gap-2 p-1">
        <div className="flex-1 min-w-0">
          {/* ... título existente ... */}
        </div>

        {/* Indicador de background stream */}
        {isBackgroundStreaming && bgStatus === 'streaming' && (
          <div 
            className="shrink-0 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            title={t('chat_list.background_streaming')}
          />
        )}
        {isBackgroundStreaming && bgStatus === 'approval-needed' && (
          <div 
            className="shrink-0 h-4 w-4 flex items-center justify-center text-warning"
            title={t('chat_list.needs_approval')}
          >
            <AlertCircle size={14} />
          </div>
        )}
        {isBackgroundStreaming && bgStatus === 'error' && (
          <div 
            className="shrink-0 h-4 w-4 flex items-center justify-center text-destructive"
            title={t('chat_list.background_error')}
          >
            <XCircle size={14} />
          </div>
        )}

        {/* ... dropdown menu existente ... */}
      </div>
    </div>
  );
};
```

#### 5.2 Modificar `src/renderer/components/sidebar/SidebarSections.tsx`

**Pasar estado de background streams a `ChatListContent`:**

```typescript
import { useBackgroundStreamStore } from '@/stores/backgroundStreamStore';

export function SidebarSections({ /* ... */ }) {
  // Suscribirse al store de background streams
  const bgStreams = useBackgroundStreamStore((state) => state.streams);
  
  const backgroundStreamSessionIds = useMemo(() => {
    return new Set(bgStreams.keys());
  }, [bgStreams]);

  const backgroundStreamStatuses = useMemo(() => {
    const map = new Map<string, BackgroundStreamStatus>();
    for (const [sessionId, stream] of bgStreams) {
      map.set(sessionId, stream.status);
    }
    return map;
  }, [bgStreams]);

  return (
    <div className="flex flex-col h-full">
      {/* ... */}
      <ChatListContent 
        {...chatListProps} 
        searchQuery={searchQuery}
        backgroundStreamSessionIds={backgroundStreamSessionIds}
        backgroundStreamStatuses={backgroundStreamStatuses}
      />
    </div>
  );
}
```

---

### Fase 6: UI — Notificaciones Toast

#### 6.1 Crear `src/renderer/components/chat/BackgroundStreamToast.tsx` (NUEVO)

Componente personalizado para la notificación toast:

```typescript
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';

interface BackgroundStreamToastProps {
  sessionId: string;
  sessionTitle: string;
  preview: string;
  onNavigate: (sessionId: string) => void;
}

export function showBackgroundStreamCompletedToast({
  sessionId,
  sessionTitle,
  preview,
  onNavigate,
}: BackgroundStreamToastProps) {
  toast(sessionTitle, {
    description: preview.length > 80 ? preview.substring(0, 80) + '...' : preview,
    icon: <MessageSquare size={16} />,
    duration: 5000,
    action: {
      label: 'Open',
      onClick: () => onNavigate(sessionId),
    },
  });
}

export function showBackgroundStreamErrorToast({
  sessionTitle,
  error,
}: {
  sessionTitle: string;
  error: string;
}) {
  toast.error(`${sessionTitle}`, {
    description: error,
    duration: 5000,
  });
}
```

#### 6.2 Modificar `src/renderer/App.tsx`

**Inicializar el `backgroundStreamStore` y manejar navegación desde toasts:**

```typescript
import { useBackgroundStreamStore } from '@/stores/backgroundStreamStore';

function App() {
  // ... código existente ...

  // Inicializar background stream listener
  useEffect(() => {
    const cleanup = useBackgroundStreamStore.getState().initialize();
    return cleanup;
  }, []);

  // Escuchar navegación desde toasts de background streams
  useEffect(() => {
    const handleNavigateToSession = (event: CustomEvent) => {
      const { sessionId } = event.detail;
      handleLoadSession(sessionId);
    };

    window.addEventListener('navigate-to-session', handleNavigateToSession as EventListener);
    return () => {
      window.removeEventListener('navigate-to-session', handleNavigateToSession as EventListener);
    };
  }, [handleLoadSession]);

  // ... resto ...
}
```

---

### Fase 7: Persistencia de mensajes en background

#### 7.1 Modificar `src/main/ipc/chatHandlers.ts`

**Persistir el mensaje del asistente en DB al completar el stream en background:**

Actualmente la persistencia ocurre en el `onFinish` de `useChat` en `ChatPage.tsx`. Para background streams, el main process debe hacer la persistencia directamente.

```typescript
// En el finally del streaming loop (handleChatStream):
if (streamData.status === 'completed' && sessionId) {
  try {
    // Persistir mensaje del asistente en DB
    const db = getDatabaseService(); // O importar el servicio
    await db.createMessage({
      session_id: sessionId,
      role: 'assistant',
      content: fullText,
      tool_calls: extractToolCallsFromChunks(streamData.chunks),
      // Nota: razonamientos y attachments también deben extraerse de los chunks
      input_tokens: tokenUsage?.inputTokens ?? null,
      output_tokens: tokenUsage?.outputTokens ?? null,
      total_tokens: tokenUsage?.totalTokens ?? null,
    });

    logger.aiSdk.info('Background stream message persisted to DB', {
      sessionId,
      streamId,
      contentLength: fullText.length,
    });
  } catch (error) {
    logger.aiSdk.error('Failed to persist background stream message', {
      sessionId,
      error: error instanceof Error ? error.message : error,
    });
  }
}
```

**Importante:** Cuando el usuario **sí** está observando la conversación (no es background), la persistencia sigue ocurriendo desde `ChatPage` via `onFinish`. Solo se persiste desde el main process cuando es un stream en background que completó sin observador.

Para esto, añadir un flag `isBackground` al stream:

```typescript
interface ActiveStream {
  // ... campos existentes ...
  isBackground: boolean;  // true cuando el usuario navegó fuera
}
```

El renderer notifica al main process cuando un stream pasa a background:

```typescript
// Nuevo IPC handler
ipcMain.handle('levante/chat/mark-stream-background', 
  (_event, streamId: string) => {
    const stream = activeStreams.get(streamId);
    if (stream) {
      stream.isBackground = true;
      return { success: true };
    }
    return { success: false };
  }
);
```

---

### Fase 8: Traducciones

#### 8.1 Modificar `src/renderer/locales/en/chat.json`

```json
{
  "chat_list": {
    "background_streaming": "Processing in background...",
    "needs_approval": "Needs tool approval",
    "background_error": "Background processing failed",
    "background_completed": "Finished processing",
    "background_completed_description": "Click to view the response",
    "max_background_streams": "Maximum background conversations reached ({{max}})"
  }
}
```

#### 8.2 Modificar `src/renderer/locales/es/chat.json`

```json
{
  "chat_list": {
    "background_streaming": "Procesando en segundo plano...",
    "needs_approval": "Necesita aprobación de herramienta",
    "background_error": "Error en procesamiento en segundo plano",
    "background_completed": "Procesamiento terminado",
    "background_completed_description": "Haz click para ver la respuesta",
    "max_background_streams": "Máximo de conversaciones en segundo plano alcanzado ({{max}})"
  }
}
```

---

## Resumen de Archivos Afectados

| Archivo | Tipo de cambio | Descripción |
|---|---|---|
| `src/main/ipc/chatHandlers.ts` | **Modificar** | Buffer de chunks, estado de streams, persistencia background, nuevos IPC handlers |
| `src/preload/api/chat.ts` | **Modificar** | Nuevas funciones IPC: background status, reconexión, no limpiar listeners agresivamente |
| `src/preload/preload.ts` | **Modificar** | Exponer nuevas APIs en contextBridge |
| `src/renderer/stores/backgroundStreamStore.ts` | **Crear** | Nuevo Zustand store para gestionar background streams |
| `src/renderer/components/chat/BackgroundStreamToast.tsx` | **Crear** | Componente de notificación toast para streams completados |
| `src/renderer/pages/ChatPage.tsx` | **Modificar** | No cancelar streams al navegar, reconexión, registrar background streams |
| `src/renderer/transports/ElectronChatTransport.ts` | **Modificar** | Implementar `reconnectToStream` |
| `src/renderer/components/chat/ChatListContent.tsx` | **Modificar** | Mostrar spinner/indicador de estado por sesión |
| `src/renderer/components/sidebar/SidebarSections.tsx` | **Modificar** | Pasar estado de background streams al ChatListContent |
| `src/renderer/App.tsx` | **Modificar** | Inicializar backgroundStreamStore, manejar navegación desde toasts |
| `src/renderer/locales/en/chat.json` | **Modificar** | Nuevas traducciones (background streaming) |
| `src/renderer/locales/es/chat.json` | **Modificar** | Nuevas traducciones (background streaming) |

---

## Orden de Implementación Recomendado

1. **Fase 1** — Main Process: Buffer + estado (chatHandlers.ts) — Es la base de todo
2. **Fase 2** — Preload: Nuevos canales IPC — Necesario para que el renderer se comunique
3. **Fase 3** — Renderer: backgroundStreamStore — Gestión de estado en frontend
4. **Fase 4** — Renderer: ChatPage + Transport — No cancelar streams, reconexión
5. **Fase 5** — UI: Spinner en sidebar — Feedback visual
6. **Fase 6** — UI: Notificaciones toast — Feedback de completado
7. **Fase 7** — Persistencia background — Garantizar que DB quede consistente
8. **Fase 8** — Traducciones — Últimos detalles de i18n

---

## Riesgos y Puntos de Atención

1. **Memory leaks**: Los chunks buffered en `activeStreams` pueden acumular mucha memoria si el stream es largo. Considerar un límite de buffer (ej: mantener solo los últimos N chunks y confiar en la DB para el resto).

2. **Race conditions**: El momento exacto en que el usuario navega fuera/dentro de una sesión con stream activo es crítico. Usar transiciones atómicas en el store.

3. **Persistencia dual**: Hay que evitar que el mensaje se persista dos veces (una vez desde ChatPage y otra desde el main process). El flag `isBackground` es clave.

4. **IPC listeners**: Actualmente `chat.ts` limpia agresivamente todos los listeners de streams. Esto **romperá** los background streams. Cambiar a limpieza selectiva.

5. **Transport lifecycle**: `ElectronChatTransport` está ligado a una instancia de `useChat`. Al reconectar, hay que asegurar que el nuevo transport puede escuchar chunks del stream existente.

6. **Tool approvals**: Cuando un stream en background necesita aprobación, el usuario debe ser notificado visualmente (cambio de spinner a icono de alerta). Al entrar a la sesión, la UI de aprobación debe mostrarse normalmente.
