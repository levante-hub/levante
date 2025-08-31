import { ChatConversationPort, ChatOptions, ChatResponse, ChatStreamChunk, ConversationData, ConversationLoadOptions, ConversationSummary, MessagePaginationOptions, MessageBatch, InvalidSessionError, ModelNotAvailableError, MessageTooLongError, ConversationContextError, AIProviderError, TitleGenerationError } from '../../domain/ports/primary/ChatConversationPort';
import { ChatSession } from '../../domain/entities/ChatSession';
import { Message } from '../../domain/entities/Message';
import { MessageRole } from '../../domain/value-objects/MessageRole';
import { MessageParts } from '../../domain/value-objects/MessageParts';
import { ChatSessionRepository } from '../../domain/ports/secondary/ChatSessionRepository';
import { MessageRepository } from '../../domain/ports/secondary/MessageRepository';
import { ProviderRepository } from '../../domain/ports/secondary/ProviderRepository';
import { ModelRepository } from '../../domain/ports/secondary/ModelRepository';
import { MessageId } from '../../domain/value-objects/MessageId';
import { ToolCall } from '../../domain/value-objects/ToolCall';
import { ChatId } from '../../domain/value-objects/ChatId';
import { ModelId } from '../../domain/value-objects/ModelId';
import { ProviderId } from '../../domain/value-objects/ProviderId';
import { AIProviderAdapter, ChatRequest, ChatResponse as AIResponse, ChatStreamChunk as AIStreamChunk } from '../../domain/ports/secondary/BaseAIAdapter';
import { OpenRouterAdapter } from '../../domain/ports/secondary/OpenRouterAdapter';
import { VercelGatewayAdapter } from '../../domain/ports/secondary/VercelGatewayAdapter';
import { LocalProviderAdapter } from '../../domain/ports/secondary/LocalProviderAdapter';
import { CloudProviderAdapter } from '../../domain/ports/secondary/CloudProviderAdapter';

export class ChatConversationService implements ChatConversationPort {
  private readonly maxMessageLength = 100000; // 100k characters
  private readonly maxContextWindow = 200000; // tokens

  constructor(
    private readonly sessionRepository: ChatSessionRepository,
    private readonly messageRepository: MessageRepository,
    private readonly providerRepository: ProviderRepository,
    private readonly modelRepository: ModelRepository,
    private readonly openRouterAdapter: OpenRouterAdapter,
    private readonly vercelGatewayAdapter: VercelGatewayAdapter,
    private readonly localProviderAdapter: LocalProviderAdapter,
    private readonly cloudProviderAdapter: CloudProviderAdapter
  ) {}

