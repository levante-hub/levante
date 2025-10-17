# Plan de Implementación: Botón para Eliminar Servidores MCP

## Resumen

Añadir un botón "Delete" en la UI que permita eliminar servidores MCP del archivo `mcp.json` (tanto de `mcpServers` como de `disabled`). Este botón debe incluir confirmación para evitar eliminaciones accidentales.

## Estado Actual

### Backend (✅ Ya implementado)

Todo el backend necesario ya existe:

1. **mcpConfigManager.ts** (`src/main/services/mcpConfigManager.ts:85-106`):
   ```typescript
   async removeServer(serverId: string): Promise<void> {
     const currentConfig = await this.loadConfiguration();

     // Busca en mcpServers
     if (currentConfig.mcpServers[serverId]) {
       delete currentConfig.mcpServers[serverId];
       found = true;
     }

     // Busca en disabled
     if (currentConfig.disabled && currentConfig.disabled[serverId]) {
       delete currentConfig.disabled[serverId];
       found = true;
     }

     await this.saveConfiguration(currentConfig);
   }
   ```

2. **IPC Handler** (`src/main/ipc/mcpHandlers.ts`):
   ```typescript
   ipcMain.handle('levante/mcp/remove-server', async (_, serverId: string) => {
     try {
       await configManager.removeServer(serverId);
       return { success: true };
     } catch (error: any) {
       return { success: false, error: error.message };
     }
   });
   ```

3. **Preload** (`src/preload/preload.ts`):
   ```typescript
   removeServer: (serverId: string) =>
     ipcRenderer.invoke('levante/mcp/remove-server', serverId)
   ```

4. **Store** (`src/renderer/stores/mcpStore.ts`):
   ```typescript
   removeServer: async (serverId: string) => {
     // Desconecta si está conectado
     await get().disconnectServer(serverId);

     // Elimina del mcp.json
     const result = await window.levante.mcp.removeServer(serverId);

     if (result.success) {
       // Actualiza estado local
       set(state => ({
         activeServers: state.activeServers.filter(s => s.id !== serverId)
       }));
     }
   }
   ```

### Frontend (❌ Falta implementar)

Actualmente **NO existe botón** en la UI para eliminar servidores. Los componentes actuales son:

- **IntegrationCard**: Muestra Switch ON/OFF y botón "Configure" en modo 'active'
- **StoreLayout**: Renderiza las cards y maneja eventos de toggle/configure

## Arquitectura de la Solución

### Flujo de Usuario

```
Usuario hace clic en botón "Delete" en IntegrationCard
    ↓
Se abre AlertDialog con confirmación:
    "Are you sure you want to delete this MCP server?"
    "This action cannot be undone. The server will be removed from your configuration."
    ↓
Usuario hace clic en "Cancel" → Cierra diálogo (no hace nada)
    ↓
Usuario hace clic en "Delete" → Ejecuta eliminación
    ↓
IntegrationCard: onDelete() callback
    ↓
StoreLayout: handleDeleteServer(serverId)
    ↓
mcpStore.removeServer(serverId)
    ↓
1. Desconecta servidor si está conectado
2. Llama a IPC: window.levante.mcp.removeServer(serverId)
3. Backend elimina de mcp.json (mcpServers o disabled)
4. Store actualiza activeServers (filtra el servidor eliminado)
5. UI se actualiza automáticamente (Zustand reactivity)
    ↓
Toast: "Server deleted successfully" o error message
```

### Diseño Visual

**Opción seleccionada**: Añadir botón "Delete" junto al botón "Configure" en `CardFooter`

```
┌──────────────────────────────────────┐
│  [Icon] Server Name          [Switch]│
│  Category Badge                       │
│                                       │
│  Description text...                 │
│                                       │
│  [Status] [Active/Disabled Badge]    │
│                                       │
│  ┌──────────┐  ┌──────────┐         │
│  │Configure │  │  Delete  │         │
│  └──────────┘  └──────────┘         │
└──────────────────────────────────────┘
```

