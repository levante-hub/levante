import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import { sanitizeMessagesForModel } from '../toolMessageSanitizer';

function makeAssistantMessage(parts: any[]): UIMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    parts,
  } as UIMessage;
}

function makeToolPart(overrides: Record<string, unknown> = {}) {
  return {
    type: 'tool-invocation',
    toolCallId: overrides.toolCallId ?? 'call_1',
    toolName: overrides.toolName ?? 'bash',
    args: {},
    ...overrides,
  };
}

describe('sanitizeMessagesForModel', () => {
  it('converts approval-responded with approved=false to output-denied', () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({
          state: 'approval-responded',
          approval: { id: 'a1', approved: false },
          output: 'should be removed',
          errorText: 'should be removed',
        }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.state).toBe('output-denied');
    expect(part.approval.approved).toBe(false);
    expect(part.output).toBeUndefined();
    expect(part.errorText).toBeUndefined();
  });

  it('converts approval-requested to output-denied with fallback reason', () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({
          state: 'approval-requested',
          approval: { id: 'a1' },
        }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.state).toBe('output-denied');
    expect(part.approval.approved).toBe(false);
    expect(part.approval.reason).toContain('approval was still pending');
    expect(part.output).toBeUndefined();
  });

  it('converts approval-requested without approval object to output-denied', () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({
          toolCallId: 'call_xyz',
          state: 'approval-requested',
        }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.state).toBe('output-denied');
    expect(part.approval.id).toBe('pending-call_xyz');
    expect(part.approval.approved).toBe(false);
  });

  it('converts input-available to output-error', () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({
          state: 'input-available',
          output: 'should be removed',
        }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.state).toBe('output-error');
    expect(part.errorText).toContain('interrupted');
    expect(part.output).toBeUndefined();
  });

  it('converts input-streaming to output-error', () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({
          state: 'input-streaming',
        }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.state).toBe('output-error');
    expect(part.errorText).toContain('interrupted');
  });

  it('does not alter a valid output-available tool', () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({
          state: 'output-available',
          output: 'valid result',
        }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.state).toBe('output-available');
    expect(part.output).toBe('valid result');
  });

  it('does not alter approval-responded with approved=true', () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({
          state: 'approval-responded',
          approval: { id: 'a1', approved: true },
        }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.state).toBe('approval-responded');
    expect(part.approval.approved).toBe(true);
  });

  it('does not mutate the original messages', () => {
    const original: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({
          state: 'approval-requested',
          approval: { id: 'a1' },
        }),
      ]),
    ];

    const originalState = (original[0].parts[0] as any).state;
    sanitizeMessagesForModel(original);

    expect((original[0].parts[0] as any).state).toBe(originalState);
  });

  it('preserves Google thoughtSignature in providerMetadata', () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({
          state: 'output-available',
          output: 'result',
          providerMetadata: {
            google: { thoughtSignature: 'sig123' },
          },
        }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.providerMetadata.google.thoughtSignature).toBe('sig123');
  });

  it('removes providerMetadata without thoughtSignature', () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({
          state: 'output-available',
          output: 'result',
          providerMetadata: {
            openai: { someField: 'value' },
          },
        }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.providerMetadata).toBeUndefined();
  });

  it('preserves canonical tool outputs intact', () => {
    const output = {
      __levanteToolResult: 1,
      text: 'canonical',
      modelOutput: {
        type: 'content',
        value: [
          { type: 'text', text: 'canonical' },
          {
            kind: 'image-ref',
            assetId: 'asset-1',
            mediaType: 'image/png',
            byteSize: 4,
            base64Length: 4,
            sha256: 'asset-1',
          },
        ],
      },
    };

    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({ state: 'output-available', output }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.output).toEqual(output);
    expect(part.output.modelOutput.value[1].kind).toBe('image-ref');
  });

  it('strips uiResources and images from legacy outputs', () => {
    const output = {
      text: 'txt',
      content: [{ type: 'text', text: 'txt' }],
      uiResources: [{ type: 'resource' }],
      images: [{ data: 'AAAA', mediaType: 'image/png' }],
    };

    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({ state: 'output-available', output }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.output.uiResources).toBeUndefined();
    expect(part.output.images).toBeUndefined();
    expect(part.output.text).toBe('txt');
    expect(part.output.content).toEqual([{ type: 'text', text: 'txt' }]);
  });

  it('strips uiResources from non-canonical outputs', () => {
    const output = {
      uiResources: [{ type: 'resource' }],
      text: 'some text',
    };

    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({ state: 'output-available', output }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.output.uiResources).toBeUndefined();
    expect(part.output.text).toBe('some text');
  });

  it('preserves uiResources when output is canonical', () => {
    const output = {
      __levanteToolResult: 1,
      text: 'canonical',
      modelOutput: { type: 'text', value: 'canonical' },
      uiResources: [{ type: 'resource' }],
    };

    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({ state: 'output-available', output }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.output.uiResources).toEqual([{ type: 'resource' }]);
  });

  it('falls back to "[Widget rendered]" when legacy output has no recognized fields', () => {
    const output = {
      uiResources: [{ type: 'resource' }],
      images: [{ data: 'AAAA', mediaType: 'image/png' }],
    };

    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({ state: 'output-available', output }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.output).toBe('[Widget rendered]');
  });

  it('sanitizes legacy content[].image without inventing image-data', () => {
    const output = {
      uiResources: [],
      content: [
        { type: 'text', text: 'header' },
        { type: 'image', data: 'BIGBASE64', mimeType: 'image/png' },
      ],
    };

    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({ state: 'output-available', output }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.output.uiResources).toBeUndefined();
    expect(part.output.content).toEqual([
      { type: 'text', text: 'header' },
      { type: 'image', mimeType: 'image/png', omitted: true },
    ]);
    expect(JSON.stringify(part.output)).not.toContain('BIGBASE64');
  });

  it('does not mutate the original input', () => {
    const output = {
      uiResources: [{ type: 'resource' }],
      content: [{ type: 'image', data: 'XXX', mimeType: 'image/png' }],
      images: [{ data: 'AAAA', mediaType: 'image/png' }],
    };
    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({ state: 'output-available', output }),
      ]),
    ];
    const snapshot = JSON.parse(JSON.stringify(messages));

    sanitizeMessagesForModel(messages);

    expect(messages).toEqual(snapshot);
  });

  it('keeps structuredContent available on legacy outputs', () => {
    const output = {
      uiResources: [],
      structuredContent: { payload: 123 },
      content: [{ type: 'text', text: 'hi' }],
    };

    const messages: UIMessage[] = [
      makeAssistantMessage([
        makeToolPart({ state: 'output-available', output }),
      ]),
    ];

    const result = sanitizeMessagesForModel(messages);
    const part = result[0].parts[0] as any;

    expect(part.output.structuredContent).toEqual({ payload: 123 });
    expect(part.output.content).toEqual([{ type: 'text', text: 'hi' }]);
    expect(part.output.uiResources).toBeUndefined();
  });
});