  async sendMessage(message: string, options?: ChatOptions & { sessionId?: string }): Promise<ChatResponse> {
    // Validate message
    this.validateMessage(message);

    // Get or create session
    const session = options?.sessionId ? 
      await this.getExistingSession(options.sessionId) :
      await this.createNewConversation(undefined, options?.model);

    // Get model and provider
    const { model, provider, adapter } = await this.getModelAndProvider(options?.model || session.getModelId());

    // Create user message
    const userMessage = Message.create({
      sessionId: session.getId(),
      role: MessageRole.fromString('user'),
      content: MessageParts.textOnly(message),
      modelId: model.getId()
    });

    // Save user message
    const savedUserMessage = await this.messageRepository.save(userMessage);

    // Get conversation context
    const context = await this.buildConversationContext(session, options);

    try {
      // Generate AI response
      const aiResponse = await adapter.generateResponse({
        messages: context.messages.map(m => ({
          id: `msg_${Date.now()}`,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content
        })),
        model: model.getId(),
        options: {
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          systemPrompt: options?.systemPrompt,
          webSearch: options?.webSearch,
          stream: false
        }
      });

      // Create assistant message
      // Convert AI adapter tool calls to domain tool calls
      const domainToolCalls = aiResponse.toolCalls ? 
        aiResponse.toolCalls.map(tc => new ToolCall(tc.name, tc.arguments, tc.result)) : 
        [];

      const assistantMessage = Message.create({
        sessionId: session.getId(),
        role: MessageRole.fromString('assistant'),
        content: MessageParts.textOnly(aiResponse.content),
        modelId: model.getId(),
        toolCalls: domainToolCalls
      });

      // Save assistant message
      const assistantSaveResult = await this.messageRepository.save(assistantMessage);
      if (!assistantSaveResult.success) {
        throw new Error(`Failed to save assistant message: ${assistantSaveResult.error}`);
      }
      const savedAssistantMessage = assistantSaveResult.data!;

      // Update session
      session.updateLastActivity();
      await this.sessionRepository.save(session);

      // Generate title if it's the first message
      if (await this.isFirstUserMessage(session.getId())) {
        this.generateConversationTitle(session.getId()).catch(error => {
          console.error('Failed to generate title:', error);
        });
      }

      return {
        id: savedAssistantMessage.getId(),
        content: aiResponse.content,
        finishReason: aiResponse.finishReason || 'stop',
        usage: aiResponse.usage,
        sources: (aiResponse as any).sources || undefined,
        reasoning: (aiResponse as any).reasoning || undefined,
        sessionId: session.getId(),
        messageId: savedAssistantMessage.getId()
      };

    } catch (error) {
      throw new AIProviderError(
        error instanceof Error ? error.message : 'Unknown AI provider error',
        provider.getId()
      );
    }
  }

  async *streamMessage(message: string, options?: ChatOptions & { sessionId?: string }): AsyncGenerator<ChatStreamChunk> {
    // Validate message
    this.validateMessage(message);

    // Get or create session
    const session = options?.sessionId ? 
      await this.getExistingSession(options.sessionId) :
      await this.createNewConversation(undefined, options?.model);

    // Get model and provider
    const { model, provider, adapter } = await this.getModelAndProvider(options?.model || session.getModelId());

    // Create user message
    const userMessage = Message.create({
      sessionId: session.getId(),
      role: MessageRole.fromString('user'),
      content: MessageParts.textOnly(message),
      modelId: model.getId()
    });

    // Save user message
    await this.messageRepository.save(userMessage);

    // Get conversation context
    const context = await this.buildConversationContext(session, options);

    let assistantContent = '';
    let assistantMessage: Message | null = null;
    let messageId = '';

    try {
      // Stream AI response
      const responseStream = adapter.streamResponse({
        messages: context.messages.map(m => ({
          id: `msg_${Date.now()}`,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content
        })),
        model: model.getId(),
        options: {
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          systemPrompt: options?.systemPrompt,
          webSearch: options?.webSearch,
          stream: true
        }
      });

      for await (const chunk of responseStream) {
        // Accumulate content
        if (chunk.delta) {
          assistantContent += chunk.delta;
        }

        // Create/update assistant message on first chunk
        if (!assistantMessage && assistantContent.trim()) {
          assistantMessage = Message.create({
            sessionId: session.getId(),
            role: MessageRole.fromString('assistant'),
            content: MessageParts.textOnly(assistantContent),
            modelId: model.getId()
          });
          
          const saveResult = await this.messageRepository.save(assistantMessage);
          if (!saveResult.success) {
            throw new Error(`Failed to save assistant message: ${saveResult.error}`);
          }
          messageId = saveResult.data!.getId();
        } else if (assistantMessage && chunk.delta) {
          // Update message content
          assistantMessage.updateContent(MessageParts.textOnly(assistantContent));
          await this.messageRepository.save(assistantMessage);
        }

        // Yield chunk
        yield {
          id: chunk.id,
          delta: chunk.delta,
          finishReason: chunk.finishReason,
          usage: chunk.usage,
          done: chunk.done,
          sources: chunk.sources,
          reasoning: chunk.reasoning,
          sessionId: session.getId(),
          messageId: messageId
        };

        if (chunk.done) {
          break;
        }
      }

      // Final update to session
      session.updateLastActivity();
      await this.sessionRepository.save(session);

      // Generate title if it's the first message
      if (await this.isFirstUserMessage(session.getId())) {
        this.generateConversationTitle(session.getId()).catch(error => {
          console.error('Failed to generate title:', error);
        });
      }

    } catch (error) {
      throw new AIProviderError(
        error instanceof Error ? error.message : 'Unknown AI provider error',
        provider.getId()
      );
    }
  }

