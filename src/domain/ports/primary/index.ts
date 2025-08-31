// Primary ports - Entry points to the domain layer
// These represent the use cases and business operations exposed by the domain

export type { ChatConversationPort } from './ChatConversationPort';
export type { ChatSessionPort } from './ChatSessionPort';
export type { AIProviderPort } from './AIProviderPort';
export type { UserPreferencesPort } from './UserPreferencesPort';

// Re-export errors explicitly to avoid ambiguity
export { 
  AIProviderError as ConversationAIProviderError,
  ModelNotAvailableError as ConversationModelNotAvailableError 
} from './ChatConversationPort';

export {
  AIProviderError,
  ModelNotAvailableError
} from './AIProviderPort';