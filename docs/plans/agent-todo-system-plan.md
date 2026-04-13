# Runbook de Implementacion: Sistema de To-Dos del Agente

> Fecha: 2026-04-09
> Estado: Corregido para el codigo actual del repo
> Objetivo: permitir que el agente en Cowork mode cree, liste, consulte y actualice tareas de trabajo asociadas a la sesion de chat activa, con persistencia en SQLite y sincronizacion en tiempo real hacia el renderer.

---

## Veredicto

El plan original no era aplicable tal cual. Este documento lo sustituye con un runbook completo y ejecutable sobre la arquitectura actual de Levante.

Las correcciones clave son:

- `sessionId` debe propagarse end-to-end desde `useChat` hasta `aiService`.
- Todas las operaciones de lectura/escritura de todos deben ir scoped por `sessionId`.
- La limpieza al borrar una sesion debe quedar cerrada, con FK y limpieza defensiva manual.
- Los nuevos tools deben quedar habilitados por defecto dentro de `getCodingTools()`.
- La integracion de UI debe respetar el flujo real de `ChatPage`, `ElectronChatTransport`, preload e i18n.

---

## Scope del MVP

Se implementa:

- Persistencia SQLite de todos por sesion de chat.
- 4 AI tools de uso interno del agente:
  - `todo_create`
  - `todo_list`
  - `todo_get`
  - `todo_update`
- Sincronizacion main -> renderer via IPC push (`levante/todos:updated`).
- Panel de tareas en la vista de chat.
- Instrucciones de system prompt para que el agente use los tools.

No se implementa en este MVP:

- Dependencias entre tareas (`blocks` / `blockedBy`)
- Drag and drop de reordenacion
- Edicion manual de tareas desde la UI
- Multi-agent / swarms
- Hooks de lifecycle
- Filtros avanzados por status o busqueda

Si algo no aparece en este runbook, no forma parte de la implementacion.

---

## Decisiones de Diseno

| Tema | Decision |
|------|----------|
| Persistencia | SQLite via `databaseService` |
| Scope | Todos por `session_id`, siempre asociados a una conversacion concreta |
| IDs | `crypto.randomUUID()` |
| Sincronizacion UI | Evento IPC push + `list(sessionId)` |
| Integracion AI | Nuevos tools dentro de `src/main/services/ai/codingTools` |
| Renderer | Panel propio en `ChatPage`, independiente de `BackgroundTasksDropdown` |
| Limpieza | `FOREIGN KEY ... ON DELETE CASCADE` + borrado defensivo manual en `chatService.deleteSession()` |
| Seguridad logica | `get` y `update` siempre scoped por `sessionId`, nunca solo por `id` |

---

## Arquitectura Final

```text
Renderer
  ChatPage.tsx
    -> useTodoSync(currentSession?.id)
    -> TodoPanel
    -> window.levante.todos.list(sessionId)
    -> window.levante.todos.onUpdated(...)

Preload
  todos.ts
    -> ipcRenderer.invoke('levante/todos:list', sessionId)
    -> ipcRenderer.on('levante/todos:updated', ...)

Main
  todoHandlers.ts
    -> todoService.list(sessionId)
    -> registra el notificador global de cambios

  todoEvents.ts
    -> setTodoNotifier(fn)
    -> notifyTodosUpdated(sessionId)

  todoService.ts
    -> create / list / getBySession / updateBySession / deleteBySession

  codingTools
    -> todo_create
    -> todo_list
    -> todo_get
    -> todo_update

SQLite
  agent_todos(session_id -> chat_sessions.id)
```

---

## Orden de Implementacion

1. Modelo de datos y tipos compartidos
2. Servicio de negocio
3. Bus de notificaciones de todos
4. AI tools
5. Registro en `codingTools`
6. Propagacion de `sessionId` por transport/preload/main
7. IPC de lectura + eventos
8. Integracion de limpieza al borrar sesion
9. Store y hook de sincronizacion en renderer
10. Panel UI + i18n
11. System prompt
12. Tests

---

## Fase 1: Modelo de Datos

### 1.1 Migracion DB

Archivo: `src/main/services/databaseService.ts`

Agregar migracion `version: 11` al final de `getMigrations()`.