**Estilos del botón**:
- Variant: `destructive` (rojo)
- Size: `sm`
- Icon: `Trash2` de lucide-react
- Solo visible en modo `'active'`

## Plan de Implementación Paso a Paso

### Paso 1: Modificar `IntegrationCard` Component

**Archivo**: `src/renderer/components/mcp/store-page/integration-card.tsx`

**Cambios**:

1. **Imports** (línea 1-18):
   ```typescript
   import { Trash2 } from 'lucide-react';
   import {
     AlertDialog,
     AlertDialogAction,
     AlertDialogCancel,
     AlertDialogContent,
     AlertDialogDescription,
     AlertDialogFooter,
     AlertDialogHeader,
     AlertDialogTitle,
   } from '@/components/ui/alert-dialog';
   ```

2. **Props** (línea 20-29):
   ```typescript
   interface IntegrationCardProps {
     mode: 'active' | 'store';
     entry?: MCPRegistryEntry;
     server?: MCPServerConfig;
     status: MCPConnectionStatus;
     isActive: boolean;
     onToggle: () => void;
     onConfigure: () => void;
     onAddToActive?: () => void;
     onDelete?: () => void;  // ← NUEVO
   }
   ```

3. **Destructure props** (línea 41-50):
   ```typescript
   export function IntegrationCard({
     mode,
     entry,
     server,
     status,
     isActive,
     onToggle,
     onConfigure,
     onAddToActive,
     onDelete  // ← NUEVO
   }: IntegrationCardProps) {
   ```

4. **Estado local para AlertDialog** (después de línea 56):
   ```typescript
   const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

   const handleDeleteClick = () => {
     setShowDeleteDialog(true);
   };

   const handleDeleteConfirm = () => {
     setShowDeleteDialog(false);
     onDelete?.();
   };
   ```

5. **Modificar CardFooter** (líneas 110-149):
   ```typescript
   <CardFooter className="p-6 pt-0">
     <div className="flex gap-2 w-full">
       {mode === 'store' ? (
         // Store: Botón "Add to Active"
         !isActive ? (
           <Button
             variant="default"
             size="sm"
             className="flex-1"
             onClick={onAddToActive}
           >
             <Plus className="w-4 h-4 mr-2" />
             Add to Active
           </Button>
         ) : (
           <Button
             variant="outline"
             size="sm"
             className="flex-1"
             disabled
           >
             Already Added
           </Button>
         )
       ) : (
         // Active: Botones "Configure" y "Delete"
         <>
           <Button
             variant="outline"
             size="sm"
             className="flex-1"
             onClick={onConfigure}
             disabled={status === 'connecting'}
           >
             <Settings className="w-4 h-4 mr-2" />
             Configure
           </Button>

           {onDelete && (
             <Button
               variant="destructive"
               size="sm"
               onClick={handleDeleteClick}
               disabled={status === 'connecting'}
             >
               <Trash2 className="w-4 h-4" />
             </Button>
           )}
         </>
       )}
     </div>
   </CardFooter>
   ```

6. **Añadir AlertDialog** (antes del cierre del Card, después de línea 163):
   ```typescript
   {/* Delete Confirmation Dialog */}
   <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
     <AlertDialogContent>
       <AlertDialogHeader>
         <AlertDialogTitle>Delete MCP Server?</AlertDialogTitle>
         <AlertDialogDescription>
           Are you sure you want to delete <strong>{displayName}</strong>?
           <br />
           <br />
           This will remove the server from your configuration file. This action cannot be undone.
         </AlertDialogDescription>
       </AlertDialogHeader>
       <AlertDialogFooter>
         <AlertDialogCancel>Cancel</AlertDialogCancel>
         <AlertDialogAction
           onClick={handleDeleteConfirm}
           className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
         >
           Delete
         </AlertDialogAction>
       </AlertDialogFooter>
     </AlertDialogContent>
   </AlertDialog>
   ```

### Paso 2: Modificar `StoreLayout` Component

