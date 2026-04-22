/**
 * Background Task Manager
 *
 * Manages shell commands running in background with output capture,
 * and lifecycle management.
 */

import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { getLogger } from '../logging';
import {
  getShellConfig,
  getShellEnv,
  killProcessTree,
  sanitizeBinaryOutput,
} from '../ai/codingTools/utils/shell';
import {
  TaskStatus,
  TaskInfo,
  TaskInfoDTO,
  TaskEntry,
  TaskOutputLine,
  TaskStream,
  SpawnTaskOptions,
  GetOutputOptions,
  TaskStats,
} from './types';

const logger = getLogger();

// Limits for output storage
const MAX_OUTPUT_LINES = 5000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Regex patterns for detecting server ports in task output.
 * Ordered by specificity/priority.
 */
const PORT_DETECTION_PATTERNS: RegExp[] = [
  // URL completa: http://localhost:3000 o http://127.0.0.1:8080
  /https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/i,
  // Vite: ➜  Local:   http://localhost:5173/
  /➜\s+Local:\s+https?:\/\/[^:]+:(\d{2,5})/i,
  // Vite/Webpack: Local: http://localhost:5173/
  /\bLocal:\s+https?:\/\/[^:]+:(\d{2,5})/i,
  // Next.js: started server on 0.0.0.0:3000
  /started server on [^:]+:(\d{2,5})/i,
  // Express / genérico: Listening on port 3000
  /(?:listening on|running on)\s+(?:port\s+)?(\d{2,5})/i,
  // Flask/Werkzeug: * Running on http://127.0.0.1:5000
  /\*\s+Running on\s+https?:\/\/[^:]+:(\d{2,5})/i,
  // Genérico controlado: "port 3000" pero evitando "port 3000 is in use"
  /\bport[:\s]+(\d{2,5})\b(?!\s+is\s+in\s+use)/i,
];

const PORT_MIN = 1024;
const PORT_MAX = 65535;
const NON_ACTIVE_PORT_PATTERNS: RegExp[] = [
  /\b(?:port|address)\s+\d{2,5}\s+is\s+in\s+use\b/i,
  /\beaddrinuse\b/i,
  /\btrying another one\b/i,
];

function extractPortFromLine(line: string): number | null {
  // Ignore lines that mention conflicting/unavailable ports.
  for (const pattern of NON_ACTIVE_PORT_PATTERNS) {
    if (pattern.test(line)) {
      return null;
    }
  }

  for (const pattern of PORT_DETECTION_PATTERNS) {
    const match = line.match(pattern);
    if (match?.[1]) {
      const port = parseInt(match[1], 10);
      if (port >= PORT_MIN && port <= PORT_MAX) {
        return port;
      }
    }
  }
  return null;
}

/**
 * Background Task Manager Singleton
 *
 * Handles spawning, monitoring, and cleanup of background shell tasks.
 */
class BackgroundTaskManager extends EventEmitter {
  private tasks: Map<string, TaskEntry> = new Map();

  constructor() {
    super();
  }

