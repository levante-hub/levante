# Plan de Implementación v2: Background Conversations

**Referencia:** [PDR - Background Conversations](./background-conversations.md)  
**Fecha:** 2026-04-12  
**Estado:** Pendiente de implementación

---

## Decisiones (Open Questions resueltas)

| Pregunta | Decisión |
|---|---|
| Límite de streams simultáneos | 3, no configurable por usuario, sí en código fuente |
| Duración de notificaciones | Duración normal (~5s) |
| Indicador en sidebar | Solo spinner |
| Comportamiento al cerrar app | El stream se apaga |
| Tool approvals en background | Icono de alerta en lugar de spinner; el usuario debe entrar a aprobar |
| Compaction/Context | Sí, context budget independiente por conversación |

---

## Principio de diseño

> **El main process es el único dueño del ciclo de vida del stream y de la persistencia de mensajes.**  
> El renderer es un viewer que se suscribe y desuscribe.

Esto significa:
- La persistencia ocurre **siempre** en el main process — no hay lógica dual ni flag `isBackground`
- El renderer nunca cancela un stream por navegar fuera — solo desuscribe sus listeners
- Cuando el renderer vuelve a una sesión con stream activo, usa `reconnectToStream` de AI SDK
- El buffer de chunks vive en el main process como fuente de verdad única

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│ MAIN PROCESS                                                 │
│                                                              │
│  StreamManager (nuevo servicio)                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ streams: Map<sessionId, ManagedStream>                 │  │
│  │                                                        │  │
│  │ ManagedStream {                                        │  │
│  │   streamId, sessionId, status,                         │  │
│  │   chunks[], fullText, tokenUsage,                      │  │
│  │   toolCalls[], reasoning, generatedAttachments,        │  │
│  │   subscribers: Set<WebContents>                        │  │
│  │ }                                                      │  │
│  └────────────────────────────────────────────────────────┘  │
│  • Consume aiService.streamChat()                            │
│  • Almacena chunks                                           │
│  • Envía chunks a subscribers activos                        │
│  • Persiste mensaje en DB al terminar (via chatService)      │
│  • Emite eventos de estado (started/completed/error/approval)│
│                                                              │
│  chatHandlers.ts                                             │
│  • Delega a StreamManager                                    │
│  • Expone nuevos IPC handlers                                │
└──────────────────────────────────────────────────────────────┘
                         │ IPC
┌──────────────────────────────────────────────────────────────┐
│ RENDERER                                                     │
│                                                              │
│  backgroundStreamStore (nuevo Zustand store)                 │
│  • Escucha eventos de estado del StreamManager               │
│  • Alimenta spinners en sidebar + toasts                     │
│                                                              │
│  ElectronChatTransport                                       │
│  • sendMessages(): suscribe al stream, retorna ReadableStream│
│  • reconnectToStream(): obtiene chunks buffered + suscribe   │
│                                                              │
│  ChatPage                                                    │
│  • Al navegar fuera: desuscribe (no cancela)                 │
│  • Al volver: resumeStream() → reconnectToStream()           │
│  • onFinish: solo UI (token display, mermaid) — NO persiste  │
└──────────────────────────────────────────────────────────────┘
```

---

## Fase 1: StreamManager — Servicio en Main Process

### Crear `src/main/services/streamManager.ts`

Este servicio reemplaza la lógica de gestión de streams que actualmente vive en `chatHandlers.ts`. Es el dueño del ciclo de vida completo de cada stream.

```typescript
import { WebContents } from 'electron';
import { AIService, ChatRequest, ChatStreamChunk } from './aiService';
import { chatService } from './chatService';
import { attachmentStorage } from './attachmentStorage';
import { getLogger } from './logging';

const logger = getLogger();

export type StreamStatus = 'streaming' | 'completed' | 'error' | 'approval-needed';

export interface ManagedStream {
  streamId: string;
  sessionId: string;
  status: StreamStatus;
  chunks: ChatStreamChunk[];
  fullText: string;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  toolCalls: any[];
  reasoning: { text: string; duration?: number } | null;
  generatedAttachments: any[];
  error?: string;
  toolApproval?: any;
  startedAt: number;
  cancel: () => void;
  subscribers: Set<WebContents>;  // Renderers activos escuchando
}

const MAX_CONCURRENT_STREAMS = 3;

class StreamManager {
  private streams = new Map<string, ManagedStream>();
  private aiService = new AIService();
  // WebContents global para enviar eventos de estado (sidebar, toasts)
  private statusSubscribers = new Set<WebContents>();

