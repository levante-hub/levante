# Guía de Migración a Arquitectura Hexagonal - Chat y Mensajes

## 📋 Análisis del Estado Actual

### Estructura Actual en src/main/
```
src/main/
├── main.ts                    # Entry point con IPC handlers básicos para chat
├── services/
│   ├── chatService.ts         # CRUD operations para chat/messages 
│   ├── aiService.ts          # AI provider integration
│   └── databaseService.ts    # SQLite connection layer
└── ipc/
    └── databaseHandlers.ts   # IPC handlers para DB operations
```

### IPC Handlers Actuales
- `levante/chat/stream` - Streaming chat responses
- `levante/chat/send` - Single message requests  
- `levante/db/sessions/*` - Chat session CRUD
- `levante/db/messages/*` - Message operations

### Servicios Clave Identificados
1. **ChatService** - Repository pattern actual para chat/messages
2. **AIService** - Integración con providers AI
3. **DatabaseService** - Capa de conexión SQLite

## 🎯 Plan de Migración

### Fase 1: Implementar Adapters Secundarios

#### 1.1 Chat Session Repository Adapter
```typescript
// src/infrastructure/adapters/secondary/ChatSessionRepositoryImpl.ts
import { ChatSessionRepository } from '../../../domain/ports/secondary/ChatSessionRepository';
import { chatService } from '../../services/chatService';

export class ChatSessionRepositoryImpl implements ChatSessionRepository {
  async save(session: ChatSession): Promise<RepositoryResult<ChatSession>> {
    const input = {
      title: session.getTitle(),
      model: session.getModelId(),
      folder_id: session.getFolderId()
    };
    
    const result = await chatService.createSession(input);
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    
    return { 
      success: true, 
      data: ChatSession.fromDatabase(result.data) 
    };
  }

  async findById(id: string): Promise<RepositoryResult<ChatSession | null>> {
    const result = await chatService.getSession(id);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    return {
      success: true,
      data: result.data ? ChatSession.fromDatabase(result.data) : null
    };
  }

  async findAll(): Promise<RepositoryResult<ChatSession[]>> {
    const result = await chatService.getSessions();
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    const sessions = result.data.items.map(ChatSession.fromDatabase);
    return { success: true, data: sessions };
  }

  async update(session: ChatSession): Promise<RepositoryResult<ChatSession>> {
    const input = {
      id: session.getId(),
      title: session.getTitle(),
      updated_at: Date.now()
    };
    
    const result = await chatService.updateSession(input);
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    
    return { 
      success: true, 
      data: ChatSession.fromDatabase(result.data) 
    };
  }

  async delete(id: string): Promise<RepositoryResult<boolean>> {
    const result = await chatService.deleteSession(id);
    return { 
      success: result.success, 
      data: result.data,
      error: result.error 
    };
  }
}
```

#### 1.2 Message Repository Adapter
```typescript
// src/infrastructure/adapters/secondary/MessageRepositoryImpl.ts
export class MessageRepositoryImpl implements MessageRepository {
  async save(message: Message): Promise<RepositoryResult<Message>> {
    const input = {
      session_id: message.getSessionId(),
      role: message.getRole(),
      content: message.getContent(),
      tool_calls: message.getToolCalls()
    };
    
    const result = await chatService.createMessage(input);
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    
    return {
      success: true,
      data: Message.fromDatabase(result.data)
    };
  }

  async findBySessionId(sessionId: string, options?: any): Promise<RepositoryResult<Message[]>> {
    const query = {
      session_id: sessionId,
      limit: options?.limit || 100,
      offset: options?.offset || 0
    };
    
    const result = await chatService.getMessages(query);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    const messages = result.data.items.map(Message.fromDatabase);
    return { success: true, data: messages };
  }

  async searchInSession(sessionId: string, query: string): Promise<RepositoryResult<Message[]>> {
    const result = await chatService.searchMessages(query, sessionId);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    const messages = result.data.map(Message.fromDatabase);
    return { success: true, data: messages };
  }

  async deleteBySessionId(sessionId: string): Promise<RepositoryResult<boolean>> {
    // ChatService no tiene este método, implementar si es necesario
    return { success: true, data: true };
  }
}
```