  /**
   * Spawn a new background task
   */
  spawn(
    command: string,
    options: SpawnTaskOptions
  ): { taskId: string; pid: number | null } {
    const taskId = randomUUID();
    const { shell, args } = getShellConfig(options.shellOverride);
    const env = options.env ?? getShellEnv();

    const info: TaskInfo = {
      id: taskId,
      command,
      description: options.description,
      status: TaskStatus.RUNNING,
      pid: null,
      cwd: options.cwd,
      startedAt: new Date(),
      completedAt: null,
      exitCode: null,
      timedOut: false,
      interrupted: false,
      detectedPort: null,
    };

    const entry: TaskEntry = {
      info,
      process: null,
      output: [],
      outputBytes: 0,
      stdoutRemainder: '',
      stderrRemainder: '',
    };

    this.tasks.set(taskId, entry);

    try {
      const child = spawn(shell, [...args, command], {
        cwd: options.cwd,
        detached: process.platform !== 'win32',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      entry.process = child;
      info.pid = child.pid ?? null;

      // Set up output handlers
      child.stdout?.on('data', (chunk: Buffer) => {
        this.handleOutput(taskId, chunk, 'stdout', options.onStdout);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        this.handleOutput(taskId, chunk, 'stderr', options.onStderr);
      });

      // Handle process close
      child.on('close', (code) => {
        this.handleClose(taskId, code);
      });

      // Handle spawn errors
      child.on('error', (err) => {
        this.handleError(taskId, err);
      });

      logger.aiSdk.info('Background task spawned', {
        taskId,
        command: command.substring(0, 100),
        pid: info.pid,
        cwd: options.cwd,
      });

      return { taskId, pid: info.pid };
    } catch (error) {
      // Mark as failed if spawn itself fails
      info.status = TaskStatus.FAILED;
      info.completedAt = new Date();
      info.exitCode = 1;

      logger.aiSdk.error('Failed to spawn background task', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });

      return { taskId, pid: null };
    }
  }

  /**
   * Kill a running task
   */
  kill(taskId: string): boolean {
    const entry = this.tasks.get(taskId);
    if (!entry) {
      return false;
    }

    if (entry.info.status !== TaskStatus.RUNNING) {
      return false;
    }

    // Kill process tree
    if (entry.process?.pid) {
      killProcessTree(entry.process.pid);
    }

    // Update state
    entry.info.status = TaskStatus.KILLED;
    entry.info.interrupted = true;
    entry.info.completedAt = new Date();

    // Flush remaining output
    this.flushRemainders(taskId);

    logger.aiSdk.info('Background task killed', {
      taskId,
      pid: entry.info.pid,
    });

    return true;
  }

  /**
   * Get task status/info
   */
  getStatus(taskId: string): TaskInfo | null {
    const entry = this.tasks.get(taskId);
    return entry ? { ...entry.info } : null;
  }

  /**
   * Get task output
   */
  getOutput(taskId: string, options?: GetOutputOptions): string | null {
    const entry = this.tasks.get(taskId);
    if (!entry) {
      return null;
    }

    let lines = entry.output;

    // Apply tail if specified
    if (options?.tail && options.tail > 0 && options.tail < lines.length) {
      lines = lines.slice(-options.tail);
    }

    // Format output
    if (options?.includeTimestamps) {
      return lines
        .map((line) => {
          const ts = new Date(line.ts).toISOString();
          const prefix = line.stream === 'stderr' ? '[ERR]' : '[OUT]';
          return `${ts} ${prefix} ${line.text}`;
        })
        .join('\n');
    }

    return lines.map((line) => line.text).join('\n');
  }

  /**
   * List tasks with optional filter
   */
  list(filter?: { status?: TaskStatus }): TaskInfo[] {
    const results: TaskInfo[] = [];

    for (const entry of this.tasks.values()) {
      if (!filter?.status || entry.info.status === filter.status) {
        results.push({ ...entry.info });
      }
    }

    // Sort by startedAt descending
    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    return results;
  }

  /**
   * Wait for a task to complete
   */
  async wait(taskId: string, timeoutMs = 30000): Promise<TaskInfo> {
    const entry = this.tasks.get(taskId);
    if (!entry) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Already completed
    if (entry.info.status !== TaskStatus.RUNNING) {
      return { ...entry.info };
    }

    return new Promise((resolve, reject) => {
      const checkInterval = 100;
      let elapsed = 0;

      const check = () => {
        const current = this.tasks.get(taskId);
        if (!current) {
          reject(new Error(`Task disappeared: ${taskId}`));
          return;
        }

        if (current.info.status !== TaskStatus.RUNNING) {
          resolve({ ...current.info });
          return;
        }

        elapsed += checkInterval;
        if (elapsed >= timeoutMs) {
          reject(new Error(`Wait timeout for task: ${taskId}`));
          return;
        }

        setTimeout(check, checkInterval);
      };

      check();
    });
  }

  /**
   * Cleanup completed/failed/killed tasks older than maxAgeMs
   */
  cleanup(maxAgeMs = 3600000): number {
    const now = Date.now();
    let count = 0;

    for (const [taskId, entry] of this.tasks.entries()) {
      // Only cleanup terminal states
      if (entry.info.status === TaskStatus.RUNNING) {
        continue;
      }

      const completedAt = entry.info.completedAt?.getTime() ?? now;
      if (now - completedAt >= maxAgeMs) {
        this.tasks.delete(taskId);
        count++;
      }
    }

    if (count > 0) {
      logger.aiSdk.info('Background tasks cleaned up', { count });
    }

    return count;
  }

  /**
   * Clear all tasks (for shutdown)
   */
  clearAll(): void {
    // Kill all running tasks
    for (const [taskId, entry] of this.tasks.entries()) {
      // Kill process if running
      if (entry.info.status === TaskStatus.RUNNING && entry.process?.pid) {
        try {
          killProcessTree(entry.process.pid);
        } catch {
          // Ignore errors during shutdown
        }
      }
    }

    this.tasks.clear();

    logger.aiSdk.info('All background tasks cleared');
  }

  /**
   * Get statistics about tasks
   */
  getStatistics(): TaskStats {
    const stats: TaskStats = {
      total: 0,
      running: 0,
      completed: 0,
      failed: 0,
      killed: 0,
    };

    for (const entry of this.tasks.values()) {
      stats.total++;
      switch (entry.info.status) {
        case TaskStatus.RUNNING:
          stats.running++;
          break;
        case TaskStatus.COMPLETED:
          stats.completed++;
          break;
        case TaskStatus.FAILED:
          stats.failed++;
          break;
        case TaskStatus.KILLED:
          stats.killed++;
          break;
      }
    }

    return stats;
  }

  /**
   * Convert TaskInfo to DTO (for IPC)
   */
  toDTO(info: TaskInfo): TaskInfoDTO {
    return {
      id: info.id,
      command: info.command,
      description: info.description,
      status: info.status,
      pid: info.pid,
      cwd: info.cwd,
      startedAt: info.startedAt.toISOString(),
      completedAt: info.completedAt?.toISOString() ?? null,
      exitCode: info.exitCode,
      timedOut: info.timedOut,
      interrupted: info.interrupted,
      detectedPort: info.detectedPort,
    };
  }

  /**
   * Convert TaskInfo array to DTO array
   */
  toDTOList(list: TaskInfo[]): TaskInfoDTO[] {
    return list.map((info) => this.toDTO(info));
  }

  // ===== Private methods =====

  private handleOutput(
    taskId: string,
    chunk: Buffer,
    stream: TaskStream,
    callback?: (text: string) => void
  ): void {
    const entry = this.tasks.get(taskId);
    if (!entry) return;

    const text = sanitizeBinaryOutput(chunk.toString('utf8'));
    const remainder =
      stream === 'stdout' ? entry.stdoutRemainder : entry.stderrRemainder;
    const combined = remainder + text;

    // Split into lines, keeping last partial line as remainder
    const parts = combined.split('\n');
    const newRemainder = parts.pop() ?? '';

    if (stream === 'stdout') {
      entry.stdoutRemainder = newRemainder;
    } else {
      entry.stderrRemainder = newRemainder;
    }

    // Add complete lines to output
    const now = Date.now();
    for (const line of parts) {
      this.addOutputLine(entry, { ts: now, stream, text: line });
    }

    // Call callback with raw text
    callback?.(text);
  }

  private addOutputLine(entry: TaskEntry, line: TaskOutputLine): void {
    const lineBytes = Buffer.byteLength(line.text, 'utf8') + 50; // estimate overhead

    // Check limits
    while (
      entry.output.length >= MAX_OUTPUT_LINES ||
      entry.outputBytes + lineBytes > MAX_OUTPUT_BYTES
    ) {
      const removed = entry.output.shift();
      if (removed) {
        entry.outputBytes -= Buffer.byteLength(removed.text, 'utf8') + 50;
      } else {
        break;
      }
    }

    entry.output.push(line);
    entry.outputBytes += lineBytes;

    // Port detection: solo si aún no detectamos un puerto para esta tarea
    if (entry.info.detectedPort === null && line.text.trim()) {
      const port = extractPortFromLine(line.text);
      if (port !== null) {
        entry.info.detectedPort = port;
        logger.aiSdk.info('Port detected in task output', {
          taskId: entry.info.id,
          port,
          line: line.text.substring(0, 200),
        });
        this.emit('task:port-detected', entry.info.id, port, { ...entry.info });
      }
    }
  }

  private flushRemainders(taskId: string): void {
    const entry = this.tasks.get(taskId);
    if (!entry) return;

    const now = Date.now();

    if (entry.stdoutRemainder) {
      this.addOutputLine(entry, {
        ts: now,
        stream: 'stdout',
        text: entry.stdoutRemainder,
      });
      entry.stdoutRemainder = '';
    }

    if (entry.stderrRemainder) {
      this.addOutputLine(entry, {
        ts: now,
        stream: 'stderr',
        text: entry.stderrRemainder,
      });
      entry.stderrRemainder = '';
    }
  }

  private handleClose(taskId: string, code: number | null): void {
    const entry = this.tasks.get(taskId);
    if (!entry) return;

    // Don't overwrite terminal state (e.g., KILLED)
    if (entry.info.status !== TaskStatus.RUNNING) {
      return;
    }

    // Flush remaining output
    this.flushRemainders(taskId);

    // Update state
    entry.info.exitCode = code;
    entry.info.completedAt = new Date();
    entry.info.status = code === 0 ? TaskStatus.COMPLETED : TaskStatus.FAILED;

    logger.aiSdk.info('Background task completed', {
      taskId,
      exitCode: code,
      status: entry.info.status,
    });
  }

  private handleError(taskId: string, error: Error): void {
    const entry = this.tasks.get(taskId);
    if (!entry) return;

    // Don't overwrite terminal state
    if (entry.info.status !== TaskStatus.RUNNING) {
      return;
    }

    // Flush remaining output
    this.flushRemainders(taskId);

    // Add error to output
    this.addOutputLine(entry, {
      ts: Date.now(),
      stream: 'stderr',
      text: `Process error: ${error.message}`,
    });

    // Update state
    entry.info.status = TaskStatus.FAILED;
    entry.info.exitCode = 1;
    entry.info.completedAt = new Date();

    logger.aiSdk.error('Background task error', {
      taskId,
      error: error.message,
    });
  }
}

// Singleton instance
export const taskManager = new BackgroundTaskManager();
