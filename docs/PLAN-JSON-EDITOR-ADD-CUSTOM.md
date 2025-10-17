# Plan: Reemplazar Cuestionario por Editor JSON en "Add Custom Integration"

## Análisis Actual

### Componente Afectado
- **`add-new-modal.tsx`**: Modal con formulario tradicional (campos individuales)
- **`store-layout.tsx`**: Invoca el modal desde línea 176-186 ("Add Custom Integration" card)

### Flujo Actual
1. Usuario hace clic en "Add Custom Integration"
2. Se abre `AddNewModal` con formulario paso a paso
3. Campos: Transport, Name, Command, Args, URL, Headers
4. Test Connection → Add Server

### Componente de Referencia
**`json-editor-panel.tsx`**: Ya implementa editor JSON con:
- Validación en tiempo real
- Preview del servidor a la derecha
- Test de conexión integrado
- Soporte completo para stdio/http/sse

## Cambios Propuestos

### 1. Modificar `store-layout.tsx`
**Líneas 176-186**: Cambiar el comportamiento del click

```typescript
// ANTES
onClick={() => setIsAddModalOpen(true)}

// DESPUÉS
onClick={() => setConfigServerId('new-custom-server')}
```

**Resultado**: Abre directamente el `JSONEditorPanel` en lugar del modal de formulario.

### 2. Adaptar `json-editor-panel.tsx`
**Líneas 28-30**: Manejar caso de servidor "nuevo custom"

```typescript
// Detectar si es un servidor completamente nuevo (no del registry)
const isCustomNewServer = serverId === 'new-custom-server';
```

**Líneas 32-66**: Inicialización mejorada

```typescript
useEffect(() => {
  if (isOpen && serverId) {
    if (isCustomNewServer) {
      // Mostrar template vacío para servidor custom
      setJsonText(JSON.stringify({
        type: 'stdio',
        command: 'npx',
        args: [],
        env: {}
      }, null, 2));
    }
    // ... resto del código existente
  }
}, [isOpen, serverId, server, registryEntry, connectionStatus]);
```

**Líneas 165-206**: Ajustar lógica de guardado

```typescript
const serverConfig: MCPServerConfig = {
  id: isCustomNewServer
    ? `custom-${Date.now()}` // Generar ID único
    : serverId,
  name: isCustomNewServer
    ? validation.data.name || `Custom Server ${Date.now()}` // Extraer del JSON
    : (registryEntry?.name || serverId),
  // ... resto de configuración
};
```

### 3. Validación JSON Mejorada
**Líneas 87-108**: Añadir campo `name` al JSON

```typescript
const validateJSON = (text: string) => {
  try {
    const parsed = JSON.parse(text);

    // Para servidores custom, requerir nombre
    if (isCustomNewServer && !parsed.name) {
      return { valid: false, error: 'Missing required field: name' };
    }

    // ... resto de validaciones existentes
  }
};
```

### 4. Eliminar `add-new-modal.tsx`
- Archivo ya no necesario
- Remover import en `store-layout.tsx` (línea 8)
- Remover state `isAddModalOpen` (línea 38)
- Remover renderizado del modal (líneas 253-257)

## Estructura JSON Final

```json
{
  "name": "My Custom Server",
  "type": "stdio",
  "command": "npx",
  "args": ["@modelcontextprotocol/server-filesystem", "/path"],
  "env": {
    "SOME_VAR": "value"
  }
}
```

Para HTTP/SSE:
```json
{
  "name": "Remote Server",
  "type": "http",
  "baseUrl": "http://localhost:3000",
  "headers": {
    "Authorization": "Bearer token"
  }
}
```

## Beneficios

1. **Consistencia**: Mismo flujo para configurar servidores del registry y custom
2. **Poder**: Editor JSON permite configuraciones complejas sin limitaciones de formulario
3. **Preview**: Visualización inmediata del resultado antes de guardar
4. **Menos código**: Elimina un componente completo (add-new-modal.tsx)
5. **Mejor UX**: Test de conexión y preview integrados en el mismo panel

## Archivos a Modificar

1. **`src/renderer/components/mcp/store-page/store-layout.tsx`**
   - Cambiar handler del click (línea ~179)
   - Remover import y estado de AddNewModal

2. **`src/renderer/components/mcp/config/json-editor-panel.tsx`**
   - Detectar caso `new-custom-server`
   - Ajustar inicialización del JSON
   - Extraer `name` del JSON para ID y título
   - Validar campo `name` en JSON

3. **`src/renderer/components/mcp/store-page/add-new-modal.tsx`**
   - **ELIMINAR ARCHIVO**

## Impacto
- **Baja complejidad**: Reutiliza componente existente
- **Sin cambios en backend**: Solo ajustes en UI
- **Backwards compatible**: No afecta servidores existentes
