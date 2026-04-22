import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// fs.existsSync is used by getShellConfig to probe the override + well-known paths.
// Mock it per-test to exercise each branch.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

import { existsSync } from 'fs';
import { getShellConfig } from '../shell';

const existsSyncMock = existsSync as unknown as ReturnType<typeof vi.fn>;

describe('getShellConfig override', () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the override when it exists', () => {
    existsSyncMock.mockImplementation((p: string) =>
      p === '/custom/levante/gitbash/bin/bash.exe'
    );

    const config = getShellConfig('/custom/levante/gitbash/bin/bash.exe');

    expect(config.shell).toBe('/custom/levante/gitbash/bin/bash.exe');
    expect(config.args).toEqual(['-c']);
  });

  it('falls back to auto-detection when the override is missing', () => {
    // Override path does not exist; platform fallback kicks in.
    existsSyncMock.mockImplementation((p: string) => p === '/bin/bash');

    const config = getShellConfig('/missing/bash.exe');

    // On the test machine (non-win32), this should return /bin/bash.
    if (process.platform !== 'win32') {
      expect(config.shell).toBe('/bin/bash');
      expect(config.args).toEqual(['-c']);
    } else {
      // On Windows without Git Bash installed, falls back to PowerShell.
      expect(['powershell.exe', 'C:\\Program Files\\Git\\bin\\bash.exe']).toContain(config.shell);
    }
  });

  it('uses auto-detection when no override is passed', () => {
    existsSyncMock.mockImplementation((p: string) => p === '/bin/bash');

    const config = getShellConfig();

    if (process.platform !== 'win32') {
      expect(config.shell).toBe('/bin/bash');
    }
  });
});
