# Arquitectura MCP: Disabled Servers con Diccionario Separado

**Fecha:** 2025-10-12
**Estado:** Plan de Implementación
**Prioridad:** Alta - Solución al problema de activación/desactivación

---

## 🎯 Decisión Arquitectónica

**NO modificar el estándar MCP.json** añadiendo campos dentro de `mcpServers`.

**SOLUCIÓN:** Crear un nuevo diccionario `disabled` al mismo nivel que `mcpServers`:

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx @modelcontextprotocol/server-filesystem",
      "args": ["/Users/user/Documents"]
    },
    "github": {
      "type": "stdio",
      "command": "npx @modelcontextprotocol/server-github"
    }
  },
  "disabled": {
    "memory": {
      "type": "stdio",
      "command": "npx @modelcontextprotocol/server-memory"
    },
    "sqlite": {
      "type": "http",
      "baseUrl": "http://localhost:3000"
    }
  }
}
```

---

## ✅ Ventajas de Esta Arquitectura

1. **No rompe compatibilidad:** `mcpServers` mantiene su formato estándar
2. **Separación clara:** Activos vs Desactivados son colecciones distintas
3. **Fácil de razonar:** Un servidor está en uno u otro, nunca en ambos
4. **Compatible con otras herramientas:** Otras apps que lean `mcpServers` funcionarán
5. **Migración simple:** Mover un servidor = eliminar de un dict + añadir a otro
6. **Backward compatible:** Si falta `disabled`, se asume `{}`

---

## 🔄 Flujos de Estado

### Estados Posibles

| Estado | Ubicación en mcp.json | En activeServers | connectionStatus | Tools en Chat |
|--------|-----------------------|------------------|------------------|---------------|
| **No instalado** | Ninguna | ❌ No | N/A | ❌ No |
| **Instalado + Desactivado** | `disabled` | ✅ Sí | `disconnected` | ❌ No |
| **Instalado + Activado** | `mcpServers` | ✅ Sí | `connected` | ✅ Sí |

### Transiciones de Estado

```
┌─────────────┐
│    Store    │  (No instalado)
└──────┬──────┘
       │ Install
       ↓
┌─────────────────────────┐
│ disabled: { server }    │  (Instalado pero desactivado)
│ Switch: OFF             │
└──────┬──────────────┬───┘
       │ Switch ON    │ Uninstall
       ↓              ↓
┌─────────────────┐  ┌──────────────┐
│ mcpServers: {}  │  │ Eliminado de │
│ Switch: ON      │  │ ambos dicts  │
└──────┬──────────┘  └──────────────┘
       │ Switch OFF
       ↓
  (Vuelve a disabled)
```

---

## 📋 Plan de Implementación

### FASE 1: Actualizar Tipos y Estructuras

#### 1.1 Actualizar `MCPConfiguration`

**Archivo:** `src/main/types/mcp.ts`

```typescript
export interface MCPConfiguration {
  mcpServers: Record<string, Omit<MCPServerConfig, 'id'>>;
  disabled?: Record<string, Omit<MCPServerConfig, 'id'>>;  // ← NUEVO
}
```

**Compatibilidad:** El `?` hace que sea opcional, por lo que configs antiguas sin `disabled` seguirán funcionando.

---

### FASE 2: Actualizar mcpConfigManager

#### 2.1 Modificar `loadConfiguration()`

**Archivo:** `src/main/services/mcpConfigManager.ts:24-51`

```typescript
async loadConfiguration(): Promise<MCPConfiguration> {
  try {
    const content = await fs.readFile(this.configPath, 'utf-8');
    const config = JSON.parse(content);

    // Validar estructura
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      this.logger.mcp.warn("Invalid MCP configuration format, using empty config");
      return { mcpServers: {}, disabled: {} };
    }

    // ✅ NUEVO: Asegurar que disabled existe
    if (!config.disabled) {
      config.disabled = {};
    }

    return config;
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      // ✅ NUEVO: Incluir disabled en config vacía
      const emptyConfig = { mcpServers: {}, disabled: {} };
      await this.saveConfiguration(emptyConfig);
      return emptyConfig;
    }

    this.logger.mcp.error("Failed to load MCP configuration", { error });
    return { mcpServers: {}, disabled: {} };
  }
}
```

#### 2.2 Añadir `disableServer()`

**Archivo:** `src/main/services/mcpConfigManager.ts` (NUEVO MÉTODO)

```typescript
/**
 * Desactiva un servidor (mueve de mcpServers a disabled)
 */
