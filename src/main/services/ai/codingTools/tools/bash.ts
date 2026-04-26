/**
 * Herramienta Bash: ejecutar comandos en shell.
 * Adaptada de pi-mono para Vercel AI SDK.
 */

import { tool } from "ai";
import { z } from "zod";
import { executeCommand } from "../utils/shell";
import { truncateTail, formatSize } from "../utils/truncate";
import { taskManager } from "../../../tasks";
import { getLogger } from "../../../logging";

const logger = getLogger();

export interface BashToolConfig {
  cwd: string;
  timeout?: number; // ms, default 120000 (2 min)
  maxOutputLines?: number;
  maxOutputBytes?: number;
  /**
   * Absolute path to a shell binary to use instead of the auto-detected one.
   * Populated by ensureCoworkPrerequisites when Levante provisions PortableGit
   * on Windows systems that lack Git Bash / PowerShell.
   */
  shellOverride?: string;
}

export function createBashTool(config: BashToolConfig) {
  const timeout = config.timeout ?? 120000;
  const maxLines = config.maxOutputLines ?? 2000;
  const maxBytes = config.maxOutputBytes ?? 50 * 1024;

  return tool({
    needsApproval: true,
    description: `Execute a bash command in the shell.
Foreground commands run in a bash shell with a ${Math.round(timeout / 1000)}s timeout.
IMPORTANT:
- Do NOT use for file operations (use read, write, edit tools instead)
- Use for: git commands, npm/yarn, build tools, system commands
- Output is truncated to ${maxLines} lines / ${formatSize(maxBytes)}
- Commands run in: ${config.cwd}`,

    inputSchema: z.object({
      command: z.string().describe("The bash command to execute"),
      description: z.string().optional()
        .describe("Brief description of what this command does (for logging)"),
      run_in_background: z.boolean()
        .describe("REQUIRED. Set to true for long-running commands (dev servers, watch modes, builds >30s). Set to false for quick commands (git status, ls, cat). Background tasks return a taskId immediately and run without timeout."),
    }),

    execute: async ({ command, description, run_in_background }: { command: string; description?: string; run_in_background: boolean }) => {
      // Debug log directo a consola
      console.log('[BASH_TOOL] Called with:', {
        command: command.substring(0, 100),
        description,
        run_in_background,
      });

      logger.aiSdk.info('Bash tool called', {
        command: command.substring(0, 100),
        description,
        run_in_background,
      });

      // Handle background execution
      if (run_in_background) {
        const { taskId, pid } = taskManager.spawn(command, {
          cwd: config.cwd,
          description,
          shellOverride: config.shellOverride,
        });

        return {
          status: 'background',
          taskId,
          pid,
          exitCode: null,
          output: `Command started in background (taskId: ${taskId})`,
          truncated: false,
        };
      }

      try {
        const result = await executeCommand(command, {
          cwd: config.cwd,
          timeout,
          shellOverride: config.shellOverride,
        });

        // Combinar stdout y stderr
        let output = "";
        if (result.stdout) {
          output += result.stdout;
        }
        if (result.stderr) {
          if (output) output += "\n";
          output += result.stderr;
        }

        // Truncar output
        const truncated = truncateTail(output || "(no output)", { maxLines, maxBytes });

        // Construir resultado
        const status = result.timedOut
          ? "timed_out"
          : result.interrupted
            ? "interrupted"
            : result.exitCode === 0
              ? "success"
              : "error";

        return {
          status,
          exitCode: result.exitCode,
          output: truncated.content,
          truncated: truncated.wasTruncated,
          ...(result.timedOut && {
            warning: `Command timed out after ${timeout}ms`
          }),
          ...(result.interrupted && {
            warning: "Command was interrupted"
          }),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: "error",
          exitCode: 1,
          output: `Failed to execute command: ${message}`,
          error: message,
        };
      }
    },
  });
}
