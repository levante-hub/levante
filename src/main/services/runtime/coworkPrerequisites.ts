/**
 * Cowork Prerequisites
 *
 * Ensures that the minimum runtimes required by Cowork mode are available:
 *   - A POSIX shell (bash.exe on Windows; /bin/bash or /bin/sh on macOS/Linux)
 *   - Python (used by skill-creator and common MCP servers)
 *
 * On Windows, if no shell can be found, PortableGit is downloaded from
 * git-for-windows and extracted to ~/levante/runtimes/gitbash/<version>/.
 */

import { existsSync } from 'fs';
import { RuntimeManager } from './runtimeManager';
import {
    DEFAULT_PYTHON_VERSION,
    PORTABLE_GIT_VERSION,
} from './constants';
import type { Logger } from '../logging';

export type CoworkPrereqStep =
    | 'checking'
    | 'installing-gitbash'
    | 'ensuring-python'
    | 'ready'
    | 'error';

export interface CoworkPrerequisitesResult {
    /** Shell binary usable by the bash coding tool (e.g. Git Bash, PortableGit, /bin/bash). */
    shellPath: string | null;
    /** Python binary (Levante-managed or system); null if provisioning failed. */
    pythonPath: string | null;
    /** Non-fatal warnings (e.g. network errors) surfaced to the renderer. */
    warnings: string[];
}

export interface EnsureCoworkPrerequisitesOptions {
    onProgress?: (step: CoworkPrereqStep, detail?: Record<string, unknown>) => void;
}

/**
 * Resolves a POSIX shell and Python runtime for Cowork.
 *
 * Fallback order on Windows:
 *   1. System Git Bash / bash.exe on PATH
 *   2. Levante-managed PortableGit already installed
 *   3. Download + extract PortableGit under ~/levante/runtimes/gitbash/<version>/
 *
 * On macOS/Linux, we skip the Git Bash step (native bash/sh already works).
 */
export async function ensureCoworkPrerequisites(
    runtimeManager: RuntimeManager,
    logger: Logger,
    options: EnsureCoworkPrerequisitesOptions = {}
): Promise<CoworkPrerequisitesResult> {
    const onProgress = options.onProgress ?? (() => { });
    const warnings: string[] = [];
    let shellPath: string | null = null;

    onProgress('checking');

    if (process.platform === 'win32') {
        // 1) System Git Bash / PowerShell fallback is handled downstream,
        //    but we try to surface an absolute path here so the bash tool
        //    doesn't need to re-search.
        try {
            shellPath = await runtimeManager.detectSystemRuntime('gitbash');
        } catch (err) {
            logger.core.warn('Cowork prereq: detectSystemRuntime(gitbash) failed', { err: String(err) });
        }

        // 2) Levante-managed PortableGit
        if (!shellPath) {
            const managed = runtimeManager.findLevanteRuntime('gitbash', PORTABLE_GIT_VERSION);
            if (managed && existsSync(managed)) {
                shellPath = managed;
            }
        }

        // 3) Download PortableGit
        if (!shellPath) {
            onProgress('installing-gitbash', { version: PORTABLE_GIT_VERSION });
            try {
                shellPath = await runtimeManager.ensureRuntime({
                    type: 'gitbash',
                    version: PORTABLE_GIT_VERSION,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                warnings.push(`No se pudo instalar Git Bash portable: ${message}`);
                logger.core.warn('Cowork prereq: PortableGit provisioning failed', { err: message });
            }
        }
    }

    // Python: pre-provision on every platform so skill-creator and
    // Python-based MCPs work out of the box on first Cowork entry.
    //
    // Only emit `ensuring-python` progress when we're actually going to
    // download/install. If a Levante-managed Python is already on disk,
    // reuse it silently so subsequent app launches don't flash a toast.
    let pythonPath: string | null = runtimeManager.findLevanteRuntime(
        'python',
        DEFAULT_PYTHON_VERSION
    );
    if (!pythonPath) {
        onProgress('ensuring-python', { version: DEFAULT_PYTHON_VERSION });
        try {
            pythonPath = await runtimeManager.ensureRuntime({
                type: 'python',
                version: DEFAULT_PYTHON_VERSION,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            warnings.push(`No se pudo preparar Python: ${message}`);
            logger.core.warn('Cowork prereq: python provisioning failed', { err: message });
        }
    }

    onProgress('ready');

    return { shellPath, pythonPath, warnings };
}
