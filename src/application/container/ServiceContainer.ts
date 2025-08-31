/**
 * Dependency Injection Container for Hexagonal Architecture
 * 
 * This container manages the creation and lifecycle of all services,
 * ensuring proper dependency injection following hexagonal architecture principles.
 */

// Primary Ports (interfaces)
import { AIProviderPort } from '../../domain/ports/primary/AIProviderPort';
import { ChatConversationPort } from '../../domain/ports/primary/ChatConversationPort';
import { ChatSessionPort } from '../../domain/ports/primary/ChatSessionPort';
import { UserPreferencesPort } from '../../domain/ports/primary/UserPreferencesPort';

// Application Services (primary port implementations)
import { AIProviderService } from '../services/AIProviderService';
import { ChatConversationService } from '../services/ChatConversationService';
import { ChatSessionService } from '../services/ChatSessionService';
import { UserPreferencesService } from '../services/UserPreferencesService';

// Secondary Ports (interfaces)
import { ChatSessionRepository } from '../../domain/ports/secondary/ChatSessionRepository';
import { MessageRepository } from '../../domain/ports/secondary/MessageRepository';
import { ProviderRepository } from '../../domain/ports/secondary/ProviderRepository';
import { ModelRepository } from '../../domain/ports/secondary/ModelRepository';
import { SettingRepository } from '../../domain/ports/secondary/SettingRepository';
import { OpenRouterAdapter } from '../../domain/ports/secondary/OpenRouterAdapter';
import { VercelGatewayAdapter } from '../../domain/ports/secondary/VercelGatewayAdapter';
import { LocalProviderAdapter } from '../../domain/ports/secondary/LocalProviderAdapter';
import { CloudProviderAdapter } from '../../domain/ports/secondary/CloudProviderAdapter';

export interface ServiceContainerConfig {
  // Repository implementations (secondary adapters)
  chatSessionRepository: ChatSessionRepository;
  messageRepository: MessageRepository;
  providerRepository: ProviderRepository;
  modelRepository: ModelRepository;
  settingRepository: SettingRepository;
  
  // AI Provider adapters (secondary adapters)
  openRouterAdapter: OpenRouterAdapter;
  vercelGatewayAdapter: VercelGatewayAdapter;
  localProviderAdapter: LocalProviderAdapter;
  cloudProviderAdapter: CloudProviderAdapter;
}

/**
 * Service Container implementing Dependency Injection for Hexagonal Architecture
 * 
 * This follows the pattern:
 * UI Layer -> Primary Ports -> Application Services -> Secondary Ports -> Infrastructure
 */
export class ServiceContainer {
  private services: Map<string, any> = new Map();
  private config: ServiceContainerConfig;

  constructor(config: ServiceContainerConfig) {
    this.config = config;
    this.initializeServices();
  }

  /**
   * Initialize all services with proper dependency injection
   */
  private initializeServices(): void {
    // Initialize Application Services (Primary Port implementations)
    this.initializeAIProviderService();
    this.initializeChatSessionService();
    this.initializeUserPreferencesService();
    this.initializeChatConversationService(); // Last because it depends on others
  }

  private initializeAIProviderService(): void {
    const service = new AIProviderService(
      this.config.providerRepository,
      this.config.modelRepository,
      this.config.openRouterAdapter,
      this.config.vercelGatewayAdapter,
      this.config.localProviderAdapter,
      this.config.cloudProviderAdapter
    );
    
    this.services.set('AIProviderService', service);
  }

  private initializeChatSessionService(): void {
    const service = new ChatSessionService(
      this.config.chatSessionRepository,
      this.config.messageRepository
    );
    
    this.services.set('ChatSessionService', service);
  }

  private initializeUserPreferencesService(): void {
    const service = new UserPreferencesService(
      this.config.settingRepository
    );
    
    this.services.set('UserPreferencesService', service);
  }

  private initializeChatConversationService(): void {
    const service = new ChatConversationService(
      this.config.chatSessionRepository,
      this.config.messageRepository,
      this.config.providerRepository,
      this.config.modelRepository,
      this.config.openRouterAdapter,
      this.config.vercelGatewayAdapter,
      this.config.localProviderAdapter,
      this.config.cloudProviderAdapter
    );
    
    this.services.set('ChatConversationService', service);
  }

  /**
   * Get AIProvider service (Primary Port)
   */
  getAIProviderService(): AIProviderPort {
    return this.services.get('AIProviderService');
  }

  /**
   * Get ChatConversation service (Primary Port)
   */
  getChatConversationService(): ChatConversationPort {
    return this.services.get('ChatConversationService');
  }

  /**
   * Get ChatSession service (Primary Port)
   */
  getChatSessionService(): ChatSessionPort {
    return this.services.get('ChatSessionService');
  }

  /**
   * Get UserPreferences service (Primary Port)
   */
  getUserPreferencesService(): UserPreferencesPort {
    return this.services.get('UserPreferencesService');
  }

  /**
   * Get all primary port services
   */
  getAllPrimaryServices(): {
    aiProvider: AIProviderPort;
    chatConversation: ChatConversationPort;
    chatSession: ChatSessionPort;
    userPreferences: UserPreferencesPort;
  } {
    return {
      aiProvider: this.getAIProviderService(),
      chatConversation: this.getChatConversationService(),
      chatSession: this.getChatSessionService(),
      userPreferences: this.getUserPreferencesService()
    };
  }

  /**
   * Health check for all services
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    services: Array<{ name: string; status: 'healthy' | 'unhealthy'; error?: string }>;
  }> {
    const serviceChecks = [
      { name: 'AIProviderService', service: this.getAIProviderService() },
      { name: 'ChatConversationService', service: this.getChatConversationService() },
      { name: 'ChatSessionService', service: this.getChatSessionService() },
      { name: 'UserPreferencesService', service: this.getUserPreferencesService() }
    ];

    const results = await Promise.all(
      serviceChecks.map(async ({ name, service }) => {
        try {
          // Basic health check - just verify service is instantiated
          if (!service) {
            throw new Error('Service not initialized');
          }
          
          return { name, status: 'healthy' as const };
        } catch (error) {
          return { 
            name, 
            status: 'unhealthy' as const, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      })
    );

    const healthy = results.every(result => result.status === 'healthy');

    return { healthy, services: results };
  }

  /**
   * Dispose of all services and clean up resources
   */
  dispose(): void {
    // Clear all services
    this.services.clear();
  }
}

/**
 * Factory function to create a ServiceContainer with all dependencies
 */
export function createServiceContainer(config: ServiceContainerConfig): ServiceContainer {
  return new ServiceContainer(config);
}

/**
 * Singleton instance for global access (optional pattern)
 */
let globalContainer: ServiceContainer | null = null;

export function initializeGlobalContainer(config: ServiceContainerConfig): ServiceContainer {
  if (globalContainer) {
    globalContainer.dispose();
  }
  
  globalContainer = createServiceContainer(config);
  return globalContainer;
}

export function getGlobalContainer(): ServiceContainer {
  if (!globalContainer) {
    throw new Error('ServiceContainer not initialized. Call initializeGlobalContainer first.');
  }
  
  return globalContainer;
}

export function disposeGlobalContainer(): void {
  if (globalContainer) {
    globalContainer.dispose();
    globalContainer = null;
  }
}