# Implementación: Editor JSON para MCPs

**Fecha:** 2025-01-15

---

## 📊 Experiencia de Usuario Final

### Escenario 1: Instalar un MCP desde el Store

```
1. Usuario abre la app → Ve toggle "🔧 Active / 🏪 Store"
2. Click en "🏪 Store" → Ve catálogo de MCPs disponibles
3. Ve card "Sequential Thinking" con botón "Add to Active"
4. Click "Add to Active"
   → Toast: "Sequential Thinking added to Active MCPs ✓"
   → Badge cambia a "Already Added"
5. Switch a "🔧 Active" → Ve el MCP instalado (disconnected)
```

**Duración:** < 5 segundos
**Acciones:** 2 clicks

---

### Escenario 2: Configurar y conectar un MCP

```
1. Usuario en vista "🔧 Active"
2. Ve card "Sequential Thinking" (disconnected)
3. Click botón "⚙️ Configure"
   → Se abre panel lateral derecho con JSON editor
4. Ve el JSON actual:
   {
     "type": "stdio",
     "command": "npx",
     "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
     "env": {}
   }
5. [Opcional] Edita valores (ej: añadir env vars)
6. Click "Test Connection"
   → Spinner... → ✓ "Connection successful!"
7. Click "Save"
   → Panel se cierra
   → Config actualizada en .mcp.json
8. Click Switch en la card
   → MCP se conecta
   → Badge muestra "Connected"
```

**Duración:** 30-60 segundos
**Acciones:** 4-5 clicks

---

### Escenario 3: Añadir MCP custom (no en store)

```
1. Usuario en vista "🏪 Store"
2. Ve card especial "➕ Add Custom Integration"
3. Click en la card
   → Abre panel lateral con JSON editor vacío
4. Pega JSON de configuración:
   {
     "type": "stdio",
     "command": "npx",
     "args": ["-y", "@my-org/custom-mcp"],
     "env": {
       "API_KEY": "sk-..."
     }
   }
5. Escribe nombre: "My Custom MCP"
6. Click "Test Connection" → ✓ Success
7. Click "Save"
8. Switch a "🔧 Active" → Ve el MCP custom instalado
```

**Duración:** 1-2 minutos
**Acciones:** 5 clicks + escribir JSON

---

## 🔧 Cambios Técnicos Detallados

### 1. Actualizar mcpRegistry.json

**Archivo:** `src/renderer/data/mcpRegistry.json`

**Cambio:** Añadir `configuration.template` a cada entrada

**Antes:**
```json
{
  "id": "sequential-thinking",
  "name": "Sequential Thinking",
  "description": "...",
  "configuration": {
    "fields": [
      { "key": "command", "defaultValue": "npx ..." }
    ]
  }
}
```

**Después:**
```json
{
  "id": "sequential-thinking",
  "name": "Sequential Thinking",
  "description": "...",
  "configuration": {
    "fields": [...],  // ← Mantener por ahora (deprecado)
    "template": {     // ← NUEVO
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      "env": {}
    }
  }
}
```

**Acción:** Actualizar las 3 entradas existentes del registry

---

### 2. Crear JSONEditorPanel

**Archivo nuevo:** `src/renderer/components/mcp/config/json-editor-panel.tsx`

