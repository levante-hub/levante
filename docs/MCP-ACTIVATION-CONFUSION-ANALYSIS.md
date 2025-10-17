# MCP Server Activation Confusion - Análisis de Arquitectura Actual

**Fecha:** 2025-10-10
**Estado:** Problema Identificado - Requiere Refactorización
**Prioridad:** Alta - Afecta UX/UI y expectativas del usuario

---

## 🔴 Problema Identificado

### Descripción del Comportamiento Confuso

Actualmente existe una **confusión conceptual** entre "activar/desactivar" vs "instalar/desinstalar" servidores MCP:

1. **En Store:** Hay un botón "Add to Active" que sugiere "activar" un servidor
2. **En Active MCPs:** Hay un Switch ON/OFF que sugiere activar/desactivar temporalmente
3. **Comportamiento Real:** El Switch OFF DESINSTALA el servidor (lo borra de `mcp.json`)
4. **Resultado:** El servidor desaparece de Active MCPs y vuelve solo al Store

**Expectativa del Usuario:**
- Store = Catálogo de servidores disponibles para instalar
- "Install" = Guardar en `mcp.json` permanentemente
- Switch = Conectar/desconectar temporalmente (sin borrar configuración)
- "Uninstall" = Borrar de `mcp.json` (acción explícita y destructiva)

**Realidad Actual:**
- "Add to Active" = Instalar Y conectar
- Switch OFF = Desinstalar (borrar de `mcp.json`)
- No existe estado intermedio "instalado pero desconectado"

---

## 📊 Análisis del Flujo de Código Actual

### 1. Añadir Servidor desde Store

**Archivo:** `src/renderer/components/mcp/store-page/store-layout.tsx:72-98`

```typescript
const handleAddToActive = async (entryId: string) => {
  const registryEntry = registry.entries.find(e => e.id === entryId);

  const serverConfig: MCPServerConfig = {
    id: entryId,
    name: registryEntry.name,
    transport: registryEntry.configuration?.template?.type || 'stdio',
    command: registryEntry.configuration?.template?.command || '',
    args: registryEntry.configuration?.template?.args || [],
    env: registryEntry.configuration?.template?.env || {}
  };

  await addServer(serverConfig);  // ← Guarda en mcp.json
  await loadActiveServers();      // ← Recarga lista
  toast.success(`${registryEntry.name} added to Active MCPs`);
}
```

**Flujo:**
```
User: Click "Add to Active"
  ↓
StoreLayout.handleAddToActive()
  ↓
useMCPStore.addServer(config)
  ↓
IPC: window.levante.mcp.addServer()
  ↓
Main Process: mcpConfigManager.addServer()
  ↓
Escribe en ~/levante/mcp.json
  ↓
Servidor aparece en Active MCPs
```

**Resultado:**
- ✅ Servidor guardado en `mcp.json`
- ✅ Aparece en `activeServers`
- ❌ NO se conecta automáticamente

---

### 2. Toggle Switch en Active MCPs (PROBLEMA)

**Archivo:** `src/renderer/components/mcp/store-page/store-layout.tsx:50-66`

```typescript
const handleToggleServer = async (serverId: string) => {
  const server = activeServers.find(s => s.id === serverId);
  const isActive = connectionStatus[serverId] === 'connected';

  if (isActive) {
    await disconnectServer(serverId);  // ← ⚠️ DESINSTALA
  } else if (server) {
    await connectServer(server);
  }
}
```

**Archivo:** `src/renderer/stores/mcpStore.ts:135-158`

```typescript
disconnectServer: async (serverId: string) => {
  const result = await window.levante.mcp.disconnectServer(serverId);

  if (result.success) {
    set(state => ({
      activeServers: state.activeServers.filter(s => s.id !== serverId), // ← Elimina
      connectionStatus: {
        ...state.connectionStatus,
        [serverId]: 'disconnected'
      }
    }));
  }
}
```

**Archivo:** `src/main/ipc/mcpHandlers.ts:27-35`

```typescript
ipcMain.handle('levante/mcp/disconnect-server', async (_, serverId: string) => {
  await mcpService.disconnectServer(serverId);
  await configManager.removeServer(serverId);  // ← ⚠️ BORRA DE mcp.json
  return { success: true };
});
```

