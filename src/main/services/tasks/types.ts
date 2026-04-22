/**
 * Types for Background Task Manager
 *
 * Contracts and DTOs for background shell task management.
 */

export enum TaskStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  KILLED = 'killed',
}

export type TaskStream = 'stdout' | 'stderr';

export interface TaskInfo {
  id: string;
  command: string;
  description?: string;
  status: TaskStatus;
  pid: number | null;
  cwd: string;
  startedAt: Date;
  completedAt: Date | null;
  exitCode: number | null;
  timedOut: boolean;
  interrupted: boolean;
  detectedPort: number | null;
}

export interface TaskInfoDTO {
  id: string;
  command: string;
  description?: string;
  status: TaskStatus;
  pid: number | null;
  cwd: string;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
  timedOut: boolean;
  interrupted: boolean;
  detectedPort: number | null;
}

export interface SpawnTaskOptions {
  cwd: string;
  description?: string;
  env?: NodeJS.ProcessEnv;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  /** Absolute path to a shell binary to use instead of the auto-detected one. */
  shellOverride?: string;
}

export interface GetOutputOptions {
  includeTimestamps?: boolean;
  tail?: number;
}

export interface WaitTaskOptions {
  timeoutMs?: number; // default 30000
}

export interface TaskStats {
  total: number;
  running: number;
  completed: number;
  failed: number;
  killed: number;
}

export interface TaskEvents {
  'task:spawn': (taskId: string, info: TaskInfo) => void;
  'task:output': (taskId: string, line: string, stream: TaskStream) => void;
  'task:complete': (taskId: string, info: TaskInfo) => void;
  'task:killed': (taskId: string, info: TaskInfo) => void;
  'task:error': (taskId: string, error: Error) => void;
  'task:port-detected': (taskId: string, port: number, info: TaskInfo) => void;
}

/**
 * Internal structure for task entry storage
 */
export interface TaskOutputLine {
  ts: number;
  stream: TaskStream;
  text: string;
}

export interface TaskEntry {
  info: TaskInfo;
  process: import('child_process').ChildProcess | null;
  output: TaskOutputLine[];
  outputBytes: number;
  stdoutRemainder: string;
  stderrRemainder: string;
}
