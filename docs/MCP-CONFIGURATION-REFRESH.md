# Documentación: Configuración de MCP en Settings

## ¿Qué es la sección "🔧 MCP Configuration"?

La sección **MCP Configuration** en la página de Settings (Ajustes) permite gestionar la configuración de los servidores MCP (Model Context Protocol) de forma centralizada. Esta sección proporciona herramientas para recargar la configuración desde el archivo `mcp.json` y visualizar el estado de salud de cada servidor conectado.

## Archivo de Configuración

**Ubicación**: `~/levante/mcp.json`

Este archivo contiene dos diccionarios principales:

```json
{
  "mcpServers": {
    // Servidores activos que se conectan automáticamente
    "context7": { ... },
    "sequential-thinking": { ... }
  },
  "disabled": {
    // Servidores instalados pero desactivados temporalmente
    "time": { ... }
  }
}
```

### Arquitectura de Estados

Los servidores MCP pueden existir en dos estados:

1. **Activos** (`mcpServers`): Servidores que se conectan automáticamente al iniciar la aplicación y cuyas herramientas están disponibles para el LLM durante el chat.

2. **Desactivados** (`disabled`): Servidores instalados pero temporalmente desactivados. No se conectan automáticamente y sus herramientas NO están disponibles para el LLM.

## Funcionalidad "Refresh Configuration"

### ¿Qué hace el botón "Refresh Configuration"?

El botón **"Refresh Configuration"** ejecuta el siguiente proceso:

1. **Desconecta todos los servidores activos** que estén actualmente en memoria
2. **Recarga el archivo `mcp.json`** desde el disco, detectando cualquier cambio manual que hayas hecho
3. **Reconecta SOLO los servidores** que estén en el diccionario `mcpServers` (servidores activos)
4. **Ignora completamente** los servidores que estén en el diccionario `disabled`
5. **Muestra los resultados** de conexión de cada servidor con indicadores de salud

### Flujo Técnico

```
Usuario hace clic en "Refresh Configuration"
    ↓
Settings Page: handleRefreshMCP()
    ↓
IPC: levante/mcp/refresh-configuration
    ↓
Main Process: mcpHandlers.ts
    ↓
1. mcpService.disconnectAll() → Desconecta todos los servidores
    ↓
2. configManager.loadConfiguration() → Lee ~/levante/mcp.json
    ↓
3. Para cada servidor en config.mcpServers:
   - mcpService.connectServer(serverConfig)
   - Registra resultado (success/error)
    ↓
4. Retorna resultados a UI
    ↓
Settings Page: Muestra resultados + recarga health data
```

### Código Relevante

**Backend** (`src/main/ipc/mcpHandlers.ts:109-144`):
```typescript
ipcMain.handle('levante/mcp/refresh-configuration', async () => {
  // Disconnect all current servers
  await mcpService.disconnectAll();

  // Reload configuration from disk
  const config = await configManager.loadConfiguration();

  // ONLY reconnect servers in mcpServers (NOT disabled)
  const results: Record<string, { success: boolean; error?: string }> = {};

  for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
    try {
      await mcpService.connectServer({ id: serverId, ...serverConfig });
      results[serverId] = { success: true };
    } catch (error) {
      results[serverId] = { success: false, error: error.message };
    }
  }

  return { success: true, data: { serverResults: results } };
});
```

**Frontend** (`src/renderer/pages/SettingsPage.tsx:36-73`):
```typescript
const handleRefreshMCP = async () => {
  setMcpStatus({ loading: true });

  try {
    const result = await window.levante.mcp.refreshConfiguration();

    if (result.success) {
      setMcpStatus({
        loading: false,
        success: true,
        message: 'MCP configuration refreshed successfully',
        serverResults: result.data?.serverResults
      });
    } else {
      setMcpStatus({
        loading: false,
        success: false,
        message: result.error || 'Failed to refresh MCP configuration'
      });
    }
  } catch (error) {
    // Handle error
  }

  // Reload health data after MCP refresh
  await loadHealthData();

  // Clear status after 5 seconds
  setTimeout(() => setMcpStatus({ loading: false }), 5000);
};
```