**Archivo**: `src/renderer/components/mcp/store-page/store-layout.tsx`

**Cambios**:

1. **Importar removeServer del store** (línea 23-35):
   ```typescript
   const {
     registry,
     activeServers,
     connectionStatus,
     isLoading,
     error,
     loadRegistry,
     loadActiveServers,
     refreshConnectionStatus,
     connectServer,
     disconnectServer,
     addServer,
     removeServer  // ← NUEVO
   } = useMCPStore();
   ```

2. **Añadir handler para delete** (después de línea 98):
   ```typescript
   const handleDeleteServer = async (serverId: string) => {
     try {
       await removeServer(serverId);

       // Recargar lista de servidores activos
       await loadActiveServers();

       // Feedback al usuario
       toast.success('Server deleted successfully');
     } catch (error) {
       logger.mcp.error('Failed to delete server', { serverId, error });
       toast.error('Failed to delete server');
     }
   };
   ```

3. **Pasar onDelete a IntegrationCard en modo 'active'** (línea 163-173):
   ```typescript
   <IntegrationCard
     key={server.id}
     mode="active"
     entry={registryEntry}
     server={server}
     status={status}
     isActive={true}
     onToggle={() => handleToggleServer(server.id)}
     onConfigure={() => handleConfigureServer(server.id)}
     onDelete={() => handleDeleteServer(server.id)}  // ← NUEVO
   />
   ```

## Testing Manual

### Checklist de Pruebas

1. **UI Rendering**:
   - [ ] El botón "Delete" (icono de basura) aparece solo en modo 'active'
   - [ ] El botón NO aparece en modo 'store'
   - [ ] El botón tiene estilo destructivo (rojo)
   - [ ] El botón está deshabilitado cuando status === 'connecting'

2. **Confirmación de Eliminación**:
   - [ ] Al hacer clic en "Delete", se abre el AlertDialog
   - [ ] El diálogo muestra el nombre correcto del servidor
   - [ ] El texto de confirmación es claro y advertencial
   - [ ] El botón "Cancel" cierra el diálogo sin hacer nada
   - [ ] El botón "Delete" en el diálogo tiene estilo destructivo

3. **Funcionalidad de Eliminación**:
   - [ ] Al confirmar, el servidor se elimina del mcp.json
   - [ ] Si el servidor estaba en `mcpServers`, se elimina de ahí
   - [ ] Si el servidor estaba en `disabled`, se elimina de ahí
   - [ ] La UI se actualiza automáticamente (el servidor desaparece)
   - [ ] Aparece toast de éxito: "Server deleted successfully"

4. **Manejo de Errores**:
   - [ ] Si falla la eliminación, aparece toast de error
   - [ ] La UI no se actualiza si hay error
   - [ ] El error se registra en logs

5. **Edge Cases**:
   - [ ] Eliminar servidor conectado (debe desconectar primero)
   - [ ] Eliminar servidor desconectado
   - [ ] Eliminar servidor disabled
   - [ ] Eliminar múltiples servidores consecutivamente

### Comandos de Testing

```bash
# Ver logs durante testing
tail -f ~/Library/Application\ Support/Levante/logs/main.log | grep MCP

# Verificar cambios en mcp.json
cat ~/levante/mcp.json | jq .
```

## Archivos Modificados

### Frontend
- ✏️ `src/renderer/components/mcp/store-page/integration-card.tsx` (modificar)
- ✏️ `src/renderer/components/mcp/store-page/store-layout.tsx` (modificar)

### Backend
- ✅ No requiere cambios (ya implementado)

## Consideraciones de UX

### ¿Por qué un botón separado en lugar de un menú dropdown?

**Pros del botón separado**:
- ✅ Más directo y rápido (menos clics)
- ✅ Visibilidad clara de las acciones disponibles
- ✅ Icono universalmente reconocible (basura = eliminar)
- ✅ Color rojo indica claramente que es acción destructiva

