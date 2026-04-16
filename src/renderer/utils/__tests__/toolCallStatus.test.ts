import { describe, expect, it } from 'vitest';
import {
  deriveToolCallVisualStatus,
  isBackgroundTaskOutput,
} from '../toolCallStatus';

describe('toolCallStatus', () => {
  it('detects background task outputs', () => {
    const output = {
      status: 'background',
      taskId: 'task-123',
      pid: 4242,
    };

    expect(isBackgroundTaskOutput(output)).toBe(true);
    expect(
      deriveToolCallVisualStatus({
        state: 'output-available',
        output,
      })
    ).toBe('background');
  });

  it('keeps standard tool output states intact', () => {
    expect(deriveToolCallVisualStatus({ state: 'input-available' })).toBe('running');
    expect(
      deriveToolCallVisualStatus({
        state: 'output-available',
        output: { status: 'success' },
      })
    ).toBe('success');
    expect(deriveToolCallVisualStatus({ state: 'output-error' })).toBe('error');
    expect(deriveToolCallVisualStatus({ state: 'input-start' })).toBe('pending');
  });
});
