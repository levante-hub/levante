# Simplificación de Puertos Secundarios - Hexagonal Architecture

## 🎯 Objetivo
Eliminar Value Objects innecesarios que over-engineerizan la arquitectura y usar tipos primitivos simples donde corresponde.

## ❌ Value Objects a ELIMINAR
- `ChatId` → usar `string`
- `MessageId` → usar `string` 
- `ModelId` → usar `string`
- `ProviderId` → usar `string`
- `FolderId` → usar `string`
- `MCPServerId` → usar `string`
- `MCPToolId` → usar `string`
- `SettingKey` → usar `string`
- `SettingType` → usar `'string' | 'number' | 'boolean' | 'json'`

## ✅ Value Objects a MANTENER
- `ApiKey` → tiene lógica de enmascaramiento y validación
- `Timestamp` → tiene lógica de formateo y comparación

## 🔧 Cambios por hacer en cada archivo:

### 1. Eliminar imports innecesarios
```typescript
// ANTES:
import { ModelId } from '../../value-objects/ModelId';
import { ChatId } from '../../value-objects/ChatId';

// DESPUÉS:
// (eliminar estas líneas)
```

### 2. Reemplazar tipos en interfaces
```typescript
// ANTES:
findById(id: ChatId): Promise<Result<Chat>>
updateModel(modelId: ModelId): Promise<void>

// DESPUÉS:  
findById(id: string): Promise<Result<Chat>>
updateModel(modelId: string): Promise<void>
```

### 3. Mantener solo imports necesarios
```typescript
// MANTENER:
import { ApiKey } from '../../value-objects/ApiKey';
import { Timestamp } from '../../value-objects/Timestamp';
```

## 📋 Proceso:
1. Abrir archivo de puerto secundario
2. Eliminar imports de VO innecesarios
3. Reemplazar tipos VO por tipos primitivos
4. Mantener solo ApiKey y Timestamp si se usan
5. Verificar que no queden errores de TypeScript
6. Continuar con el siguiente archivo

## 🎯 Resultado esperado:
Interfaces más simples, menos verbosas, sin over-engineering, manteniendo solo la complejidad necesaria para el dominio.