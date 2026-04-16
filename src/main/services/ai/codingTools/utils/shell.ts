/**
 * Utilidades de shell para ejecutar comandos.
 * Migrado de pi-mono/packages/coding-agent
 */

import { spawn, spawnSync, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { delimiter } from "path";
import { homedir } from "os";
import { join } from "path";

const ANSI_OSC_PATTERN = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;
const ANSI_CSI_PATTERN = /[\u001B\u009B][[()\]#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-TZcf-nq-uy=><~])/g;
const ANSI_SINGLE_PATTERN = /\u001B[@-_]/g;

/**
 * Obtener configuración de shell según plataforma
 */
export function getShellConfig(): { shell: string; args: string[] } {
  if (process.platform === "win32") {
    // Git Bash en Windows
    const gitBashPaths = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
      join(homedir(), "scoop", "apps", "git", "current", "bin", "bash.exe"),
    ];

    for (const path of gitBashPaths) {
      if (existsSync(path)) {
        return { shell: path, args: ["-c"] };
      }
    }

    // Fallback a PowerShell
    return { shell: "powershell.exe", args: ["-Command"] };
  }

  // Unix: preferir bash
  if (existsSync("/bin/bash")) {
    return { shell: "/bin/bash", args: ["-c"] };
  }

  return { shell: "sh", args: ["-c"] };
}

/**
 * Obtener environment para shell
 */
export function getShellEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  // Asegurar que binarios comunes estén en PATH
  const extraPaths = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    join(homedir(), ".local", "bin"),
  ];

  const currentPath = env.PATH || "";
  const pathsToAdd = extraPaths.filter(p => !currentPath.includes(p));

  if (pathsToAdd.length > 0) {
    env.PATH = [...pathsToAdd, currentPath].join(delimiter);
  }

  // No prompts interactivos
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_ASKPASS = "";

  return env;
}

/**
 * Sanitizar output binario (remover caracteres no imprimibles)
 */
export function stripAnsiSequences(str: string): string {
  return str
    .replace(ANSI_OSC_PATTERN, "")
    .replace(ANSI_CSI_PATTERN, "")
    .replace(ANSI_SINGLE_PATTERN, "");
}

export function sanitizeBinaryOutput(str: string): string {
  const withoutAnsi = stripAnsiSequences(str);
  // Remover caracteres de control excepto newlines y tabs
  return withoutAnsi.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Matar árbol de procesos
 */
export function killProcessTree(pid: number): void {
  try {
    if (process.platform === "win32") {
      // Windows: taskkill con /T para árbol completo
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
      });
    } else {
      // Unix: enviar señal al grupo de procesos (negativo)
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // Ignorar si ya terminó
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Proceso ya no existe
    }
  }
}

export interface ExecuteCommandOptions {
  cwd: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface ExecuteCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  interrupted: boolean;
}

/**
 * Ejecutar comando en shell
 */
export async function executeCommand(
  command: string,
  options: ExecuteCommandOptions
): Promise<ExecuteCommandResult> {
  const { shell, args } = getShellConfig();
  const env = options.env ?? getShellEnv();
  const timeout = options.timeout ?? 120000; // 2 minutos default

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let interrupted = false;
    let child: ChildProcess;

    const cleanup = () => {
      if (child && child.pid) {
        killProcessTree(child.pid);
      }
    };

    // Manejar abort signal
    if (options.signal) {
      if (options.signal.aborted) {
        resolve({
          stdout: "",
          stderr: "Command aborted before start",
          exitCode: 130,
          timedOut: false,
          interrupted: true,
        });
        return;
      }
      options.signal.addEventListener("abort", () => {
        interrupted = true;
        cleanup();
      });
    }

    // Timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      cleanup();
    }, timeout);

    child = spawn(shell, [...args, command], {
      cwd: options.cwd,
      detached: process.platform !== "win32",
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = sanitizeBinaryOutput(chunk.toString("utf8"));
      stdout += text;
      options.onStdout?.(text);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = sanitizeBinaryOutput(chunk.toString("utf8"));
      stderr += text;
      options.onStderr?.(text);
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? (timedOut ? 124 : interrupted ? 130 : 1),
        timedOut,
        interrupted,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr: stderr + "\n" + err.message,
        exitCode: 1,
        timedOut,
        interrupted,
      });
    });
  });
}