```tsx
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useMCPStore } from '@/stores/mcpStore';
import { MCPServerConfig } from '@/types/mcp';

interface JSONEditorPanelProps {
  serverId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function JSONEditorPanel({ serverId, isOpen, onClose }: JSONEditorPanelProps) {
  const { getServerById, getRegistryEntryById, testConnection, updateServer, addServer } = useMCPStore();

  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const server = serverId ? getServerById(serverId) : null;
  const registryEntry = serverId ? getRegistryEntryById(serverId) : null;
  const isNewServer = !server;

  useEffect(() => {
    if (isOpen && serverId) {
      // Load initial JSON
      if (server) {
        // Existing server - load current config
        const config = {
          type: server.transport,
          command: server.command,
          args: server.args || [],
          env: server.env || {},
          ...(server.baseUrl && { baseUrl: server.baseUrl }),
          ...(server.headers && { headers: server.headers })
        };
        setJsonText(JSON.stringify(config, null, 2));
      } else if (registryEntry?.configuration?.template) {
        // New server - load template
        setJsonText(JSON.stringify(registryEntry.configuration.template, null, 2));
      } else {
        // Fallback empty template
        setJsonText(JSON.stringify({
          type: 'stdio',
          command: '',
          args: [],
          env: {}
        }, null, 2));
      }
      setJsonError(null);
      setTestResult(null);
    }
  }, [isOpen, serverId, server, registryEntry]);

  const validateJSON = (text: string): { valid: boolean; data?: any; error?: string } => {
    try {
      const parsed = JSON.parse(text);

      // Validate required fields
      if (!parsed.type) {
        return { valid: false, error: 'Missing required field: type' };
      }

      if (parsed.type === 'stdio' && !parsed.command) {
        return { valid: false, error: 'Missing required field: command (for stdio transport)' };
      }

      if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.baseUrl) {
        return { valid: false, error: 'Missing required field: baseUrl (for http/sse transport)' };
      }

      return { valid: true, data: parsed };
    } catch (error) {
      return { valid: false, error: 'Invalid JSON syntax' };
    }
  };

  const handleJSONChange = (text: string) => {
    setJsonText(text);
    const validation = validateJSON(text);
    setJsonError(validation.error || null);
  };

  const handleTestConnection = async () => {
    const validation = validateJSON(jsonText);
    if (!validation.valid || !validation.data) {
      setJsonError(validation.error || 'Invalid JSON');
      return;
    }

    setIsTestingConnection(true);
    setTestResult(null);

    try {
      const testConfig: MCPServerConfig = {
        id: `test-${Date.now()}`,
        name: registryEntry?.name || 'Test Server',
        transport: validation.data.type,
        command: validation.data.command,
        args: validation.data.args || [],
        env: validation.data.env || {},
        baseUrl: validation.data.baseUrl,
        headers: validation.data.headers
      };

      const success = await testConnection(testConfig);

      setTestResult({
        success,
        message: success
          ? 'Connection test successful! Server is responding correctly.'
          : 'Connection test failed. Please check your configuration.'
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Connection test failed with an unexpected error.'
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = async () => {
    const validation = validateJSON(jsonText);
    if (!validation.valid || !validation.data || !serverId) {
      setJsonError(validation.error || 'Invalid JSON');
      return;
    }

    setIsSaving(true);

    try {
      const serverConfig: MCPServerConfig = {
        id: serverId,
        name: registryEntry?.name || serverId,
        transport: validation.data.type,
        command: validation.data.command,
        args: validation.data.args || [],
        env: validation.data.env || {},
        baseUrl: validation.data.baseUrl,
        headers: validation.data.headers
      };

      if (isNewServer) {
        await addServer(serverConfig);
      } else {
        await updateServer(serverId, {
          name: serverConfig.name,
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
          transport: serverConfig.transport,
          baseUrl: serverConfig.baseUrl,
          headers: serverConfig.headers
        });
      }

      onClose();
    } catch (error) {
      setJsonError('Failed to save server configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isNewServer ? 'Configure' : 'Edit'} {registryEntry?.name || serverId}
          </SheetTitle>
        </SheetHeader>

        <div className="py-6 space-y-4">
          {/* JSON Editor */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Server Configuration (JSON)
            </label>
            <Textarea
              value={jsonText}
              onChange={(e) => handleJSONChange(e.target.value)}
              className="font-mono text-sm min-h-[400px]"
              placeholder="Enter JSON configuration..."
            />
          </div>

          {/* Validation Error */}
          {jsonError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{jsonError}</AlertDescription>
            </Alert>
          )}

          {/* Test Result */}
          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{testResult.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <SheetFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={!!jsonError || isTestingConnection || isSaving}
          >
            {isTestingConnection ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!!jsonError || isTestingConnection || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

---

### 3. Actualizar IntegrationCard

**Archivo:** `src/renderer/components/mcp/store-page/integration-card.tsx`

**Cambios:**

```tsx
// 1. Actualizar interface
interface IntegrationCardProps {
  mode: 'active' | 'store';  // ← NUEVO
  entry?: MCPRegistryEntry;
  server?: MCPServerConfig;
  status: MCPConnectionStatus;
  isActive: boolean;
  onToggle: () => void;
  onConfigure: () => void;
  onAddToActive?: () => void;  // ← NUEVO
}