#### 1.3 AI Provider Adapters
```typescript
// src/infrastructure/adapters/secondary/OpenRouterAdapterImpl.ts
export class OpenRouterAdapterImpl implements OpenRouterAdapter {
  constructor(private aiService: AIService) {}

  async sendMessage(request: AIRequest): Promise<AIResponse> {
    try {
      const chatRequest = this.mapToAIServiceRequest(request);
      const result = await this.aiService.sendSingleMessage(chatRequest);
      
      return {
        content: result.content || '',
        usage: result.usage
      };
    } catch (error) {
      throw new Error(`OpenRouter error: ${error}`);
    }
  }

  async *streamMessage(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    try {
      const chatRequest = this.mapToAIServiceRequest(request);
      
      for await (const chunk of this.aiService.streamChat(chatRequest)) {
        yield {
          content: chunk.delta || '',
          done: chunk.done,
          error: chunk.error
        };
      }
    } catch (error) {
      yield {
        content: '',
        done: true,
        error: error instanceof Error ? error.message : 'Stream error'
      };
    }
  }

  async listModels(): Promise<Model[]> {
    // Implementar si es necesario obtener modelos desde aiService
    return [];
  }

  private mapToAIServiceRequest(request: AIRequest): any {
    return {
      messages: request.messages,
      model: request.modelId,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      stream: request.stream
    };
  }
}
```

### Fase 2: Dependency Injection Container

#### 2.1 Crear Container Simple
```typescript
// src/infrastructure/di/Container.ts
export class Container {
  private static instance: Container;
  private dependencies = new Map<string, any>();

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  register<T>(key: string, factory: () => T): void {
    this.dependencies.set(key, factory);
  }

  resolve<T>(key: string): T {
    const factory = this.dependencies.get(key);
    if (!factory) {
      throw new Error(`Dependency not found: ${key}`);
    }
    return factory();
  }
}
```

#### 2.2 Configurar Dependencies
```typescript
// src/infrastructure/di/setup.ts
import { Container } from './Container';
import { chatService } from '../services/chatService';
import { aiService } from '../services/aiService';
import { ChatSessionRepositoryImpl } from '../adapters/secondary/ChatSessionRepositoryImpl';
import { MessageRepositoryImpl } from '../adapters/secondary/MessageRepositoryImpl';
import { OpenRouterAdapterImpl } from '../adapters/secondary/OpenRouterAdapterImpl';

export function setupDependencies(): void {
  const container = Container.getInstance();

  // Secondary Ports (Adapters)
  container.register('ChatSessionRepository', () => 
    new ChatSessionRepositoryImpl()
  );
  
  container.register('MessageRepository', () => 
    new MessageRepositoryImpl()
  );

  container.register('OpenRouterAdapter', () =>
    new OpenRouterAdapterImpl(aiService)
  );

  // Use Cases
  container.register('CreateConversationUseCase', () =>
    new CreateConversationUseCase(container.resolve('ChatSessionRepository'))
  );

  container.register('SendMessageUseCase', () =>
    new SendMessageUseCase(
      container.resolve('MessageRepository'),
      container.resolve('ChatSessionRepository'),
      container.resolve('OpenRouterAdapter')
    )
  );

  container.register('LoadConversationUseCase', () =>
    new LoadConversationUseCase(
      container.resolve('ChatSessionRepository'),
      container.resolve('MessageRepository')
    )
  );

  // Primary Port (Compositor)
  container.register('ChatConversationUseCase', () =>
    new ChatConversationUseCase(
      container.resolve('SendMessageUseCase'),
      container.resolve('LoadConversationUseCase'),
      container.resolve('CreateConversationUseCase')
    )
  );
}
```

### Fase 3: Nuevos IPC Handlers Hexagonales

