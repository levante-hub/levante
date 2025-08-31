# Hexagonal Architecture Integration Guide

## 🎯 Current Status

**✅ Architecture Foundation: COMPLETE**
- Domain layer with entities, value objects, and ports ✅
- Application layer with service implementations ✅  
- Dependency injection container ✅
- All primary and secondary ports defined ✅

**❌ Integration: IN PROGRESS**
- TypeScript compilation errors need resolution
- Infrastructure adapters need implementation
- Service wiring needs completion

## 🚀 How to Complete the Integration

### Step 1: Fix Entity Constructors

The main issue is constructor mismatches. Choose one approach:

**Option A: Update Entity Constructors**
```typescript
// Current: Provider expects many parameters
constructor(id, name, type, isActive, isEnabled, ...)

// Better: Provider.create() factory method
Provider.create({
  name: string,
  type: ProviderType,
  apiKey?: ApiKey,
  // ... other options
})
```

**Option B: Update Service Usage**
```typescript
// Instead of:
const provider = Provider.create(config);

// Use:
const provider = new Provider(
  id, name, type.getValue(), false, true,
  config.baseUrl, config.apiKey?.getValue(), config.metadata
);
```

### Step 2: Fix Value Object Usage

Replace primitive types with value objects consistently:

```typescript
// ❌ Before:
async getProvider(providerId: string): Promise<Provider>

// ✅ After:  
async getProvider(providerId: ProviderId): Promise<Provider>

// Or update implementation to convert:
const result = await this.providerRepository.findById(ProviderId.create(providerId));
```

### Step 3: Handle RepositoryResult Types

Use the RepositoryUtils helper:

```typescript
// ❌ Before:
const providers = await this.providerRepository.findAll();

// ✅ After:
const result = await this.providerRepository.findAll();
const providers = RepositoryUtils.unwrapOrEmpty(result);
```

### Step 4: Create Infrastructure Adapters

Implement the secondary ports:

```typescript
// src/infrastructure/repositories/SQLiteProviderRepository.ts
export class SQLiteProviderRepository implements ProviderRepository {
  async findAll(): Promise<RepositoryResult<Provider[]>> {
    try {
      // SQLite query implementation
      const providers = await this.db.query('SELECT * FROM providers');
      return { success: true, data: providers.map(row => this.mapToProvider(row)) };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  }
  
  // ... other methods
}
```

### Step 5: Wire Services in Container

```typescript
// Update ServiceContainer constructor
constructor(config: ServiceContainerConfig) {
  this.config = config;
  
  // Create infrastructure adapters
  const providerRepo = new SQLiteProviderRepository(database);
  const modelRepo = new SQLiteModelRepository(database);
  
  // Create application services
  const aiProviderService = new AIProviderService(
    providerRepo, modelRepo, // ... adapters
  );
  
  this.services.set('AIProviderService', aiProviderService);
}
```

### Step 6: Use in UI Layer

```typescript
// In renderer components
import { getGlobalContainer } from '@/application/container';

const ChatPage = () => {
  const container = getGlobalContainer();
  const chatService = container.getChatConversationService();
  
  const handleSendMessage = async (message: string) => {
    const response = await chatService.sendMessage(message, {
      sessionId: currentSessionId,
      temperature: 0.7
    });
    
    // Handle response...
  };
  
  return <div>{/* UI components */}</div>;
};
```

## ⚡ Quick Start (Minimal Viable Integration)

For fastest integration, temporarily comment out complex services and focus on one:

1. **Comment out** services with errors in `ServiceContainer.ts`
2. **Keep only** `UserPreferencesService` (simplest)
3. **Create minimal** infrastructure adapter for settings
4. **Test integration** with one working service
5. **Gradually add** other services as issues are resolved

## 🎯 Priority Order

1. **UserPreferencesService** - Simplest, least dependencies
2. **ChatSessionService** - Core functionality, moderate complexity  
3. **AIProviderService** - Most complex, many dependencies
4. **ChatConversationService** - Most complex, depends on others

## 🔧 Development Workflow

1. Fix one service at a time
2. Create infrastructure adapter for it
3. Test in isolation
4. Wire into container  
5. Test integration
6. Move to next service

The hexagonal architecture foundation is excellent - these are just implementation details to complete the integration!