import { AsyncLocalStorage } from 'async_hooks';
import { app } from 'electron';
import { isProduction } from './winstonConfig';

type AnySpan = {
  end(): void;
  recordException(error: unknown): void;
  setStatus(status: { code: number; message?: string }): void;
  setAttributes(attrs: Record<string, string | number | boolean>): void;
};

type LogfireModule = {
  configure(config: Record<string, unknown>): void;
  startSpan(msgTemplate: string, attributes?: Record<string, unknown>, options?: { parentSpan?: AnySpan }): AnySpan;
};

let logfireModule: LogfireModule | null = null;

// Own AsyncLocalStorage for parent span tracking — more reliable than OTel context API
// because logfire's startSpan() may not automatically read the OTel active context.
const spanStorage = new AsyncLocalStorage<AnySpan | null>();

export async function initializeLogfire(): Promise<void> {
  if (isProduction()) return;
  if (!process.env.LOGFIRE_TOKEN) return;

  try {
    logfireModule = (await import('@pydantic/logfire-node')) as unknown as LogfireModule;
    logfireModule.configure({
      token: process.env.LOGFIRE_TOKEN,
      serviceName: 'levante',
      serviceVersion: app.getVersion(),
      environment: process.env.LOGFIRE_ENVIRONMENT ?? 'dev',
      sendToLogfire: true,
    });
  } catch (e) {
    console.error('[Logfire] Failed to initialize:', e);
    logfireModule = null;
  }
}

export function isLogfireEnabled(): boolean {
  return logfireModule !== null;
}

/**
 * Create a span. Automatically uses the span stored in AsyncLocalStorage as parent,
 * so parent-child nesting works without manual threading.
 */
export function openSpan(name: string, attrs: Record<string, unknown>): AnySpan | null {
  if (!logfireModule) return null;
  try {
    const parentSpan = spanStorage.getStore() ?? undefined;
    return logfireModule.startSpan(name, attrs, parentSpan ? { parentSpan } : undefined);
  } catch {
    return null;
  }
}

export function closeSpan(span: AnySpan | null, attrs?: Record<string, string | number | boolean>): void {
  if (!span) return;
  try {
    if (attrs) span.setAttributes(attrs);
    span.end();
  } catch { /* noop */ }
}

export function failSpan(span: AnySpan | null, error: unknown): void {
  if (!span) return;
  try {
    span.recordException(error);
    span.setStatus({ code: 2 }); // SpanStatusCode.ERROR
    span.end();
  } catch { /* noop */ }
}

/**
 * Run async fn() with span as the active parent in spanStorage.
 * Child spans created via openSpan() inside fn() will be nested under span.
 * Does NOT close the span.
 */
export function withActiveSpan<T>(span: AnySpan | null, fn: () => Promise<T>): Promise<T> {
  if (!logfireModule || !span) return fn();
  return spanStorage.run(span, fn);
}

/**
 * Run synchronous fn() with span as the active parent in spanStorage.
 * Does NOT close the span.
 */
export function runWithSpanContext<T>(span: AnySpan | null, fn: () => T): T {
  if (!logfireModule || !span) return fn();
  return spanStorage.run(span, fn);
}

/**
 * Create a span, activate it in spanStorage, run fn(), then close it.
 * Errors from fn() cause failSpan and are re-thrown.
 */
export async function withAgentSpan<T>(
  name: string,
  attrs: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  if (!logfireModule) return fn();
  const span = openSpan(name, attrs);
  return spanStorage.run(span, async () => {
    try {
      return await fn();
    } catch (e) {
      failSpan(span, e);
      throw e;
    } finally {
      closeSpan(span);
    }
  });
}

/**
 * Create a span and activate it in spanStorage for each generator iteration.
 * Each gen.next() runs with this span as the active parent, so any openSpan()
 * calls inside the generator will be properly nested under this span.
 */
export async function* withAgentGenerator<T>(
  name: string,
  attrs: Record<string, unknown>,
  gen: AsyncGenerator<T>
): AsyncGenerator<T> {
  if (!logfireModule) { yield* gen; return; }

  const span = openSpan(name, attrs);
  if (!span) { yield* gen; return; }

  try {
    // Run each gen.next() within spanStorage context so child spans (llm.stream,
    // mcp.tool.call, etc.) created during generator execution are nested under span.
    let iteration = await spanStorage.run(span, () => gen.next());
    while (!iteration.done) {
      yield iteration.value;
      iteration = await spanStorage.run(span, () => gen.next());
    }
  } catch (e) {
    failSpan(span, e);
    throw e;
  } finally {
    // CRITICAL: always end the span, even when the caller breaks out of `for await`
    // (e.g. chatHandlers breaking on chunk.done=true calls .return() on this generator,
    // skipping everything after the last yield — without finally the span is never
    // exported to Logfire and child spans appear as orphan roots).
    closeSpan(span);
  }
}

/** Truncate a string to maxBytes for span attribute storage */
export function truncateAttr(s: string | undefined | null, maxBytes = 4096): string {
  if (!s) return '';
  if (s.length <= maxBytes) return s;
  return s.slice(0, maxBytes) + '…[truncated]';
}

/** Serialize a value to JSON, truncated to maxBytes */
export function summarizeAttr(value: unknown, maxBytes = 8192): string {
  try {
    const json = JSON.stringify(value);
    if (json.length <= maxBytes) return json;
    return json.slice(0, maxBytes) + '…[truncated]';
  } catch {
    return '[unserializable]';
  }
}
