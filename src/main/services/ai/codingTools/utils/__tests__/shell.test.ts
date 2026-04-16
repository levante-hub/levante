import { describe, expect, it } from 'vitest';
import { sanitizeBinaryOutput, stripAnsiSequences } from '../shell';

describe('shell output sanitization', () => {
  it('removes ANSI sequences from Vite startup output', () => {
    const viteLine =
      '\u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://localhost:\u001b[1m5174\u001b[22m/\u001b[39m';

    expect(stripAnsiSequences(viteLine)).toBe('➜  Local:   http://localhost:5174/');
  });

  it('removes ANSI sequences and binary control characters while preserving newlines', () => {
    const noisyOutput = '\u001b[32mLocal:\u001b[39m http://localhost:5174/\u0000\nready';

    expect(sanitizeBinaryOutput(noisyOutput)).toBe('Local: http://localhost:5174/\nready');
  });
});
