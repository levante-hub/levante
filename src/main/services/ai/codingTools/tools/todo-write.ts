import { tool } from 'ai';
import { z } from 'zod';

const todoItemSchema = z.object({
  id: z.string().describe('Stable identifier for this todo (LLM chooses, must persist across updates)'),
  subject: z.string().describe('Brief, actionable title in imperative form'),
  activeForm: z.string().optional().describe('Present continuous form shown while in progress'),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

export function createTodoWriteTool() {
  return tool({
    description: `Rewrite the full task list for the current session.
Pass every task every time — this replaces the previous list.
Use to add, update status, rename, reorder, or remove tasks.
If all tasks are completed, pass an empty array to clear the list.`,

    inputSchema: z.object({
      todos: z.array(todoItemSchema).describe('Full list of tasks for this turn'),
    }),

    execute: async ({ todos }: { todos: z.infer<typeof todoItemSchema>[] }) => {
      const allDone = todos.length > 0 && todos.every((t) => t.status === 'completed');
      const normalized = allDone ? [] : todos;
      return { success: true, todos: normalized };
    },
  });
}
