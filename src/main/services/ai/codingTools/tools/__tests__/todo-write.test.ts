import { describe, it, expect } from 'vitest';
import { createTodoWriteTool } from '../todo-write';

async function run(tool: ReturnType<typeof createTodoWriteTool>, input: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execute = (tool as any).execute as (args: unknown) => Promise<unknown>;
  return execute(input);
}

describe('todo_write tool', () => {
  it('returns todos as-is when there are pending tasks', async () => {
    const tool = createTodoWriteTool();
    const todos = [
      { id: 'a', subject: 'Task A', status: 'pending' as const },
      { id: 'b', subject: 'Task B', status: 'in_progress' as const },
    ];
    const result = await run(tool, { todos });
    expect(result).toEqual({ success: true, todos });
  });

  it('clears list when every task is completed', async () => {
    const tool = createTodoWriteTool();
    const todos = [
      { id: 'a', subject: 'A', status: 'completed' as const },
      { id: 'b', subject: 'B', status: 'completed' as const },
    ];
    const result = await run(tool, { todos });
    expect(result).toEqual({ success: true, todos: [] });
  });

  it('returns empty list for empty input', async () => {
    const tool = createTodoWriteTool();
    const result = await run(tool, { todos: [] });
    expect(result).toEqual({ success: true, todos: [] });
  });
});
