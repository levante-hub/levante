import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0-test' },
}));

vi.mock('../winstonConfig', () => ({
  isProduction: () => false,
}));

import {
  isLogfireEnabled,
  openSpan,
  closeSpan,
  failSpan,
  withAgentSpan,
  withAgentGenerator,
} from '../logfire';

async function* makeGen<T>(values: T[]): AsyncGenerator<T> {
  for (const v of values) yield v;
}

describe('logfire helpers (Logfire disabled — no token)', () => {
  it('isLogfireEnabled() returns false when not initialized', () => {
    expect(isLogfireEnabled()).toBe(false);
  });

  it('openSpan() returns null when disabled', () => {
    expect(openSpan('test', {})).toBeNull();
  });

  it('closeSpan(null) is safe', () => {
    expect(() => closeSpan(null)).not.toThrow();
    expect(() => closeSpan(null, { k: 1 })).not.toThrow();
  });

  it('failSpan(null, error) is safe', () => {
    expect(() => failSpan(null, new Error('boom'))).not.toThrow();
  });

  it('withAgentGenerator passes through all values when disabled', async () => {
    const values = [1, 2, 3];
    const result: number[] = [];
    for await (const v of withAgentGenerator('span', {}, makeGen(values))) {
      result.push(v);
    }
    expect(result).toEqual(values);
  });

  it('withAgentGenerator propagates errors when disabled', async () => {
    async function* failGen(): AsyncGenerator<number> {
      yield 1;
      throw new Error('gen error');
    }
    await expect(async () => {
      for await (const _ of withAgentGenerator('span', {}, failGen())) { /* consume */ }
    }).rejects.toThrow('gen error');
  });

  it('withAgentSpan passes through to fn when disabled', async () => {
    const result = await withAgentSpan('span', {}, async () => 42);
    expect(result).toBe(42);
  });

  it('withAgentSpan propagates errors from fn when disabled', async () => {
    await expect(
      withAgentSpan('span', {}, async () => { throw new Error('fn error'); })
    ).rejects.toThrow('fn error');
  });
});

describe('span helpers with a fake span', () => {
  const makeSpan = () => ({
    end: vi.fn(),
    recordException: vi.fn(),
    setStatus: vi.fn(),
    setAttributes: vi.fn(),
  });

  it('closeSpan calls setAttributes then end()', () => {
    const span = makeSpan();
    closeSpan(span, { key: 1, label: 'ok' });
    expect(span.setAttributes).toHaveBeenCalledWith({ key: 1, label: 'ok' });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('closeSpan without attrs calls only end()', () => {
    const span = makeSpan();
    closeSpan(span);
    expect(span.setAttributes).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('failSpan records exception, sets error status (code 2), then ends', () => {
    const span = makeSpan();
    const err = new Error('boom');
    failSpan(span, err);
    expect(span.recordException).toHaveBeenCalledWith(err);
    expect(span.setStatus).toHaveBeenCalledWith({ code: 2 });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('double-closing a span does not throw', () => {
    const span = makeSpan();
    closeSpan(span);
    expect(() => closeSpan(span)).not.toThrow();
    expect(span.end).toHaveBeenCalledTimes(2); // second call is no-op in real OTel
  });
});