async disableServer(serverId: string): Promise<void> {
  const currentConfig = await this.loadConfiguration();

  // Verificar que existe en mcpServers
  if (!currentConfig.mcpServers[serverId]) {
    throw new Error(`Server ${serverId} not found in mcpServers`);
  }

  // Mover de mcpServers a disabled
  const serverConfig = currentConfig.mcpServers[serverId];
  currentConfig.disabled = currentConfig.disabled || {};
  currentConfig.disabled[serverId] = serverConfig;
  delete currentConfig.mcpServers[serverId];

  await this.saveConfiguration(currentConfig);
  this.logger.mcp.info("Server disabled and moved to disabled section", { serverId });
}
```

#### 2.3 Añadir `enableServer()`

**Archivo:** `src/main/services/mcpConfigManager.ts` (NUEVO MÉTODO)

```typescript
/**
 * Activa un servidor (mueve de disabled a mcpServers)
 */
async enableServer(serverId: string): Promise<void> {
  const currentConfig = await this.loadConfiguration();

  // Verificar que existe en disabled
  if (!currentConfig.disabled || !currentConfig.disabled[serverId]) {
    throw new Error(`Server ${serverId} not found in disabled`);
  }

  // Mover de disabled a mcpServers
  const serverConfig = currentConfig.disabled[serverId];
  currentConfig.mcpServers[serverId] = serverConfig;
  delete currentConfig.disabled[serverId];

  await this.saveConfiguration(currentConfig);
  this.logger.mcp.info("Server enabled and moved to mcpServers", { serverId });
}
```

#### 2.4 Actualizar `listServers()` para Incluir Disabled

**Archivo:** `src/main/services/mcpConfigManager.ts:117-124`

**ANTES:**
```typescript
async listServers(): Promise<MCPServerConfig[]> {
  const config = await this.loadConfiguration();

  return Object.entries(config.mcpServers).map(([id, serverConfig]) => ({
    id,
    ...serverConfig
  }));
}
```

**DESPUÉS:**
```typescript
async listServers(): Promise<MCPServerConfig[]> {
  const config = await this.loadConfiguration();

  // ✅ Combinar mcpServers (activos) + disabled (desactivados)
  const activeServers = Object.entries(config.mcpServers).map(([id, serverConfig]) => ({
    id,
    ...serverConfig,
    enabled: true  // ← Indicador de estado
  }));

  const disabledServers = Object.entries(config.disabled || {}).map(([id, serverConfig]) => ({
    id,
    ...serverConfig,
    enabled: false  // ← Indicador de estado
  }));

  return [...activeServers, ...disabledServers];
}
```

**IMPORTANTE:** Añadimos `enabled` en el resultado para que el renderer sepa el estado, pero NO lo guardamos en el JSON (el estado viene de la ubicación en el diccionario).

#### 2.5 Actualizar `removeServer()` para Buscar en Ambos

**Archivo:** `src/main/services/mcpConfigManager.ts:80-87`

**ANTES:**
```typescript
async removeServer(serverId: string): Promise<void> {
  const currentConfig = await this.loadConfiguration();

  if (currentConfig.mcpServers[serverId]) {
    delete currentConfig.mcpServers[serverId];
    await this.saveConfiguration(currentConfig);
  }
}
```

**DESPUÉS:**
```typescript
async removeServer(serverId: string): Promise<void> {
  const currentConfig = await this.loadConfiguration();

  // ✅ Buscar y eliminar de ambos diccionarios
  let found = false;

  if (currentConfig.mcpServers[serverId]) {
    delete currentConfig.mcpServers[serverId];
    found = true;
  }

  if (currentConfig.disabled && currentConfig.disabled[serverId]) {
    delete currentConfig.disabled[serverId];
    found = true;
  }

  if (found) {
    await this.saveConfiguration(currentConfig);
    this.logger.mcp.info("Server removed from configuration", { serverId });
  } else {
    this.logger.mcp.warn("Server not found in configuration", { serverId });
  }
}
```

---

### FASE 3: Actualizar IPC Handlers

#### 3.1 Modificar `disconnect-server` Handler

**Archivo:** `src/main/ipc/mcpHandlers.ts:27-35`

**ANTES (problemático):**
```typescript
ipcMain.handle('levante/mcp/disconnect-server', async (_, serverId: string) => {
  await mcpService.disconnectServer(serverId);
  await configManager.removeServer(serverId);  // ← Borra completamente
  return { success: true };
});
```

**DESPUÉS (correcto):**
```typescript
ipcMain.handle('levante/mcp/disconnect-server', async (_, serverId: string) => {
  try {
    // Desconectar del servicio (runtime)
    await mcpService.disconnectServer(serverId);

    // ✅ Mover de mcpServers a disabled (persistencia)
    await configManager.disableServer(serverId);

    logger.mcp.info('Server disconnected and disabled', { serverId });
    return { success: true };
  } catch (error: any) {
    logger.mcp.error('Failed to disconnect server', { serverId, error: error.message });
    return { success: false, error: error.message };
  }
});
```

#### 3.2 Modificar `connect-server` Handler

**Archivo:** `src/main/ipc/mcpHandlers.ts:15-24`

**ANTES:**
```typescript
ipcMain.handle('levante/mcp/connect-server', async (_, config: MCPServerConfig) => {
  try {
    await mcpService.connectServer(config);
    await configManager.addServer(config);  // Añade si no existe
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
```

**DESPUÉS:**
```typescript
ipcMain.handle('levante/mcp/connect-server', async (_, config: MCPServerConfig) => {
  try {
    // Conectar en runtime
    await mcpService.connectServer(config);

    // ✅ Verificar si está en disabled, moverlo a mcpServers
    const currentConfig = await configManager.loadConfiguration();

    if (currentConfig.disabled && currentConfig.disabled[config.id]) {
      // Mover de disabled a mcpServers
      await configManager.enableServer(config.id);
      logger.mcp.info('Server enabled and moved to mcpServers', { serverId: config.id });
    } else if (!currentConfig.mcpServers[config.id]) {
      // No existe en ningún lado, añadir a mcpServers
      await configManager.addServer(config);
      logger.mcp.info('New server added to mcpServers', { serverId: config.id });
    }

    return { success: true };
  } catch (error: any) {
    logger.mcp.error('Failed to connect server', { serverId: config.id, error: error.message });
    return { success: false, error: error.message };
  }
});
```

#### 3.3 Añadir Handler `enable-server`

**Archivo:** `src/main/ipc/mcpHandlers.ts` (NUEVO HANDLER)

```typescript
ipcMain.handle('levante/mcp/enable-server', async (_, serverId: string) => {
  try {
    await configManager.enableServer(serverId);
    logger.mcp.info('Server enabled', { serverId });
    return { success: true };
  } catch (error: any) {
    logger.mcp.error('Failed to enable server', { serverId, error: error.message });
    return { success: false, error: error.message };
  }
});
```

#### 3.4 Añadir Handler `disable-server`

**Archivo:** `src/main/ipc/mcpHandlers.ts` (NUEVO HANDLER)

```typescript
ipcMain.handle('levante/mcp/disable-server', async (_, serverId: string) => {
  try {
    await configManager.disableServer(serverId);
    logger.mcp.info('Server disabled', { serverId });
    return { success: true };
  } catch (error: any) {
    logger.mcp.error('Failed to disable server', { serverId, error: error.message });
    return { success: false, error: error.message };
  }
});
```

#### 3.5 Actualizar `refresh-configuration`

**Archivo:** `src/main/ipc/mcpHandlers.ts:90-123`

**ANTES:**
```typescript
ipcMain.handle('levante/mcp/refresh-configuration', async () => {
  await mcpService.disconnectAll();
  const config = await configManager.loadConfiguration();

  // Reconecta TODOS los de mcpServers
  for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
    await mcpService.connectServer({ id: serverId, ...serverConfig });
  }
});
```

**DESPUÉS:**
```typescript
ipcMain.handle('levante/mcp/refresh-configuration', async () => {
  try {
    logger.mcp.info('Refreshing MCP configuration and reconnecting servers');

    // Disconnect all current servers
    await mcpService.disconnectAll();

    // Reload configuration from disk
    const config = await configManager.loadConfiguration();

    // ✅ SOLO reconectar servidores en mcpServers (NO los de disabled)
    const results: Record<string, { success: boolean; error?: string }> = {};

    for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        await mcpService.connectServer({
          id: serverId,
          ...serverConfig
        });
        results[serverId] = { success: true };
        logger.mcp.info('Successfully reconnected MCP server', { serverId });
      } catch (error: any) {
        results[serverId] = { success: false, error: error.message };
        logger.mcp.error('Failed to reconnect MCP server', { serverId, error: error.message });
      }
    }

    // ✅ Log servidores desactivados (para información)
    const disabledCount = Object.keys(config.disabled || {}).length;
    logger.mcp.info('MCP configuration refresh completed', {
      connectedCount: Object.keys(results).length,
      disabledCount
    });

    return { success: true, data: { serverResults: results, config } };
  } catch (error: any) {
    logger.mcp.error('MCP configuration refresh failed', { error: error.message });
    return { success: false, error: error.message };
  }
});
```

---

### FASE 4: Actualizar aiService (Tools)

#### 4.1 Modificar `getMCPTools()`

**Archivo:** `src/main/services/aiService.ts:521-589`

**ANTES:**
```typescript
private async getMCPTools(): Promise<Record<string, any>> {
  const config = await configManager.loadConfiguration();
  const allTools: Record<string, any> = {};

  // Itera sobre TODOS los servidores
  for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
    if (!mcpService.isConnected(serverId)) {
      await mcpService.connectServer({ id: serverId, ...serverConfig });
    }
    const serverTools = await mcpService.listTools(serverId);
    // ...
  }
}
```

**DESPUÉS:**
```typescript
private async getMCPTools(): Promise<Record<string, any>> {
  const config = await configManager.loadConfiguration();
  const allTools: Record<string, any> = {};

  // ✅ SOLO iterar sobre mcpServers (los activos)
  // Los servidores en "disabled" se IGNORAN completamente
  for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
    try {
      // Asegurar conexión
      if (!mcpService.isConnected(serverId)) {
        await mcpService.connectServer({ id: serverId, ...serverConfig });
      }

      // Get tools from this server
      const serverTools = await mcpService.listTools(serverId);

      // Convert MCP tools to AI SDK format
      for (const mcpTool of serverTools) {
        if (!mcpTool.name || mcpTool.name.trim() === "") {
          this.logger.aiSdk.error("Invalid tool name from server", { serverId, tool: mcpTool });
          continue;
        }

        const toolId = `${serverId}_${mcpTool.name}`;
        allTools[toolId] = this.createToolFromMCP(serverId, mcpTool);
      }
    } catch (error) {
      this.logger.aiSdk.error("Failed to get tools from server", {
        serverId,
        error: error instanceof Error ? error.message : error
      });
      // Continue con siguiente servidor en vez de fallar todo
    }
  }

  // ✅ Log información sobre servidores desactivados
  const disabledCount = Object.keys(config.disabled || {}).length;
  this.logger.aiSdk.debug('MCP tools loaded', {
    activeServers: Object.keys(config.mcpServers).length,
    disabledServers: disabledCount,
    toolCount: Object.keys(allTools).length
  });

  return allTools;
}
```

---

### FASE 5: Actualizar Frontend (Renderer)

#### 5.1 Actualizar Tipos en Renderer

**Archivo:** `src/renderer/types/mcp.ts`

```typescript
export interface MCPServerConfig {
  id: string;
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  baseUrl?: string;
  headers?: Record<string, string>;
  transport: 'stdio' | 'http' | 'sse';
  enabled?: boolean;  // ← Añadido en listServers(), no en JSON
}
```

**Nota:** `enabled` NO se guarda en el JSON, pero viene en las respuestas de `listServers()` para que la UI sepa el estado.

#### 5.2 Actualizar `mcpStore.disconnectServer`

**Archivo:** `src/renderer/stores/mcpStore.ts:135-158`

**ANTES:**
```typescript
disconnectServer: async (serverId: string) => {
  const result = await window.levante.mcp.disconnectServer(serverId);

  if (result.success) {
    set(state => ({
      activeServers: state.activeServers.filter(s => s.id !== serverId), // ← Elimina
      connectionStatus: { ...state.connectionStatus, [serverId]: 'disconnected' }
    }));
  }
}
```

**DESPUÉS:**
```typescript
disconnectServer: async (serverId: string) => {
  set({ isLoading: true, error: null });

  try {
    const result = await window.levante.mcp.disconnectServer(serverId);

    if (result.success) {
      set(state => ({
        // ✅ NO eliminar de activeServers, solo marcar como disabled
        activeServers: state.activeServers.map(server =>
          server.id === serverId
            ? { ...server, enabled: false }  // ← Marca como desactivado
            : server
        ),
        connectionStatus: {
          ...state.connectionStatus,
          [serverId]: 'disconnected'
        }
      }));
    } else {
      set({ error: result.error || 'Failed to disconnect from server' });
    }
  } catch (error) {
    console.error('Failed to disconnect server:', error);
    set({ error: 'Failed to disconnect from server' });
  } finally {
    set({ isLoading: false });
  }
}
```

#### 5.3 Actualizar `mcpStore.connectServer`

**Archivo:** `src/renderer/stores/mcpStore.ts:86-132`

**MODIFICAR para manejar el cambio de enabled:**

```typescript
connectServer: async (config: MCPServerConfig) => {
  set({ isLoading: true, error: null });

  try {
    // Update connection status to connecting
    set(state => ({
      connectionStatus: {
        ...state.connectionStatus,
        [config.id]: 'connecting'
      }
    }));

    const result = await window.levante.mcp.connectServer(config);

    if (result.success) {
      // ✅ Actualizar o añadir a activeServers con enabled=true
      set(state => {
        const existingIndex = state.activeServers.findIndex(s => s.id === config.id);

        if (existingIndex !== -1) {
          // Actualizar servidor existente
          const updatedServers = [...state.activeServers];
          updatedServers[existingIndex] = { ...config, enabled: true };

          return {
            activeServers: updatedServers,
            connectionStatus: {
              ...state.connectionStatus,
              [config.id]: 'connected'
            }
          };
        } else {
          // Añadir nuevo servidor
          return {
            activeServers: [...state.activeServers, { ...config, enabled: true }],
            connectionStatus: {
              ...state.connectionStatus,
              [config.id]: 'connected'
            }
          };
        }
      });
    } else {
      set(state => ({
        connectionStatus: {
          ...state.connectionStatus,
          [config.id]: 'error'
        },
        error: result.error || 'Failed to connect to server'
      }));
    }
  } catch (error) {
    console.error('Failed to connect server:', error);
    set(state => ({
      connectionStatus: {
        ...state.connectionStatus,
        [config.id]: 'error'
      },
      error: 'Failed to connect to server'
    }));
  } finally {
    set({ isLoading: false });
  }
}
```

#### 5.4 Actualizar Preload para Nuevos Handlers

**Archivo:** `src/preload/preload.ts`

**AÑADIR:**
```typescript
mcp: {
  // ... handlers existentes ...

  enableServer: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/enable-server', serverId),

  disableServer: (serverId: string) =>
    ipcRenderer.invoke('levante/mcp/disable-server', serverId),
}
```

---

### FASE 6: Actualizar UI Components

#### 6.1 Mostrar Estado en IntegrationCard

**Archivo:** `src/renderer/components/mcp/store-page/integration-card.tsx:88-98`

**MODIFICAR el badge en modo Active:**

```typescript
{/* Status indicator solo en modo Active */}
{mode === 'active' && (
  <div className="flex items-center justify-between">
    <ConnectionStatus
      serverId={server?.id || entry?.id || 'unknown'}
      status={status}
      size="sm"
      variant="indicator"
    />
    {/* ✅ NUEVO: Badge diferente según enabled */}
    <Badge variant={server?.enabled !== false ? 'default' : 'secondary'}>
      {server?.enabled !== false ? 'Active' : 'Disabled'}
    </Badge>
  </div>
)}
```

#### 6.2 Deshabilitar Switch para Servidores Disabled

**Archivo:** `src/renderer/components/mcp/store-page/integration-card.tsx:74-80`

```typescript
{/* Switch solo en modo Active */}
{mode === 'active' && (
  <Switch
    checked={status === 'connected'}
    disabled={status === 'connecting'}
    onCheckedChange={onToggle}
  />
)}
```

**Nota:** El Switch ya funciona correctamente porque:
- Switch ON → Llama `connectServer()` → Mueve de disabled a mcpServers
- Switch OFF → Llama `disconnectServer()` → Mueve de mcpServers a disabled

---

### FASE 7: Migración de Datos Existentes

#### 7.1 Script de Migración (Opcional)

**Archivo:** `src/main/services/mcpConfigManager.ts` (NUEVO MÉTODO)

```typescript
/**
 * Migra configuraciones antiguas que no tienen el campo disabled
 * Este método se puede llamar en el primer arranque después de la actualización
 */
