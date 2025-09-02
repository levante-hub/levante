# Guía Completa: Migración a Arquitectura Hexagonal - Levante

## Resumen Ejecutivo

Esta guía detalla cómo migrar Levante de su arquitectura actual en capas a una arquitectura hexagonal pura, eliminando el acoplamiento entre la lógica de negocio y los detalles de infraestructura.

## Preparación Inicial

### 1. Configuración del Entorno
```bash
# Crear rama específica para la migración
git checkout -b architecture/hexagonal-migration

# Instalar dependencias adicionales para DI
pnpm add tsyringe reflect-metadata

# Instalar herramientas de testing
pnpm add -D @types/jest
```

### 2. Estructura de Directorios Target
```
src/
├── domain/                     # ← NUEVO: Core del negocio
│   ├── entities/              # Entidades del dominio
│   ├── value-objects/         # Objetos de valor
│   ├── use-cases/            # Casos de uso (puertos primarios)
│   ├── repositories/         # Interfaces de repositorios
│   └── errors/               # Errores específicos del dominio
├── application/               # ← REFACTOR: Servicios de aplicación
│   ├── services/             # Orquestadores de casos de uso
│   ├── handlers/             # Manejadores IPC (adaptadores primarios)
│   └── dto/                  # Data Transfer Objects
├── infrastructure/           # ← REFACTOR: Adaptadores secundarios
│   ├── adapters/            # Implementaciones de puertos
│   │   ├── ai-providers/    # Adaptadores de IA
│   │   ├── database/        # Adaptadores de BD
│   │   ├── storage/         # Adaptadores de almacenamiento
│   │   └── external/        # APIs externas
│   ├── config/              # Configuración
│   └── mappers/             # Mapeo domain ↔ persistencia
└── presentation/             # ← ACTUAL: renderer/ (cambios mínimos)
```

## FASE 1: Fundamentos del Dominio (10-12 días)

### Día 1-2: Creación de Value Objects

**Objetivo**: Crear objetos de valor fundamentales

#### Paso 1.1: Crear ChatId
```typescript
// src/domain/value-objects/ChatId.ts
export class ChatId {
  constructor(private readonly value: string) {
    if (!value.trim()) {
      throw new Error('ChatId cannot be empty')
    }
    if (!this.isValidUUID(value)) {
      throw new Error('ChatId must be a valid UUID')
    }
  }
  
  toString(): string {
    return this.value
  }
  
  equals(other: ChatId): boolean {
    return this.value === other.value
  }
  
  static generate(): ChatId {
    return new ChatId(crypto.randomUUID())
  }
  
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)
  }
}
```

#### Paso 1.2: Crear MessageId y MessageContent
```typescript
// src/domain/value-objects/MessageId.ts
export class MessageId {
  constructor(private readonly value: string) {
    if (!value.trim()) {
      throw new Error('MessageId cannot be empty')
    }
  }
  
  toString(): string { return this.value }
  equals(other: MessageId): boolean { return this.value === other.value }
  static generate(): MessageId { return new MessageId(crypto.randomUUID()) }
}

// src/domain/value-objects/MessageContent.ts
export class MessageContent {
  private static readonly MAX_LENGTH = 100000
  
  constructor(private readonly text: string) {
    if (!text.trim()) {
      throw new Error('Message content cannot be empty')
    }
    if (text.length > MessageContent.MAX_LENGTH) {
      throw new Error(`Message content exceeds maximum length of ${MessageContent.MAX_LENGTH}`)
    }
  }
  
  toString(): string { return this.text }
  length(): number { return this.text.length }
  isEmpty(): boolean { return this.text.trim().length === 0 }
  
  truncate(maxLength: number): MessageContent {
    if (this.text.length <= maxLength) return this
    return new MessageContent(this.text.substring(0, maxLength))
  }
}
```

#### Paso 1.3: Crear ModelId y ProviderId
```typescript
// src/domain/value-objects/ModelId.ts
export class ModelId {
  constructor(private readonly value: string) {
    if (!value.trim()) {
      throw new Error('ModelId cannot be empty')
    }
  }
  
  toString(): string { return this.value }
  equals(other: ModelId): boolean { return this.value === other.value }
}

// src/domain/value-objects/ProviderId.ts
export class ProviderId {
  private static readonly VALID_PROVIDERS = [
    'openai', 'anthropic', 'google', 'openrouter', 
    'vercel-gateway', 'local'
  ]
  
  constructor(private readonly value: string) {
    if (!value.trim()) {
      throw new Error('ProviderId cannot be empty')
    }
    if (!ProviderId.VALID_PROVIDERS.includes(value)) {
      throw new Error(`Invalid provider: ${value}`)
    }
  }
  
  toString(): string { return this.value }
  equals(other: ProviderId): boolean { return this.value === other.value }
  
  static openai(): ProviderId { return new ProviderId('openai') }
  static anthropic(): ProviderId { return new ProviderId('anthropic') }
  static google(): ProviderId { return new ProviderId('google') }
  static openrouter(): ProviderId { return new ProviderId('openrouter') }
  static gateway(): ProviderId { return new ProviderId('vercel-gateway') }
  static local(): ProviderId { return new ProviderId('local') }
}
```

### Día 3-4: Creación de Entidades del Dominio

#### Paso 2.1: Entidad Message
```typescript
// src/domain/entities/Message.ts
import { MessageId } from '../value-objects/MessageId'
import { ChatId } from '../value-objects/ChatId'
import { MessageContent } from '../value-objects/MessageContent'

export type MessageRole = 'user' | 'assistant' | 'system'

export class Message {
  constructor(
    public readonly id: MessageId,
    public readonly chatId: ChatId,
    public readonly role: MessageRole,
    public readonly content: MessageContent,
    public readonly createdAt: Date,
    public readonly updatedAt: Date = createdAt
  ) {}
  
  isFromUser(): boolean {
    return this.role === 'user'
  }
  
  isFromAssistant(): boolean {
    return this.role === 'assistant'
  }
  
  isSystem(): boolean {
    return this.role === 'system'
  }
  
  getWordCount(): number {
    return this.content.toString().split(/\s+/).length
  }
  
  static createUserMessage(chatId: ChatId, content: string): Message {
    return new Message(
      MessageId.generate(),
      chatId,
      'user',
      new MessageContent(content),
      new Date()
    )
  }
  
  static createAssistantMessage(chatId: ChatId, content: string): Message {
    return new Message(
      MessageId.generate(),
      chatId,
      'assistant',
      new MessageContent(content),
      new Date()
    )
  }
}
```

#### Paso 2.2: Entidad Chat
```typescript
// src/domain/entities/Chat.ts
import { ChatId } from '../value-objects/ChatId'
import { ModelId } from '../value-objects/ModelId'

export class Chat {
  constructor(
    public readonly id: ChatId,
    private _title: string,
    public readonly modelId: ModelId,
    public readonly createdAt: Date,
    private _updatedAt: Date,
    private _messageCount: number = 0
  ) {}
  
  get title(): string { return this._title }
  get updatedAt(): Date { return this._updatedAt }
  get messageCount(): number { return this._messageCount }
  
  updateTitle(newTitle: string): void {
    if (!newTitle.trim()) {
      throw new Error('Title cannot be empty')
    }
    if (newTitle.length > 200) {
      throw new Error('Title cannot exceed 200 characters')
    }
    this._title = newTitle.trim()
    this.touch()
  }
  
  incrementMessageCount(): void {
    this._messageCount++
    this.touch()
  }
  
  touch(): void {
    this._updatedAt = new Date()
  }
  
  isEmpty(): boolean {
    return this._messageCount === 0
  }
  
  static create(modelId: ModelId, title: string = 'New Conversation'): Chat {
    return new Chat(
      ChatId.generate(),
      title,
      modelId,
      new Date(),
      new Date(),
      0
    )
  }
}
```

