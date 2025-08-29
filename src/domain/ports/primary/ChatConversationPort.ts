import { ChatSession } from '../../entities/ChatSession';
import { Message } from '../../entities/Message';

// Input types for the port
export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  webSearch?: boolean;
  systemPrompt?: string;
  streaming?: boolean;
}

export interface ConversationData {
  session: ChatSession;
  messages: Message[];
  hasMoreMessages: boolean;
  totalMessages: number;
}

// Output types for responses
export interface ChatResponse {
  id: string;
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'cancelled';
  usage: TokenUsage;
  sources?: Array<{ url: string; title?: string }>;
  reasoning?: string;
  sessionId: string;
  messageId: string;
}

export interface ChatStreamChunk {
  id: string;
  delta?: string;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'cancelled';
  usage?: TokenUsage;
  done: boolean;
  sources?: Array<{ url: string; title?: string }>;
  reasoning?: string;
  sessionId?: string;
  messageId?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}

// Error types specific to chat operations
export abstract class ChatConversationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidSessionError extends ChatConversationError {
  constructor(sessionId: string) {
    super(`Chat session ${sessionId} not found or invalid`, 'INVALID_SESSION', false);
  }
}

export class ModelNotAvailableError extends ChatConversationError {
  constructor(modelId: string) {
    super(`Model ${modelId} is not available or configured`, 'MODEL_NOT_AVAILABLE', false);
  }
}

export class MessageTooLongError extends ChatConversationError {
  constructor(length: number, maxLength: number) {
    super(`Message length ${length} exceeds maximum of ${maxLength}`, 'MESSAGE_TOO_LONG', false);
  }
}

export class ConversationContextError extends ChatConversationError {
  constructor(reason: string) {
    super(`Conversation context error: ${reason}`, 'CONTEXT_ERROR', true);
  }
}

export class AIProviderError extends ChatConversationError {
  constructor(message: string, public readonly providerId?: string) {
    super(message, 'AI_PROVIDER_ERROR', true);
  }
}

export class TitleGenerationError extends ChatConversationError {
  constructor(originalError: string) {
    super(`Failed to generate conversation title: ${originalError}`, 'TITLE_GENERATION_ERROR', true);
  }
}

// Main port interface
export interface ChatConversationPort {
  /**
   * Send a message and get complete response (non-streaming)
   * Creates session if none provided in options
   */
  sendMessage(message: string, options?: ChatOptions & { sessionId?: string }): Promise<ChatResponse>;

  /**
   * Send a message and get streaming response
   * Creates session if none provided in options
   */
  streamMessage(message: string, options?: ChatOptions & { sessionId?: string }): AsyncGenerator<ChatStreamChunk>;

  /**
   * Load an existing conversation with its messages
   */
  loadConversation(sessionId: string, options?: ConversationLoadOptions): Promise<ConversationData>;

  /**
   * Create a new conversation session
   */
  createNewConversation(title?: string, modelId?: string): Promise<ChatSession>;

  /**
   * Get conversation summary/metadata without loading all messages
   */
  getConversationSummary(sessionId: string): Promise<ConversationSummary>;

  /**
   * Continue a conversation by adding a message to existing session
   */
  continueConversation(sessionId: string, message: string, options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Load more messages from a conversation (pagination)
   */
  loadMoreMessages(sessionId: string, options?: MessagePaginationOptions): Promise<MessageBatch>;

  /**
   * Regenerate the last AI response in a conversation
   */
  regenerateLastResponse(sessionId: string, options?: ChatOptions): AsyncGenerator<ChatStreamChunk>;

  /**
   * Generate or update conversation title based on content
   */
  generateConversationTitle(sessionId: string, forceRegenerate?: boolean): Promise<string>;
}

// Additional supporting types
export interface ConversationLoadOptions {
  includeMessages?: boolean;
  messageLimit?: number;
  messageOffset?: number;
  includeSystemMessages?: boolean;
}

export interface ConversationSummary {
  session: ChatSession;
  messageCount: number;
  lastActivity: Date;
  estimatedTokens: number;
  participants: string[]; // roles involved
  topics?: string[]; // extracted topics/themes
}

export interface MessagePaginationOptions {
  limit?: number;
  offset?: number;
  beforeMessageId?: string;
  afterMessageId?: string;
  includeSystemMessages?: boolean;
}

export interface MessageBatch {
  messages: Message[];
  hasMore: boolean;
  totalCount: number;
  nextOffset?: number;
}

// Events that can be emitted during conversation operations
export interface ConversationEvent {
  type: ConversationEventType;
  sessionId: string;
  timestamp: Date;
  data?: any;
}

export type ConversationEventType = 
  | 'conversation_created'
  | 'message_sent' 
  | 'message_received'
  | 'title_generated'
  | 'conversation_loaded'
  | 'stream_started'
  | 'stream_completed'
  | 'error_occurred';

// Configuration for conversation behavior
export interface ConversationConfig {
  autoGenerateTitle: boolean;
  maxMessagesPerConversation: number;
  defaultModel: string;
  enableWebSearch: boolean;
  streamingEnabled: boolean;
  autoSave: boolean;
  titleGenerationDelay: number; // ms to wait before generating title
}

// Context management for conversations
export interface ConversationContext {
  sessionId: string;
  activeModel: string;
  messageHistory: Message[];
  tokenCount: number;
  contextWindow: number;
  needsContextTrimming: boolean;
  lastActivity: Date;
}

// Validation and business rules
export interface MessageValidationRules {
  maxLength: number;
  minLength: number;
  allowedRoles: ('user' | 'assistant' | 'system')[];
  forbiddenPatterns: string[];
  requireNonEmpty: boolean;
}

export interface ConversationValidationRules {
  maxTitleLength: number;
  maxMessagesPerSession: number;
  allowedModelPatterns: string[];
  requireValidModel: boolean;
  autoArchiveAfterDays?: number;
}

// Statistics and analytics
export interface ConversationStats {
  totalSessions: number;
  totalMessages: number;
  totalTokensUsed: number;
  averageMessagesPerSession: number;
  mostUsedModels: Array<{ modelId: string; count: number }>;
  averageResponseTime: number;
  sessionsByTimeRange: Array<{ date: string; count: number }>;
}