  /**
   * Inicia un stream para una sesión.
   * Si ya hay un stream activo para esta sesión, lo cancela primero.
   */
  async startStream(
    sessionId: string,
    request: ChatRequest,
    sender: WebContents
  ): Promise<{ streamId: string } | { error: string }> {
    // Verificar límite
    const activeCount = [...this.streams.values()]
      .filter(s => s.status === 'streaming' || s.status === 'approval-needed')
      .length;

    if (activeCount >= MAX_CONCURRENT_STREAMS) {
      return { error: 'max_concurrent_streams_reached' };
    }

    // Cancelar stream previo de esta sesión si existe
    const existing = this.streams.get(sessionId);
    if (existing && (existing.status === 'streaming' || existing.status === 'approval-needed')) {
      existing.cancel();
      this.streams.delete(sessionId);
    }

    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    let isCancelled = false;

    const managed: ManagedStream = {
      streamId,
      sessionId,
      status: 'streaming',
      chunks: [],
      fullText: '',
      tokenUsage: null,
      toolCalls: [],
      reasoning: null,
      generatedAttachments: [],
      startedAt: Date.now(),
      cancel: () => { isCancelled = true; },
      subscribers: new Set([sender]),
    };

    this.streams.set(sessionId, managed);

    // Notificar inicio a status subscribers
    this.emitStatus(sessionId, 'streaming');

    // Iniciar streaming en background
    setImmediate(async () => {
      try {
        for await (const chunk of this.aiService.streamChat(request)) {
          if (isCancelled) {
            this.sendToSubscribers(managed, {
              error: 'Stream cancelled by user',
              done: true,
            });
            managed.status = 'completed';
            break;
          }

          // Acumular datos del chunk
          this.accumulateChunk(managed, chunk);

          // Enviar a subscribers activos
          this.sendToSubscribers(managed, chunk);

          // Detectar tool approval
          if (chunk.toolApproval) {
            managed.status = 'approval-needed';
            managed.toolApproval = chunk.toolApproval;
            this.emitStatus(sessionId, 'approval-needed', {
              toolApproval: chunk.toolApproval,
            });
          }

          if (chunk.done) {
            managed.status = 'completed';
            break;
          }
        }

        // ── Persistir mensaje en DB ──
        if (managed.status === 'completed' && managed.fullText) {
          await this.persistAssistantMessage(managed);
        }

        this.emitStatus(sessionId, 'completed', {
          preview: managed.fullText.substring(0, 100),
        });

      } catch (error) {
        managed.status = 'error';
        managed.error = error instanceof Error ? error.message : 'Stream error';

        this.sendToSubscribers(managed, {
          error: managed.error,
          done: true,
        });

        this.emitStatus(sessionId, 'error', {
          error: managed.error,
        });
      } finally {
        // Limpiar después de un timeout para dar tiempo a reconexión
        setTimeout(() => {
          const current = this.streams.get(sessionId);
          if (current?.streamId === streamId) {
            this.streams.delete(sessionId);
          }
        }, 30_000);
      }
    });

    return { streamId };
  }

  /**
   * Acumula datos de un chunk en el ManagedStream.
   */
  private accumulateChunk(stream: ManagedStream, chunk: ChatStreamChunk): void {
    stream.chunks.push(chunk);

    if (chunk.delta) {
      stream.fullText += chunk.delta;
    }

    if (chunk.tokenUsage) {
      stream.tokenUsage = chunk.tokenUsage;
    }

    if (chunk.toolCall) {
      stream.toolCalls.push(chunk.toolCall);
    }

    if (chunk.toolResult) {
      // Actualizar el toolCall correspondiente con su resultado
      const tc = stream.toolCalls.find(t => t.id === chunk.toolResult!.id);
      if (tc) {
        tc.result = chunk.toolResult.result;
        tc.status = chunk.toolResult.status;
      }
    }

    if (chunk.reasoningText) {
      if (!stream.reasoning) {
        stream.reasoning = { text: '' };
      }
      stream.reasoning.text += chunk.reasoningText;
    }

    if (chunk.generatedAttachment) {
      stream.generatedAttachments.push(chunk.generatedAttachment);
    }
  }

