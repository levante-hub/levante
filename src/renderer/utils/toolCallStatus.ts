export type ToolCallVisualStatus = 'pending' | 'running' | 'background' | 'success' | 'error';

interface BackgroundTaskOutput {
  status: 'background';
  taskId: string;
  pid?: number | null;
}

interface ToolCallPartLike {
  state?: string;
  output?: unknown;
}

export function isBackgroundTaskOutput(output: unknown): output is BackgroundTaskOutput {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as { status?: unknown }).status === 'background' &&
    typeof (output as { taskId?: unknown }).taskId === 'string'
  );
}

export function deriveToolCallVisualStatus(part: ToolCallPartLike): ToolCallVisualStatus {
  if (part.state === 'output-error') {
    return 'error';
  }

  if (part.state === 'input-available') {
    return 'running';
  }

  if (part.state === 'output-available') {
    return isBackgroundTaskOutput(part.output) ? 'background' : 'success';
  }

  return 'pending';
}