#### 3.1 Crear Handlers Hexagonales
```typescript
// src/main/ipc/hexagonalChatHandlers.ts
import { ipcMain } from 'electron';
import { Container } from '../../infrastructure/di/Container';
import { ChatConversationPort } from '../../domain/ports/primary/ChatConversationPort';

export function setupHexagonalChatHandlers(): void {
  const container = Container.getInstance();
  const chatUseCase = container.resolve<ChatConversationPort>('ChatConversationUseCase');

  // Streaming chat con arquitectura hexagonal
  ipcMain.handle('levante/hexagonal/chat/stream', async (event, message: string, options: any) => {
    const streamId = `hexagonal_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    setTimeout(async () => {
      try {
        for await (const chunk of chatUseCase.streamMessage(message, options)) {
          event.sender.send(`levante/hexagonal/chat/stream/${streamId}`, chunk);
          await new Promise(resolve => setImmediate(resolve));
        }
      } catch (error) {
        event.sender.send(`levante/hexagonal/chat/stream/${streamId}`, {
          error: error instanceof Error ? error.message : 'Stream error',
          done: true
        });
      }
    }, 10);

    return { streamId };
  });

  // Send message con arquitectura hexagonal  
  ipcMain.handle('levante/hexagonal/chat/send', async (_, message: string, options: any) => {
    try {
      const result = await chatUseCase.sendMessage(message, options);
      return { success: true, ...result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Create conversation
  ipcMain.handle('levante/hexagonal/conversation/create', async (_, title?: string, modelId?: string) => {
    try {
      const session = await chatUseCase.createNewConversation(title, modelId);
      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Load conversation
  ipcMain.handle('levante/hexagonal/conversation/load', async (_, sessionId: string, options?: any) => {
    try {
      const conversation = await chatUseCase.loadConversation(sessionId, options);
      return { success: true, data: conversation };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  console.log('Hexagonal chat IPC handlers registered');
}
```

### Fase 4: Actualizar main.ts

#### 4.1 Integrar Setup Hexagonal
```typescript
// src/main/main.ts - añadir estas líneas

import { setupDependencies } from '../infrastructure/di/setup';
import { setupHexagonalChatHandlers } from './ipc/hexagonalChatHandlers';

// En app.whenReady()
app.whenReady().then(async () => {
  // ... código existente ...

  // Setup hexagonal architecture
  setupDependencies();
  
  // Setup IPC handlers (mantener los existentes + hexagonales)
  setupDatabaseHandlers();
  setupPreferencesHandlers(); 
  setupModelHandlers();
  setupHexagonalChatHandlers(); // 🆕 NUEVO

  createWindow();
  // ... resto del código ...
});
```

## 🔄 Estrategia de Migración Incremental

### Opción A: Dual Mode (Recomendado)
1. **Mantener handlers actuales** para compatibilidad
2. **Agregar handlers hexagonales** con prefijo `levante/hexagonal/`
3. **Migrar frontend** gradualmente para usar nuevos handlers
4. **Remover handlers antiguos** cuando migración esté completa


// En IPC handlers
if (FEATURE_FLAGS.HEXAGONAL_CHAT) {
  setupHexagonalChatHandlers();
}
```

## 📝 Domain Entity Mapping

### ChatSession Entity Mapping
```typescript
// src/domain/entities/ChatSession.ts - añadir método
static fromDatabase(dbData: any): ChatSession {
  return new ChatSession(
    dbData.id,
    dbData.title,
    dbData.model,
    dbData.folder_id,
    new Date(dbData.created_at),
    new Date(dbData.updated_at)
  );
}

toDatabase() {
  return {
    id: this.id,
    title: this._title,
    model: this.modelId,
    folder_id: this.folderId,
    created_at: this.createdAt.getTime(),
    updated_at: this.updatedAt.getTime()
  };
}
```

### Message Entity Mapping  
```typescript
// src/domain/entities/Message.ts - añadir método
static fromDatabase(dbData: any): Message {
  return new Message(
    dbData.id,
    dbData.session_id,
    dbData.role,
    dbData.content,
    dbData.tool_calls ? JSON.parse(dbData.tool_calls) : undefined,
    new Date(dbData.created_at)
  );
}

toDatabase() {
  return {
    id: this.id,
    session_id: this.sessionId,
    role: this.role,
    content: this.content,
    tool_calls: this.toolCalls ? JSON.stringify(this.toolCalls) : null,
    created_at: this.createdAt.getTime()
  };
}
```

## 🧪 Testing Strategy

### Unit Tests
```typescript
// tests/unit/use-cases/SendMessageUseCase.test.ts
describe('SendMessageUseCase', () => {
  it('should save message and return response', async () => {
    // Mock repositories y adapters
    const mockMessageRepo = jest.fn();
    const mockChatRepo = jest.fn();
    const mockAIAdapter = jest.fn();
    
    const useCase = new SendMessageUseCase(mockMessageRepo, mockChatRepo, mockAIAdapter);
    
    // Test use case logic
    const result = await useCase.execute('test message', { sessionId: 'test-id' });
    expect(result).toBeDefined();
  });
});
```

### Integration Tests
```typescript
// tests/integration/chat-flow.test.ts  
describe('Chat Flow Integration', () => {
  it('should create conversation and send message', async () => {
    // Setup container con mocks
    const container = Container.getInstance();
    const chatUseCase = container.resolve('ChatConversationUseCase');
    
    // Test full hexagonal flow
    const conversation = await chatUseCase.createNewConversation('Test Chat');
    expect(conversation.getTitle()).toBe('Test Chat');
    
    const response = await chatUseCase.sendMessage('Hello', { sessionId: conversation.getId() });
    expect(response.content).toBeDefined();
  });
});
```

## ⚡ Pasos de Implementación

1. **Crear adapters secundarios** (1-2 días)
   - Implementar ChatSessionRepositoryImpl
   - Implementar MessageRepositoryImpl  
   - Implementar OpenRouterAdapterImpl

2. **Configurar dependency injection** (1 día)
   - Container simple
   - Setup de dependencias
   - Registro de use cases

3. **Implementar nuevos IPC handlers** (1 día)
   - Handlers hexagonales paralelos
   - Mantener compatibilidad con existentes

4. **Integrar en main.ts** (0.5 días)
   - Setup de dependencias
   - Registro de handlers hexagonales

5. **Testing básico** (0.5 días)
   - Unit tests para use cases
   - Integration test básico

6. **Migración gradual del frontend** (2-3 días)
   - Actualizar stores de Zustand
   - Cambiar IPC calls progresivamente

## 🎯 Beneficios Esperados

- ✅ **Testabilidad**: Use cases aislados y mockeables
- ✅ **Mantenibilidad**: Lógica de negocio separada  
- ✅ **Flexibilidad**: Fácil cambio de providers AI
- ✅ **Escalabilidad**: Base sólida para nuevas features
- ✅ **Compatibilidad**: Migración sin breaking changes

## 📋 Checklist de Migración

### Fase 1: Adapters
- [ ] ChatSessionRepositoryImpl implementado
- [ ] MessageRepositoryImpl implementado
- [ ] OpenRouterAdapterImpl implementado
- [ ] Mapping methods en entidades

### Fase 2: DI Container  
- [ ] Container básico creado
- [ ] Setup de dependencias configurado
- [ ] Use cases registrados correctamente

### Fase 3: IPC Handlers
- [ ] Handlers hexagonales implementados
- [ ] Compatibilidad con handlers existentes
- [ ] Streaming funcional

### Fase 4: Integration
- [ ] main.ts actualizado
- [ ] Tests básicos pasando
- [ ] No breaking changes

### Fase 5: Frontend Migration
- [ ] Stores actualizados
- [ ] IPC calls migradas
- [ ] UI funcional con nueva arquitectura

Este plan se enfoca específicamente en migrar chat y mensajes usando la arquitectura hexagonal ya creada, manteniendo compatibilidad y permitiendo una transición gradual.