  async loadConversation(sessionId: string, options?: ConversationLoadOptions): Promise<ConversationData> {
    const session = await this.getExistingSession(sessionId);
    
    if (!options?.includeMessages) {
      return {
        session,
        messages: [],
        hasMoreMessages: false,
        totalMessages: 0
      };
    }

    const limit = options.messageLimit || 50;
    const offset = options.messageOffset || 0;

    const messagesResult = await this.messageRepository.findBySessionId(sessionId, {
      limit,
      offset,
      includeSystemMessages: options.includeSystemMessages ?? true
    });
    const messages = messagesResult.success && messagesResult.data ? messagesResult.data : [];

    const totalMessagesResult = await this.messageRepository.countBySessionId(sessionId);
    const totalMessages = totalMessagesResult.success && totalMessagesResult.data ? totalMessagesResult.data : 0;

    return {
      session,
      messages,
      hasMoreMessages: offset + messages.length < totalMessages,
      totalMessages
    };
  }

  async createNewConversation(title?: string, modelId?: string): Promise<ChatSession> {
    // Get default model if none specified
    const effectiveModelId = modelId || await this.getDefaultModelId();

    // Validate model availability
    await this.validateModelAvailability(effectiveModelId);

    const session = ChatSession.create({
      title: title || 'New Conversation',
      modelId: effectiveModelId
    });

    const saveResult = await this.sessionRepository.save(session);
    if (!saveResult.success) {
      throw new Error(`Failed to save session: ${saveResult.error}`);
    }
    return saveResult.data!;
  }

  async getConversationSummary(sessionId: string): Promise<ConversationSummary> {
    const session = await this.getExistingSession(sessionId);
    const messageCountResult = await this.messageRepository.countBySessionId(sessionId);
    const messageCount = messageCountResult.success && messageCountResult.data ? messageCountResult.data : 0;
    
    const messagesResult = await this.messageRepository.findBySessionId(sessionId, { limit: 10 });
    const messages = messagesResult.success && messagesResult.data ? messagesResult.data : [];

    // Calculate estimated tokens
    let estimatedTokens = 0;
    const participants = new Set<string>();

    for (const message of messages) {
      estimatedTokens += this.estimateTokens(message.getContent().getCombinedText());
      participants.add(message.getRole().toString());
    }

    return {
      session,
      messageCount,
      lastActivity: session.getUpdatedAt(),
      estimatedTokens,
      participants: Array.from(participants)
    };
  }

  async continueConversation(sessionId: string, message: string, options?: ChatOptions): Promise<ChatResponse> {
    return await this.sendMessage(message, { ...options, sessionId });
  }

  async loadMoreMessages(sessionId: string, options?: MessagePaginationOptions): Promise<MessageBatch> {
    await this.getExistingSession(sessionId); // Validate session exists

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let messages: Message[];

    if (options?.beforeMessageId) {
      const result = await this.messageRepository.findBeforeMessage(sessionId, options.beforeMessageId, limit);
      messages = result.success && result.data ? result.data : [];
    } else if (options?.afterMessageId) {
      const result = await this.messageRepository.findAfterMessage(sessionId, options.afterMessageId, limit);
      messages = result.success && result.data ? result.data : [];
    } else {
      const result = await this.messageRepository.findBySessionId(sessionId, {
        limit,
        offset,
        includeSystemMessages: options?.includeSystemMessages ?? true
      });
      messages = result.success && result.data ? result.data : [];
    }

    const totalCountResult = await this.messageRepository.countBySessionId(sessionId);
    const totalCount = totalCountResult.success && totalCountResult.data ? totalCountResult.data : 0;

    return {
      messages,
      hasMore: offset + messages.length < totalCount,
      totalCount,
      nextOffset: offset + messages.length < totalCount ? offset + limit : undefined
    };
  }

