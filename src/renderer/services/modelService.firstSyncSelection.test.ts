import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Model, ProviderConfig } from '../../types/models';

// --- Mocks must be declared before imports ---

const mockPreferencesGet = vi.fn();
const mockPreferencesSet = vi.fn();

vi.stubGlobal('window', {
  levante: {
    preferences: {
      get: mockPreferencesGet,
      set: mockPreferencesSet,
    },
    models: {
      fetchOpenAI: vi.fn(),
    },
  },
});

vi.mock('@/services/logger', () => ({
  getRendererLogger: () => ({
    models: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    core: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }),
}));

vi.mock('./model/migrations', () => ({
  migrateCloudProvider: vi.fn().mockResolvedValue({ migrated: false, providers: [] }),
  migrateCloudProvidersToDynamic: vi.fn().mockResolvedValue({ migrated: false, providers: [] }),
}));

// Mock classifyModel to avoid depending on real classification
vi.mock('../../utils/modelClassification', () => ({
  classifyModel: (model: Model) => ({
    category: 'chat' as const,
    capabilities: {
      supportsTools: false,
      supportsVision: false,
      supportsStreaming: true,
      requiresAttachment: false,
      supportsAudioOut: false,
      supportsAudioIn: false,
      supportsSystemPrompt: true,
      supportsMultiTurn: true,
    },
  }),
  getCompatibleCategories: vi.fn().mockReturnValue([]),
}));

// Mock the OpenAI provider fetcher
const mockFetchOpenAIModels = vi.fn();
vi.mock('./model/providers/openAIProvider', () => ({
  fetchOpenAIModels: (...args: unknown[]) => mockFetchOpenAIModels(...args),
}));

// Mock all other provider fetchers to avoid import issues
vi.mock('./model/providers/openRouterProvider', () => ({ fetchOpenRouterModels: vi.fn() }));
vi.mock('./model/providers/gatewayProvider', () => ({ fetchGatewayModels: vi.fn() }));
vi.mock('./model/providers/localProvider', () => ({ discoverLocalModels: vi.fn() }));
vi.mock('./model/providers/googleProvider', () => ({ fetchGoogleModels: vi.fn() }));
vi.mock('./model/providers/anthropicProvider', () => ({ fetchAnthropicModels: vi.fn() }));
vi.mock('./model/providers/groqProvider', () => ({ fetchGroqModels: vi.fn() }));
vi.mock('./model/providers/xAIProvider', () => ({ fetchXAIModels: vi.fn() }));
vi.mock('./model/providers/huggingfaceProvider', () => ({ fetchHuggingFaceModels: vi.fn() }));

// --- Import after mocks ---
import { modelService } from './modelService';

// --- Helpers ---

function makeModel(id: string): Model {
  return {
    id,
    name: id,
    provider: 'openai',
    contextLength: 128000,
    capabilities: ['text'],
    isAvailable: true,
    userDefined: false,
  };
}

function makeOpenAIProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    apiKey: 'test-key',
    models: [],
    isActive: true,
    settings: {},
    modelSource: 'dynamic',
    ...overrides,
  };
}

function resetModelService(): void {
  const service = modelService as any;
  service.providers = [];
  service.activeProviderId = null;
  service.isInitialized = false;
  service.classificationCache = new Map();
  service.syncedProvidersInSession = new Set();
  service.initializationPromise = null;
  service.syncPromises = new Map();
  service.saveProvidersQueue = Promise.resolve();
}

// --- Tests ---

describe('modelService first-sync selection', () => {
  beforeEach(() => {
    resetModelService();
    vi.clearAllMocks();
    mockPreferencesSet.mockResolvedValue({ success: true });
  });

  it('Case A: auto-selects curated models on first sync without persisted state', async () => {
    const provider = makeOpenAIProvider({
      selectedModelIds: undefined,
      models: [],
    });

    // Set up the service with this provider already loaded
    (modelService as any).providers = [provider];
    (modelService as any).isInitialized = true;

    mockFetchOpenAIModels.mockResolvedValue([
      makeModel('gpt-5.4'),
      makeModel('gpt-5.4-mini'),
      makeModel('gpt-4o'),
    ]);

    await modelService.syncProviderModels('openai');

    const synced = modelService.getProviders().find(p => p.id === 'openai')!;

    const gpt54 = synced.models.find(m => m.id === 'gpt-5.4');
    const gpt54mini = synced.models.find(m => m.id === 'gpt-5.4-mini');
    const gpt4o = synced.models.find(m => m.id === 'gpt-4o');

    expect(gpt54?.isSelected).toBe(true);
    expect(gpt54mini?.isSelected).toBe(true);
    expect(gpt4o?.isSelected).toBe(false);

    expect(synced.selectedModelIds).toEqual(['gpt-5.4', 'gpt-5.4-mini']);
  });

  it('Case B: preserves empty persisted selectedModelIds and does not auto-select', async () => {
    const provider = makeOpenAIProvider({
      selectedModelIds: [],
      models: [],
    });

    (modelService as any).providers = [provider];
    (modelService as any).isInitialized = true;

    mockFetchOpenAIModels.mockResolvedValue([
      makeModel('gpt-5.4'),
      makeModel('gpt-5.4-mini'),
    ]);

    await modelService.syncProviderModels('openai');

    const synced = modelService.getProviders().find(p => p.id === 'openai')!;

    expect(synced.models.every(m => m.isSelected === false)).toBe(true);
    expect(synced.selectedModelIds).toEqual([]);
  });

  it('Case C: preserves existing in-memory selection state', async () => {
    const provider = makeOpenAIProvider({
      selectedModelIds: undefined,
      models: [
        { ...makeModel('gpt-5.4'), isSelected: false },
        { ...makeModel('gpt-5.4-mini'), isSelected: true },
      ],
    });

    (modelService as any).providers = [provider];
    (modelService as any).isInitialized = true;

    mockFetchOpenAIModels.mockResolvedValue([
      makeModel('gpt-5.4'),
      makeModel('gpt-5.4-mini'),
    ]);

    await modelService.syncProviderModels('openai');

    const synced = modelService.getProviders().find(p => p.id === 'openai')!;

    const gpt54 = synced.models.find(m => m.id === 'gpt-5.4');
    const gpt54mini = synced.models.find(m => m.id === 'gpt-5.4-mini');

    expect(gpt54?.isSelected).toBe(false);
    expect(gpt54mini?.isSelected).toBe(true);
    expect(synced.selectedModelIds).toEqual(['gpt-5.4-mini']);
  });
});