// 2. Actualizar componente
export function IntegrationCard({
  mode,  // ← NUEVO
  entry,
  server,
  status,
  isActive,
  onToggle,
  onConfigure,
  onAddToActive  // ← NUEVO
}: IntegrationCardProps) {
  // ... código existente ...

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md">
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{displayName}</h3>
              <Badge variant="secondary" className="text-xs">
                {category}
              </Badge>
            </div>
          </div>

          {/* Switch solo en modo Active */}
          {mode === 'active' && (
            <Switch
              checked={status === 'connected'}
              disabled={status === 'connecting'}
              onCheckedChange={onToggle}
            />
          )}
        </div>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {description}
        </p>

        {/* Status indicator solo en modo Active */}
        {mode === 'active' && (
          <div className="flex items-center justify-between">
            <ConnectionStatus
              serverId={server?.id || entry?.id || 'unknown'}
              status={status}
              size="sm"
              variant="indicator"
            />
            <Badge variant="default">Configured</Badge>
          </div>
        )}

        {/* Badge en modo Store */}
        {mode === 'store' && (
          <Badge variant={isActive ? 'default' : 'outline'}>
            {isActive ? 'Already Added' : 'Available'}
          </Badge>
        )}
      </CardContent>

      <CardFooter className="p-6 pt-0">
        <div className="flex gap-2 w-full">
          {/* Botón diferente según modo */}
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
            // Active: Botón "Configure"
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
          )}
        </div>
      </CardFooter>

      {/* Overlay solo en modo Active */}
      {mode === 'active' && status === 'connecting' && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <ConnectionStatus
            serverId={server?.id || entry?.id || 'unknown'}
            status="connecting"
            size="lg"
            variant="full"
            showLabel={true}
          />
        </div>
      )}
    </Card>
  );
}
```

---

### 4. Actualizar StoreLayout

**Archivo:** `src/renderer/components/mcp/store-page/store-layout.tsx`

**Cambios:**

```tsx
import { JSONEditorPanel } from '../config/json-editor-panel';  // ← NUEVO
import { toast } from 'sonner';  // ← NUEVO

