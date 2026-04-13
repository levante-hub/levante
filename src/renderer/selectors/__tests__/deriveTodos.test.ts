import { describe, it, expect } from 'vitest';
import { deriveTodosFromMessages } from '../deriveTodos';
import type { UIMessage } from 'ai';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mkAssistant = (parts: any[]): UIMessage => ({
  id: Math.random().toString(36),
  role: 'assistant',
  parts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

const mkToolPart = (todos: unknown[]) => ({
  type: 'tool-todo_write',
  toolName: 'todo_write',
  output: { todos },
});

describe('deriveTodosFromMessages', () => {
  it('returns empty when no messages', () => {
    const state = deriveTodosFromMessages([]);
    expect(state.todos).toEqual([]);
    expect(state.counts.total).toBe(0);
  });

  it('extracts todos from a single todo_write tool-call', () => {
    const msgs = [
      mkAssistant([
        mkToolPart([
          { id: 'a', subject: 'A', status: 'pending' },
          { id: 'b', subject: 'B', status: 'in_progress' },
          { id: 'c', subject: 'C', status: 'completed' },
        ]),
      ]),
    ];
    const state = deriveTodosFromMessages(msgs);
    expect(state.todos.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(state.counts).toEqual({ pending: 1, inProgress: 1, completed: 1, total: 3 });
  });

  it('picks the latest todo_write across messages', () => {
    const msgs = [
      mkAssistant([mkToolPart([{ id: 'x', subject: 'old', status: 'pending' }])]),
      mkAssistant([mkToolPart([{ id: 'y', subject: 'new', status: 'pending' }])]),
    ];
    const state = deriveTodosFromMessages(msgs);
    expect(state.todos).toHaveLength(1);
    expect(state.todos[0].id).toBe('y');
  });

  it('picks the latest todo_write within the same message', () => {
    const msgs = [
      mkAssistant([
        mkToolPart([{ id: 'x', subject: 'old', status: 'pending' }]),
        mkToolPart([{ id: 'y', subject: 'new', status: 'pending' }]),
      ]),
    ];
    const state = deriveTodosFromMessages(msgs);
    expect(state.todos).toHaveLength(1);
    expect(state.todos[0].id).toBe('y');
  });

  it('treats empty todos result as empty list', () => {
    const msgs = [
      mkAssistant([mkToolPart([{ id: 'x', subject: 'old', status: 'pending' }])]),
      mkAssistant([mkToolPart([])]),
    ];
    const state = deriveTodosFromMessages(msgs);
    expect(state.todos).toEqual([]);
  });

  it('falls back to previous todo_write when latest message removed', () => {
    const msgs = [
      mkAssistant([mkToolPart([{ id: 'x', subject: 'first', status: 'pending' }])]),
    ];
    const state = deriveTodosFromMessages(msgs);
    expect(state.todos[0]?.id).toBe('x');

    const empty = deriveTodosFromMessages([]);
    expect(empty.todos).toEqual([]);
  });
});
