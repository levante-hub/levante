import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { RuntimeConfig, RuntimeInfo, RuntimeType } from '../../../types/runtime';
import {
    DEFAULT_NODE_VERSION,
    DEFAULT_PYTHON_VERSION,
    LEVANTE_DIR_NAME,
    RUNTIME_DIR_NAME,
    NODE_DIST_BASE_URL,
    PORTABLE_GIT_ARCHIVE_X64,
    PORTABLE_GIT_URL_X64,
} from './constants';
import { analyticsService } from '../analytics/analyticsService';

const execAsync = promisify(exec);

// Installation locks to prevent concurrent installations of the same runtime
const installationLocks: Map<string, Promise<string>> = new Map();
// Separate lock for uv installation (returns void, not string)
const uvInstallationLock: { promise: Promise<void> | null } = { promise: null };

export class RuntimeManager {
    private runtimesPath: string;
    private usagePath: string;

    constructor() {
        this.runtimesPath = path.join(app.getPath('home'), LEVANTE_DIR_NAME, RUNTIME_DIR_NAME);
        this.usagePath = path.join(this.runtimesPath, 'usage.json');
    }

    /**
     * Returns the base path where Levante runtimes are installed.
     */
    getRuntimesPath(): string {
        return this.runtimesPath;
    }

    /**
   * Ensures that the requested runtime is available.
   * Priority depends on developerMode and preferSystemRuntimes flags:
   *
   * Simple Mode (developerMode = false):
   * - Levante → System → Auto-install (silent)
   * - Prioritizes Levante for tracking and guaranteed compatibility
   *
   * Advanced Mode (developerMode = true):
   * - If preferSystemRuntimes: System → Levante → Prompt
   * - If !preferSystemRuntimes: Levante → System → Prompt
   *
   * If source is 'system', only checks system path (no installation).
   */
    async ensureRuntime(config: RuntimeConfig, preferSystemRuntimes = false, developerMode = false): Promise<string> {
        const { type, version, source = 'shared' } = config;

        // 1. If source is explicitly 'system', only look in system
        if (source === 'system') {
            const systemPath = await this.detectSystemRuntime(type, version);
            if (systemPath) {
                return systemPath;
            } else {
                throw new Error(`System runtime ${type} not found`);
            }
        }

        // 2. If source is 'shared' (default): Check preference based on mode

        if (!developerMode) {
            // SIMPLE MODE: Levante → System → Auto-install (silent)
            // Prioritizes Levante for tracking and guaranteed compatibility

            const levanteRuntime = this.findLevanteRuntime(type, version);
            if (levanteRuntime) {
                return levanteRuntime; // Use Levante runtime (trackeable)
            }

            try {
                return await this.installRuntimeWithLock(type, version);
            } catch (installError) {
                console.warn(`[RuntimeManager] Installation failed for ${type} ${version}:`, installError);

                // Fallback to system runtime
                const systemPath = await this.detectSystemRuntime(type, version);
                if (systemPath) {
                    console.log(`[RuntimeManager] Using system runtime as fallback: ${systemPath}`);
                    return systemPath; // Fallback to system
                }

                // Re-throw with more informative message
                const errorMsg = installError instanceof Error ? installError.message : String(installError);
                throw new Error(`Failed to install ${type} ${version} runtime: ${errorMsg}`);
            }

        } else {
            // ADVANCED MODE: Respects preferSystemRuntimes setting

            if (preferSystemRuntimes) {
                // User prefers System: System → Levante → Prompt
                const systemPath = await this.detectSystemRuntime(type, version);
                if (systemPath) {
                    return systemPath; // Use system (not tracked)
                }

                const levanteRuntime = this.findLevanteRuntime(type, version);
                if (levanteRuntime) {
                    return levanteRuntime; // Fallback to Levante
                }

                // Not found anywhere: throw error so UI can show confirmation dialog
                throw new Error('RUNTIME_NOT_FOUND');

            } else {
                // User prefers Levante: Check Levante first
                const levanteRuntime = this.findLevanteRuntime(type, version);
                if (levanteRuntime) {
                    return levanteRuntime; // Use Levante runtime (trackeable)
                }

                // Levante not found: try to install it (user prefers Levante)
                try {
                    console.log(`[RuntimeManager] Installing ${type} ${version} runtime (user prefers Levante)...`);
                    return await this.installRuntimeWithLock(type, version);
                } catch (installError) {
                    console.warn(`[RuntimeManager] Installation failed for ${type} ${version}:`, installError);

                    // Fallback to system runtime if available
                    const systemPath = await this.detectSystemRuntime(type, version);
                    if (systemPath) {
                        console.log(`[RuntimeManager] Using system ${type} runtime as fallback: ${systemPath}`);
                        return systemPath;
                    }

                    // Nothing available
                    throw new Error('RUNTIME_NOT_FOUND');
                }
            }
        }
    }