```ts
{
  version: 11,
  name: 'Add agent todos table',
  queries: [
    `CREATE TABLE IF NOT EXISTS agent_todos (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      active_form TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'in_progress', 'completed')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_todos_session_sort
      ON agent_todos(session_id, sort_order, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_todos_status
      ON agent_todos(status)`
  ]
}
```

Notas:

- El `FOREIGN KEY` es obligatorio.
- Aunque exista `ON DELETE CASCADE`, mas adelante se hara limpieza defensiva manual al borrar sesion.
- `sort_order` se mantiene para futuro reordering, pero en MVP solo se usa como orden de insercion.

### 1.2 Tipos compartidos

Archivo nuevo: `src/types/todos.ts`

```ts
export type AgentTodoStatus = 'pending' | 'in_progress' | 'completed';

export interface AgentTodo {
  id: string;
  sessionId: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: AgentTodoStatus;
  sortOrder: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface CreateTodoInput {
  sessionId: string;
  subject: string;
  description: string;
  activeForm?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateTodoInput {
  subject?: string;
  description?: string;
  activeForm?: string | null;
  status?: AgentTodoStatus | 'deleted';
  metadata?: Record<string, unknown>;
}

export interface TodoListItem {
  id: string;
  subject: string;
  activeForm?: string;
  status: AgentTodoStatus;
  sortOrder: number;
}

export interface TodoListResult {
  todos: TodoListItem[];
  counts: {
    pending: number;
    inProgress: number;
    completed: number;
    total: number;
  };
}
```

---

## Fase 2: Servicio de Negocio

Archivo nuevo: `src/main/services/todoService.ts`

### API del servicio

Implementar estos metodos:

- `create(input: CreateTodoInput): Promise<AgentTodo>`
- `list(sessionId: string): Promise<TodoListResult>`
- `getBySession(todoId: string, sessionId: string): Promise<AgentTodo | null>`
- `updateBySession(todoId: string, sessionId: string, input: UpdateTodoInput): Promise<AgentTodo | null>`
- `deleteBySession(sessionId: string): Promise<number>`

### Reglas obligatorias

- Usar `crypto.randomUUID()`, no agregar dependencia `uuid`.
- `get` y `update` no deben existir en version global por `id`; el scope por sesion es obligatorio.
- Antes de borrar por `status: 'deleted'`, hay que cargar el todo scoped por sesion para saber si existe y para poder notificar correctamente.
- Si el status cambia a `completed`, setear `completed_at = now`.
- Si el status cambia a otro valor distinto de `completed`, limpiar `completed_at = NULL`.
- El orden de listado debe ser `ORDER BY sort_order ASC, created_at ASC, id ASC`.

### Implementacion de referencia

```ts
import { databaseService } from './databaseService';
import { getLogger } from './logging';
import type {
  AgentTodo,
  AgentTodoStatus,
  CreateTodoInput,
  UpdateTodoInput,
  TodoListResult,
} from '../../types/todos';

const logger = getLogger();

class TodoService {
  async create(input: CreateTodoInput): Promise<AgentTodo> {
    const now = Date.now();
    const id = crypto.randomUUID();

    const maxResult = await databaseService.execute(
      'SELECT COALESCE(MAX(sort_order), 0) FROM agent_todos WHERE session_id = ?',
      [input.sessionId]
    );
    const maxOrder = Number(maxResult.rows[0]?.[0] ?? 0);
    const sortOrder = maxOrder + 1;

    await databaseService.execute(
      `INSERT INTO agent_todos (
        id, session_id, subject, description, active_form, status,
        sort_order, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        id,
        input.sessionId,
        input.subject,
        input.description,
        input.activeForm ?? null,
        sortOrder,
        input.metadata ? JSON.stringify(input.metadata) : null,
        now,
        now,
      ]
    );

    logger.database.debug('Todo created', { id, sessionId: input.sessionId });
    return {
      id,
      sessionId: input.sessionId,
      subject: input.subject,
      description: input.description,
      activeForm: input.activeForm,
      status: 'pending',
      sortOrder,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getBySession(todoId: string, sessionId: string): Promise<AgentTodo | null> {
    const result = await databaseService.execute(
      'SELECT * FROM agent_todos WHERE id = ? AND session_id = ?',
      [todoId, sessionId]
    );
    if (result.rows.length === 0) return null;
    return this.rowToTodo(result.rows[0] as Record<string, unknown>);
  }

  async list(sessionId: string): Promise<TodoListResult> {
    const result = await databaseService.execute(
      `SELECT * FROM agent_todos
       WHERE session_id = ?
       ORDER BY sort_order ASC, created_at ASC, id ASC`,
      [sessionId]
    );

    const todos = result.rows.map((row) => {
      const todo = this.rowToTodo(row as Record<string, unknown>);
      return {
        id: todo.id,
        subject: todo.subject,
        activeForm: todo.activeForm,
        status: todo.status,
        sortOrder: todo.sortOrder,
      };
    });

    return {
      todos,
      counts: {
        pending: todos.filter((t) => t.status === 'pending').length,
        inProgress: todos.filter((t) => t.status === 'in_progress').length,
        completed: todos.filter((t) => t.status === 'completed').length,
        total: todos.length,
      },
    };
  }

  async updateBySession(
    todoId: string,
    sessionId: string,
    input: UpdateTodoInput
  ): Promise<AgentTodo | null> {
    const existing = await this.getBySession(todoId, sessionId);
    if (!existing) return null;

    if (input.status === 'deleted') {
      await databaseService.execute(
        'DELETE FROM agent_todos WHERE id = ? AND session_id = ?',
        [todoId, sessionId]
      );
      return null;
    }

    const now = Date.now();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.subject !== undefined) {
      updates.push('subject = ?');
      values.push(input.subject);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description);
    }
    if (input.activeForm !== undefined) {
      updates.push('active_form = ?');
      values.push(input.activeForm);
    }
    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
      updates.push('completed_at = ?');
      values.push(input.status === 'completed' ? now : null);
    }
    if (input.metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(JSON.stringify(input.metadata));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(todoId, sessionId);

    await databaseService.execute(
      `UPDATE agent_todos SET ${updates.join(', ')}
       WHERE id = ? AND session_id = ?`,
      values
    );

    return this.getBySession(todoId, sessionId);
  }

  async deleteBySession(sessionId: string): Promise<number> {
    const result = await databaseService.execute(
      'DELETE FROM agent_todos WHERE session_id = ?',
      [sessionId]
    );
    return Number(result.rowsAffected ?? 0);
  }

  private rowToTodo(row: Record<string, unknown>): AgentTodo {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      subject: row.subject as string,
      description: (row.description as string) ?? '',
      activeForm: (row.active_form as string | null) ?? undefined,
      status: row.status as AgentTodoStatus,
      sortOrder: Number(row.sort_order),
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
    };
  }
}