#### Paso 2.3: Entidad Model
```typescript
// src/domain/entities/Model.ts
import { ModelId } from '../value-objects/ModelId'
import { ProviderId } from '../value-objects/ProviderId'

export enum ModelCapability {
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBEDDING = 'embedding',
  IMAGE_GENERATION = 'image_generation',
  CODE_GENERATION = 'code_generation',
  WEB_SEARCH = 'web_search'
}

export class Model {
  constructor(
    public readonly id: ModelId,
    public readonly name: string,
    public readonly provider: ProviderId,
    public readonly capabilities: ModelCapability[],
    public readonly contextLength: number,
    public readonly description?: string,
    private _isSelected: boolean = false,
    private _isAvailable: boolean = true
  ) {
    if (contextLength <= 0) {
      throw new Error('Context length must be positive')
    }
  }
  
  get isSelected(): boolean { return this._isSelected }
  get isAvailable(): boolean { return this._isAvailable }
  
  select(): void {
    if (!this._isAvailable) {
      throw new Error('Cannot select unavailable model')
    }
    this._isSelected = true
  }
  
  deselect(): void {
    this._isSelected = false
  }
  
  setAvailable(available: boolean): void {
    this._isAvailable = available
    if (!available) {
      this._isSelected = false
    }
  }
  
  hasCapability(capability: ModelCapability): boolean {
    return this.capabilities.includes(capability)
  }
  
  supportsChat(): boolean {
    return this.hasCapability(ModelCapability.CHAT)
  }
  
  getDisplayName(): string {
    return `${this.name} (${this.provider.toString()})`
  }
  
  canHandleContextLength(messageLength: number): boolean {
    return messageLength <= this.contextLength
  }
}
```

### Día 5-6: Definición de Repositorios (Puertos Secundarios)

#### Paso 3.1: ChatRepository
```typescript
// src/domain/repositories/ChatRepository.ts
import { Chat } from '../entities/Chat'
import { ChatId } from '../value-objects/ChatId'
import { ModelId } from '../value-objects/ModelId'

export interface ChatRepository {
  save(chat: Chat): Promise<void>
  findById(id: ChatId): Promise<Chat | null>
  findAll(): Promise<Chat[]>
  findByModel(modelId: ModelId): Promise<Chat[]>
  delete(id: ChatId): Promise<void>
  exists(id: ChatId): Promise<boolean>
  count(): Promise<number>
  findRecentChats(limit: number): Promise<Chat[]>
}
```

#### Paso 3.2: MessageRepository
```typescript
// src/domain/repositories/MessageRepository.ts
import { Message } from '../entities/Message'
import { MessageId } from '../value-objects/MessageId'
import { ChatId } from '../value-objects/ChatId'

export interface MessageRepository {
  save(message: Message): Promise<void>
  findById(id: MessageId): Promise<Message | null>
  findByChatId(chatId: ChatId, limit?: number, offset?: number): Promise<Message[]>
  findRecentByChatId(chatId: ChatId, limit: number): Promise<Message[]>
  delete(id: MessageId): Promise<void>
  deleteAllByChatId(chatId: ChatId): Promise<void>
  countByChatId(chatId: ChatId): Promise<number>
  searchInChat(chatId: ChatId, query: string): Promise<Message[]>
}
```

#### Paso 3.3: ModelRepository
```typescript
// src/domain/repositories/ModelRepository.ts
import { Model } from '../entities/Model'
import { ModelId } from '../value-objects/ModelId'
import { ProviderId } from '../value-objects/ProviderId'

export interface ModelRepository {
  save(model: Model): Promise<void>
  saveAll(models: Model[]): Promise<void>
  findById(id: ModelId): Promise<Model | null>
  findByProvider(providerId: ProviderId): Promise<Model[]>
  findSelected(): Promise<Model[]>
  findAvailable(): Promise<Model[]>
  deleteByProvider(providerId: ProviderId): Promise<void>
  updateSelection(modelId: ModelId, selected: boolean): Promise<void>
  updateAvailability(modelId: ModelId, available: boolean): Promise<void>
}
```

#### Paso 3.4: AIProviderPort
```typescript
// src/domain/repositories/AIProviderPort.ts
import { ModelId } from '../value-objects/ModelId'
import { Model } from '../entities/Model'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  model: string
  temperature?: number
  maxTokens?: number
  webSearch?: boolean
  stream?: boolean
}

export interface ChatChunk {
  delta?: string
  done: boolean
  error?: string
}

export interface ChatResponse {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface ProviderConfig {
  apiKey?: string
  baseUrl?: string
  organization?: string
  [key: string]: any
}

export interface AIProviderPort {
  streamChat(request: ChatRequest): AsyncGenerator<ChatChunk>
  sendSingleMessage(request: ChatRequest): Promise<ChatResponse>
  listModels(config: ProviderConfig): Promise<Model[]>
  validateConfiguration(config: ProviderConfig): Promise<boolean>
  getName(): string
  getRequiredConfigKeys(): string[]
}
```

### Día 7-8: Casos de Uso (Puertos Primarios)

#### Paso 4.1: ChatUseCase
```typescript
// src/domain/use-cases/ChatUseCase.ts
import { Chat } from '../entities/Chat'
import { Message } from '../entities/Message'
import { ChatId } from '../value-objects/ChatId'
import { ModelId } from '../value-objects/ModelId'
import { MessageContent } from '../value-objects/MessageContent'

export interface StreamChunk {
  type: 'delta' | 'complete' | 'error'
  content?: string
  message?: Message
  error?: string
}

export interface ChatUseCase {
  startConversation(modelId: string, title?: string): Promise<Chat>
  sendMessage(chatId: ChatId, content: MessageContent): AsyncGenerator<StreamChunk>
  getChatHistory(chatId: ChatId, limit?: number, offset?: number): Promise<Message[]>
  updateChatTitle(chatId: ChatId, title: string): Promise<void>
  deleteChat(chatId: ChatId): Promise<void>
  getAllChats(): Promise<Chat[]>
  searchMessages(chatId: ChatId, query: string): Promise<Message[]>
}
```

#### Paso 4.2: ModelManagementUseCase
```typescript
// src/domain/use-cases/ModelManagementUseCase.ts
import { Model } from '../entities/Model'
import { ModelId } from '../value-objects/ModelId'
import { ProviderId } from '../value-objects/ProviderId'

export interface ModelSyncResult {
  success: boolean
  modelsFound: number
  modelsAdded: number
  modelsUpdated: number
  error?: string
}

export interface ModelManagementUseCase {
  getAvailableModels(): Promise<Model[]>
  getModelsByProvider(providerId: ProviderId): Promise<Model[]>
  getSelectedModels(): Promise<Model[]>
  syncProviderModels(providerId: ProviderId, config: any): Promise<ModelSyncResult>
  toggleModelSelection(modelId: ModelId, selected: boolean): Promise<void>
  updateModelAvailability(modelId: ModelId, available: boolean): Promise<void>
  validateProviderConfig(providerId: ProviderId, config: any): Promise<boolean>
  bulkUpdateModelSelection(providerId: ProviderId, selectedIds: ModelId[]): Promise<void>
}
```