async migrateConfiguration(): Promise<void> {
  const config = await this.loadConfiguration();

  // Si ya existe disabled, no necesita migración
  if (config.disabled !== undefined) {
    this.logger.mcp.info('Configuration already migrated');
    return;
  }

  // Crear disabled vacío
  config.disabled = {};

  await this.saveConfiguration(config);
  this.logger.mcp.info('Configuration migrated to include disabled section');
}
```

**Llamar en el arranque de la app:**

**Archivo:** `src/main/main.ts` (después de inicializar servicios)

```typescript
// Después de inicializar database y preferences
try {
  await configManager.migrateConfiguration();
  logger.core.info('MCP configuration migrated successfully');
} catch (error) {
  logger.core.error('Failed to migrate MCP configuration', {
    error: error instanceof Error ? error.message : error
  });
}
```

---

## 📊 Ejemplos de Flujo

### Ejemplo 1: Instalar desde Store

```typescript
// Usuario click "Install" en Store
handleInstall('filesystem') {
  const config = {
    id: 'filesystem',
    type: 'stdio',
    command: 'npx @modelcontextprotocol/server-filesystem',
    args: ['/Users/user/Documents']
  };

  // Se añade a mcpServers (NO conecta automáticamente)
  await addServer(config);

  // Resultado en mcp.json:
  {
    "mcpServers": {
      "filesystem": { ... }  // ← Añadido aquí
    },
    "disabled": {}
  }

  // En UI:
  // - Aparece en Active MCPs
  // - Switch OFF (no conectado aún)
  // - Badge "Disabled" o "Disconnected"
}
```

### Ejemplo 2: Activar Servidor (Switch ON)

```typescript
// Usuario activa Switch en Active MCPs
handleToggleServer('filesystem') {
  // Switch OFF → ON
  await connectServer(config);

  // Backend:
  // - mcpService.connectServer() → Conecta en runtime
  // - Si está en disabled → Lo mueve a mcpServers

  // Resultado en mcp.json (sin cambios, ya estaba en mcpServers):
  {
    "mcpServers": {
      "filesystem": { ... }
    }
  }

  // En UI:
  // - Switch ON
  // - Badge "Active" o "Connected"
  // - Tools disponibles en chat
}
```

### Ejemplo 3: Desactivar Servidor (Switch OFF)

```typescript
// Usuario desactiva Switch en Active MCPs
handleToggleServer('filesystem') {
  // Switch ON → OFF
  await disconnectServer('filesystem');

  // Backend:
  // - mcpService.disconnectServer() → Desconecta en runtime
  // - configManager.disableServer() → Mueve de mcpServers a disabled

  // Resultado en mcp.json:
  {
    "mcpServers": {},
    "disabled": {
      "filesystem": { ... }  // ← Movido aquí
    }
  }

  // En UI:
  // - Permanece en Active MCPs
  // - Switch OFF
  // - Badge "Disabled"
  // - Tools NO disponibles en chat
}
```

### Ejemplo 4: Desinstalar Servidor

```typescript
// Usuario click "Uninstall" en Active MCPs
handleUninstall('filesystem') {
  await removeServer('filesystem');

  // Backend:
  // - mcpService.disconnectServer() (si está conectado)
  // - configManager.removeServer() → Elimina de ambos dicts

  // Resultado en mcp.json:
  {
    "mcpServers": {},
    "disabled": {}  // ← Eliminado de ambos
  }

  // En UI:
  // - Desaparece de Active MCPs
  // - Vuelve al Store como "Available"
}
```

---

## 🎯 Comparación: Antes vs Después

### Estructura mcp.json

**ANTES (problemático):**
```json
{
  "mcpServers": {
    "filesystem": { ... },
    "github": { ... }
  }
}
```
- Switch OFF → Servidor BORRADO completamente
- No hay estado "instalado pero desactivado"

**DESPUÉS (correcto):**
```json
{
  "mcpServers": {
    "filesystem": { ... }
  },
  "disabled": {
    "github": { ... }
  }
}
```
- Switch OFF → Servidor MOVIDO a `disabled`
- Estado "instalado pero desactivado" existe
- Switch ON → Servidor MOVIDO a `mcpServers`

### Comportamiento de Tools

**ANTES:**
- `getMCPTools()` lee todos los servidores de `mcpServers`
- Si un servidor está ahí, se usa (no hay forma de desactivarlo)

**DESPUÉS:**
- `getMCPTools()` lee SOLO `mcpServers` (ignora `disabled`)
- Servidores en `disabled` NO aportan tools al chat
- Para usar un servidor desactivado → Switch ON → Se mueve a `mcpServers`

---

## ✅ Checklist de Implementación

### Backend (Main Process)
- [ ] Actualizar `MCPConfiguration` type para incluir `disabled`
- [ ] Modificar `mcpConfigManager.loadConfiguration()` para inicializar `disabled`
- [ ] Añadir `mcpConfigManager.disableServer()`
- [ ] Añadir `mcpConfigManager.enableServer()`
- [ ] Actualizar `mcpConfigManager.listServers()` para combinar ambos dicts
- [ ] Actualizar `mcpConfigManager.removeServer()` para buscar en ambos
- [ ] Modificar `mcpHandlers.disconnect-server` para usar `disableServer()`
- [ ] Modificar `mcpHandlers.connect-server` para usar `enableServer()`
- [ ] Añadir `mcpHandlers.enable-server`
- [ ] Añadir `mcpHandlers.disable-server`
- [ ] Actualizar `mcpHandlers.refresh-configuration` para ignorar `disabled`
- [ ] Modificar `aiService.getMCPTools()` para ignorar `disabled`
- [ ] Añadir script de migración `mcpConfigManager.migrateConfiguration()`

### Frontend (Renderer)
- [ ] Actualizar `MCPServerConfig` type para incluir `enabled` (solo en respuestas)
- [ ] Modificar `mcpStore.disconnectServer()` para marcar `enabled=false`
- [ ] Modificar `mcpStore.connectServer()` para marcar `enabled=true`
- [ ] Actualizar preload para exponer `enable-server` y `disable-server`
- [ ] Modificar `IntegrationCard` para mostrar badge según `enabled`
- [ ] Verificar que Switch funciona correctamente con nueva lógica

### Testing
- [ ] Verificar que switch OFF mueve servidor a `disabled`
- [ ] Verificar que switch ON mueve servidor a `mcpServers`
- [ ] Verificar que servidores en `disabled` NO aportan tools
- [ ] Verificar que refresh NO reconecta servidores en `disabled`
- [ ] Verificar que uninstall borra de ambos dicts
- [ ] Verificar migración de configs antiguas sin `disabled`

---

## 🔧 Consideraciones Adicionales

### Compatibilidad con Herramientas Externas

Otras herramientas que lean `mcp.json` (como Claude Desktop) seguirán funcionando porque:
1. Leerán `mcpServers` como siempre
2. Ignorarán `disabled` (campo desconocido)
3. Solo verán los servidores activos

### Persistencia de Configuración

Los servidores desactivados mantienen su configuración completa:
- Command
- Args
- Env variables
- Headers (si aplica)

Esto permite reactivarlos sin perder configuración.

### Performance

No hay impacto en performance:
- `getMCPTools()` itera sobre menos servidores (solo activos)
- Los desactivados no intentan conectar
- Menos conexiones = Menor overhead

---

## 📝 Notas Finales

**Ventaja principal:** Mantener compatibilidad con el estándar MCP mientras añadimos funcionalidad de activación/desactivación.

**Decisión arquitectónica clave:** Usar ubicación en el diccionario (mcpServers vs disabled) como fuente de verdad del estado, en vez de añadir un campo `enabled` dentro de cada servidor.

**Backward compatibility:** Configuraciones antiguas sin `disabled` se migran automáticamente añadiendo `disabled: {}` vacío.