  async *regenerateLastResponse(sessionId: string, options?: ChatOptions): AsyncGenerator<ChatStreamChunk> {
    const session = await this.getExistingSession(sessionId);
    
    // Get last assistant message
    const messagesResult = await this.messageRepository.findBySessionId(sessionId, { limit: 2 });
    const messages = messagesResult.success && messagesResult.data ? messagesResult.data : [];
    const lastAssistantMessage = messages.find((m: Message) => m.getRole().toString() === 'assistant');
    const lastUserMessage = messages.find((m: Message) => m.getRole().toString() === 'user');

    if (!lastUserMessage) {
      throw new ConversationContextError('No user message found to regenerate response');
    }

    // Delete last assistant message if it exists
    if (lastAssistantMessage) {
      await this.messageRepository.delete(MessageId.fromString(lastAssistantMessage.getId()));
    }

    // Regenerate response using streaming
    yield* this.streamMessage(lastUserMessage.getContent().getCombinedText(), {
      ...options,
      sessionId
    });
  }

  async generateConversationTitle(sessionId: string, forceRegenerate?: boolean): Promise<string> {
    const session = await this.getExistingSession(sessionId);

    // Don't regenerate if title was manually set (unless forced)
    if (!forceRegenerate && !session.getTitle().startsWith('New Conversation')) {
      return session.getTitle();
    }

    try {
      // Get first few messages for context
      const messagesResult = await this.messageRepository.findBySessionId(sessionId, { limit: 6 });
      const messages = messagesResult.success && messagesResult.data ? messagesResult.data : [];
      if (messages.length === 0) {
        return session.getTitle();
      }

      // Build context for title generation
      const context = messages
        .slice(0, 4) // Use first 4 messages max
        .map((m: Message) => `${m.getRole().toString()}: ${m.getContent().getCombinedText()}`)
        .join('\n');

      // Get model and provider for title generation
      const { model, provider, adapter } = await this.getModelAndProvider(session.getModelId());

      // Generate title
      const response = await adapter.generateResponse({
        messages: [
          {
            id: `title_system_${Date.now()}`,
            role: 'system',
            content: 'Generate a concise, descriptive title (max 50 characters) for this conversation based on the content below. Only return the title, no quotes or extra text.'
          },
          {
            id: `title_user_${Date.now()}`,
            role: 'user',
            content: context
          }
        ],
        model: model.getId(),
        options: {
          temperature: 0.3,
          maxTokens: 50,
          stream: false
        }
      });

      const title = response.content.trim().replace(/^["']|["']$/g, ''); // Remove quotes
      const finalTitle = title.length > 50 ? title.substring(0, 47) + '...' : title;

      // Update session title
      session.setTitle(finalTitle);
      await this.sessionRepository.save(session);

      return finalTitle;

    } catch (error) {
      throw new TitleGenerationError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // Private helper methods
  private validateMessage(message: string): void {
    if (!message?.trim()) {
      throw new MessageTooLongError(0, 1);
    }

    if (message.length > this.maxMessageLength) {
      throw new MessageTooLongError(message.length, this.maxMessageLength);
    }
  }

  private async getExistingSession(sessionId: string): Promise<ChatSession> {
    const result = await this.sessionRepository.findById(ChatId.fromString(sessionId));
    if (!result.success || !result.data) {
      throw new InvalidSessionError(sessionId);
    }
    return result.data;
  }

  private async getModelAndProvider(modelId: string): Promise<{
    model: any;
    provider: any;
    adapter: AIProviderAdapter;
  }> {
    const modelResult = await this.modelRepository.findById(ModelId.fromString(modelId));
    const model = modelResult.success ? modelResult.data : null;
    if (!model) {
      throw new ModelNotAvailableError(modelId);
    }

    const providerResult = await this.providerRepository.findById(ProviderId.fromString(model.getProviderId()));
    const provider = providerResult.success ? providerResult.data : null;
    if (!provider || !provider.isEnabled()) {
      throw new ModelNotAvailableError(modelId);
    }

    const adapter = this.getAdapterForProvider(provider);

    return { model, provider, adapter };
  }

  private getAdapterForProvider(provider: any): AIProviderAdapter {
    switch (provider.getType().getValue()) {
      case 'openrouter':
        return this.openRouterAdapter;
      case 'vercel-gateway':
        return this.vercelGatewayAdapter;
      case 'local':
        return this.localProviderAdapter;
      case 'cloud':
        return this.cloudProviderAdapter;
      default:
        throw new Error(`No adapter found for provider type: ${provider.getType().getValue()}`);
    }
  }

  private async buildConversationContext(session: ChatSession, options?: ChatOptions): Promise<{
    messages: Array<{ role: string; content: string }>;
    tokenCount: number;
  }> {
    // Get recent messages for context
    const messagesResult = await this.messageRepository.findBySessionId(session.getId(), {
      limit: 50,
      includeSystemMessages: true
    });
    const messages = messagesResult.success && messagesResult.data ? messagesResult.data : [];

    // Convert to context format and trim if needed
    const contextMessages: Array<{ role: string; content: string }> = [];
    let tokenCount = 0;

    // Add system message if provided
    if (options?.systemPrompt) {
      contextMessages.push({
        role: 'system',
        content: options.systemPrompt
      });
      tokenCount += this.estimateTokens(options.systemPrompt);
    }

    // Add conversation messages (oldest first for context)
    const reversedMessages = [...messages].reverse();
    
    for (const message of reversedMessages) {
      const content = message.getContent().getCombinedText();
      const messageTokens = this.estimateTokens(content);
      
      // Stop if we would exceed context window
      if (tokenCount + messageTokens > this.maxContextWindow) {
        break;
      }

      contextMessages.push({
        role: message.getRole().toString(),
        content
      });
      
      tokenCount += messageTokens;
    }

    return { messages: contextMessages, tokenCount };
  }

  private async getDefaultModelId(): Promise<string> {
    // Get active provider's first selected model
    const providersResult = await this.providerRepository.findAll();
    const providers = providersResult.success && providersResult.data ? providersResult.data : [];
    const activeProvider = providers.find((p: any) => p.isActive());
    
    if (!activeProvider) {
      throw new Error('No active provider configured');
    }

    const modelsResult = await this.modelRepository.findByProviderId(ProviderId.fromString(activeProvider.getId()));
    const models = modelsResult.success && modelsResult.data ? modelsResult.data.items : [];
    const selectedModel = models.find((m: any) => m.isSelected());
    
    if (!selectedModel) {
      throw new Error('No models selected for active provider');
    }

    return selectedModel.getId();
  }

  private async validateModelAvailability(modelId: string): Promise<void> {
    const modelResult = await this.modelRepository.findById(ModelId.fromString(modelId));
    const model = modelResult.success ? modelResult.data : null;
    if (!model || !model.isAvailable()) {
      throw new ModelNotAvailableError(modelId);
    }

    const providerResult = await this.providerRepository.findById(ProviderId.fromString(model.getProviderId()));
    const provider = providerResult.success ? providerResult.data : null;
    if (!provider || !provider.isEnabled() || !provider.isActive()) {
      throw new ModelNotAvailableError(modelId);
    }
  }

  private async isFirstUserMessage(sessionId: string): Promise<boolean> {
    const messageCountResult = await this.messageRepository.countBySessionId(sessionId);
    const messageCount = messageCountResult.success && messageCountResult.data ? messageCountResult.data : 0;
    return messageCount === 2; // User message + assistant message
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}