import { describe, expect, it } from 'vitest';
import type { Model } from '../../../types/models';
import { resolveFirstSyncSelectedIds, selectTopModels } from './topModels';

function makeModel(id: string, provider: string): Model {
  return {
    id,
    name: id,
    provider,
    contextLength: 128000,
    capabilities: ['text'],
    isAvailable: true,
    userDefined: false,
  };
}

describe('selectTopModels', () => {
  it('selects only curated OpenAI models and does not fill with arbitrary models', () => {
    const models = [
      makeModel('gpt-5.4-mini', 'openai'),
      makeModel('gpt-5.4', 'openai'),
      makeModel('gpt-5.3-codex', 'openai'),
      makeModel('gpt-5.1-codex', 'openai'),
      makeModel('gpt-4o', 'openai'),
      makeModel('gpt-4.1', 'openai'),
    ];

    expect(selectTopModels(models, 'openai')).toEqual([
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.3-codex',
      'gpt-5.1-codex',
    ]);
  });

  it('does not let gpt-5.4 match gpt-5.4-mini', () => {
    const models = [
      makeModel('gpt-5.4-mini', 'openai'),
      makeModel('gpt-5.4', 'openai'),
    ];

    expect(selectTopModels(models, 'openai')).toEqual([
      'gpt-5.4',
      'gpt-5.4-mini',
    ]);
  });

  it('selects the latest Anthropic revision for a prefix matcher', () => {
    const models = [
      makeModel('claude-sonnet-4-6-20260115', 'anthropic'),
      makeModel('claude-sonnet-4-6-20260301', 'anthropic'),
      makeModel('claude-opus-4-6-20260301', 'anthropic'),
      makeModel('claude-haiku-4-5-20251001', 'anthropic'),
      makeModel('claude-3-5-sonnet-20241022', 'anthropic'),
    ];

    expect(selectTopModels(models, 'anthropic')).toEqual([
      'claude-sonnet-4-6-20260301',
      'claude-opus-4-6-20260301',
      'claude-haiku-4-5-20251001',
    ]);
  });

  it('returns empty for providers without curated list', () => {
    const models = [
      makeModel('gemini-2.5-pro', 'google'),
      makeModel('gemini-2.5-flash', 'google'),
    ];

    expect(selectTopModels(models, 'google')).toEqual([]);
  });
});

describe('resolveFirstSyncSelectedIds', () => {
  it('preserves existing in-memory selections when present', () => {
    const models = [
      makeModel('gpt-5.4', 'openai'),
      makeModel('gpt-5.4-mini', 'openai'),
    ];

    const selected = resolveFirstSyncSelectedIds(models, 'openai', {
      'gpt-5.4': false,
      'gpt-5.4-mini': true,
    });

    expect(Array.from(selected)).toEqual(['gpt-5.4-mini']);
  });

  it('preserves explicit all-false in-memory state and does not auto-select', () => {
    const models = [
      makeModel('gpt-5.4', 'openai'),
      makeModel('gpt-5.4-mini', 'openai'),
    ];

    const selected = resolveFirstSyncSelectedIds(models, 'openai', {
      'gpt-5.4': false,
      'gpt-5.4-mini': false,
    });

    expect(Array.from(selected)).toEqual([]);
  });

  it('auto-selects curated models when there is no prior in-memory state', () => {
    const models = [
      makeModel('gpt-5.4', 'openai'),
      makeModel('gpt-5.4-mini', 'openai'),
      makeModel('gpt-4o', 'openai'),
    ];

    const selected = resolveFirstSyncSelectedIds(models, 'openai', {});

    expect(Array.from(selected)).toEqual(['gpt-5.4', 'gpt-5.4-mini']);
  });
});