export function StoreLayout({ mode }: StoreLayoutProps) {
  // ... imports y hooks existentes ...

  // NUEVO: Handler para añadir desde Store
  const handleAddToActive = async (entryId: string) => {
    const registryEntry = registry.entries.find(e => e.id === entryId);
    if (!registryEntry) return;

    try {
      // Construir config desde template
      const serverConfig: MCPServerConfig = {
        id: entryId,
        name: registryEntry.name,
        transport: registryEntry.configuration?.template?.type || 'stdio',
        command: registryEntry.configuration?.template?.command || '',
        args: registryEntry.configuration?.template?.args || [],
        env: registryEntry.configuration?.template?.env || {}
      };

      // Guardar directo en .mcp.json (sin test, sin connect)
      await addServer(serverConfig);

      // Recargar lista de servidores activos
      await loadActiveServers();

      // Feedback al usuario
      toast.success(`${registryEntry.name} added to Active MCPs`);
    } catch (error) {
      toast.error('Failed to add server');
    }
  };

  return (
    <div className="px-10 py-6">
      {/* ... header existente ... */}

      {/* Active Mode */}
      {mode === 'active' && (
        <section>
          {activeServers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeServers.map(server => {
                const registryEntry = registry.entries.find(entry => entry.id === server.id);
                const status = connectionStatus[server.id] || 'disconnected';

                return (
                  <IntegrationCard
                    key={server.id}
                    mode="active"  // ← NUEVO
                    entry={registryEntry}
                    server={server}
                    status={status}
                    isActive={true}
                    onToggle={() => handleToggleServer(server.id)}
                    onConfigure={() => handleConfigureServer(server.id)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No active MCP servers</p>
              <p className="text-sm text-muted-foreground">
                Switch to the Store tab to add integrations
              </p>
            </div>
          )}
        </section>
      )}

      {/* Store Mode */}
      {mode === 'store' && (
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Add Custom Card - mantener igual */}
            <Card className="p-6 border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer">
              <div
                className="flex flex-col items-center justify-center text-center h-full min-h-[200px]"
                onClick={() => setIsAddModalOpen(true)}
              >
                <Plus className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">Add Custom Integration</h3>
                <p className="text-sm text-muted-foreground">
                  Connect to your own MCP server
                </p>
              </div>
            </Card>

            {/* Registry Cards */}
            {registry.entries.map(entry => {
              const server = activeServers.find(s => s.id === entry.id);
              const status = connectionStatus[entry.id] || 'disconnected';
              const isActive = !!server;

              return (
                <IntegrationCard
                  key={entry.id}
                  mode="store"  // ← NUEVO
                  entry={entry}
                  server={server}
                  status={status}
                  isActive={isActive}
                  onToggle={() => handleToggleServer(entry.id)}
                  onConfigure={() => handleConfigureServer(entry.id)}
                  onAddToActive={() => handleAddToActive(entry.id)}  // ← NUEVO
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Reemplazar ServerConfigModal por JSONEditorPanel */}
      <JSONEditorPanel
        serverId={configServerId}
        isOpen={!!configServerId}
        onClose={() => setConfigServerId(null)}
      />

      {/* AddNewModal - mantener por ahora o adaptar */}
      <AddNewModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
}
```

---

### 5. Eliminar componentes obsoletos

**Archivos a eliminar:**
- ✅ `src/renderer/components/mcp/config/server-config-modal.tsx`
- ✅ `src/renderer/components/mcp/config/dynamic-config-form.tsx`

**Nota:** Mantener `add-new-modal.tsx` adaptado o usar JSONEditorPanel también para custom servers

---

## 📝 Checklist de Implementación

### Fase 1: Preparación
- [ ] Crear nueva rama: `feat/json-editor-mcp-config`
- [ ] Actualizar `mcpRegistry.json` con templates

### Fase 2: Componentes nuevos
- [ ] Crear `JSONEditorPanel.tsx`
- [ ] Implementar validación JSON
- [ ] Implementar Test Connection
- [ ] Implementar Save

### Fase 3: Actualizar existentes
- [ ] Actualizar `IntegrationCard.tsx` (añadir prop `mode`)
- [ ] Actualizar `StoreLayout.tsx` (handler `handleAddToActive`)
- [ ] Pasar prop `mode` a todas las IntegrationCard

### Fase 4: Integración
- [ ] Reemplazar `ServerConfigModal` por `JSONEditorPanel`
- [ ] Probar flujo Store → Add to Active
- [ ] Probar flujo Active → Configure → Save
- [ ] Probar Test Connection

### Fase 5: Limpieza
- [ ] Eliminar `server-config-modal.tsx`
- [ ] Eliminar `dynamic-config-form.tsx`
- [ ] Actualizar imports
- [ ] Verificar no hay referencias rotas

### Fase 6: Testing
- [ ] Add MCP from Store (con template)
- [ ] Configure MCP desde Active
- [ ] Test Connection con config válida
- [ ] Test Connection con config inválida
- [ ] Save cambios en Active
- [ ] Switch Connect/Disconnect

---

## 🎯 Beneficios vs UX Actual

| Aspecto | Antes | Después |
|---------|-------|---------|
| **Instalar MCP** | Configurar formulario + Save | 1 click "Add to Active" |
| **Configurar** | Formulario con campos limitados | JSON directo (flexible) |
| **Test Connection** | En Store (confuso) | Solo en Active (claro) |
| **Mental Model** | Difuso (Store = Config?) | Claro (Store = Instalar, Active = Usar) |
| **Flexibilidad** | Limitado a fields definidos | Total (cualquier JSON válido) |
| **Tiempo instalación** | 30-60 seg | < 5 seg |

---

## 🔄 Comparación de Flujos

### Flujo Actual (Confuso)
```
Store → Click "Set up" → Formulario → Test? → Save → Auto-connect
  ↓
¿Está "instalado" o "configurándose"?
```

### Flujo Nuevo (Claro)
```
Store → Click "Add to Active" → Instalado en .mcp.json
  ↓
Active → Click "Configure" → JSON Editor → Test → Save
  ↓
Active → Switch → Connect
```

**Separación clara:**
- Store = Instalación (como `npm install`)
- Active = Ejecución (como `npm run dev`)