  /**
   * Persiste el mensaje del asistente en DB.
   * Única fuente de persistencia — antes estaba en ChatPage onFinish.
   */
  private async persistAssistantMessage(stream: ManagedStream): Promise<void> {
    try {
      // Guardar generated attachments en disco
      const savedAttachments: any[] = [];
      for (const att of stream.generatedAttachments) {
        try {
          const base64Data = att.dataUrl.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          const result = await attachmentStorage.save(
            stream.sessionId,
            `assistant-${stream.streamId}`,
            buffer,
            att.filename,
            att.mime
          );
          if (result) {
            savedAttachments.push(result);
          }
        } catch (err) {
          logger.aiSdk.error('Failed to save generated attachment', {
            error: err instanceof Error ? err.message : err,
          });
        }
      }

      // Construir tool_calls para DB
      const toolCallsData = stream.toolCalls.length > 0
        ? stream.toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
            result: tc.result,
            status: tc.status === 'success' ? 'success' : tc.status,
          }))
        : null;

      await chatService.createMessage({
        session_id: stream.sessionId,
        role: 'assistant',
        content: stream.fullText,
        tool_calls: toolCallsData,
        attachments: savedAttachments.length > 0 ? savedAttachments : undefined,
        reasoningText: stream.reasoning,
        input_tokens: stream.tokenUsage?.inputTokens ?? null,
        output_tokens: stream.tokenUsage?.outputTokens ?? null,
        total_tokens: stream.tokenUsage?.totalTokens ?? null,
      });

      logger.aiSdk.info('Assistant message persisted by StreamManager', {
        sessionId: stream.sessionId,
        contentLength: stream.fullText.length,
        hasToolCalls: !!toolCallsData,
        hasAttachments: savedAttachments.length > 0,
        hasReasoning: !!stream.reasoning,
      });
    } catch (error) {
      logger.aiSdk.error('StreamManager: failed to persist message', {
        sessionId: stream.sessionId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Envía un chunk a todos los subscribers activos del stream.
   */
  private sendToSubscribers(stream: ManagedStream, chunk: ChatStreamChunk): void {
    for (const subscriber of stream.subscribers) {
      if (!subscriber.isDestroyed()) {
        subscriber.send(`levante/chat/stream/${stream.streamId}`, chunk);
      } else {
        stream.subscribers.delete(subscriber);
      }
    }
  }

  /**
   * Emite un evento de estado a todos los status subscribers (para sidebar/toasts).
   */
  private emitStatus(sessionId: string, status: StreamStatus, extra?: Record<string, any>): void {
    for (const subscriber of this.statusSubscribers) {
      if (!subscriber.isDestroyed()) {
        subscriber.send('levante/chat/background-stream-status', {
          sessionId,
          status,
          ...extra,
        });
      } else {
        this.statusSubscribers.delete(subscriber);
      }
    }
  }

  // ── API pública para IPC handlers ──

  /**
   * Suscribe un renderer a chunks de un stream activo.
   * Usado para reconexión cuando el usuario vuelve a una sesión.
   * Retorna los chunks acumulados + estado actual.
   */
  subscribe(sessionId: string, sender: WebContents): {
    streamId: string;
    status: StreamStatus;
    chunks: ChatStreamChunk[];
  } | null {
    const stream = this.streams.get(sessionId);
    if (!stream) return null;

    stream.subscribers.add(sender);
    return {
      streamId: stream.streamId,
      status: stream.status,
      chunks: stream.chunks,
    };
  }

  /**
   * Desuscribe un renderer de un stream (navegó fuera).
   * NO cancela el stream.
   */
  unsubscribe(sessionId: string, sender: WebContents): void {
    const stream = this.streams.get(sessionId);
    if (stream) {
      stream.subscribers.delete(sender);
    }
  }

  /**
   * Suscribe un renderer a eventos de estado globales (para sidebar/toasts).
   */
  subscribeToStatus(sender: WebContents): void {
    this.statusSubscribers.add(sender);
  }

  cancelStream(sessionId: string): boolean {
    const stream = this.streams.get(sessionId);
    if (stream && (stream.status === 'streaming' || stream.status === 'approval-needed')) {
      stream.cancel();
      return true;
    }
    return false;
  }

  getActiveStreams(): Array<{
    streamId: string;
    sessionId: string;
    status: StreamStatus;
    preview: string;
  }> {
    return [...this.streams.values()]
      .filter(s => s.status === 'streaming' || s.status === 'approval-needed')
      .map(s => ({
        streamId: s.streamId,
        sessionId: s.sessionId,
        status: s.status,
        preview: s.fullText.substring(0, 100),
      }));
  }

  hasActiveStream(sessionId: string): boolean {
    const stream = this.streams.get(sessionId);
    return !!stream && (stream.status === 'streaming' || stream.status === 'approval-needed');
  }

  /**
   * Cancela todos los streams activos. Llamar al cerrar la app.
   */
  cancelAll(): void {
    for (const stream of this.streams.values()) {
      if (stream.status === 'streaming') {
        stream.cancel();
      }
    }
    this.streams.clear();
  }
}

export const streamManager = new StreamManager();
```

---

## Fase 2: Modificar chatHandlers.ts — Delegar a StreamManager

### Modificar `src/main/ipc/chatHandlers.ts`

Reemplazar la lógica local de `activeStreams` por delegación al `StreamManager`.

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { getLogger } from '../services/logging';
import { streamManager } from '../services/streamManager';
import type { ChatRequest } from '../services/aiService';

const logger = getLogger();

export function setupChatHandlers(): void {
  // Stream — delega a StreamManager
  ipcMain.handle('levante/chat/stream', handleChatStream);
  ipcMain.handle('levante/chat/stop-stream', handleStopStream);
  ipcMain.handle('levante/chat/send', handleChatSend);

  // Nuevos handlers para background streams
  ipcMain.handle('levante/chat/subscribe-stream', handleSubscribeStream);
  ipcMain.handle('levante/chat/unsubscribe-stream', handleUnsubscribeStream);
  ipcMain.handle('levante/chat/active-background-streams', handleGetActiveStreams);
  ipcMain.handle('levante/chat/subscribe-status', handleSubscribeStatus);

  logger.core.info('Chat handlers registered successfully');
}

async function handleChatStream(
  event: IpcMainInvokeEvent,
  request: ChatRequest & { sessionId?: string }
): Promise<{ streamId: string } | { error: string }> {
  const sessionId = request.sessionId;
  if (!sessionId) {
    return { error: 'sessionId is required' };
  }

  return streamManager.startStream(sessionId, request, event.sender);
}

async function handleStopStream(
  _event: IpcMainInvokeEvent,
  sessionIdOrStreamId: string
): Promise<{ success: boolean; error?: string }> {
  // Intentar cancelar por sessionId (más natural ahora)
  const cancelled = streamManager.cancelStream(sessionIdOrStreamId);
  return { success: cancelled, error: cancelled ? undefined : 'Stream not found' };
}

/**
 * Suscribirse a un stream activo (reconexión).
 * Retorna chunks acumulados + estado.
 */
async function handleSubscribeStream(
  event: IpcMainInvokeEvent,
  sessionId: string
): Promise<{
  success: boolean;
  data?: { streamId: string; status: string; chunks: any[] };
}> {
  const result = streamManager.subscribe(sessionId, event.sender);
  if (!result) {
    return { success: false };
  }
  return { success: true, data: result };
}

/**
 * Desuscribirse de un stream (navegando fuera).
 */
async function handleUnsubscribeStream(
  event: IpcMainInvokeEvent,
  sessionId: string
): Promise<{ success: boolean }> {
  streamManager.unsubscribe(sessionId, event.sender);
  return { success: true };
}

/**
 * Obtener lista de background streams activos.
 */
async function handleGetActiveStreams(
  _event: IpcMainInvokeEvent
): Promise<{ success: boolean; data: any[] }> {
  return { success: true, data: streamManager.getActiveStreams() };
}

/**
 * Suscribirse a eventos de estado de todos los streams (para sidebar/toasts).
 */
async function handleSubscribeStatus(
  event: IpcMainInvokeEvent
): Promise<{ success: boolean }> {
  streamManager.subscribeToStatus(event.sender);
  return { success: true };
}

// handleChatSend se mantiene igual (no es streaming)
```

### Registrar cleanup al cerrar la app

En `src/main/index.ts` o donde se gestione el ciclo de vida de la app:

```typescript
import { streamManager } from './services/streamManager';

app.on('before-quit', () => {
  streamManager.cancelAll();
});
```

---

## Fase 3: Preload — Nuevas APIs

### Modificar `src/preload/api/chat.ts`

```typescript
export const chatApi = {
  // Existente — modificar para pasar sessionId
  streamChat: async (
    request: ChatRequest & { sessionId?: string },
    onChunk: (chunk: ChatStreamChunk) => void
  ) => {
    // CAMBIO: NO limpiar listeners de otros streams
    // Solo limpiar el listener que vamos a crear
    const { streamId } = await ipcRenderer.invoke('levante/chat/stream', request);

    (globalThis as any)._currentStreamId = streamId;

    return new Promise<string>((resolve, reject) => {
      let fullResponse = '';

      const handleChunk = (_event: any, chunk: ChatStreamChunk) => {
        if (chunk.delta) fullResponse += chunk.delta;
        onChunk(chunk);

        if (chunk.done) {
          ipcRenderer.removeAllListeners(`levante/chat/stream/${streamId}`);
          delete (globalThis as any)._currentStreamId;
          if (chunk.error) reject(new Error(chunk.error));
          else resolve(fullResponse);
        }
      };

      ipcRenderer.on(`levante/chat/stream/${streamId}`, handleChunk);
    });
  },

  // Existente — sin cambios
  stopStreaming: async (sessionId?: string) => {
    // Ahora acepta sessionId en lugar de streamId
    const target = sessionId || (globalThis as any)._currentStreamId;
    if (!target) return { success: false, error: 'No active stream' };

    try {
      ipcRenderer.removeAllListeners(`levante/chat/stream/${target}`);
      const result = await ipcRenderer.invoke('levante/chat/stop-stream', target);
      delete (globalThis as any)._currentStreamId;
      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // ── NUEVAS APIs ──

  /**
   * Suscribirse a un stream activo existente (para reconexión).
   * Retorna chunks acumulados y suscribe a nuevos chunks.
   */
  subscribeToStream: async (sessionId: string, onChunk: (chunk: ChatStreamChunk) => void) => {
    const result = await ipcRenderer.invoke('levante/chat/subscribe-stream', sessionId);

    if (!result.success || !result.data) {
      return { success: false };
    }

    const { streamId, chunks, status } = result.data;

    // Escuchar nuevos chunks
    const handleChunk = (_event: any, chunk: ChatStreamChunk) => {
      onChunk(chunk);
      if (chunk.done) {
        ipcRenderer.removeListener(`levante/chat/stream/${streamId}`, handleChunk);
      }
    };
    ipcRenderer.on(`levante/chat/stream/${streamId}`, handleChunk);

    return {
      success: true,
      data: { streamId, status, bufferedChunks: chunks },
      cleanup: () => {
        ipcRenderer.removeListener(`levante/chat/stream/${streamId}`, handleChunk);
      },
    };
  },

  /**
   * Desuscribirse de un stream sin cancelarlo.
   */
  unsubscribeFromStream: async (sessionId: string) => {
    return ipcRenderer.invoke('levante/chat/unsubscribe-stream', sessionId);
  },

  /**
   * Obtener lista de background streams activos.
   */
  getActiveBackgroundStreams: () =>
    ipcRenderer.invoke('levante/chat/active-background-streams'),

  /**
   * Suscribirse a eventos de estado de background streams (sidebar/toasts).
   */
  onBackgroundStreamStatus: (callback: (data: {
    sessionId: string;
    status: string;
    preview?: string;
    error?: string;
    toolApproval?: any;
  }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('levante/chat/background-stream-status', handler);

    // Suscribirse en main process
    ipcRenderer.invoke('levante/chat/subscribe-status');

    return () => {
      ipcRenderer.removeListener('levante/chat/background-stream-status', handler);
    };
  },
};
```

### Modificar `src/preload/preload.ts`

Exponer las nuevas funciones en `contextBridge.exposeInMainWorld('levante', { ... })`:

```typescript
// Agregar junto a streamChat y stopStreaming:
subscribeToStream: chatApi.subscribeToStream,
unsubscribeFromStream: chatApi.unsubscribeFromStream,
getActiveBackgroundStreams: chatApi.getActiveBackgroundStreams,
onBackgroundStreamStatus: chatApi.onBackgroundStreamStatus,
```

---

## Fase 4: ElectronChatTransport — Reconexión

### Modificar `src/renderer/transports/ElectronChatTransport.ts`

**Cambio 1:** En `sendMessages`, pasar `sessionId` en el request:

```typescript
// En sendMessages, al construir el request:
const request: ChatRequest = {
  messages: contextMessages,
  model,
  enableMCP,
  sessionId: chatId,  // ← NUEVO: pasar el sessionId
  // ... resto igual
};
```

**Cambio 2:** Implementar `reconnectToStream`:

```typescript
/**
 * Reconecta a un stream activo en el main process.
 * AI SDK llama este método vía resumeStream() cuando el usuario
 * vuelve a una sesión con streaming activo.
 */
async reconnectToStream(options: {
  chatId: string;
}): Promise<ReadableStream<UIMessageChunk> | null> {
  const { chatId: sessionId } = options;

  // Preguntar al main process si hay un stream activo para esta sesión
  const result = await window.levante.subscribeToStream(
    sessionId,
    () => {} // placeholder, lo reemplazamos abajo
  );

  if (!result.success || !result.data) {
    return null; // No hay stream activo
  }

  const { streamId, bufferedChunks, status } = result.data;

  // Si ya terminó, no hay stream al que reconectar
  if (status === 'completed' || status === 'error') {
    result.cleanup?.();
    return null;
  }

  // Reset state
  this.hasStartedTextPart = false;
  this.currentTextPartId = `text-${Date.now()}`;
  this.lastErrorCategory = undefined;
  this.lastTokenUsage = null;

  return new ReadableStream<UIMessageChunk>({
    start: async (controller) => {
      this.currentController = controller;

      // Limpiar el placeholder y crear listener real
      result.cleanup?.();

      // 1. Reproducir chunks buffered
      for (const chunk of bufferedChunks) {
        if (chunk.tokenUsage) {
          this.lastTokenUsage = chunk.tokenUsage;
          continue;
        }
        for (const uiChunk of this.convertChunkToUIMessageChunks(chunk)) {
          controller.enqueue(uiChunk);
        }
        if (chunk.done) {
          controller.close();
          this.currentController = null;
          return;
        }
      }

      // 2. Suscribirse a chunks nuevos
      const subscribeResult = await window.levante.subscribeToStream(
        sessionId,
        (chunk: ChatStreamChunk) => {
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
        }
      );

      // Guardar cleanup para cancel
      if (subscribeResult.cleanup) {
        this._reconnectCleanup = subscribeResult.cleanup;
      }
    },

    cancel: async () => {
      this._reconnectCleanup?.();
      // Desuscribir pero NO cancelar el stream
      await window.levante.unsubscribeFromStream(sessionId);
      this.currentController = null;
    },
  });
}

private _reconnectCleanup?: () => void;
```

---

## Fase 5: ChatPage — Desacoplar lifecycle

### Modificar `src/renderer/pages/ChatPage.tsx`

**Cambio 1:** Eliminar persistencia del `onFinish`

```typescript
// ANTES: onFinish persistía el mensaje en DB
// DESPUÉS: onFinish solo hace lógica de UI

onFinish: async ({ message }) => {
  logger.aiSdk.info('AI response finished', {
    sessionId: currentSession?.id,
    messageId: message.id,
  });

  if (currentSession) {
    // Consumir token usage del transport para mostrar en UI
    const tokenUsage = transport.consumeLastTokenUsage();

    // Consumir learned overhead y actualizar EMA (para context budget UI)
    const learnedOverhead = transport.consumeLastLearnedOverheadTokens();
    if (learnedOverhead !== null) {
      updateLearnedOverhead(learnedOverhead);
    }

    // Actualizar mensaje en useChat state con token usage (solo UI)
    if (tokenUsage) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? ({ ...m, tokenUsage } as any) : m
        )
      );
    }

    // Track model usage analytics
    if (model && currentModelInfo) {
      window.levante.analytics?.trackModelUsage?.(model, currentModelInfo.provider).catch(() => {});
    }
  }

  triggerMermaidProcessing();
},
```

> **Nota:** La persistencia del mensaje de usuario también debe moverse al main process. Actualmente `ChatPage` llama `persistMessage(userMessage)` antes de enviar. Este `persistMessage` seguirá existiendo para el mensaje de usuario, pero el mensaje del asistente lo persiste `StreamManager`.

**Cambio 2:** En el useEffect de cambio de sesión, desuscribir en lugar de cancelar

```typescript
useEffect(() => {
  const currentSessionId = currentSession?.id || null;
  const previousSessionId = previousSessionIdRef.current;

  if (currentSessionId === previousSessionId) return;

  // ── Si la sesión anterior tenía streaming activo, desuscribir (no cancelar) ──
  if (previousSessionId && (status === 'streaming' || status === 'submitted')) {
    // Desuscribir del stream — el stream sigue corriendo en main process
    window.levante.unsubscribeFromStream(previousSessionId);

    // Registrar en background store para mostrar spinner en sidebar
    const previousSession = sessions.find(s => s.id === previousSessionId);
    useBackgroundStreamStore.getState().addStream({
      streamId: '', // StreamManager tiene el real
      sessionId: previousSessionId,
      status: 'streaming',
      preview: '',
      sessionTitle: previousSession?.title || 'Untitled Chat',
      startedAt: Date.now(),
    });

    logger.core.info('Stream moved to background', { sessionId: previousSessionId });
  }

  previousSessionIdRef.current = currentSessionId;

  // ── Si la nueva sesión tiene un stream activo, reconectar via resumeStream ──
  if (currentSessionId) {
    const bgStream = useBackgroundStreamStore.getState().getStreamForSession(currentSessionId);
    if (bgStream && (bgStream.status === 'streaming' || bgStream.status === 'approval-needed')) {
      // Cargar mensajes históricos (el de usuario ya está en DB)
      setIsLoadingMessages(true);
      loadHistoricalMessages(currentSessionId)
        .then((msgs) => {
          setMessages(msgs);
          setIsLoadingMessages(false);
          // Remover del background store
          useBackgroundStreamStore.getState().removeStream(currentSessionId);
          // resumeStream() llamará a transport.reconnectToStream()
          // que se suscribirá al stream activo y reproducirá chunks buffered
          resumeStream();
        });
      return;
    }
  }

  // ... resto del código existente de carga de mensajes históricos ...
}, [currentSession?.id, /* ... */]);
```

**Cambio 3:** Extraer `resumeStream` del `useChat` hook:

```typescript
const {
  messages,
  setMessages,
  sendMessage: sendMessageAI,
  status,
  stop,
  error: chatError,
  addToolApprovalResponse,
  resumeStream,        // ← NUEVO: extraer del hook
} = useChat({
  // ...
});
```

---

## Fase 6: backgroundStreamStore — Estado global en Renderer

### Crear `src/renderer/stores/backgroundStreamStore.ts`

```typescript
import { create } from 'zustand';
import { toast } from 'sonner';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

export type BackgroundStreamStatus = 'streaming' | 'completed' | 'error' | 'approval-needed';

export interface BackgroundStream {
  streamId: string;
  sessionId: string;
  status: BackgroundStreamStatus;
  preview: string;
  sessionTitle: string;
  error?: string;
  startedAt: number;
}

interface BackgroundStreamStore {
  streams: Map<string, BackgroundStream>;
  addStream: (stream: BackgroundStream) => void;
  updateStreamStatus: (sessionId: string, status: BackgroundStreamStatus, extra?: Partial<BackgroundStream>) => void;
  removeStream: (sessionId: string) => void;
  getStreamForSession: (sessionId: string) => BackgroundStream | undefined;
  isSessionStreaming: (sessionId: string) => boolean;
  initialize: () => () => void;
}

export const useBackgroundStreamStore = create<BackgroundStreamStore>()(
  (set, get) => ({
    streams: new Map(),

    addStream: (stream) =>
      set((state) => {
        const next = new Map(state.streams);
        next.set(stream.sessionId, stream);
        return { streams: next };
      }),

    updateStreamStatus: (sessionId, status, extra) =>
      set((state) => {
        const next = new Map(state.streams);
        const existing = next.get(sessionId);
        if (existing) {
          next.set(sessionId, { ...existing, status, ...extra });
        }
        return { streams: next };
      }),

    removeStream: (sessionId) =>
      set((state) => {
        const next = new Map(state.streams);
        next.delete(sessionId);
        return { streams: next };
      }),

    getStreamForSession: (sessionId) => get().streams.get(sessionId),

    isSessionStreaming: (sessionId) => {
      const stream = get().streams.get(sessionId);
      return stream?.status === 'streaming' || stream?.status === 'approval-needed';
    },

    /**
     * Suscribirse a eventos de estado del StreamManager en main process.
     * Retorna cleanup function.
     */
    initialize: () => {
      const cleanup = window.levante.onBackgroundStreamStatus((data) => {
        const { sessionId, status, preview, error } = data;
        const stream = get().streams.get(sessionId);

        if (!stream) return; // No es un stream que estemos rastreando

        if (status === 'completed') {
          get().updateStreamStatus(sessionId, 'completed', { preview });

          // Mostrar toast clickeable
          toast(stream.sessionTitle, {
            description: preview && preview.length > 80
              ? preview.substring(0, 80) + '...'
              : preview,
            duration: 5000,
            action: {
              label: 'Open',
              onClick: () => {
                window.dispatchEvent(
                  new CustomEvent('navigate-to-session', { detail: { sessionId } })
                );
              },
            },
          });

          // Limpiar del store después de un rato
          setTimeout(() => get().removeStream(sessionId), 15_000);
        }

        if (status === 'error') {
          get().updateStreamStatus(sessionId, 'error', { error });
          toast.error(stream.sessionTitle, {
            description: error || 'Background processing failed',
            duration: 5000,
          });
        }

        if (status === 'approval-needed') {
          get().updateStreamStatus(sessionId, 'approval-needed');
        }
      });

      // También cargar streams activos que puedan existir (si app se recargó)
      window.levante.getActiveBackgroundStreams?.().then((result: any) => {
        if (result?.success && result.data) {
          for (const stream of result.data) {
            if (!get().streams.has(stream.sessionId)) {
              get().addStream({
                ...stream,
                sessionTitle: '', // Se podría cargar de DB
                startedAt: Date.now(),
              });
            }
          }
        }
      });

      return cleanup;
    },
  })
);
```

---

## Fase 7: UI — Spinner en Sidebar

### Modificar `src/renderer/components/chat/ChatListContent.tsx`

Agregar prop y renderizar indicador:

```typescript
import { useBackgroundStreamStore } from '@/stores/backgroundStreamStore';

// Dentro del componente, acceder directamente al store:
const isSessionStreaming = useBackgroundStreamStore((s) => s.isSessionStreaming);
const streams = useBackgroundStreamStore((s) => s.streams);

// En renderSession, antes del DropdownMenu:
const bgStream = streams.get(session.id);
const isBackground = !!bgStream;

{isBackground && bgStream.status === 'streaming' && (
  <div
    className="shrink-0 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
    title={t('chat_list.background_streaming')}
    onClick={(e) => {
      e.stopPropagation();
      // Click en spinner = navegar a la sesión
      onSessionSelect(session.id);
    }}
  />
)}
{isBackground && bgStream.status === 'approval-needed' && (
  <div
    className="shrink-0 text-amber-500 cursor-pointer"
    title={t('chat_list.needs_approval')}
    onClick={(e) => {
      e.stopPropagation();
      onSessionSelect(session.id);
    }}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
  </div>
)}
{isBackground && bgStream.status === 'error' && (
  <div className="shrink-0 text-destructive" title={t('chat_list.background_error')}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
    </svg>
  </div>
)}
```

> **Nota:** `ChatListContent` accede directamente al store con `useBackgroundStreamStore`. No necesita props adicionales de `SidebarSections`.

---

## Fase 8: App.tsx — Inicialización y navegación

### Modificar `src/renderer/App.tsx`

```typescript
import { useBackgroundStreamStore } from '@/stores/backgroundStreamStore';

function App() {
  // ... existente ...

  // Inicializar background stream listener
  useEffect(() => {
    const cleanup = useBackgroundStreamStore.getState().initialize();
    return cleanup;
  }, []);

  // Navegación desde toasts de background streams
  useEffect(() => {
    const handler = (e: Event) => {
      const { sessionId } = (e as CustomEvent).detail;
      handleLoadSession(sessionId);
    };
    window.addEventListener('navigate-to-session', handler);
    return () => window.removeEventListener('navigate-to-session', handler);
  }, [handleLoadSession]);

  // ... resto ...
}
```

---

## Fase 9: Traducciones

### `src/renderer/locales/en/chat.json`

Agregar dentro de `chat_list`:

```json
"background_streaming": "Processing in background...",
"needs_approval": "Needs tool approval",
"background_error": "Background processing failed",
"max_background_streams": "Maximum background conversations reached ({{max}})"
```

### `src/renderer/locales/es/chat.json`

```json
"background_streaming": "Procesando en segundo plano...",
"needs_approval": "Necesita aprobación de herramienta",
"background_error": "Error en procesamiento en segundo plano",
"max_background_streams": "Máximo de conversaciones en segundo plano alcanzado ({{max}})"
```

---

## Resumen de archivos

| Archivo | Cambio | Descripción |
|---|---|---|
| `src/main/services/streamManager.ts` | **Crear** | Dueño único del ciclo de vida de streams y persistencia |
| `src/main/ipc/chatHandlers.ts` | **Reescribir** | Delegar a StreamManager, nuevos handlers IPC |
| `src/main/index.ts` (o lifecycle) | **Modificar** | `streamManager.cancelAll()` en `before-quit` |
| `src/preload/api/chat.ts` | **Modificar** | Nuevas APIs, eliminar limpieza agresiva de listeners |
| `src/preload/preload.ts` | **Modificar** | Exponer nuevas APIs |
| `src/renderer/stores/backgroundStreamStore.ts` | **Crear** | Estado de background streams para UI |
| `src/renderer/transports/ElectronChatTransport.ts` | **Modificar** | Implementar `reconnectToStream`, pasar `sessionId` |
| `src/renderer/pages/ChatPage.tsx` | **Modificar** | Eliminar persistencia de onFinish, desuscribir en lugar de cancelar, `resumeStream` |
| `src/renderer/components/chat/ChatListContent.tsx` | **Modificar** | Spinner/indicadores de estado |
| `src/renderer/App.tsx` | **Modificar** | Inicializar store, navegación desde toasts |
| `src/renderer/locales/en/chat.json` | **Modificar** | Traducciones |
| `src/renderer/locales/es/chat.json` | **Modificar** | Traducciones |

---

## Orden de implementación

1. **Fase 1** → `StreamManager` — Base de todo
2. **Fase 2** → `chatHandlers.ts` — Conectar StreamManager al IPC
3. **Fase 3** → Preload — APIs nuevas
4. **Fase 4** → Transport — `reconnectToStream` + `sessionId`
5. **Fase 5** → ChatPage — Eliminar persistencia, desuscribir, `resumeStream`
6. **Fase 6** → `backgroundStreamStore` — Estado global UI
7. **Fase 7** → Sidebar — Spinners
8. **Fase 8** → App.tsx — Inicialización y navegación
9. **Fase 9** → Traducciones

**Fases 1-5** son el core funcional. Fases 6-9 son UI y polish.

---

## Diferencias clave vs v1

| Aspecto | v1 (parche) | v2 (correcto) |
|---|---|---|
| Dueño del stream | Renderer (useChat) con backup en main | Main process (StreamManager) siempre |
| Persistencia | Dual: renderer (foreground) + main (background) | Única: siempre en StreamManager |
| Flag `isBackground` | Sí, coordinación frágil | No existe, innecesario |
| Buffer de chunks | Duplicado en main + transport | Solo en StreamManager |
| Reconexión | Reproducción manual de chunks | AI SDK nativo: `resumeStream()` → `reconnectToStream()` |
| Complejidad de coordinación | Alta (race conditions probables) | Baja (fuente de verdad única) |