export const todoService = new TodoService();
```

---

## Fase 3: Notificaciones de Cambio

Archivo nuevo: `src/main/services/todoEvents.ts`

Este modulo centraliza la notificacion para evitar acoplar el IPC a cada tool por separado.

```ts
let notifyImpl: ((sessionId: string) => void) | null = null;

export function setTodoNotifier(fn: (sessionId: string) => void) {
  notifyImpl = fn;
}

export function notifyTodosUpdated(sessionId: string) {
  notifyImpl?.(sessionId);
}
```

Regla:

- Los tools AI y los handlers IPC solo llaman `notifyTodosUpdated(sessionId)`.
- Solo `todoHandlers.ts` registra el callback real.

---

## Fase 4: AI Tools

Archivos nuevos:

- `src/main/services/ai/codingTools/tools/todo-create.ts`
- `src/main/services/ai/codingTools/tools/todo-list.ts`
- `src/main/services/ai/codingTools/tools/todo-get.ts`
- `src/main/services/ai/codingTools/tools/todo-update.ts`

### 4.1 `todo_create`

- Requiere `sessionId` en config.
- Crea el todo con `todoService.create(...)`.
- Notifica con `notifyTodosUpdated(config.sessionId)`.

### 4.2 `todo_list`

- Lista los todos de la sesion actual.

### 4.3 `todo_get`

- Debe llamar `todoService.getBySession(todoId, config.sessionId)`.
- No debe existir acceso cross-session.

### 4.4 `todo_update`

- Debe llamar `todoService.updateBySession(todoId, config.sessionId, input)`.
- Si `status === 'deleted'`, primero debe cargarse el todo existente scoped por sesion; si no existe, devolver error de negocio.
- Debe notificar siempre solo si el todo pertenecia a la sesion actual.

### Input schema sugerido

```ts
z.object({
  todoId: z.string().optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
  activeForm: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'deleted']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
```

Notas:

- `todo_create` no recibe `todoId`.
- `todo_list` no recibe input.
- `todo_get` recibe solo `todoId`.
- `todo_update` recibe `todoId` obligatorio y los demas campos opcionales.

---

## Fase 5: Registro en Coding Tools

Archivo: `src/main/services/ai/codingTools/index.ts`

### Cambios obligatorios

1. Agregar `sessionId?: string` a `CodingToolsConfig`.
2. Agregar flags nuevos al tipo `enabled`.
3. Agregar defaults nuevos en `const enabled = { ... }`.
4. Registrar los 4 tools solo si existe `config.sessionId`.

### Defaults requeridos

```ts
const enabled = {
  bash: true,
  read: true,
  write: true,
  edit: true,
  grep: true,
  find: true,
  ls: true,
  taskOutput: true,
  killTask: true,
  listTasks: true,
  todoCreate: true,
  todoList: true,
  todoGet: true,
  todoUpdate: true,
  ...config.enabled,
};
```

### Registro

```ts
if (config.sessionId && enabled.todoCreate) {
  tools.todo_create = createTodoCreateTool({ sessionId: config.sessionId });
}
if (config.sessionId && enabled.todoList) {
  tools.todo_list = createTodoListTool({ sessionId: config.sessionId });
}
if (config.sessionId && enabled.todoGet) {
  tools.todo_get = createTodoGetTool({ sessionId: config.sessionId });
}
if (config.sessionId && enabled.todoUpdate) {
  tools.todo_update = createTodoUpdateTool({ sessionId: config.sessionId });
}
```

---

## Fase 6: Propagacion de `sessionId`

Esta es una de las correcciones mas importantes del plan.

### 6.1 Tipos de request

Archivos:

- `src/preload/types/index.ts`
- `src/main/services/aiService.ts`

Agregar:

```ts
sessionId?: string;
```

a `ChatRequest`.

### 6.2 Transport del renderer

Archivo: `src/renderer/transports/ElectronChatTransport.ts`

No hay que pasar `sessionId` manualmente desde cada `sendMessageAI(...)`.
Hay que reutilizar el `chatId` que ya entrega `useChat`.

Dentro de `sendMessages(...)`, al construir el request:

```ts
const request: ChatRequest = {
  messages: contextMessages,
  model,
  enableMCP,
  ...(chatId !== 'new-chat' && { sessionId: chatId }),
  ...(coworkMode && coworkModeCwd && {
    codeMode: {
      enabled: true,
      cwd: coworkModeCwd,
    },
  }),
  ...(projectDescription && { projectDescription }),
  ...(projectId && { projectContext: { projectId } }),
};
```

Notas:

- No cambiar `ChatPage` para inyectar `sessionId` en `body`.
- La primera interaccion ya esta resuelta por el flujo actual: cuando no existe sesion, se crea primero y el mensaje pendiente se envia despues.

### 6.3 Paso a `getCodingTools()`

Archivo: `src/main/services/aiService.ts`

Cuando se construyen las coding tools:

```ts
const codingTools = getCodingTools({
  cwd: validCwd,
  sessionId: request.sessionId,
  enabled: request.codeMode.tools,
});
```

---

## Fase 7: IPC y Preload

### 7.1 IPC handlers

Archivo nuevo: `src/main/ipc/todoHandlers.ts`

El renderer solo necesita:

- `levante/todos:list`
- evento push `levante/todos:updated`

Implementacion:

```ts
import { ipcMain, BrowserWindow } from 'electron';
import { todoService } from '../services/todoService';
import { setTodoNotifier } from '../services/todoEvents';
import { getLogger } from '../services/logging';

const logger = getLogger();

function ok<T>(data: T) {
  return { success: true as const, data };
}

function fail(error: unknown) {
  return {
    success: false as const,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function setupTodoHandlers(getMainWindow: () => BrowserWindow | null): void {
  setTodoNotifier((sessionId: string) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
      return;
    }
    win.webContents.send('levante/todos:updated', { sessionId });
  });

  ipcMain.removeHandler('levante/todos:list');
  ipcMain.handle('levante/todos:list', async (_, sessionId: string) => {
    try {
      if (!sessionId || typeof sessionId !== 'string') {
        return fail('Invalid sessionId');
      }
      return ok(await todoService.list(sessionId));
    } catch (error) {
      logger.ipc.error('Failed to list todos', { error: String(error), sessionId });
      return fail(error);
    }
  });

  logger.ipc.info('Todo handlers registered');
}
```

### 7.2 Registro en initialization

Archivo: `src/main/lifecycle/initialization.ts`

- Importar `setupTodoHandlers`
- Ejecutarlo junto al resto de handlers app-level

```ts
setupTaskHandlers(getMainWindow);
setupTodoHandlers(getMainWindow);
setupProjectHandlers();
```

### 7.3 Preload API

Archivo nuevo: `src/preload/api/todos.ts`

```ts
import { ipcRenderer } from 'electron';

export const todosApi = {
  list: (sessionId: string) =>
    ipcRenderer.invoke('levante/todos:list', sessionId),

  onUpdated: (callback: (data: { sessionId: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string }) => {
      callback(data);
    };
    ipcRenderer.on('levante/todos:updated', handler);
    return () => ipcRenderer.removeListener('levante/todos:updated', handler);
  },
};
```

### 7.4 Exposicion en preload

Archivo: `src/preload/preload.ts`

Cambios:

- importar `todosApi`
- agregar `todos: typeof todosApi;` a `LevanteAPI`
- exponer `todos: todosApi` dentro del objeto `api`

---

## Fase 8: Limpieza al Borrar Sesion

Archivo: `src/main/services/chatService.ts`

Aunque exista FK con cascade, este paso sigue siendo obligatorio porque el codigo actual no explicita `PRAGMA foreign_keys = ON` en runtime y queremos consistencia defensiva.

Modificar `deleteSession(id: string)` para:

1. borrar todos de la sesion
2. borrar la sesion

Implementacion recomendada:

```ts
async deleteSession(id: string): Promise<DatabaseResult<boolean>> {
  try {
    await todoService.deleteBySession(id);
    await databaseService.execute(
      'DELETE FROM chat_sessions WHERE id = ?',
      [id as InValue]
    );
    return { data: true, success: true };
  } catch (error) {
    ...
  }
}
```

Importar `todoService` al inicio del archivo.

---

## Fase 9: Estado en Renderer

### 9.1 Store

Archivo nuevo: `src/renderer/stores/todoStore.ts`

Reglas del store:

- Mantener solo el estado necesario para renderizar el panel.
- No implementar auto-collapse temporizado en MVP.
- Al cambiar de sesion, resetear el estado si `sessionId` es `null`.

```ts
import { create } from 'zustand';
import type { TodoListResult } from '../../types/todos';

type IPCResult<T> = { success: boolean; data?: T; error?: string };

const initialCounts = { pending: 0, inProgress: 0, completed: 0, total: 0 };

function unwrapResult<T>(result: IPCResult<T>, fallback: string): T {
  if (!result.success || result.data === undefined) {
    throw new Error(result.error || fallback);
  }
  return result.data;
}

interface TodoStoreState {
  todos: TodoListResult['todos'];
  counts: TodoListResult['counts'];
  loading: boolean;
  error: string | null;
  expanded: boolean;
  currentSessionId: string | null;
  fetchTodos: (sessionId: string) => Promise<void>;
  setExpanded: (expanded: boolean) => void;
  setCurrentSession: (sessionId: string | null) => void;
  reset: () => void;
}

export const useTodoStore = create<TodoStoreState>((set) => ({
  todos: [],
  counts: initialCounts,
  loading: false,
  error: null,
  expanded: false,
  currentSessionId: null,

  fetchTodos: async (sessionId: string) => {
    set({ loading: true, error: null });
    try {
      const result = await window.levante.todos.list(sessionId);
      const data = unwrapResult<TodoListResult>(result, 'Failed to fetch todos');
      set({
        todos: data.todos,
        counts: data.counts,
        loading: false,
        expanded: data.counts.total > 0 ? true : false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch todos',
      });
    }
  },

  setExpanded: (expanded) => set({ expanded }),
  setCurrentSession: (currentSessionId) => set({ currentSessionId }),
  reset: () =>
    set({
      todos: [],
      counts: initialCounts,
      loading: false,
      error: null,
      expanded: false,
      currentSessionId: null,
    }),
}));
```

### 9.2 Hook de sincronizacion

Archivo nuevo: `src/renderer/hooks/useTodoSync.ts`

```ts
import { useEffect } from 'react';
import { useTodoStore } from '../stores/todoStore';

export function useTodoSync(sessionId: string | null) {
  const fetchTodos = useTodoStore((s) => s.fetchTodos);
  const setCurrentSession = useTodoStore((s) => s.setCurrentSession);
  const reset = useTodoStore((s) => s.reset);

  useEffect(() => {
    if (!sessionId) {
      reset();
      return;
    }

    setCurrentSession(sessionId);
    void fetchTodos(sessionId);

    const unsubscribe = window.levante.todos.onUpdated((data) => {
      if (data.sessionId === sessionId) {
        void fetchTodos(sessionId);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [sessionId, fetchTodos, setCurrentSession, reset]);
}
```

---

## Fase 10: UI del Chat

### 10.1 Componente `TodoPanel`

Archivo nuevo: `src/renderer/components/chat/TodoPanel.tsx`

Requisitos:

- Leer estado desde `useTodoStore`
- No renderizar si `counts.total === 0`
- Mostrar iconos por estado
- Mostrar `activeForm` cuando el todo esta `in_progress`
- Usar i18n

```tsx
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useTodoStore } from '@/stores/todoStore';
import { cn } from '@/lib/utils';

export function TodoPanel() {
  const { t } = useTranslation('chat');
  const { todos, counts, expanded, setExpanded } = useTodoStore();

  if (counts.total === 0) return null;

  return (
    <div className="border-b border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span>{t('todo_panel.title')}</span>
        <span className="ml-auto flex items-center gap-2 text-xs">
          {counts.inProgress > 0 && (
            <span className="flex items-center gap-1 text-blue-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              {counts.inProgress}
            </span>
          )}
          {counts.pending > 0 && (
            <span>{t('todo_panel.pending', { count: counts.pending })}</span>
          )}
          <span className="text-green-600">
            {t('todo_panel.completed_ratio', {
              completed: counts.completed,
              total: counts.total,
            })}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="space-y-1 px-4 pb-3">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className={cn(
                'flex items-center gap-2 py-1 text-sm',
                todo.status === 'completed' && 'text-muted-foreground line-through'
              )}
            >
              {todo.status === 'completed' && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
              )}
              {todo.status === 'in_progress' && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
              )}
              {todo.status === 'pending' && (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">
                {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.subject}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 10.2 Integracion en `ChatPage`

Archivo: `src/renderer/pages/ChatPage.tsx`

Cambios:

- importar `useTodoSync`
- importar `TodoPanel`
- montar `useTodoSync(currentSession?.id ?? null)` dentro de `ChatPage`
- renderizar `<TodoPanel />` dentro de la rama de conversacion, encima de `ConversationContent`

Patron recomendado:

```tsx
const currentSessionId = currentSession?.id ?? null;
useTodoSync(currentSessionId);
```

Y en JSX:

```tsx
<Conversation className="flex-1">
  <TodoPanel />
  <ConversationContent ...>
    ...
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
```

No tocar `BackgroundTasksDropdown`. Son dos conceptos distintos:

- `BackgroundTasksDropdown`: procesos shell en background
- `TodoPanel`: plan de trabajo del agente

### 10.3 i18n

Archivos:

- `src/renderer/locales/en/chat.json`
- `src/renderer/locales/es/chat.json`

Agregar:

```json
"todo_panel": {
  "title": "Tasks",
  "pending": "{{count}} pending",
  "completed_ratio": "{{completed}}/{{total}}"
}
```

```json
"todo_panel": {
  "title": "Tareas",
  "pending": "{{count}} pendientes",
  "completed_ratio": "{{completed}}/{{total}}"
}
```

---

## Fase 11: System Prompt

Archivo: `src/main/services/ai/systemPromptBuilder.ts`

El prompt no debe depender solo de que exista code mode; debe depender de que los tools de todos hayan sido registrados.

### Cambio de firma

Agregar un parametro:

```ts
todoToolsEnabled: boolean = false
```

Firma final:

```ts
export async function buildSystemPrompt(
  webSearch: boolean,
  enableMCP: boolean,
  toolCount: number,
  mermaidValidation: boolean = true,
  mcpDiscoveryEnabled: boolean = true,
  projectDescription?: string,
  skills?: InstalledSkill[],
  codeModePrompt?: string | null,
  todoToolsEnabled: boolean = false
): Promise<string>
```

### Instrucciones

Agregar despues de inyectar `codeModePrompt`:

```ts
if (todoToolsEnabled) {
  systemPrompt += `

TASK TRACKING:
You have access to todo management tools (todo_create, todo_list, todo_get, todo_update).

Use them for multi-step work in Cowork mode.
- Create tasks before starting complex work.
- Mark one task as in_progress when you start it.
- Mark tasks as completed immediately when finished.
- Keep task subjects short and imperative.
- Do not create todos for trivial one-step actions.
`;
}
```

### Call sites en `aiService.ts`

En streaming y en single-message:

```ts
const todoToolsEnabled =
  'todo_create' in tools &&
  'todo_list' in tools &&
  'todo_get' in tools &&
  'todo_update' in tools;
```

Pasar ese boolean a `buildSystemPrompt(...)`.

---

## Fase 12: Tests

### Unit tests obligatorios

1. `todoService`
   - crea un todo
   - lista por sesion
   - `getBySession` no devuelve un todo de otra sesion
   - `updateBySession` no actualiza un todo de otra sesion
   - marcar `completed` setea `completedAt`
   - volver a `pending` limpia `completedAt`
   - `deleteBySession` elimina todos los de la sesion

2. AI tools
   - `todo_create` crea y notifica
   - `todo_list` lista solo la sesion actual
   - `todo_get` falla si el todo no pertenece a la sesion
   - `todo_update` falla si el todo no pertenece a la sesion

3. Transport
   - `ElectronChatTransport` envia `sessionId = chatId` cuando `chatId !== 'new-chat'`
   - no envia `sessionId` para `new-chat`

### Integration tests recomendados

1. La migracion v11 se aplica correctamente.
2. Al borrar una sesion se limpian sus todos.
3. Un chat en Cowork mode crea y actualiza todos y el renderer recibe `levante/todos:updated`.

---

## Resumen de Archivos

### Nuevos

- `src/types/todos.ts`
- `src/main/services/todoService.ts`
- `src/main/services/todoEvents.ts`
- `src/main/ipc/todoHandlers.ts`
- `src/preload/api/todos.ts`
- `src/main/services/ai/codingTools/tools/todo-create.ts`
- `src/main/services/ai/codingTools/tools/todo-list.ts`
- `src/main/services/ai/codingTools/tools/todo-get.ts`
- `src/main/services/ai/codingTools/tools/todo-update.ts`
- `src/renderer/stores/todoStore.ts`
- `src/renderer/hooks/useTodoSync.ts`
- `src/renderer/components/chat/TodoPanel.tsx`

### Modificados

- `src/main/services/databaseService.ts`
- `src/main/services/ai/codingTools/index.ts`
- `src/main/services/aiService.ts`
- `src/main/services/chatService.ts`
- `src/main/services/ai/systemPromptBuilder.ts`
- `src/main/lifecycle/initialization.ts`
- `src/preload/types/index.ts`
- `src/preload/preload.ts`
- `src/renderer/transports/ElectronChatTransport.ts`
- `src/renderer/pages/ChatPage.tsx`
- `src/renderer/locales/en/chat.json`
- `src/renderer/locales/es/chat.json`

---

## Checklist de Aceptacion

- [ ] Los tools aparecen en Cowork mode con `sessionId` valido
- [ ] El agente puede crear, listar, consultar y actualizar todos
- [ ] Ningun todo puede leerse o modificarse desde otra sesion
- [ ] Al borrar una sesion no quedan todos huerfanos
- [ ] El panel se actualiza sin polling
- [ ] La UI no rompe `BackgroundTasksDropdown`
- [ ] El prompt instruye correctamente al agente a usar los todos
- [ ] Hay tests de servicio, tools y transporte