**Contras**:
- ⚠️ Ocupa más espacio en la UI
- ⚠️ Puede ser más fácil hacer clic accidental (mitigado con AlertDialog)

**Decisión**: Botón separado porque:
1. El AlertDialog previene clics accidentales
2. Es una acción suficientemente importante para ser visible
3. Sigue patrones comunes de UI (ej: GitHub, Gmail)

### ¿Por qué solo icono sin texto en el botón Delete?

**Razones**:
- Ahorra espacio horizontal en la card
- El icono de basura es universalmente reconocible
- El texto "Configure" ya ocupa espacio
- El color rojo + icono basura es suficientemente claro

Si el usuario pasa el cursor sobre el botón, se puede añadir un `title` attribute:
```typescript
<Button
  variant="destructive"
  size="sm"
  onClick={handleDeleteClick}
  disabled={status === 'connecting'}
  title="Delete server"
>
  <Trash2 className="w-4 h-4" />
</Button>
```

## Logs Esperados

### Durante Eliminación Exitosa

```
[MCP] info: Removing server from configuration { serverId: 'context7' }
[MCP] info: Server removed from configuration { serverId: 'context7' }
[MCP] debug: Configuration saved successfully
```

### Durante Eliminación con Error

```
[MCP] error: Failed to remove server { serverId: 'context7', error: 'Server not found in configuration' }
```

## Diferencias con Disable (Switch OFF)

| Acción | Switch OFF (Disable) | Botón Delete |
|--------|---------------------|--------------|
| **Efecto en mcp.json** | Mueve de `mcpServers` → `disabled` | Elimina completamente del archivo |
| **Reversible** | ✅ Sí (Switch ON vuelve a activar) | ❌ No (hay que reinstalar) |
| **Desconecta servidor** | ✅ Sí | ✅ Sí |
| **Preserva configuración** | ✅ Sí | ❌ No |
| **Uso recomendado** | Desactivación temporal | Eliminar servidores no deseados |
| **Confirmación requerida** | ❌ No | ✅ Sí (AlertDialog) |

## Mejoras Futuras (Opcional)

### 1. Botón "Uninstall" en Store Mode

Actualmente el botón Delete solo aparece en modo 'active'. Se podría añadir también en modo 'store' para servidores que están "Already Added":

```typescript
{mode === 'store' && isActive && (
  <Button
    variant="ghost"
    size="sm"
    onClick={handleDeleteClick}
  >
    <Trash2 className="w-4 h-4 mr-2" />
    Uninstall
  </Button>
)}
```

### 2. Bulk Delete

Añadir checkboxes para seleccionar múltiples servidores y eliminarlos en batch:

```typescript
const [selectedServers, setSelectedServers] = useState<string[]>([]);

// Botón en header
{selectedServers.length > 0 && (
  <Button
    variant="destructive"
    onClick={() => handleBulkDelete(selectedServers)}
  >
    Delete {selectedServers.length} servers
  </Button>
)}
```

### 3. Undo Delete

Implementar un sistema de "papelera" temporal que permite recuperar servidores eliminados durante los últimos 30 segundos:

```typescript
const [deletedServers, setDeletedServers] = useState<MCPServerConfig[]>([]);

// Toast con acción de undo
toast.success('Server deleted', {
  action: {
    label: 'Undo',
    onClick: () => restoreServer(serverId)
  }
});
```

## Resumen

### Estado Actual
- ✅ Backend completamente implementado
- ❌ UI no tiene botón para eliminar

### Implementación Requerida
- ✏️ Modificar `integration-card.tsx` (añadir botón + AlertDialog)
- ✏️ Modificar `store-layout.tsx` (añadir handler + pasar callback)
- ⏱️ Tiempo estimado: **30-45 minutos**
- 🧪 Testing: **15-20 minutos**

### Resultado Final
Un botón destructivo (rojo) con icono de basura que permite eliminar servidores MCP con confirmación, eliminándolos completamente del archivo `mcp.json` (tanto de `mcpServers` como de `disabled`).