## Visualización de Resultados

### Server Connection Results

Después de hacer refresh, la UI muestra una cuadrícula con el estado de cada servidor:

#### Tarjetas de Estado por Color

- **Verde** (`bg-green-50 border-green-200`): Servidor conectado correctamente y saludable
- **Amarillo** (`bg-yellow-50 border-yellow-200`): Servidor conectado pero con problemas de salud (errores recurrentes)
- **Rojo** (`bg-red-50 border-red-200`): Servidor que falló al conectar

#### Iconos de Estado

- **✓ CheckCircle (verde)**: Conexión exitosa y servidor saludable
- **⚠ AlertCircle (amarillo)**: Conexión exitosa pero servidor unhealthy
- **✗ XCircle (rojo)**: Error de conexión

#### Indicadores de Salud

Cada tarjeta de servidor muestra:

```
[Icono] server-id                    [Estado]
Error message (si hay)
X success, Y errors
```

Ejemplo:
```
✓ context7                           ✓
24 success, 0 errors

⚠ filesystem                         ⚠ (3 errors)
Connection timeout
18 success, 3 errors

✗ database
Failed to spawn process
0 success, 5 errors
```

### Ordenamiento de Servidores

Los servidores se ordenan automáticamente según esta prioridad (`SettingsPage.tsx:138-162`):

1. **Conexión exitosa primero**, luego conexiones fallidas
2. Dentro de exitosos: **Healthy primero**, luego unhealthy, luego unknown
3. Dentro de cada categoría: **Menos errores consecutivos primero**
4. Fallback: **Orden alfabético**

### Health Status Monitoring

El sistema de salud (`src/main/services/mcpHealthMonitor.ts`) rastrea:

```typescript
{
  status: 'healthy' | 'unhealthy' | 'unknown',
  errorCount: number,           // Total de errores históricos
  successCount: number,         // Total de operaciones exitosas
  consecutiveErrors: number     // Errores consecutivos actuales
}
```

**Criterios de Health**:
- **healthy**: `consecutiveErrors < 3`
- **unhealthy**: `consecutiveErrors >= 3`
- **unknown**: Servidor recién conectado sin historial

## Casos de Uso

### 1. Editar manualmente `mcp.json`

**Escenario**: Has editado el archivo `~/levante/mcp.json` manualmente para agregar un nuevo servidor o cambiar parámetros de un servidor existente.

**Acción**:
1. Guarda los cambios en `mcp.json`
2. Ve a Settings → MCP Configuration
3. Haz clic en "Refresh Configuration"
4. Verifica que el nuevo servidor aparece en los resultados o que los cambios se aplicaron

**Resultado**: La aplicación recarga la configuración sin necesidad de reiniciar.

### 2. Reactivar servidor después de errores

**Escenario**: Un servidor MCP está marcado como "unhealthy" (⚠) debido a errores recurrentes y quieres intentar reconectarlo.

**Acción**:
1. Ve a Settings → MCP Configuration
2. Haz clic en "Refresh Configuration"
3. El servidor se desconecta y vuelve a conectar desde cero

**Resultado**: El contador de errores consecutivos se resetea y el servidor tiene una oportunidad limpia de reconectar.

### 3. Verificar estado de servidores activos

**Escenario**: Quieres ver qué servidores están actualmente conectados y su estado de salud.

**Acción**:
1. Ve a Settings → MCP Configuration
2. Los resultados muestran todos los servidores en `mcpServers` con su estado actual

**Resultado**: Vista consolidada del estado de salud de todos los servidores activos.

### 4. Aplicar cambios después de desactivar un servidor

**Escenario**: Has desactivado un servidor desde la sección "Active MCPs" (usando el switch OFF) y quieres confirmar que ya no se conecta.

