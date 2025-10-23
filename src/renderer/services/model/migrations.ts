import type { ProviderConfig } from '../../../types/models';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

/**
 * Get default cloud providers configuration
 */
export async function getDefaultCloudProviders(): Promise<ProviderConfig[]> {
  return [
    {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      models: [],
      isActive: true,
      settings: {},
      modelSource: 'dynamic',
      baseUrl: 'https://api.openai.com/v1'
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      models: [],
      isActive: false,
      settings: {},
      modelSource: 'dynamic'
    },
    {
      id: 'google',
      name: 'Google AI',
      type: 'google',
      models: [],
      isActive: false,
      settings: {},
      modelSource: 'dynamic'
    },
    {
      id: 'groq',
      name: 'Groq',
      type: 'groq',
      models: [],
      isActive: false,
      settings: {},
      modelSource: 'dynamic',
      baseUrl: 'https://api.groq.com/openai/v1'
    },
    {
      id: 'xai',
      name: 'xAI',
      type: 'xai',
      models: [],
      isActive: false,
      settings: {},
      modelSource: 'dynamic',
      baseUrl: 'https://api.x.ai/v1'
    }
  ];
}

/**
 * Migrate old 'cloud' provider to new individual cloud providers
 */
export async function migrateCloudProvider(
  providers: ProviderConfig[]
): Promise<{ migrated: boolean; providers: ProviderConfig[]; activeProviderId: string | null }> {
  const oldCloudProvider = providers.find(p => p.type === 'cloud' as any);

  if (!oldCloudProvider) {
    return { migrated: false, providers, activeProviderId: null };
  }

  logger.models.info('Found old cloud provider, starting migration');

  // Remove old cloud provider
  let updatedProviders = providers.filter(p => p.type !== 'cloud' as any);

  // Get default cloud providers
  const defaultProviders = await getDefaultCloudProviders();

  // If old cloud provider was active, set openai as active
  const wasActive = oldCloudProvider.isActive;
  let newActiveProviderId: string | null = null;

  if (wasActive) {
    newActiveProviderId = 'openai';
  }

  // Add new cloud providers if they don't exist
  for (const newProvider of defaultProviders) {
    const exists = updatedProviders.find(p => p.id === newProvider.id);
    if (!exists) {
      newProvider.isActive = wasActive && newProvider.id === 'openai';
      updatedProviders.push(newProvider);
    }
  }

  return {
    migrated: true,
    providers: updatedProviders,
    activeProviderId: newActiveProviderId
  };
}

/**
 * Migrate cloud providers from user-defined to dynamic model source
 */
export async function migrateCloudProvidersToDynamic(
  providers: ProviderConfig[]
): Promise<{ migrated: boolean; providers: ProviderConfig[] }> {
  const cloudProviderTypes: Array<'openai' | 'anthropic' | 'google' | 'groq' | 'xai'> =
    ['openai', 'anthropic', 'google', 'groq', 'xai'];

  let migrated = false;
  const updatedProviders = [...providers];

  for (const provider of updatedProviders) {
    // Check if this is a cloud provider with user-defined model source
    if (cloudProviderTypes.includes(provider.type as any) && provider.modelSource === 'user-defined') {
      logger.models.info(`Migrating ${provider.id} to dynamic model source`);

      // Update to dynamic
      provider.modelSource = 'dynamic';

      // Clear old models (they will be synced from API)
      provider.models = [];
      provider.selectedModelIds = [];

      migrated = true;
    }
  }

  return { migrated, providers: updatedProviders };
}