### Día 9-10: Errores del Dominio y Tests

#### Paso 5.1: Errores del Dominio
```typescript
// src/domain/errors/DomainError.ts
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class ChatNotFoundError extends DomainError {
  constructor(chatId: string) {
    super(`Chat with id ${chatId} not found`)
  }
}

export class ModelNotFoundError extends DomainError {
  constructor(modelId: string) {
    super(`Model with id ${modelId} not found`)
  }
}

export class ModelNotAvailableError extends DomainError {
  constructor(modelId: string) {
    super(`Model ${modelId} is not available`)
  }
}

export class InvalidConfigurationError extends DomainError {
  constructor(provider: string, reason: string) {
    super(`Invalid configuration for ${provider}: ${reason}`)
  }
}

export class AIProviderError extends DomainError {
  constructor(provider: string, message: string) {
    super(`AI Provider ${provider} error: ${message}`)
  }
}
```

#### Paso 5.2: Tests del Dominio
```typescript
// src/domain/entities/__tests__/Chat.test.ts
import { Chat } from '../Chat'
import { ModelId } from '../../value-objects/ModelId'

describe('Chat Entity', () => {
  const modelId = new ModelId('gpt-4')
  
  test('should create chat with valid parameters', () => {
    const chat = Chat.create(modelId, 'Test Chat')
    
    expect(chat.title).toBe('Test Chat')
    expect(chat.modelId).toBe(modelId)
    expect(chat.messageCount).toBe(0)
    expect(chat.isEmpty()).toBe(true)
  })
  
  test('should update title correctly', () => {
    const chat = Chat.create(modelId)
    const newTitle = 'Updated Title'
    
    chat.updateTitle(newTitle)
    
    expect(chat.title).toBe(newTitle)
  })
  
  test('should throw error for empty title', () => {
    const chat = Chat.create(modelId)
    
    expect(() => chat.updateTitle('')).toThrow('Title cannot be empty')
  })
  
  test('should increment message count', () => {
    const chat = Chat.create(modelId)
    
    chat.incrementMessageCount()
    
    expect(chat.messageCount).toBe(1)
    expect(chat.isEmpty()).toBe(false)
  })
})
```

### Checklist Fase 1
- [ ] Todos los value objects creados y testeados
- [ ] Todas las entidades del dominio implementadas
- [ ] Interfaces de repositorios definidas
- [ ] Casos de uso especificados
- [ ] Errores del dominio implementados
- [ ] Tests unitarios con >90% cobertura en domain/
- [ ] Zero dependencias externas en domain/

## FASE 2: Adaptadores de Infraestructura (12-15 días)

### Día 11-13: Adaptadores de Proveedores de IA

#### Paso 6.1: OpenAI Adapter
```typescript
// src/infrastructure/adapters/ai-providers/OpenAIAdapter.ts
import { injectable } from 'tsyringe'
import { AIProviderPort, ChatRequest, ChatChunk, ChatResponse, ProviderConfig } from '../../../domain/repositories/AIProviderPort'
import { Model, ModelCapability } from '../../../domain/entities/Model'
import { ModelId } from '../../../domain/value-objects/ModelId'
import { ProviderId } from '../../../domain/value-objects/ProviderId'
import { AIProviderError } from '../../../domain/errors/DomainError'
import OpenAI from 'openai'

export interface OpenAIConfig extends ProviderConfig {
  apiKey: string
  baseUrl?: string
  organization?: string
}

@injectable()
export class OpenAIAdapter implements AIProviderPort {
  private client: OpenAI | null = null
  
  constructor(private config: OpenAIConfig) {
    this.initializeClient()
  }
  
  private initializeClient(): void {
    try {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
        organization: this.config.organization
      })
    } catch (error) {
      throw new AIProviderError('openai', `Failed to initialize client: ${error}`)
    }
  }
  
  async *streamChat(request: ChatRequest): AsyncGenerator<ChatChunk> {
    if (!this.client) {
      yield { error: 'OpenAI client not initialized', done: true }
      return
    }
    
    try {
      const stream = await this.client.chat.completions.create({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true
      })
      
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          yield { delta, done: false }
        }
      }
      
      yield { done: true }
    } catch (error) {
      yield { 
        error: error instanceof Error ? error.message : 'Unknown OpenAI error',
        done: true 
      }
    }
  }
  
  async sendSingleMessage(request: ChatRequest): Promise<ChatResponse> {
    if (!this.client) {
      throw new AIProviderError('openai', 'Client not initialized')
    }
    
    try {
      const completion = await this.client.chat.completions.create({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false
      })
      
      return {
        content: completion.choices[0]?.message?.content || '',
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        } : undefined
      }
    } catch (error) {
      throw new AIProviderError('openai', error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  async listModels(): Promise<Model[]> {
    if (!this.client) {
      throw new AIProviderError('openai', 'Client not initialized')
    }
    
    try {
      const response = await this.client.models.list()
      const providerId = ProviderId.openai()
      
      return response.data
        .filter(model => model.id.includes('gpt'))
        .map(model => new Model(
          new ModelId(model.id),
          model.id,
          providerId,
          this.parseCapabilities(model.id),
          this.getContextLength(model.id),
          `OpenAI ${model.id} model`
        ))
    } catch (error) {
      throw new AIProviderError('openai', `Failed to list models: ${error}`)
    }
  }
  
  async validateConfiguration(config: ProviderConfig): Promise<boolean> {
    try {
      const tempClient = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        organization: config.organization
      })
      
      await tempClient.models.list()
      return true
    } catch {
      return false
    }
  }
  
  getName(): string {
    return 'OpenAI'
  }
  
  getRequiredConfigKeys(): string[] {
    return ['apiKey']
  }
  
  private parseCapabilities(modelId: string): ModelCapability[] {
    const capabilities = [ModelCapability.CHAT]
    
    if (modelId.includes('gpt-4')) {
      capabilities.push(ModelCapability.CODE_GENERATION)
    }
    
    return capabilities
  }
  
  private getContextLength(modelId: string): number {
    const contextLengths: Record<string, number> = {
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-4-turbo': 128000,
      'gpt-3.5-turbo': 4096,
      'gpt-3.5-turbo-16k': 16384
    }
    
    return contextLengths[modelId] || 4096
  }
}
```

#### Paso 6.2: AI Provider Factory
```typescript
// src/infrastructure/adapters/ai-providers/AIProviderFactory.ts
import { injectable } from 'tsyringe'
import { AIProviderPort, ProviderConfig } from '../../../domain/repositories/AIProviderPort'
import { OpenAIAdapter, OpenAIConfig } from './OpenAIAdapter'
import { AnthropicAdapter, AnthropicConfig } from './AnthropicAdapter'
import { GoogleAdapter, GoogleConfig } from './GoogleAdapter'
import { OpenRouterAdapter, OpenRouterConfig } from './OpenRouterAdapter'
import { GatewayAdapter, GatewayConfig } from './GatewayAdapter'
import { LocalAdapter, LocalConfig } from './LocalAdapter'

@injectable()
export class AIProviderFactory {
  create(providerType: string, config: ProviderConfig): AIProviderPort {
    switch (providerType) {
      case 'openai':
        return new OpenAIAdapter(config as OpenAIConfig)
      case 'anthropic':
        return new AnthropicAdapter(config as AnthropicConfig)
      case 'google':
        return new GoogleAdapter(config as GoogleConfig)
      case 'openrouter':
        return new OpenRouterAdapter(config as OpenRouterConfig)
      case 'vercel-gateway':
        return new GatewayAdapter(config as GatewayConfig)
      case 'local':
        return new LocalAdapter(config as LocalConfig)
      default:
        throw new Error(`Unknown provider type: ${providerType}`)
    }
  }
  
  getSupportedProviders(): string[] {
    return ['openai', 'anthropic', 'google', 'openrouter', 'vercel-gateway', 'local']
  }
  
  getProviderRequiredConfig(providerType: string): string[] {
    const tempProvider = this.create(providerType, {})
    return tempProvider.getRequiredConfigKeys()
  }
}
```