**Flujo:**
```
User: Switch OFF en Active MCPs
  ↓
handleToggleServer() detecta isActive=true
  ↓
useMCPStore.disconnectServer(serverId)
  ↓
IPC: window.levante.mcp.disconnectServer()
  ↓
Main Process:
  - mcpService.disconnectServer()  ← Cierra conexión
  - configManager.removeServer()   ← ⚠️ BORRA de mcp.json
  ↓
Renderer:
  - Filtra activeServers (elimina servidor)
  - connectionStatus = 'disconnected'
  ↓
Servidor desaparece de Active MCPs
Servidor vuelve a Store como "Available"
```

**Resultado:**
- ❌ Servidor BORRADO de `mcp.json`
- ❌ Desaparece de `activeServers`
- ❌ Usuario pierde configuración
- ❌ Tiene que "re-instalar" desde Store

---

### 3. Existe Handler para Remove (NO USADO EN UI)

**Archivo:** `src/main/ipc/mcpHandlers.ts:143-150`

```typescript
ipcMain.handle('levante/mcp/remove-server', async (_, serverId: string) => {
  await configManager.removeServer(serverId);
  return { success: true };
});
```

**Problema:**
- ✅ Existe método `removeServer()` en mcpStore
- ✅ Existe IPC handler `levante/mcp/remove-server`
- ❌ **NO HAY UI** que lo invoque (no hay botón Delete/Uninstall)
- ❌ Solo se usa internamente desde `disconnectServer()`

---

## 🎯 Problema Conceptual UX/UI

### Estados Esperados vs Realidad

| Estado Esperado | UI Esperada | Realidad Actual | UI Actual |
|----------------|-------------|-----------------|-----------|
| **No instalado** | "Install" button en Store | Servidor solo en Store | "Add to Active" |
| **Instalado, desconectado** | En Active MCPs, Switch OFF | ❌ NO EXISTE | ❌ NO EXISTE |
| **Instalado, conectado** | En Active MCPs, Switch ON | En Active MCPs | Switch ON |
| **Desinstalar** | Botón "Uninstall" explícito | Switch OFF (confuso) | Switch OFF |

### El Switch Tiene Doble Función Conflictiva

**En Active MCPs, el Switch significa:**

| Acción | Expectativa Usuario | Realidad Actual |
|--------|-------------------|-----------------|
| **Switch ON** | Conectar al servidor | ✅ Conecta (correcto) |
| **Switch OFF** | Desconectar del servidor | ❌ Desinstala (incorrecto) |

**El usuario espera:**
```
Switch OFF → Desconectar temporalmente
             Configuración se mantiene en mcp.json
             Servidor permanece en Active MCPs
             Puede reconectar con Switch ON
```

**Lo que realmente pasa:**
```
Switch OFF → Desconectar Y desinstalar
             Configuración BORRADA de mcp.json
             Servidor desaparece de Active MCPs
             Vuelve al Store como "Available"
             Necesita re-instalar para usar
```

---

## 🏗️ Arquitectura Propuesta

### Separación de Conceptos: Install vs Connect

#### 1. **Store: "Install" / "Already Installed"**

**Acción:** Añadir servidor a `mcp.json` (persistente)

```typescript
// Botón en Store
<Button onClick={handleInstall}>
  <Download className="w-4 h-4 mr-2" />
  Install
</Button>

// Si ya está instalado
<Button disabled>
  <Check className="w-4 h-4 mr-2" />
  Already Installed
</Button>
```

**Comportamiento:**
- Guarda configuración en `mcp.json`
- NO conecta automáticamente
- Servidor aparece en Active MCPs con Switch OFF

#### 2. **Active MCPs: Switch para Connect/Disconnect**

**Acción:** Conectar/desconectar temporalmente (NO modifica `mcp.json`)

```typescript
// Switch en Active MCPs
<Switch
  checked={connectionStatus[serverId] === 'connected'}
  onCheckedChange={(checked) =>
    checked
      ? connectServer(server)      // Solo conecta
      : disconnectServer(server)   // Solo desconecta (NO borra)
  }
/>
```

**Comportamiento:**
- Switch ON → Conecta al servidor
- Switch OFF → Desconecta (configuración permanece)
- Servidor sigue en Active MCPs

#### 3. **Active MCPs: Botón "Uninstall" Explícito**

**Acción:** Borrar servidor de `mcp.json` (destructivo)

```typescript
// Botón en Active MCPs (dentro de dropdown o con confirmación)
<Button variant="destructive" onClick={handleUninstall}>
  <Trash className="w-4 h-4 mr-2" />
  Uninstall
</Button>
```

