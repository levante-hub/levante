/**
 * Tools listed here are executed by the AI agent but hidden from the chat UI.
 * They are internal housekeeping tools whose execution details provide no
 * value to the user. Add or remove tool names as needed.
 */
export const HIDDEN_TOOLS: ReadonlySet<string> = new Set([
  'todo_write',
  'present_files',
]);

/**
 * Returns true if a tool should not be rendered in the chat UI.
 * Accepts either a bare tool name ("todo_write") or the part type
 * format ("tool-todo_write").
 */
export function isToolHidden(toolNameOrPartType: string): boolean {
  const name = toolNameOrPartType.startsWith('tool-')
    ? toolNameOrPartType.slice(5)
    : toolNameOrPartType;
  return HIDDEN_TOOLS.has(name);
}
