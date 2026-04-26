import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { RuntimeManager } from '../runtimeManager';
import { ensureCoworkPrerequisites, type CoworkPrereqStep } from '../coworkPrerequisites';

// fs.existsSync is used by ensureCoworkPrerequisites to double-check the
// Levante-managed shell path returned by findLevanteRuntime.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

function makeLogger() {
  const entry = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return {
    core: entry,
    aiSdk: entry,
    mcp: entry,
    database: entry,
    ipc: entry,
    preferences: entry,
    models: entry,
    analytics: entry,
    oauth: entry,
  } as unknown as import('../../logging').Logger;
}

function makeRuntimeManager(overrides: Partial<{
  detectSystemRuntime: (type: string) => Promise<string | null>;
  findLevanteRuntime: (type: string, version: string) => string | null;
  ensureRuntime: (config: { type: string; version: string }) => Promise<string>;
}> = {}): RuntimeManager {
  return {
    detectSystemRuntime: overrides.detectSystemRuntime ?? vi.fn(async () => null),
    findLevanteRuntime: overrides.findLevanteRuntime ?? vi.fn(() => null),
    ensureRuntime: overrides.ensureRuntime ?? vi.fn(async (cfg) => `/mocked/${cfg.type}`),
  } as unknown as RuntimeManager;
}

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform });
}

describe('ensureCoworkPrerequisites', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it('on win32 uses system Git Bash when available (no install)', async () => {
    setPlatform('win32');
    const detectSystemRuntime = vi.fn(async (type: string) =>
      type === 'gitbash' ? 'C:/Program Files/Git/bin/bash.exe' : null
    );
    const ensureRuntime = vi.fn(async (cfg: { type: string; version: string }) =>
      cfg.type === 'python' ? '/py/python' : ''
    );
    const rm = makeRuntimeManager({ detectSystemRuntime, ensureRuntime });

    const steps: CoworkPrereqStep[] = [];
    const result = await ensureCoworkPrerequisites(rm, makeLogger(), {
      onProgress: (s) => steps.push(s),
    });

    expect(result.shellPath).toBe('C:/Program Files/Git/bin/bash.exe');
    expect(result.pythonPath).toBe('/py/python');
    expect(ensureRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'python' })
    );
    expect(ensureRuntime).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gitbash' })
    );
    expect(steps).toContain('checking');
    expect(steps).toContain('ready');
    expect(steps).not.toContain('installing-gitbash');
  });

  it('skips ensuring-python when a managed Python is already on disk', async () => {
    setPlatform('darwin');
    const findLevanteRuntime = vi.fn((type: string) =>
      type === 'python' ? '/levante/runtimes/python/3.13.0/python/bin/python3' : null
    );
    const ensureRuntime = vi.fn();
    const rm = makeRuntimeManager({ findLevanteRuntime, ensureRuntime });

    const steps: CoworkPrereqStep[] = [];
    const result = await ensureCoworkPrerequisites(rm, makeLogger(), {
      onProgress: (s) => steps.push(s),
    });

    expect(result.pythonPath).toBe('/levante/runtimes/python/3.13.0/python/bin/python3');
    expect(ensureRuntime).not.toHaveBeenCalled();
    expect(steps).not.toContain('ensuring-python');
    expect(steps).toContain('ready');
  });

  it('on win32 falls through system → managed → install', async () => {
    setPlatform('win32');
    const detectSystemRuntime = vi.fn(async () => null);
    const findLevanteRuntime = vi.fn(() => null);
    const ensureRuntime = vi.fn(async (cfg: { type: string; version: string }) =>
      cfg.type === 'gitbash' ? '/managed/gitbash/bin/bash.exe' : '/managed/python'
    );
    const rm = makeRuntimeManager({
      detectSystemRuntime,
      findLevanteRuntime,
      ensureRuntime,
    });

    const steps: CoworkPrereqStep[] = [];
    const result = await ensureCoworkPrerequisites(rm, makeLogger(), {
      onProgress: (s) => steps.push(s),
    });

    expect(detectSystemRuntime).toHaveBeenCalledWith('gitbash');
    expect(findLevanteRuntime).toHaveBeenCalledWith('gitbash', expect.any(String));
    expect(ensureRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gitbash' })
    );
    expect(result.shellPath).toBe('/managed/gitbash/bin/bash.exe');
    expect(steps).toContain('installing-gitbash');
  });

  it('on darwin skips gitbash entirely', async () => {
    setPlatform('darwin');
    const detectSystemRuntime = vi.fn();
    const findLevanteRuntime = vi.fn(() => null);
    const ensureRuntime = vi.fn(async () => '/py/python3');
    const rm = makeRuntimeManager({
      detectSystemRuntime,
      findLevanteRuntime,
      ensureRuntime,
    });

    const result = await ensureCoworkPrerequisites(rm, makeLogger());

    expect(detectSystemRuntime).not.toHaveBeenCalled();
    // findLevanteRuntime is consulted for Python (to skip progress events
    // when it's already cached) but never for gitbash on non-Windows.
    expect(findLevanteRuntime).not.toHaveBeenCalledWith('gitbash', expect.any(String));
    expect(result.shellPath).toBeNull();
    expect(ensureRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'python' })
    );
  });

  it('on linux skips gitbash entirely', async () => {
    setPlatform('linux');
    const ensureRuntime = vi.fn(async () => '/usr/bin/python3');
    const rm = makeRuntimeManager({ ensureRuntime });

    const result = await ensureCoworkPrerequisites(rm, makeLogger());

    expect(result.shellPath).toBeNull();
    expect(result.pythonPath).toBe('/usr/bin/python3');
  });

  it('collects warnings when Python provisioning fails', async () => {
    setPlatform('darwin');
    const ensureRuntime = vi.fn(async () => {
      throw new Error('network unreachable');
    });
    const rm = makeRuntimeManager({ ensureRuntime });

    const result = await ensureCoworkPrerequisites(rm, makeLogger());

    expect(result.pythonPath).toBeNull();
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('network unreachable');
  });
});