### Día 14-16: Adaptadores de Base de Datos

#### Paso 7.1: SQLiteChatRepository
```typescript
// src/infrastructure/adapters/database/SQLiteChatRepository.ts
import { injectable, inject } from 'tsyringe'
import { ChatRepository } from '../../../domain/repositories/ChatRepository'
import { Chat } from '../../../domain/entities/Chat'
import { ChatId } from '../../../domain/value-objects/ChatId'
import { ModelId } from '../../../domain/value-objects/ModelId'
import { DatabaseService } from '../../services/DatabaseService'
import { ChatMapper } from '../../mappers/ChatMapper'

export interface ChatRecord {
  id: string
  title: string
  model: string
  created_at: number
  updated_at: number
  message_count: number
}

@injectable()
export class SQLiteChatRepository implements ChatRepository {
  constructor(
    @inject('DatabaseService') private db: DatabaseService,
    private mapper: ChatMapper
  ) {}
  
  async save(chat: Chat): Promise<void> {
    const record = this.mapper.toRecord(chat)
    
    await this.db.execute(
      `INSERT OR REPLACE INTO chat_sessions 
       (id, title, model, created_at, updated_at, message_count) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.title,
        record.model,
        record.created_at,
        record.updated_at,
        record.message_count
      ]
    )
  }
  
  async findById(id: ChatId): Promise<Chat | null> {
    const result = await this.db.execute(
      'SELECT * FROM chat_sessions WHERE id = ?',
      [id.toString()]
    )
    
    if (!result.rows.length) return null
    
    const record = result.rows[0] as ChatRecord
    return this.mapper.toDomain(record)
  }
  
  async findAll(): Promise<Chat[]> {
    const result = await this.db.execute(
      'SELECT * FROM chat_sessions ORDER BY updated_at DESC'
    )
    
    return result.rows.map(row => 
      this.mapper.toDomain(row as ChatRecord)
    )
  }
  
  async findByModel(modelId: ModelId): Promise<Chat[]> {
    const result = await this.db.execute(
      'SELECT * FROM chat_sessions WHERE model = ? ORDER BY updated_at DESC',
      [modelId.toString()]
    )
    
    return result.rows.map(row => 
      this.mapper.toDomain(row as ChatRecord)
    )
  }
  
  async delete(id: ChatId): Promise<void> {
    await this.db.execute(
      'DELETE FROM chat_sessions WHERE id = ?',
      [id.toString()]
    )
  }
  
  async exists(id: ChatId): Promise<boolean> {
    const result = await this.db.execute(
      'SELECT 1 FROM chat_sessions WHERE id = ? LIMIT 1',
      [id.toString()]
    )
    
    return result.rows.length > 0
  }
  
  async count(): Promise<number> {
    const result = await this.db.execute(
      'SELECT COUNT(*) as count FROM chat_sessions'
    )
    
    return (result.rows[0] as any).count
  }
  
  async findRecentChats(limit: number): Promise<Chat[]> {
    const result = await this.db.execute(
      'SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT ?',
      [limit]
    )
    
    return result.rows.map(row => 
      this.mapper.toDomain(row as ChatRecord)
    )
  }
}
```

#### Paso 7.2: Mappers
```typescript
// src/infrastructure/mappers/ChatMapper.ts
import { injectable } from 'tsyringe'
import { Chat } from '../../domain/entities/Chat'
import { ChatId } from '../../domain/value-objects/ChatId'
import { ModelId } from '../../domain/value-objects/ModelId'
import { ChatRecord } from '../adapters/database/SQLiteChatRepository'

@injectable()
export class ChatMapper {
  toDomain(record: ChatRecord): Chat {
    return new Chat(
      new ChatId(record.id),
      record.title,
      new ModelId(record.model),
      new Date(record.created_at),
      new Date(record.updated_at),
      record.message_count
    )
  }
  
  toRecord(chat: Chat): ChatRecord {
    return {
      id: chat.id.toString(),
      title: chat.title,
      model: chat.modelId.toString(),
      created_at: chat.createdAt.getTime(),
      updated_at: chat.updatedAt.getTime(),
      message_count: chat.messageCount
    }
  }
}
```

### Día 17-18: Configuración de Dependency Injection

#### Paso 8.1: Container Configuration
```typescript
// src/infrastructure/config/DIContainer.ts
import { Container } from 'tsyringe'
import 'reflect-metadata'

// Domain Use Cases
import { ChatUseCase } from '../../domain/use-cases/ChatUseCase'
import { ModelManagementUseCase } from '../../domain/use-cases/ModelManagementUseCase'
import { ChatUseCaseImpl } from './implementations/ChatUseCaseImpl'
import { ModelManagementUseCaseImpl } from './implementations/ModelManagementUseCaseImpl'

// Repositories
import { ChatRepository } from '../../domain/repositories/ChatRepository'
import { MessageRepository } from '../../domain/repositories/MessageRepository'
import { ModelRepository } from '../../domain/repositories/ModelRepository'

// Infrastructure Adapters
import { SQLiteChatRepository } from '../adapters/database/SQLiteChatRepository'
import { SQLiteMessageRepository } from '../adapters/database/SQLiteMessageRepository'
import { SQLiteModelRepository } from '../adapters/database/SQLiteModelRepository'

// AI Providers
import { AIProviderFactory } from '../adapters/ai-providers/AIProviderFactory'

// Mappers
import { ChatMapper } from '../mappers/ChatMapper'
import { MessageMapper } from '../mappers/MessageMapper'
import { ModelMapper } from '../mappers/ModelMapper'

// Services
import { DatabaseService } from '../services/DatabaseService'

export class DIContainer {
  private static container: Container

  static initialize(): Container {
    if (!this.container) {
      this.container = new Container()
      this.registerDependencies()
    }
    return this.container
  }

  private static registerDependencies(): void {
    // Register Services
    this.container.registerSingleton('DatabaseService', DatabaseService)

    // Register Mappers
    this.container.registerSingleton(ChatMapper)
    this.container.registerSingleton(MessageMapper)
    this.container.registerSingleton(ModelMapper)

    // Register Repositories
    this.container.register<ChatRepository>('ChatRepository', {
      useFactory: (container) => {
        return new SQLiteChatRepository(
          container.resolve('DatabaseService'),
          container.resolve(ChatMapper)
        )
      }
    })

    this.container.register<MessageRepository>('MessageRepository', {
      useFactory: (container) => {
        return new SQLiteMessageRepository(
          container.resolve('DatabaseService'),
          container.resolve(MessageMapper)
        )
      }
    })

    this.container.register<ModelRepository>('ModelRepository', {
      useFactory: (container) => {
        return new SQLiteModelRepository(
          container.resolve('DatabaseService'),
          container.resolve(ModelMapper)
        )
      }
    })

    // Register AI Provider Factory
    this.container.registerSingleton(AIProviderFactory)

    // Register Use Cases
    this.container.register<ChatUseCase>('ChatUseCase', {
      useFactory: (container) => {
        return new ChatUseCaseImpl(
          container.resolve('ChatRepository'),
          container.resolve('MessageRepository'),
          container.resolve(AIProviderFactory)
        )
      }
    })

    this.container.register<ModelManagementUseCase>('ModelManagementUseCase', {
      useFactory: (container) => {
        return new ModelManagementUseCaseImpl(
          container.resolve('ModelRepository'),
          container.resolve(AIProviderFactory)
        )
      }
    })
  }