**Comportamiento:**
- Desconecta si está conectado
- Borra de `mcp.json`
- Servidor desaparece de Active MCPs
- Vuelve a Store como "Available"

---

## 🔄 Cambios Necesarios en el Código

### 1. Separar `disconnectServer` de `removeServer`

**Archivo:** `src/main/ipc/mcpHandlers.ts`

**ANTES:**
```typescript
ipcMain.handle('levante/mcp/disconnect-server', async (_, serverId: string) => {
  await mcpService.disconnectServer(serverId);
  await configManager.removeServer(serverId);  // ← PROBLEMA
  return { success: true };
});
```

**DESPUÉS:**
```typescript
// Disconnect: Solo desconecta, NO borra de mcp.json
ipcMain.handle('levante/mcp/disconnect-server', async (_, serverId: string) => {
  await mcpService.disconnectServer(serverId);
  // ✅ NO llamar a removeServer()
  return { success: true };
});

// Remove: Desconecta Y borra de mcp.json
ipcMain.handle('levante/mcp/remove-server', async (_, serverId: string) => {
  await mcpService.disconnectServer(serverId);  // Desconecta primero
  await configManager.removeServer(serverId);   // Luego borra
  return { success: true };
});
```

### 2. Actualizar `mcpStore.disconnectServer`

**Archivo:** `src/renderer/stores/mcpStore.ts`

**ANTES:**
```typescript
disconnectServer: async (serverId: string) => {
  const result = await window.levante.mcp.disconnectServer(serverId);

  if (result.success) {
    set(state => ({
      activeServers: state.activeServers.filter(s => s.id !== serverId), // ← PROBLEMA
      connectionStatus: { ...state.connectionStatus, [serverId]: 'disconnected' }
    }));
  }
}
```

**DESPUÉS:**
```typescript
disconnectServer: async (serverId: string) => {
  const result = await window.levante.mcp.disconnectServer(serverId);

  if (result.success) {
    set(state => ({
      // ✅ NO filtrar activeServers (el servidor permanece)
      connectionStatus: {
        ...state.connectionStatus,
        [serverId]: 'disconnected'
      }
    }));
  }
}
```

### 3. Actualizar UI de Store

**Archivo:** `src/renderer/components/mcp/store-page/integration-card.tsx`

**Cambio de terminología:**

```typescript
// ANTES
<Button onClick={onAddToActive}>
  <Plus className="w-4 h-4 mr-2" />
  Add to Active
</Button>

// DESPUÉS
<Button onClick={onInstall}>
  <Download className="w-4 h-4 mr-2" />
  Install
</Button>

// Si ya está instalado
<Button disabled>
  <Check className="w-4 h-4 mr-2" />
  Already Installed
</Button>
```

### 4. Añadir Botón Uninstall en Active MCPs

**Archivo:** `src/renderer/components/mcp/store-page/integration-card.tsx`

**Nuevo botón en modo Active:**

```typescript
{mode === 'active' && (
  <CardFooter className="p-6 pt-0">
    <div className="flex gap-2 w-full">
      <Button
        variant="outline"
        size="sm"
        onClick={onConfigure}
      >
        <Settings className="w-4 h-4 mr-2" />
        Configure
      </Button>

      {/* NUEVO: Botón Uninstall */}
      <Button
        variant="destructive"
        size="sm"
        onClick={onUninstall}
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Uninstall
      </Button>
    </div>
  </CardFooter>
)}
```

### 5. Implementar `handleUninstall` en StoreLayout

**Archivo:** `src/renderer/components/mcp/store-page/store-layout.tsx`

```typescript
const handleUninstall = async (serverId: string) => {
  // Opcional: Mostrar confirmación
  const confirmed = await confirmDialog({
    title: 'Uninstall Server',
    message: 'This will remove the server configuration. Continue?',
    variant: 'destructive'
  });

  if (!confirmed) return;

  // Usar el método removeServer del store
  await removeServer(serverId);

  toast.success('Server uninstalled successfully');
};
```

---

## 📈 Comparación de Flujos

### Flujo Actual (Confuso)

```
┌─────────────┐
│    Store    │
│  "Add to    │
│   Active"   │
└──────┬──────┘
       │ Click
       ↓
┌──────────────┐
│ Active MCPs  │
│  Switch ON   │  ← Servidor aparece aquí
└──────┬───────┘
       │ Switch OFF
       ↓
┌─────────────────────┐
│ Servidor BORRADO    │
│ de mcp.json         │
│ Vuelve al Store     │
└─────────────────────┘
```

