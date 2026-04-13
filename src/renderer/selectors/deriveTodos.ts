import type { UIMessage } from 'ai';

export interface DerivedTodo {
  id: string;
  subject: string;
  activeForm?: string;
  status: 'pending' | 'in_progress' | 'completed';
  sortOrder: number;
}

export interface DerivedTodoState {
  todos: DerivedTodo[];
  counts: { pending: number; inProgress: number; completed: number; total: number };
  hasTodoWrite: boolean;
}

const EMPTY: DerivedTodoState = {
  todos: [],
  counts: { pending: 0, inProgress: 0, completed: 0, total: 0 },
  hasTodoWrite: false,
};

/**
 * Walks messages in reverse and returns the todo list from the most recent
 * `todo_write` tool call. Returns empty state if none found.
 */
export function deriveTodosFromMessages(messages: UIMessage[]): DerivedTodoState {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || !Array.isArray(msg.parts)) continue;

    for (let j = msg.parts.length - 1; j >= 0; j--) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const part = msg.parts[j] as any;
      const partType: string | undefined = part?.type;
      const isToolPart =
        partType === 'tool-invocation' ||
        partType === 'tool-call' ||
        (typeof partType === 'string' && partType.startsWith('tool-'));

      if (!isToolPart) continue;

      const toolName: string | undefined =
        part.toolName ??
        part.tool ??
        (typeof partType === 'string' && partType.startsWith('tool-')
          ? partType.slice(5)
          : undefined);

      if (toolName !== 'todo_write') continue;

      const output =
        part.output?.todos ??
        part.result?.todos ??
        part.toolInvocation?.result?.todos ??
        part.input?.todos ??
        part.args?.todos;

      if (!Array.isArray(output)) continue;

      const todos: DerivedTodo[] = output.map((t: { id: string; subject: string; activeForm?: string; status: DerivedTodo['status'] }, idx: number) => ({
        id: t.id,
        subject: t.subject,
        activeForm: t.activeForm,
        status: t.status,
        sortOrder: idx,
      }));

      return {
        todos,
        counts: {
          pending: todos.filter((t) => t.status === 'pending').length,
          inProgress: todos.filter((t) => t.status === 'in_progress').length,
          completed: todos.filter((t) => t.status === 'completed').length,
          total: todos.length,
        },
        hasTodoWrite: true,
      };
    }
  }
  return EMPTY;
}