  static resolve<T>(token: string | Function): T {
    return this.container.resolve(token)
  }

  static registerInstance<T>(token: string, instance: T): void {
    this.container.registerInstance(token, instance)
  }

  static clear(): void {
    this.container.clearInstances()
  }
}
```

### Checklist Fase 2
- [ ] Todos los adaptadores de AI providers implementados
- [ ] Factory pattern para providers configurado
- [ ] Adaptadores de base de datos completados
- [ ] Mappers domain ↔ persistencia creados
- [ ] Dependency injection configurado
- [ ] Tests de integración para adaptadores

## FASE 3: Implementación de Casos de Uso (15-18 días)

### Día 19-21: ChatUseCaseImpl

#### Paso 9.1: Implementación del Caso de Uso de Chat
```typescript
// src/infrastructure/config/implementations/ChatUseCaseImpl.ts
import { injectable, inject } from 'tsyringe'
import { ChatUseCase, StreamChunk } from '../../../domain/use-cases/ChatUseCase'
import { Chat } from '../../../domain/entities/Chat'
import { Message } from '../../../domain/entities/Message'
import { ChatId } from '../../../domain/value-objects/ChatId'
import { ModelId } from '../../../domain/value-objects/ModelId'
import { MessageId } from '../../../domain/value-objects/MessageId'
import { MessageContent } from '../../../domain/value-objects/MessageContent'
import { ChatRepository } from '../../../domain/repositories/ChatRepository'
import { MessageRepository } from '../../../domain/repositories/MessageRepository'
import { AIProviderFactory } from '../../adapters/ai-providers/AIProviderFactory'
import { ChatNotFoundError, ModelNotFoundError } from '../../../domain/errors/DomainError'

@injectable()
export class ChatUseCaseImpl implements ChatUseCase {
  constructor(
    @inject('ChatRepository') private chatRepository: ChatRepository,
    @inject('MessageRepository') private messageRepository: MessageRepository,
    private aiProviderFactory: AIProviderFactory,
    private currentProvider: string = 'openai',
    private providerConfig: any = {}
  ) {}

  async startConversation(modelId: string, title?: string): Promise<Chat> {
    const chat = Chat.create(
      new ModelId(modelId),
      title || 'New Conversation'
    )

    await this.chatRepository.save(chat)
    return chat
  }