**Problema:** El Switch tiene doble función (connect + uninstall)

---

### Flujo Propuesto (Claro)

```
┌─────────────┐
│    Store    │
│  "Install"  │
└──────┬──────┘
       │ Click
       ↓
┌──────────────────────────┐
│     Active MCPs          │
│  Switch OFF (instalado)  │  ← Servidor aparece aquí
└─────┬────────────────┬───┘
      │                │
      │ Switch ON      │ Uninstall button
      ↓                ↓
┌─────────────┐  ┌──────────────────┐
│ Connected   │  │ Confirmación     │
│ Switch ON   │  │ "Really remove?" │
└─────┬───────┘  └────────┬─────────┘
      │                   │ Confirm
      │ Switch OFF        ↓
      ↓           ┌──────────────────┐
┌─────────────┐  │ BORRADO de       │
│Disconnected │  │ mcp.json         │
│ Switch OFF  │  │ Vuelve al Store  │
└─────────────┘  └──────────────────┘
```

**Ventajas:**
- Switch = Solo conectar/desconectar (no destructivo)
- Uninstall = Acción explícita y destructiva
- Estado "instalado pero desconectado" existe

---

## 🎨 Estados Visuales Propuestos

### En Store

| Estado | UI | Acción |
|--------|----|----|
| No instalado | Badge "Available" + Button "Install" | Instalar en mcp.json |
| Instalado | Badge "Installed" + Button disabled | Ir a Active MCPs |

### En Active MCPs

| Estado | Switch | Badge | Acciones |
|--------|--------|-------|----------|
| Instalado, desconectado | OFF | "Disconnected" | Configure, Uninstall |
| Instalado, conectado | ON | "Connected" | Configure, Uninstall |

---

## ✅ Checklist de Implementación

### Backend (Main Process)
- [ ] Modificar `mcpHandlers.ts:disconnect-server` para NO borrar de mcp.json
- [ ] Verificar que `remove-server` handler desconecta antes de borrar
- [ ] Añadir logging para diferenciar disconnect vs remove

### Frontend (Renderer)
- [ ] Actualizar `mcpStore.disconnectServer()` para NO filtrar activeServers
- [ ] Actualizar `mcpStore.removeServer()` para manejar desinstalación
- [ ] Cambiar "Add to Active" por "Install" en Store
- [ ] Añadir botón "Uninstall" en Active MCPs
- [ ] Implementar confirmación antes de uninstall
- [ ] Actualizar badges ("Available" → "Installed")

### UX/UI
- [ ] Añadir tooltips explicativos
- [ ] Actualizar iconos (Download para Install, Trash para Uninstall)
- [ ] Mostrar estado "Installed but disconnected" claramente
- [ ] Confirmar acción destructiva antes de uninstall

### Testing
- [ ] Verificar que disconnect NO borra de mcp.json
- [ ] Verificar que uninstall SÍ borra de mcp.json
- [ ] Verificar persistencia de configuración tras disconnect
- [ ] Verificar que import/export funcionan correctamente

---

## 📝 Notas Adicionales

### ¿Por qué pasó esto?

Probablemente una evolución incremental del código donde inicialmente:
1. "Add to Active" implicaba conectar automáticamente
2. No había concepto de "instalado pero desconectado"
3. "Disconnect" se equiparó con "ya no quiero este servidor"

### Impacto en Usuarios

**Actual (confuso):**
- Usuario desconecta temporalmente → Pierde configuración
- Tiene que "reinstalar" cada vez
- Comportamiento inesperado y frustrante

**Propuesto (claro):**
- Disconnect es seguro (no destructivo)
- Configuración persiste entre sesiones
- Uninstall es explícito y confirmado

---

## 🎯 Conclusión

El problema principal es la **ambigüedad semántica** entre:
- **Temporal** (connect/disconnect)
- **Permanente** (install/uninstall)

La solución propuesta introduce:
1. **Separación clara** de operaciones temporales vs permanentes
2. **Nuevo estado** "instalado pero desconectado"
3. **UI explícita** para acciones destructivas
4. **Comportamiento predecible** que cumple expectativas del usuario

**Prioridad de implementación:** Alta
**Complejidad:** Media (refactor backend + frontend)
**Impacto UX:** Alto (mejora significativa en usabilidad)
