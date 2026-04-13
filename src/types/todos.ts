export type AgentTodoStatus = 'pending' | 'in_progress' | 'completed';

export interface AgentTodo {
  id: string;
  subject: string;
  activeForm?: string;
  status: AgentTodoStatus;
  sortOrder: number;
}