    /**
     * Finds an installed Levante runtime without triggering installation.
     */
    findLevanteRuntime(type: RuntimeType, version: string): string | null {
        const runtimeDir = path.join(this.runtimesPath, type, version);

        if (!fs.existsSync(runtimeDir)) {
            return null;
        }

        if (type === 'node') {
            const binPath = process.platform === 'win32'
                ? path.join(runtimeDir, 'node.exe')
                : path.join(runtimeDir, 'bin', 'node');
            return fs.existsSync(binPath) ? binPath : null;
        } else if (type === 'gitbash') {
            // PortableGit layout: <runtimeDir>/bin/bash.exe
            const binPath = path.join(runtimeDir, 'bin', 'bash.exe');
            return fs.existsSync(binPath) ? binPath : null;
        } else {
            // Python (python-build-standalone layout)
            if (process.platform === 'win32') {
                const binPath = path.join(runtimeDir, 'python', 'python.exe');
                return fs.existsSync(binPath) ? binPath : null;
            } else {
                const binPath = path.join(runtimeDir, 'python', 'bin', 'python3');
                return fs.existsSync(binPath) ? binPath : null;
            }
        }
    }

    /**
   * Detects if a runtime is installed on the system.
   */
    async detectSystemRuntime(type: RuntimeType, version?: string): Promise<string | null> {
        try {
            // gitbash: look for Git Bash in known Windows locations + `where bash`
            if (type === 'gitbash') {
                if (process.platform !== 'win32') return null;

                const knownPaths = [
                    'C:\\Program Files\\Git\\bin\\bash.exe',
                    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
                    path.join(app.getPath('home'), 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe'),
                ];
                for (const candidate of knownPaths) {
                    if (fs.existsSync(candidate)) return candidate;
                }

                try {
                    const { stdout } = await execAsync('where bash');
                    const found = stdout.trim().split(/\r?\n/).find((line) =>
                        line.toLowerCase().endsWith('bash.exe') && fs.existsSync(line)
                    );
                    if (found) return found;
                } catch {
                    // not found on PATH
                }
                return null;
            }

            const command = type === 'node' ? 'node' : (process.platform === 'win32' ? 'python' : 'python3');
            const versionFlag = type === 'node' ? '-v' : '--version';

            // Check if command exists and get version
            await execAsync(`${command} ${versionFlag}`);

            // Get path
            const whichCommand = process.platform === 'win32'
                ? `where ${command}`
                : `which ${command}`;

            const { stdout } = await execAsync(whichCommand);
            const systemPath = stdout.trim().split('\n')[0];

            if (systemPath) {
                return systemPath;
            }
        } catch (error) {
            // Not found or error
        }
        return null;
    }

    /**
     * Installs a runtime with locking to prevent concurrent installations.
     * If another installation is in progress, waits for it to complete.
     */
    private async installRuntimeWithLock(type: RuntimeType, version: string): Promise<string> {
        const lockKey = `${type}-${version}`;

        // Check if installation is already in progress
        const existingInstallation = installationLocks.get(lockKey);
        if (existingInstallation) {
            console.log(`[RuntimeManager] Waiting for ongoing ${type} ${version} installation...`);
            return await existingInstallation;
        }

        // Start new installation with lock
        const installPromise = this.installRuntime(type, version)
            .finally(() => {
                // Remove lock when done (success or failure)
                installationLocks.delete(lockKey);
            });

        installationLocks.set(lockKey, installPromise);
        console.log(`[RuntimeManager] Starting installation of ${type} ${version}...`);

        return await installPromise;
    }

    /**
     * Installs a runtime locally in the levante/runtimes directory.
     */
    async installRuntime(type: RuntimeType, version: string): Promise<string> {
        const runtimeDir = path.join(this.runtimesPath, type, version);

        // Check if already installed (Node only)
        if (type === 'node' && fs.existsSync(runtimeDir)) {
            const binCheck = process.platform === 'win32'
                ? path.join(runtimeDir, 'node.exe')
                : path.join(runtimeDir, 'bin', 'node');

            if (fs.existsSync(binCheck)) {
                return binCheck;
            }
        }

        // Ensure directory exists
        fs.mkdirSync(runtimeDir, { recursive: true });

        if (type === 'gitbash') {
            // PortableGit only ships for Windows x64
            if (process.platform !== 'win32' || process.arch !== 'x64') {
                throw new Error('PortableGit auto-install is only supported on Windows x64');
            }

            const downloadPath = path.join(runtimeDir, PORTABLE_GIT_ARCHIVE_X64);

            console.log(`Downloading PortableGit from ${PORTABLE_GIT_URL_X64}...`);

            const response = await fetch(PORTABLE_GIT_URL_X64);
            if (!response.ok) {
                throw new Error(`Failed to download PortableGit: ${response.status} ${response.statusText}`);
            }
            if (!response.body) {
                throw new Error('No response body when downloading PortableGit');
            }

            // @ts-ignore - fetch body is a ReadableStream (Node.js fetch vs web fetch types)
            await pipeline(response.body, createWriteStream(downloadPath));

            console.log(`Extracting PortableGit to ${runtimeDir}...`);

            // PortableGit-*.7z.exe is a self-extracting 7z archive. It supports
            // silent extraction with "-y -o<dir>" (no space between -o and the path).
            await execAsync(`"${downloadPath}" -y -o"${runtimeDir}"`);

            // Cleanup installer
            try { fs.unlinkSync(downloadPath); } catch { /* ignore */ }

            const binPath = path.join(runtimeDir, 'bin', 'bash.exe');
            if (!fs.existsSync(binPath)) {
                throw new Error(`bash.exe not found after extracting PortableGit at ${binPath}`);
            }

            await analyticsService.trackRuntimeUsage(
                type,
                version,
                'shared',
                'installed'
            ).catch(() => { });

            return binPath;
        }

        if (type === 'node') {
            const arch = process.arch; // 'x64', 'arm64'
            const isWindows = process.platform === 'win32';
            const extension = isWindows ? 'zip' : 'tar.gz';
            // Node.js uses 'win' not 'win32' in download URLs
            const platformName = isWindows ? 'win' : process.platform;
            const fileName = `node-v${version}-${platformName}-${arch}.${extension}`;
            const url = `${NODE_DIST_BASE_URL}/v${version}/${fileName}`;
            const downloadPath = path.join(runtimeDir, fileName);

            console.log(`Downloading Node.js from ${url}...`);

            // Download
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to download Node.js: ${response.statusText}`);
            if (!response.body) throw new Error('No response body');

            // @ts-ignore - fetch body is a ReadableStream (Node.js fetch vs web fetch types)
            await pipeline(response.body, createWriteStream(downloadPath));

            // Extract
            console.log(`Extracting Node.js to ${runtimeDir}...`);
            if (isWindows) {
                // Windows: Use PowerShell to extract zip
                const extractDir = path.join(runtimeDir, 'temp_extract');
                await execAsync(`powershell -Command "Expand-Archive -Path '${downloadPath}' -DestinationPath '${extractDir}' -Force"`);
                // Move contents from nested folder (node-vX.Y.Z-win-x64) to runtimeDir
                const nestedFolder = path.join(extractDir, `node-v${version}-${platformName}-${arch}`);
                await execAsync(`powershell -Command "Move-Item -Path '${nestedFolder}\\*' -Destination '${runtimeDir}' -Force"`);
                // Cleanup temp folder
                await execAsync(`powershell -Command "Remove-Item -Path '${extractDir}' -Recurse -Force"`);
            } else {
                await execAsync(`tar -xzf "${downloadPath}" -C "${runtimeDir}" --strip-components=1`);
            }

            // Cleanup
            fs.unlinkSync(downloadPath);

            const binPath = process.platform === 'win32'
                ? path.join(runtimeDir, 'node.exe') // Check this assumption for windows zip
                : path.join(runtimeDir, 'bin', 'node');

            // Track la instalación del runtime
            await analyticsService.trackRuntimeUsage(
                type,
                version,
                'shared',
                'installed'
            ).catch(() => { }); // Fire and forget

            return binPath;
        } else {
            // ============================
            // Python installation (standalone)
            // ============================
            const arch = process.arch; // 'x64', 'arm64'
            const platform = process.platform;

            const { url, archiveName } = this.getPythonDownloadInfo(version, platform, arch);
            const downloadPath = path.join(runtimeDir, archiveName);

            console.log(`Downloading Python from ${url}...`);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to download Python: ${response.status} ${response.statusText}`);
            }
            if (!response.body) {
                throw new Error('No response body when downloading Python');
            }

            // Guardar el .tar.gz
            // @ts-ignore
            await pipeline(response.body, createWriteStream(downloadPath));

            console.log(`Extracting Python to ${runtimeDir}...`);

            // Los artefactos de python-build-standalone son .tar.gz en las tres plataformas
            // y contienen una carpeta raíz `python/`.
            await execAsync(`tar -xzf "${downloadPath}" -C "${runtimeDir}"`);

            // Limpieza
            fs.unlinkSync(downloadPath);

            // Ruta al ejecutable según plataforma
            const pythonBaseDir = path.join(runtimeDir, 'python');
            const pythonBin = platform === 'win32'
                ? path.join(pythonBaseDir, 'python.exe')
                : path.join(pythonBaseDir, 'bin', 'python3');

            if (!fs.existsSync(pythonBin)) {
                throw new Error(`Python binary not found at ${pythonBin}`);
            }

            // Track la instalación del runtime
            await analyticsService.trackRuntimeUsage(
                type,
                version,
                'shared',
                'installed'
            ).catch(() => { }); // Fire and forget

            return pythonBin;
        }
    }

    /**
     * Info de descarga de Python standalone (python-build-standalone).
     * Por simplicidad, soportamos solo 64-bit (x64 / arm64) y una versión concreta.
     */
    private getPythonDownloadInfo(
        version: string,
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture
    ): { url: string; archiveName: string } {
        // De momento soportamos solo la rama 3.13.*
        if (!version.startsWith('3.13')) {
            console.warn(
                `[Levante] Solo se soporta instalación automática de Python 3.13.* por ahora. ` +
                `Has pedido "${version}", se usará un build standalone 3.13 igualmente.`
            );
        }

        // Ojo: estos nombres siguen el patrón de python-build-standalone para 3.13.
        // Si en el futuro cambian, solo habría que actualizar nombres/fecha aquí.
        // Usamos nombres con `+` para el archivo local, y los codificamos en la URL.

        if (platform === 'linux' && arch === 'x64') {
            const archiveName =
                'cpython-3.13.0+20241016-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz';
            const url =
                'https://github.com/indygreg/python-build-standalone/releases/download/20241016/' +
                encodeURIComponent(archiveName);
            return { url, archiveName };
        }

        if (platform === 'darwin' && arch === 'arm64') {
            const archiveName =
                'cpython-3.13.0+20241016-aarch64-apple-darwin-install_only_stripped.tar.gz';
            const url =
                'https://github.com/indygreg/python-build-standalone/releases/download/20241016/' +
                encodeURIComponent(archiveName);
            return { url, archiveName };
        }

        if (platform === 'win32' && arch === 'x64') {
            const archiveName =
                'cpython-3.13.0+20241016-x86_64-pc-windows-msvc-install_only_stripped.tar.gz';
            const url =
                'https://github.com/indygreg/python-build-standalone/releases/download/20241016/' +
                encodeURIComponent(archiveName);
            return { url, archiveName };
        }

        throw new Error(
            `Automatic Python installation not supported for platform=${platform} arch=${arch}`
        );
    }

    /**
     * Registers that a server is using a specific runtime.
     */
    async registerServerUsage(serverId: string, runtimeKey: string): Promise<void> {
        const usage = await this.loadUsage();

        if (!usage[runtimeKey]) {
            usage[runtimeKey] = [];
        }

        if (!usage[runtimeKey].includes(serverId)) {
            usage[runtimeKey].push(serverId);
            await this.saveUsage(usage);

            // Track el uso del runtime (solo primera vez)
            const [type, version] = runtimeKey.split('-');
            await analyticsService.trackRuntimeUsage(
                type as RuntimeType,
                version,
                'shared', // Solo trackeamos runtimes de Levante
                'used',
                serverId
            ).catch(() => { }); // Fire and forget
        }
    }

    /**
     * Returns a list of installed runtimes.
     */
    async getInstalledRuntimes(): Promise<RuntimeInfo[]> {
        const runtimes: RuntimeInfo[] = [];

        if (!fs.existsSync(this.runtimesPath)) {
            return [];
        }

        const usage = await this.loadUsage();

        const types = fs.readdirSync(this.runtimesPath);
        for (const type of types) {
            // Skip if not a directory or hidden
            if (type.startsWith('.') || type === 'usage.json' || type === 'uv') continue;

            const typePath = path.join(this.runtimesPath, type);
            if (!fs.statSync(typePath).isDirectory()) continue;

            const versions = fs.readdirSync(typePath);
            for (const version of versions) {
                if (version.startsWith('.')) continue;

                const versionPath = path.join(typePath, version);
                if (!fs.statSync(versionPath).isDirectory()) continue;

                const runtimeKey = `${type}-${version}`;
                const usedBy = usage[runtimeKey] || [];

                // Basic info
                runtimes.push({
                    type: type as RuntimeType,
                    version: version,
                    path: versionPath,
                    source: 'shared',
                    usedBy: usedBy,
                    size: 'Unknown' // TODO: Implement size calculation
                });
            }
        }

        return runtimes;
    }

    /**
     * Removes runtimes that are not being used by any server.
     */
    async cleanupUnusedRuntimes(): Promise<void> {
        if (!fs.existsSync(this.runtimesPath)) {
            return;
        }

        const usage = await this.loadUsage();

        const types = fs.readdirSync(this.runtimesPath);
        for (const type of types) {
            // Skip special directories
            if (type.startsWith('.') || type === 'usage.json' || type === 'uv') continue;

            const typePath = path.join(this.runtimesPath, type);
            if (!fs.statSync(typePath).isDirectory()) continue;

            const versions = fs.readdirSync(typePath);
            for (const version of versions) {
                if (version.startsWith('.')) continue;

                const versionPath = path.join(typePath, version);
                if (!fs.statSync(versionPath).isDirectory()) continue;

                const runtimeKey = `${type}-${version}`;
                const usedBy = usage[runtimeKey] || [];

                // If not used by any server, remove it
                if (usedBy.length === 0) {
                    console.log(`Removing unused runtime: ${runtimeKey} at ${versionPath}`);

                    // Remove directory recursively
                    try {
                        if (process.platform === 'win32') {
                            await execAsync(`rmdir /s /q "${versionPath}"`);
                        } else {
                            await execAsync(`rm -rf "${versionPath}"`);
                        }

                        // Remove from usage tracking
                        delete usage[runtimeKey];
                    } catch (error) {
                        console.error(`Failed to remove runtime ${runtimeKey}:`, error);
                    }
                }
            }
        }

        // Save updated usage
        await this.saveUsage(usage);
    }

    /**
     * Ensures uv/uvx is available and returns the path to uvx executable.
     * uv is installed in ~/levante/runtimes/uv/
     */
    async ensureUvx(): Promise<string> {
        // First check if uv is already installed in Levante runtimes
        const uvDir = path.join(this.runtimesPath, 'uv');
        const isWindows = process.platform === 'win32';

        // Check for uvx in Levante runtimes
        // The uv installer may place binaries directly in uvDir or in uvDir/bin/
        // depending on the platform and installer version - check both locations
        const uvxBinPaths = isWindows
            ? [
                path.join(uvDir, 'uvx.exe'),
                path.join(uvDir, 'bin', 'uvx.exe'),
              ]
            : [
                path.join(uvDir, 'uvx'),
                path.join(uvDir, 'bin', 'uvx'),
              ];

        for (const uvxBin of uvxBinPaths) {
            if (fs.existsSync(uvxBin)) {
                return uvxBin;
            }
        }

        // Not found in Levante runtimes - install it
        // Note: We always use Levante's own uv/uvx, never the system one
        await this.installUvWithLock();

        // Check again after installation
        for (const uvxBin of uvxBinPaths) {
            if (fs.existsSync(uvxBin)) {
                return uvxBin;
            }
        }

        throw new Error('Failed to install uvx. Please install uv manually: https://docs.astral.sh/uv/');
    }

    /**
     * Installs uv with locking to prevent concurrent installations.
     */
    private async installUvWithLock(): Promise<void> {
        // Check if installation is already in progress
        if (uvInstallationLock.promise) {
            console.log('[RuntimeManager] Waiting for ongoing uv installation...');
            await uvInstallationLock.promise;
            return;
        }

        // Start new installation with lock
        const installPromise = this.installUv()
            .finally(() => {
                uvInstallationLock.promise = null;
            });

        uvInstallationLock.promise = installPromise;
        console.log('[RuntimeManager] Starting installation of uv/uvx...');

        await installPromise;
    }

    /**
     * Installs uv (which includes uvx) using the official installer.
     * Installs to ~/levante/runtimes/uv/
     */
    private async installUv(): Promise<void> {
        const uvDir = path.join(this.runtimesPath, 'uv');
        fs.mkdirSync(uvDir, { recursive: true });

        const isWindows = process.platform === 'win32';

        if (isWindows) {
            // Windows: Use PowerShell installer with custom install dir
            // UV_INSTALL_DIR sets where uv installs binaries
            const installScript = `
                $env:UV_INSTALL_DIR = '${uvDir.replace(/\\/g, '\\\\')}';
                irm https://astral.sh/uv/install.ps1 | iex
            `;
            await execAsync(`powershell -ExecutionPolicy Bypass -Command "${installScript}"`);
        } else {
            // macOS/Linux: Use shell installer with custom install dir
            const installCommand = `curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR="${uvDir}" sh`;
            await execAsync(installCommand);
        }

        console.log('uv/uvx installed successfully');
    }

    /**
     * Gets the path to uvx if installed, or null if not found.
     */
    getUvxPath(): string | null {
        const uvDir = path.join(this.runtimesPath, 'uv');
        const isWindows = process.platform === 'win32';

        // The uv installer may place binaries directly in uvDir or in uvDir/bin/
        // depending on the platform and installer version - check both locations
        const uvxBinPaths = isWindows
            ? [
                path.join(uvDir, 'uvx.exe'),
                path.join(uvDir, 'bin', 'uvx.exe'),
              ]
            : [
                path.join(uvDir, 'uvx'),
                path.join(uvDir, 'bin', 'uvx'),
              ];

        for (const uvxBin of uvxBinPaths) {
            if (fs.existsSync(uvxBin)) {
                return uvxBin;
            }
        }

        return null;
    }

    private async loadUsage(): Promise<Record<string, string[]>> {
        try {
            if (fs.existsSync(this.usagePath)) {
                const content = fs.readFileSync(this.usagePath, 'utf-8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.error('Failed to load runtime usage:', error);
        }
        return {};
    }

    private async saveUsage(usage: Record<string, string[]>): Promise<void> {
        try {
            // Ensure runtimes directory exists
            if (!fs.existsSync(this.runtimesPath)) {
                fs.mkdirSync(this.runtimesPath, { recursive: true });
            }
            fs.writeFileSync(this.usagePath, JSON.stringify(usage, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save runtime usage:', error);
        }
    }
}
