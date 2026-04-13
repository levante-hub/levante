import type { Model, ProviderType } from '../../../types/models';

type FlagshipMatcher =
  | { type: 'exact'; value: string }
  | { type: 'prefix'; value: string };

/**
 * Curated flagship matchers for first-sync auto-selection.
 *
 * Rules:
 * - 'exact': model.id must match exactly
 * - 'prefix': model.id must equal the prefix or start with `${prefix}-`
 *
 * Initial scope for issue #239:
 * - openai
 * - anthropic
 */
const FLAGSHIP_MATCHERS: Partial<Record<ProviderType, FlagshipMatcher[]>> = {
  openai: [
    { type: 'exact', value: 'gpt-5.4' },
    { type: 'exact', value: 'gpt-5.4-mini' },
    { type: 'exact', value: 'gpt-5.3-codex' },
    { type: 'exact', value: 'gpt-5.1-codex' },
  ],
  anthropic: [
    { type: 'prefix', value: 'claude-sonnet-4-6' },
    { type: 'prefix', value: 'claude-opus-4-6' },
    { type: 'prefix', value: 'claude-haiku-4-5' },
  ],
};

const MAX_AUTO_SELECT = 7;

function matches(modelId: string, matcher: FlagshipMatcher): boolean {
  const id = modelId.toLowerCase();
  const value = matcher.value.toLowerCase();

  if (matcher.type === 'exact') {
    return id === value;
  }

  return id === value || id.startsWith(`${value}-`);
}

function pickBestMatch(models: Model[], matcher: FlagshipMatcher): Model | undefined {
  const candidates = models.filter(model => matches(model.id, matcher));

  if (candidates.length === 0) {
    return undefined;
  }

  const exactValue = matcher.value.toLowerCase();
  const exact = candidates.find(model => model.id.toLowerCase() === exactValue);

  if (exact) {
    return exact;
  }

  return [...candidates].sort((a, b) => b.id.localeCompare(a.id))[0];
}

/**
 * Returns only curated flagship IDs for first sync.
 *
 * Important:
 * - Does NOT fill remaining slots with arbitrary models
 * - Caps the result to MAX_AUTO_SELECT
 * - Returns [] when the provider has no curated list
 */
export function selectTopModels(models: Model[], providerType: ProviderType): string[] {
  if (models.length === 0) {
    return [];
  }

  const matchers = FLAGSHIP_MATCHERS[providerType];
  if (!matchers || matchers.length === 0) {
    return [];
  }

  const selected: string[] = [];
  const selectedIds = new Set<string>();

  for (const matcher of matchers) {
    if (selected.length >= MAX_AUTO_SELECT) {
      break;
    }

    const match = pickBestMatch(models, matcher);
    if (!match || selectedIds.has(match.id)) {
      continue;
    }

    selected.push(match.id);
    selectedIds.add(match.id);
  }

  return selected;
}

/**
 * Resolves the selected IDs to apply on the first sync of a dynamic provider.
 *
 * Precedence:
 * 1. If any in-memory selection state already exists, preserve it exactly
 * 2. Otherwise, use curated flagship auto-selection
 */
export function resolveFirstSyncSelectedIds(
  models: Model[],
  providerType: ProviderType,
  existingSelections: Record<string, boolean>
): Set<string> {
  const hasExistingSelectionState = Object.keys(existingSelections).length > 0;

  if (hasExistingSelectionState) {
    return new Set(
      Object.entries(existingSelections)
        .filter(([, isSelected]) => isSelected)
        .map(([modelId]) => modelId)
    );
  }

  return new Set(selectTopModels(models, providerType));
}
