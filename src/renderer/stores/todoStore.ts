import { create } from 'zustand';
import type { DerivedTodoState, DerivedTodo } from '../selectors/deriveTodos';

const COMPLETED_VISIBILITY_MS = 2000;
const initialCounts = { pending: 0, inProgress: 0, completed: 0, total: 0 };
const EMPTY_DERIVED: DerivedTodoState = {
  todos: [],
  counts: initialCounts,
  hasTodoWrite: false,
};

let latestDerived: DerivedTodoState = EMPTY_DERIVED;
const completedSince = new Map<string, number>();
const completedTimers = new Map<string, ReturnType<typeof setTimeout>>();
const completedGhosts = new Map<string, DerivedTodo>();

function clearCompletedTimer(todoId: string) {
  const timer = completedTimers.get(todoId);
  if (timer) {
    clearTimeout(timer);
    completedTimers.delete(todoId);
  }
}

function buildVisibleState(sourceTodos: DerivedTodo[]): DerivedTodoState {
  const now = Date.now();
  const sourceById = new Set(sourceTodos.map((todo) => todo.id));

  const visibleSourceTodos = sourceTodos.filter((todo) => {
    if (todo.status !== 'completed') return true;
    const since = completedSince.get(todo.id);
    if (since === undefined) return true;
    return now - since < COMPLETED_VISIBILITY_MS;
  });

  const visibleGhostTodos = [...completedGhosts.values()]
    .filter((todo) => {
      if (sourceById.has(todo.id)) return false;
      const since = completedSince.get(todo.id);
      return since !== undefined && now - since < COMPLETED_VISIBILITY_MS;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const todos = [...visibleSourceTodos, ...visibleGhostTodos];

  return {
    todos,
    counts: {
      pending: todos.filter((t) => t.status === 'pending').length,
      inProgress: todos.filter((t) => t.status === 'in_progress').length,
      completed: todos.filter((t) => t.status === 'completed').length,
      total: todos.length,
    },
    hasTodoWrite: latestDerived.hasTodoWrite,
  };
}

function sameVisibleTodos(a: DerivedTodo[], b: DerivedTodo[]): boolean {
  return (
    a.length === b.length &&
    a.every((todo, index) => {
      const next = b[index];
      return (
        next &&
        next.id === todo.id &&
        next.status === todo.status &&
        next.subject === todo.subject &&
        next.activeForm === todo.activeForm &&
        next.sortOrder === todo.sortOrder
      );
    })
  );
}

interface TodoStoreState {
  todos: DerivedTodo[];
  previousTodos: DerivedTodo[];
  counts: DerivedTodoState['counts'];
  expanded: boolean;
  setFromDerived: (derived: DerivedTodoState) => void;
  setExpanded: (expanded: boolean) => void;
  reset: () => void;
}

export const useTodoStore = create<TodoStoreState>((set, get) => {
  const syncVisibleState = () => {
    const visible = buildVisibleState(latestDerived.todos);
    set((state) => {
      if (
        sameVisibleTodos(state.todos, visible.todos) &&
        state.counts.pending === visible.counts.pending &&
        state.counts.inProgress === visible.counts.inProgress &&
        state.counts.completed === visible.counts.completed &&
        state.counts.total === visible.counts.total
      ) {
        return {};
      }

      return {
        previousTodos: state.todos,
        todos: visible.todos,
        counts: visible.counts,
      };
    });
  };

  const scheduleCompletedRemoval = (todoId: string) => {
    clearCompletedTimer(todoId);
    completedTimers.set(
      todoId,
      setTimeout(() => {
        completedTimers.delete(todoId);
        completedGhosts.delete(todoId);
        completedSince.delete(todoId);
        syncVisibleState();
      }, COMPLETED_VISIBILITY_MS)
    );
  };

  return {
    todos: [],
    previousTodos: [],
    counts: initialCounts,
    expanded: false,

    setFromDerived: (derived) => {
      const previousById = new Map(latestDerived.todos.map((todo) => [todo.id, todo]));
      const previousVisibleTodos = get().todos;
      latestDerived = derived;

      const nextIds = new Set(derived.todos.map((todo) => todo.id));

      if (!derived.hasTodoWrite) {
        for (const todoId of [...completedGhosts.keys()]) {
          completedGhosts.delete(todoId);
        }
        for (const todoId of [...completedSince.keys()]) {
          completedSince.delete(todoId);
          clearCompletedTimer(todoId);
        }
      } else if (derived.todos.length === 0 && previousVisibleTodos.length > 0) {
        for (const todo of previousVisibleTodos) {
          const completedTodo: DerivedTodo = {
            ...todo,
            status: 'completed',
          };
          completedGhosts.set(todo.id, completedTodo);
          completedSince.set(todo.id, Date.now());
          scheduleCompletedRemoval(todo.id);
        }
      } else {
        for (const todoId of [...completedGhosts.keys()]) {
          if (!nextIds.has(todoId)) {
            completedGhosts.delete(todoId);
            completedSince.delete(todoId);
            clearCompletedTimer(todoId);
          }
        }
      }

      for (const todo of derived.todos) {
        const previous = previousById.get(todo.id);
        completedGhosts.delete(todo.id);

        if (todo.status === 'completed') {
          if (previous?.status !== 'completed') {
            completedSince.set(todo.id, Date.now());
            scheduleCompletedRemoval(todo.id);
          } else if (!completedSince.has(todo.id)) {
            completedSince.set(todo.id, Date.now());
            scheduleCompletedRemoval(todo.id);
          }
        } else {
          completedSince.delete(todo.id);
          clearCompletedTimer(todo.id);
        }
      }

      for (const todoId of [...completedGhosts.keys()]) {
        if (nextIds.has(todoId)) {
          completedGhosts.delete(todoId);
        }
      }

      for (const todoId of [...completedSince.keys()]) {
        if (!nextIds.has(todoId) && !completedGhosts.has(todoId)) {
          completedSince.delete(todoId);
          clearCompletedTimer(todoId);
        }
      }

      syncVisibleState();
    },

    setExpanded: (expanded) => set({ expanded }),

    reset: () => {
      latestDerived = EMPTY_DERIVED;
      for (const todoId of completedTimers.keys()) {
        clearCompletedTimer(todoId);
      }
      completedSince.clear();
      completedGhosts.clear();

      set({
        todos: [],
        previousTodos: [],
        counts: initialCounts,
        expanded: false,
      });
    },
  };
});