  async *sendMessage(chatId: ChatId, content: MessageContent): AsyncGenerator<StreamChunk> {
    // Validate chat exists
    const chat = await this.chatRepository.findById(chatId)
    if (!chat) {
      yield { type: 'error', error: 'Chat not found' }
      return
    }

    try {
      // Save user message
      const userMessage = Message.createUserMessage(chatId, content.toString())
      await this.messageRepository.save(userMessage)

      // Update chat message count
      chat.incrementMessageCount()
      await this.chatRepository.save(chat)

      // Get chat history
      const chatHistory = await this.messageRepository.findByChatId(chatId)
      
      // Prepare AI request
      const aiProvider = this.aiProviderFactory.create(this.currentProvider, this.providerConfig)
      const request = {
        messages: chatHistory.map(m => ({
          role: m.role,
          content: m.content.toString()
        })),
        model: chat.modelId.toString(),
        stream: true
      }

      // Stream AI response
      let assistantContent = ''
      for await (const chunk of aiProvider.streamChat(request)) {
        if (chunk.error) {
          yield { type: 'error', error: chunk.error }
          return
        }

        if (chunk.delta) {
          assistantContent += chunk.delta
          yield { type: 'delta', content: chunk.delta }
        }

        if (chunk.done) {
          // Save assistant message
          const assistantMessage = Message.createAssistantMessage(
            chatId, 
            assistantContent
          )
          await this.messageRepository.save(assistantMessage)

          // Update chat
          chat.incrementMessageCount()
          chat.touch()
          await this.chatRepository.save(chat)

          yield { type: 'complete', message: assistantMessage }
        }
      }
    } catch (error) {
      yield { 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  async getChatHistory(chatId: ChatId, limit?: number, offset?: number): Promise<Message[]> {
    const chatExists = await this.chatRepository.exists(chatId)
    if (!chatExists) {
      throw new ChatNotFoundError(chatId.toString())
    }

    return this.messageRepository.findByChatId(chatId, limit, offset)
  }

  async updateChatTitle(chatId: ChatId, title: string): Promise<void> {
    const chat = await this.chatRepository.findById(chatId)
    if (!chat) {
      throw new ChatNotFoundError(chatId.toString())
    }

    chat.updateTitle(title)
    await this.chatRepository.save(chat)
  }

  async deleteChat(chatId: ChatId): Promise<void> {
    const chatExists = await this.chatRepository.exists(chatId)
    if (!chatExists) {
      throw new ChatNotFoundError(chatId.toString())
    }

    // Delete all messages first
    await this.messageRepository.deleteAllByChatId(chatId)
    
    // Delete chat
    await this.chatRepository.delete(chatId)
  }

  async getAllChats(): Promise<Chat[]> {
    return this.chatRepository.findAll()
  }

  async searchMessages(chatId: ChatId, query: string): Promise<Message[]> {
    const chatExists = await this.chatRepository.exists(chatId)
    if (!chatExists) {
      throw new ChatNotFoundError(chatId.toString())
    }

    return this.messageRepository.searchInChat(chatId, query)
  }

  // Configuration methods
  setProvider(provider: string, config: any): void {
    this.currentProvider = provider
    this.providerConfig = config
  }
}
```

### Día 22-24: Servicios de Aplicación

#### Paso 10.1: ChatApplicationService
```typescript
// src/application/services/ChatApplicationService.ts
import { injectable, inject } from 'tsyringe'
import { ChatUseCase, StreamChunk } from '../../domain/use-cases/ChatUseCase'
import { Chat } from '../../domain/entities/Chat'
import { Message } from '../../domain/entities/Message'
import { ChatId } from '../../domain/value-objects/ChatId'
import { MessageContent } from '../../domain/value-objects/MessageContent'

// DTOs
export interface ChatDto {
  id: string
  title: string
  modelId: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export interface MessageDto {
  id: string
  chatId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export interface StreamChunkDto {
  type: 'delta' | 'complete' | 'error'
  content?: string
  message?: MessageDto
  error?: string
}

@injectable()
export class ChatApplicationService {
  constructor(
    @inject('ChatUseCase') private chatUseCase: ChatUseCase
  ) {}

  async startNewChat(modelId: string, title?: string): Promise<ChatDto> {
    const chat = await this.chatUseCase.startConversation(modelId, title)
    return this.mapChatToDto(chat)
  }

  async *streamMessage(chatId: string, content: string): AsyncGenerator<StreamChunkDto> {
    const chunks = this.chatUseCase.sendMessage(
      new ChatId(chatId),
      new MessageContent(content)
    )

    for await (const chunk of chunks) {
      yield this.mapStreamChunkToDto(chunk)
    }
  }

  async getChatHistory(chatId: string, limit?: number, offset?: number): Promise<MessageDto[]> {
    const messages = await this.chatUseCase.getChatHistory(
      new ChatId(chatId),
      limit,
      offset
    )

    return messages.map(this.mapMessageToDto)
  }

  async updateChatTitle(chatId: string, title: string): Promise<void> {
    await this.chatUseCase.updateChatTitle(new ChatId(chatId), title)
  }

  async deleteChat(chatId: string): Promise<void> {
    await this.chatUseCase.deleteChat(new ChatId(chatId))
  }

  async getAllChats(): Promise<ChatDto[]> {
    const chats = await this.chatUseCase.getAllChats()
    return chats.map(this.mapChatToDto)
  }

  async searchMessages(chatId: string, query: string): Promise<MessageDto[]> {
    const messages = await this.chatUseCase.searchMessages(new ChatId(chatId), query)
    return messages.map(this.mapMessageToDto)
  }

  // Mapping methods
  private mapChatToDto(chat: Chat): ChatDto {
    return {
      id: chat.id.toString(),
      title: chat.title,
      modelId: chat.modelId.toString(),
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messageCount: chat.messageCount
    }
  }

  private mapMessageToDto(message: Message): MessageDto {
    return {
      id: message.id.toString(),
      chatId: message.chatId.toString(),
      role: message.role,
      content: message.content.toString(),
      createdAt: message.createdAt.toISOString()
    }
  }

  private mapStreamChunkToDto(chunk: StreamChunk): StreamChunkDto {
    return {
      type: chunk.type,
      content: chunk.content,
      message: chunk.message ? this.mapMessageToDto(chunk.message) : undefined,
      error: chunk.error
    }
  }
}
```

### Día 25-27: IPC Handlers

#### Paso 11.1: ChatHandler
```typescript
// src/application/handlers/ChatHandler.ts
import { injectable, inject } from 'tsyringe'
import { IpcMainEvent } from 'electron'
import { ChatApplicationService, ChatDto, MessageDto, StreamChunkDto } from '../services/ChatApplicationService'

export interface IPCResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

@injectable()
export class ChatHandler {
  constructor(
    @inject(ChatApplicationService) private chatService: ChatApplicationService
  ) {}

  async handleStartChat(
    event: IpcMainEvent, 
    modelId: string, 
    title?: string
  ): Promise<IPCResponse<ChatDto>> {
    try {
      const chat = await this.chatService.startNewChat(modelId, title)
      return { success: true, data: chat }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  async *handleStreamChat(
    event: IpcMainEvent, 
    chatId: string, 
    content: string
  ): AsyncGenerator<IPCResponse<StreamChunkDto>> {
    try {
      const stream = this.chatService.streamMessage(chatId, content)

      for await (const chunk of stream) {
        yield { success: true, data: chunk }
      }
    } catch (error) {
      yield {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async handleGetChatHistory(
    event: IpcMainEvent,
    chatId: string,
    limit?: number,
    offset?: number
  ): Promise<IPCResponse<MessageDto[]>> {
    try {
      const messages = await this.chatService.getChatHistory(chatId, limit, offset)
      return { success: true, data: messages }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async handleUpdateChatTitle(
    event: IpcMainEvent,
    chatId: string,
    title: string
  ): Promise<IPCResponse<void>> {
    try {
      await this.chatService.updateChatTitle(chatId, title)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async handleDeleteChat(
    event: IpcMainEvent,
    chatId: string
  ): Promise<IPCResponse<void>> {
    try {
      await this.chatService.deleteChat(chatId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async handleGetAllChats(event: IpcMainEvent): Promise<IPCResponse<ChatDto[]>> {
    try {
      const chats = await this.chatService.getAllChats()
      return { success: true, data: chats }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
```

### Día 28-30: Integration Testing

#### Paso 12.1: Tests de Integración
```typescript
// src/infrastructure/__tests__/integration/chat-flow.test.ts
import { Container } from 'tsyringe'
import { DIContainer } from '../../config/DIContainer'
import { ChatApplicationService } from '../../../application/services/ChatApplicationService'
import { ModelManagementApplicationService } from '../../../application/services/ModelManagementApplicationService'

describe('Chat Flow Integration Tests', () => {
  let container: Container
  let chatService: ChatApplicationService
  let modelService: ModelManagementApplicationService

  beforeAll(async () => {
    container = DIContainer.initialize()
    chatService = container.resolve(ChatApplicationService)
    modelService = container.resolve(ModelManagementApplicationService)
  })

  afterAll(async () => {
    DIContainer.clear()
  })

  test('Complete chat conversation flow', async () => {
    // 1. Start new chat
    const chat = await chatService.startNewChat('gpt-4', 'Test Chat')
    expect(chat.title).toBe('Test Chat')
    expect(chat.modelId).toBe('gpt-4')

    // 2. Send message and receive stream
    const messages: string[] = []
    const stream = chatService.streamMessage(chat.id, 'Hello, world!')

    for await (const chunk of stream) {
      if (chunk.type === 'delta' && chunk.content) {
        messages.push(chunk.content)
      } else if (chunk.type === 'complete' && chunk.message) {
        expect(chunk.message.role).toBe('assistant')
        break
      }
    }

    expect(messages.length).toBeGreaterThan(0)

    // 3. Get chat history
    const history = await chatService.getChatHistory(chat.id)
    expect(history).toHaveLength(2) // User message + Assistant message
    expect(history[0].role).toBe('user')
    expect(history[0].content).toBe('Hello, world!')
    expect(history[1].role).toBe('assistant')

    // 4. Update chat title
    await chatService.updateChatTitle(chat.id, 'Updated Title')
    const updatedChats = await chatService.getAllChats()
    const updatedChat = updatedChats.find(c => c.id === chat.id)
    expect(updatedChat?.title).toBe('Updated Title')

    // 5. Delete chat
    await chatService.deleteChat(chat.id)
    const finalChats = await chatService.getAllChats()
    expect(finalChats.find(c => c.id === chat.id)).toBeUndefined()
  })
})
```

### Checklist Fase 3
- [ ] Todos los casos de uso implementados
- [ ] Servicios de aplicación como orquestadores
- [ ] Handlers IPC refactorizados
- [ ] DTOs para comunicación entre capas
- [ ] Tests de integración end-to-end
- [ ] Lógica de negocio migrada a casos de uso

## FASE 4: Integración Final y Migration (10-12 días)

### Día 31-33: Migration Scripts

#### Paso 13.1: Data Migration
```typescript
// src/infrastructure/migrations/HexagonalMigration.ts
import { DIContainer } from '../config/DIContainer'
import { DatabaseService } from '../services/DatabaseService'

export class HexagonalMigration {
  private db: DatabaseService

  constructor() {
    const container = DIContainer.initialize()
    this.db = container.resolve('DatabaseService')
  }

  async migrate(): Promise<void> {
    console.log('Starting hexagonal architecture migration...')

    // 1. Backup current data
    await this.backupData()

    // 2. Update database schema if needed
    await this.updateSchema()

    // 3. Migrate data to new format
    await this.migrateData()

    // 4. Validate migration
    await this.validateMigration()

    console.log('Hexagonal architecture migration completed successfully!')
  }

  private async backupData(): Promise<void> {
    // Implementation for backing up current data
  }

  private async updateSchema(): Promise<void> {
    // Add any new columns or indexes needed
    const migrations = [
      `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0`,
      `UPDATE chat_sessions SET message_count = (
        SELECT COUNT(*) FROM messages WHERE chat_id = chat_sessions.id
      ) WHERE message_count = 0`
    ]

    for (const migration of migrations) {
      await this.db.execute(migration)
    }
  }

  private async migrateData(): Promise<void> {
    // Migrate any data format changes
    console.log('Data migration completed')
  }

  private async validateMigration(): Promise<void> {
    // Validate that migration was successful
    const chatCount = await this.db.execute('SELECT COUNT(*) as count FROM chat_sessions')
    const messageCount = await this.db.execute('SELECT COUNT(*) as count FROM messages')
    
    console.log(`Migration validation: ${chatCount.rows[0]} chats, ${messageCount.rows[0]} messages`)
  }
}
```

### Día 34-36: Main Process Integration

#### Paso 14.1: Update main.ts
```typescript
// src/main/main.ts (updated)
import { app, BrowserWindow, ipcMain } from 'electron'
import { DIContainer } from '../infrastructure/config/DIContainer'
import { ChatHandler } from '../application/handlers/ChatHandler'
import { ModelHandler } from '../application/handlers/ModelHandler'
import { PreferencesHandler } from '../application/handlers/PreferencesHandler'
import 'reflect-metadata'

class Application {
  private mainWindow: BrowserWindow | null = null
  private chatHandler!: ChatHandler
  private modelHandler!: ModelHandler
  private preferencesHandler!: PreferencesHandler

  constructor() {
    this.initializeDependencyInjection()
    this.setupEventHandlers()
  }

  private initializeDependencyInjection(): void {
    const container = DIContainer.initialize()
    
    this.chatHandler = container.resolve(ChatHandler)
    this.modelHandler = container.resolve(ModelHandler)
    this.preferencesHandler = container.resolve(PreferencesHandler)
  }

  private setupEventHandlers(): void {
    app.whenReady().then(() => {
      this.createWindow()
      this.setupIpcHandlers()
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) this.createWindow()
    })
  }

  private setupIpcHandlers(): void {
    // Chat handlers
    ipcMain.handle('levante/chat/start', this.chatHandler.handleStartChat.bind(this.chatHandler))
    ipcMain.handle('levante/chat/history', this.chatHandler.handleGetChatHistory.bind(this.chatHandler))
    ipcMain.handle('levante/chat/update-title', this.chatHandler.handleUpdateChatTitle.bind(this.chatHandler))
    ipcMain.handle('levante/chat/delete', this.chatHandler.handleDeleteChat.bind(this.chatHandler))
    ipcMain.handle('levante/chat/all', this.chatHandler.handleGetAllChats.bind(this.chatHandler))

    // Streaming chat handler
    ipcMain.handle('levante/chat/stream', async (event, chatId: string, content: string) => {
      const stream = this.chatHandler.handleStreamChat(event, chatId, content)
      
      for await (const chunk of stream) {
        event.sender.send('levante/chat/stream-chunk', chunk)
      }
      
      event.sender.send('levante/chat/stream-complete')
    })

    // Model handlers
    ipcMain.handle('levante/models/list', this.modelHandler.handleListModels.bind(this.modelHandler))
    ipcMain.handle('levante/models/sync', this.modelHandler.handleSyncModels.bind(this.modelHandler))
    ipcMain.handle('levante/models/toggle', this.modelHandler.handleToggleModel.bind(this.modelHandler))
    
    // Preferences handlers
    ipcMain.handle('levante/preferences/get', this.preferencesHandler.handleGetPreferences.bind(this.preferencesHandler))
    ipcMain.handle('levante/preferences/set', this.preferencesHandler.handleSetPreferences.bind(this.preferencesHandler))
  }

  private createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/preload.js')
      }
    })

    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadURL('http://localhost:3000')
      this.mainWindow.webContents.openDevTools()
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
  }
}

new Application()
```

### Día 37-39: Renderer Integration

#### Paso 15.1: Update Zustand Stores
```typescript
// src/renderer/stores/chatStore.ts (updated to use new IPC)
import { create } from 'zustand'
import { ChatDto, MessageDto } from '../../application/services/ChatApplicationService'

interface ChatState {
  currentChat: ChatDto | null
  allChats: ChatDto[]
  messages: MessageDto[]
  isLoading: boolean
  isStreaming: boolean
  streamingMessage: string
  
  // Actions
  startNewChat: (modelId: string, title?: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  loadChatHistory: (chatId: string) => Promise<void>
  loadAllChats: () => Promise<void>
  updateChatTitle: (chatId: string, title: string) => Promise<void>
  deleteChat: (chatId: string) => Promise<void>
  setCurrentChat: (chat: ChatDto | null) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentChat: null,
  allChats: [],
  messages: [],
  isLoading: false,
  isStreaming: false,
  streamingMessage: '',

  startNewChat: async (modelId: string, title?: string) => {
    set({ isLoading: true })
    
    try {
      const response = await window.levante.chat.start(modelId, title)
      if (response.success && response.data) {
        set({ 
          currentChat: response.data,
          messages: [],
          isLoading: false 
        })
        
        // Refresh all chats
        get().loadAllChats()
      }
    } catch (error) {
      console.error('Failed to start chat:', error)
      set({ isLoading: false })
    }
  },

  sendMessage: async (content: string) => {
    const { currentChat } = get()
    if (!currentChat) return

    set({ isStreaming: true, streamingMessage: '' })

    try {
      // Add user message immediately
      const userMessage: MessageDto = {
        id: `temp-${Date.now()}`,
        chatId: currentChat.id,
        role: 'user',
        content,
        createdAt: new Date().toISOString()
      }

      set(state => ({ 
        messages: [...state.messages, userMessage]
      }))

      // Set up streaming listener
      const handleStreamChunk = (chunk: any) => {
        if (chunk.success && chunk.data) {
          if (chunk.data.type === 'delta') {
            set(state => ({ 
              streamingMessage: state.streamingMessage + chunk.data.content 
            }))
          } else if (chunk.data.type === 'complete') {
            set(state => ({ 
              messages: [...state.messages, chunk.data.message],
              isStreaming: false,
              streamingMessage: ''
            }))
          }
        }
      }

      const handleStreamComplete = () => {
        set({ isStreaming: false })
        window.electronAPI.removeAllListeners('levante/chat/stream-chunk')
        window.electronAPI.removeAllListeners('levante/chat/stream-complete')
      }

      window.electronAPI.on('levante/chat/stream-chunk', handleStreamChunk)
      window.electronAPI.on('levante/chat/stream-complete', handleStreamComplete)

      // Start streaming
      await window.levante.chat.stream(currentChat.id, content)
      
    } catch (error) {
      console.error('Failed to send message:', error)
      set({ isStreaming: false, streamingMessage: '' })
    }
  },

  loadChatHistory: async (chatId: string) => {
    set({ isLoading: true })
    
    try {
      const response = await window.levante.chat.getHistory(chatId)
      if (response.success && response.data) {
        set({ messages: response.data, isLoading: false })
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
      set({ isLoading: false })
    }
  },

  loadAllChats: async () => {
    try {
      const response = await window.levante.chat.getAll()
      if (response.success && response.data) {
        set({ allChats: response.data })
      }
    } catch (error) {
      console.error('Failed to load chats:', error)
    }
  },

  updateChatTitle: async (chatId: string, title: string) => {
    try {
      const response = await window.levante.chat.updateTitle(chatId, title)
      if (response.success) {
        // Update local state
        set(state => ({
          allChats: state.allChats.map(chat => 
            chat.id === chatId ? { ...chat, title } : chat
          ),
          currentChat: state.currentChat?.id === chatId 
            ? { ...state.currentChat, title }
            : state.currentChat
        }))
      }
    } catch (error) {
      console.error('Failed to update chat title:', error)
    }
  },

  deleteChat: async (chatId: string) => {
    try {
      const response = await window.levante.chat.delete(chatId)
      if (response.success) {
        set(state => ({
          allChats: state.allChats.filter(chat => chat.id !== chatId),
          currentChat: state.currentChat?.id === chatId ? null : state.currentChat,
          messages: state.currentChat?.id === chatId ? [] : state.messages
        }))
      }
    } catch (error) {
      console.error('Failed to delete chat:', error)
    }
  },

  setCurrentChat: (chat: ChatDto | null) => {
    set({ currentChat: chat, messages: [] })
    if (chat) {
      get().loadChatHistory(chat.id)
    }
  }
}))
```

### Día 40-42: Testing and Validation

#### Paso 16.1: End-to-End Testing
```typescript
// e2e/hexagonal-architecture.spec.ts
import { test, expect } from '@playwright/test'
import { ElectronApplication, Page, _electron as electron } from 'playwright'

test.describe('Hexagonal Architecture E2E Tests', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({ args: ['./out/main/main.js'] })
    page = await electronApp.firstWindow()
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('Complete chat workflow', async () => {
    // Test chat creation
    await page.click('[data-testid="new-chat-button"]')
    await page.fill('[data-testid="chat-title-input"]', 'E2E Test Chat')
    await page.selectOption('[data-testid="model-selector"]', 'gpt-4')
    await page.click('[data-testid="create-chat-button"]')

    // Verify chat was created
    await expect(page.locator('[data-testid="chat-title"]')).toHaveText('E2E Test Chat')

    // Test sending message
    await page.fill('[data-testid="message-input"]', 'Hello from E2E test')
    await page.click('[data-testid="send-button"]')

    // Wait for streaming response
    await expect(page.locator('[data-testid="message-user"]')).toContainText('Hello from E2E test')
    await expect(page.locator('[data-testid="message-assistant"]')).toBeVisible({ timeout: 10000 })

    // Test chat history persistence
    await page.reload()
    await expect(page.locator('[data-testid="message-user"]')).toContainText('Hello from E2E test')
  })

  test('Model management workflow', async () => {
    // Navigate to models page
    await page.click('[data-testid="models-nav"]')

    // Test provider selection
    await page.selectOption('[data-testid="provider-selector"]', 'openai')
    await page.fill('[data-testid="api-key-input"]', 'test-api-key')
    await page.click('[data-testid="sync-models-button"]')

    // Verify models loaded
    await expect(page.locator('[data-testid="model-list"]')).toBeVisible()
    await expect(page.locator('[data-testid="model-item"]')).toHaveCount.greaterThan(0)

    // Test model selection
    await page.click('[data-testid="model-item"]:first-child [data-testid="model-checkbox"]')
    await expect(page.locator('[data-testid="selected-models-count"]')).toContainText('1')
  })
})
```

#### Paso 16.2: Performance Testing
```typescript
// src/infrastructure/__tests__/performance/architecture-performance.test.ts
import { performance } from 'perf_hooks'
import { DIContainer } from '../../config/DIContainer'
import { ChatApplicationService } from '../../../application/services/ChatApplicationService'

describe('Hexagonal Architecture Performance Tests', () => {
  let chatService: ChatApplicationService

  beforeAll(async () => {
    const container = DIContainer.initialize()
    chatService = container.resolve(ChatApplicationService)
  })

  test('Chat creation performance', async () => {
    const iterations = 100
    const start = performance.now()

    const promises = Array(iterations).fill(0).map((_, i) => 
      chatService.startNewChat('gpt-4', `Performance Test Chat ${i}`)
    )

    await Promise.all(promises)

    const end = performance.now()
    const averageTime = (end - start) / iterations

    expect(averageTime).toBeLessThan(50) // Less than 50ms per chat creation
  })

  test('Message streaming performance', async () => {
    const chat = await chatService.startNewChat('gpt-4', 'Performance Test')
    const start = performance.now()

    let chunkCount = 0
    const stream = chatService.streamMessage(chat.id, 'Generate a short response')

    for await (const chunk of stream) {
      chunkCount++
      if (chunk.type === 'complete') break
    }

    const end = performance.now()
    const totalTime = end - start

    expect(chunkCount).toBeGreaterThan(0)
    expect(totalTime).toBeLessThan(5000) // Less than 5 seconds for response
  })
})
```

### Checklist Fase 4
- [ ] Scripts de migración ejecutados exitosamente
- [ ] Proceso principal integrado con nuevo contenedor DI
- [ ] Renderer actualizado para usar nueva IPC API
- [ ] Tests E2E pasando con nueva arquitectura
- [ ] Benchmarks de performance ≥ versión actual
- [ ] Documentación actualizada (CLAUDE.md, README)

## Post-Migration Checklist Final

### Verificación de Arquitectura Hexagonal
- [ ] **Dominio Puro**: Zero imports externos en `domain/`
- [ ] **Inversión de Dependencias**: Todas las dependencias invertidas
- [ ] **Puertos Explícitos**: Toda comunicación externa via interfaces
- [ ] **Adaptadores Intercambiables**: Sin afectar dominio
- [ ] **Inyección de Dependencias**: Resolución automática

### Verificación de Calidad
- [ ] **Tests de Dominio**: >90% cobertura
- [ ] **Tests de Aplicación**: >80% cobertura
- [ ] **Tests de Infraestructura**: >70% cobertura
- [ ] **Zero Dependencias Circulares**: Validado con herramientas
- [ ] **Performance**: ≤5% degradación vs versión actual

### Verificación Funcional
- [ ] **Funcionalidad Idéntica**: Todas las features funcionan
- [ ] **Nuevos Providers**: Pueden añadirse en <4 horas
- [ ] **Modificar Casos de Uso**: <2 horas
- [ ] **Tests sin Infraestructura Real**: Domain tests aislados
- [ ] **Build y Lint**: 0 errores

## Comandos de Validación Final

```bash
# Ejecutar todos los tests
pnpm test

# Verificar tipos
pnpm typecheck

# Verificar lint
pnpm lint

# Tests E2E
pnpm test:e2e

# Build completo
pnpm build

# Verificar dependencias circulares
npx madge --circular --extensions ts src/

# Generar reporte de cobertura
pnpm test --coverage

# Performance benchmarks
pnpm test:performance
```

## Próximos Pasos Recomendados

1. **Monitorización**: Implementar métricas de performance post-migración
2. **Documentación**: Crear guías para desarrolladores sobre la nueva arquitectura
3. **Training**: Sesiones de formación del equipo sobre hexagonal architecture
4. **Extensiones**: Planificar próximas features usando la nueva arquitectura
5. **Optimización**: Identificar y optimizar puntos lentos si los hay

Esta guía te llevará paso a paso desde la arquitectura actual hacia una implementación completa de hexagonal architecture en Levante. Cada fase está diseñada para ser incremental y validable, permitiendo rollback en caso de problemas.