import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ProviderConfig } from '../../../../types/models'

// Mock dependencies
const mockGetProfile = vi.fn()
const mockIsAuthenticated = vi.fn()
const mockPreferencesGet = vi.fn()

vi.mock('../../userProfileService', () => ({
  userProfileService: {
    getProfile: () => mockGetProfile(),
  },
}))

vi.mock('../../platformService', () => ({
  platformService: {
    isAuthenticated: () => mockIsAuthenticated(),
  },
}))

vi.mock('../../preferencesService', () => ({
  preferencesService: {
    get: (key: string) => mockPreferencesGet(key),
  },
}))

vi.mock('../../logging', () => ({
  getLogger: () => ({
    aiSdk: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }),
}))

import { resolveModelTarget } from '../modelTargetResolver'
import { buildModelRef } from '../../../../shared/modelRefs'

const makeProvider = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'openrouter',
  name: 'OpenRouter',
  type: 'openrouter',
  models: [],
  isActive: true,
  settings: {},
  modelSource: 'dynamic',
  selectedModelIds: ['gpt-4o'],
  ...overrides,
})

describe('resolveModelTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetProfile.mockResolvedValue({ appMode: 'standalone' })
    mockIsAuthenticated.mockResolvedValue(false)
    mockPreferencesGet.mockImplementation((key: string) => {
      if (key === 'providers') return [makeProvider()]
      if (key === 'useOtherProviders') return false
      return undefined
    })
  })

  it('qualified platform ref resolves to platform target', async () => {
    mockGetProfile.mockResolvedValue({ appMode: 'platform' })
    mockIsAuthenticated.mockResolvedValue(true)

    const ref = buildModelRef('levante-platform', 'gpt-4o')
    const target = await resolveModelTarget(ref)

    expect(target.source).toBe('platform')
    expect(target.rawModelId).toBe('gpt-4o')
    expect(target.providerType).toBe('levante-platform')
  })

  it('qualified standalone ref resolves to provider target', async () => {
    const ref = buildModelRef('openrouter', 'gpt-4o')
    const target = await resolveModelTarget(ref)

    expect(target.source).toBe('provider')
    expect(target.rawModelId).toBe('gpt-4o')
    expect(target.providerId).toBe('openrouter')
    if (target.source === 'provider') {
      expect(target.provider.type).toBe('openrouter')
    }
  })

  it('raw legacy standalone resolves to provider', async () => {
    const target = await resolveModelTarget('gpt-4o')

    expect(target.source).toBe('provider')
    expect(target.rawModelId).toBe('gpt-4o')
    expect(target.providerId).toBe('openrouter')
  })

  it('raw legacy in platform hybrid routes to platform when authenticated', async () => {
    mockGetProfile.mockResolvedValue({ appMode: 'platform' })
    mockIsAuthenticated.mockResolvedValue(true)
    mockPreferencesGet.mockImplementation((key: string) => {
      if (key === 'providers') return [makeProvider()]
      if (key === 'useOtherProviders') return true
      return undefined
    })

    const target = await resolveModelTarget('gpt-4o')

    expect(target.source).toBe('platform')
    expect(target.rawModelId).toBe('gpt-4o')
  })

  it('raw legacy in platform hybrid falls back to standalone when auth expired', async () => {
    mockGetProfile.mockResolvedValue({ appMode: 'platform' })
    mockIsAuthenticated.mockResolvedValue(false)
    mockPreferencesGet.mockImplementation((key: string) => {
      if (key === 'providers') return [makeProvider()]
      if (key === 'useOtherProviders') return true
      return undefined
    })

    const target = await resolveModelTarget('gpt-4o')

    expect(target.source).toBe('provider')
    expect(target.rawModelId).toBe('gpt-4o')
    expect(target.providerId).toBe('openrouter')
  })

  it('raw legacy with multiple standalone providers throws ambiguity error', async () => {
    mockGetProfile.mockResolvedValue({ appMode: 'platform' })
    mockIsAuthenticated.mockResolvedValue(false)
    mockPreferencesGet.mockImplementation((key: string) => {
      if (key === 'providers') {
        return [
          makeProvider({ id: 'openrouter', name: 'OpenRouter' }),
          makeProvider({ id: 'openai', name: 'OpenAI', type: 'openai' }),
        ]
      }
      if (key === 'useOtherProviders') return true
      return undefined
    })

    await expect(resolveModelTarget('gpt-4o')).rejects.toThrow('multiple providers')
  })

  it('unknown model throws error without platform fallback', async () => {
    mockPreferencesGet.mockImplementation((key: string) => {
      if (key === 'providers') return [makeProvider({ selectedModelIds: ['other-model'] })]
      if (key === 'useOtherProviders') return false
      return undefined
    })

    await expect(resolveModelTarget('unknown-model')).rejects.toThrow('not found')
  })

  it('expired platform + qualified standalone ref still resolves', async () => {
    mockGetProfile.mockResolvedValue({ appMode: 'platform' })
    mockIsAuthenticated.mockResolvedValue(false)
    mockPreferencesGet.mockImplementation((key: string) => {
      if (key === 'providers') return [makeProvider()]
      if (key === 'useOtherProviders') return true
      return undefined
    })

    const ref = buildModelRef('openrouter', 'gpt-4o')
    const target = await resolveModelTarget(ref)

    expect(target.source).toBe('provider')
    expect(target.rawModelId).toBe('gpt-4o')
  })

  it('expired platform + qualified platform ref throws clear error', async () => {
    mockGetProfile.mockResolvedValue({ appMode: 'platform' })
    mockIsAuthenticated.mockResolvedValue(false)

    const ref = buildModelRef('levante-platform', 'gpt-4o')
    await expect(resolveModelTarget(ref)).rejects.toThrow('session expired')
  })

  it('raw legacy in platform pure routes to platform (server-side filtering)', async () => {
    mockGetProfile.mockResolvedValue({ appMode: 'platform' })
    mockIsAuthenticated.mockResolvedValue(true)
    mockPreferencesGet.mockImplementation((key: string) => {
      if (key === 'providers') return []
      if (key === 'useOtherProviders') return false
      return undefined
    })

    const target = await resolveModelTarget('mistral-large-3')

    expect(target.source).toBe('platform')
    expect(target.rawModelId).toBe('mistral-large-3')
  })
})