**Acción**:
1. Ve a Active MCPs y desactiva un servidor (switch OFF)
2. El servidor se mueve de `mcpServers` a `disabled` en mcp.json
3. Ve a Settings → MCP Configuration
4. Haz clic en "Refresh Configuration"

**Resultado**: El servidor desactivado NO aparece en los resultados de conexión porque está en el diccionario `disabled`.

## Relación con otras secciones

### Active MCPs (Chat Sidebar)

- **Switch ON**: Mueve servidor de `disabled` → `mcpServers` y lo conecta
- **Switch OFF**: Mueve servidor de `mcpServers` → `disabled` y lo desconecta
- **Estado visual**: Badge muestra "Active" (verde) o "Disabled" (gris)

### Store (MCP Store)

- **Install**: Agrega servidor a `mcpServers` (activo por defecto)
- **Already Installed**: Servidor ya existe en `mcpServers` o `disabled`
- **Uninstall**: NO IMPLEMENTADO (botón remove server fue eliminado)

### Chat con LLM

- Solo los servidores en `mcpServers` contribuyen herramientas al LLM
- Servidores en `disabled` son ignorados completamente por `aiService.getMCPTools()`
- Refresh Configuration actualiza las herramientas disponibles sin reiniciar el chat

## Diferencias vs Reiniciar la Aplicación

| Acción | Refresh Configuration | Reiniciar App |
|--------|----------------------|---------------|
| Recarga `mcp.json` | ✓ | ✓ |
| Desconecta servidores actuales | ✓ | ✓ |
| Reconecta servidores activos | ✓ | ✓ |
| Preserva sesiones de chat | ✓ | ✗ |
| Preserva estado de UI | ✓ | ✗ |
| Ejecuta migración de config | ✗ | ✓ |
| Tiempo de ejecución | ~2-5 segundos | ~5-10 segundos |

## Logs de Debugging

Para ver logs relacionados con el refresh de configuración, habilita en `.env.local`:

```bash
DEBUG_ENABLED=true
DEBUG_MCP=true
LOG_LEVEL=debug
```

**Logs esperados durante refresh**:

```
[MCP] info: Refreshing MCP configuration and reconnecting servers
[MCP] debug: Disconnecting all MCP servers
[MCP] debug: Connecting to MCP server: context7
[MCP] debug: Server context7 connected successfully
[MCP] info: MCP configuration refreshed successfully
[MCP] debug: Active servers: 3, Disabled servers: 1
```

## Limitaciones y Consideraciones

1. **No agrega nuevos servidores automáticamente**: Refresh solo reconecta servidores que YA EXISTEN en `mcpServers`. Para agregar nuevos servidores, debes:
   - Editarlos manualmente en `mcp.json`, O
   - Instalarlos desde el Store

2. **No modifica el archivo `mcp.json`**: Refresh es una operación de LECTURA + RECONEXIÓN. No modifica el archivo de configuración.

3. **Timeout de conexión**: Si un servidor tarda mucho en responder, puede marcar como error y mostrar "Connection timeout".

4. **Health data asíncrono**: Los datos de salud se cargan después del refresh, por lo que puede haber un breve delay antes de ver los indicadores de salud actualizados.

5. **Servidores disabled son ignorados**: Aunque estén en el archivo `mcp.json`, los servidores en el diccionario `disabled` NO se reconectan durante el refresh.

## Resumen

La funcionalidad **Refresh Configuration** es una herramienta de desarrollo y mantenimiento que permite:

- ✅ Recargar cambios manuales en `mcp.json` sin reiniciar
- ✅ Reconectar servidores que han fallado
- ✅ Verificar el estado de salud de todos los servidores activos
- ✅ Aplicar cambios de activación/desactivación de servidores
- ✅ Debugging rápido de problemas de conexión

Es especialmente útil durante el desarrollo de nuevos servidores MCP o cuando se experimenta con diferentes configuraciones.
