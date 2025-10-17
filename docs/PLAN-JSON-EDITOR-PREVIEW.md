# Plan: JSON Editor con Preview y Tools

**Fecha:** 2025-01-15
**Objetivo:** Ampliar el JSONEditorPanel para mostrar preview del servidor y lista de tools en tiempo real

---

## 🎯 Propuesta

### Layout Actual (600px)
```
┌──────────────────────────────────┐
│  Configure Server Name           │
├──────────────────────────────────┤
│                                  │
│  JSON Editor                     │
│  (textarea fullwidth)            │
│                                  │
│                                  │
├──────────────────────────────────┤
│  [Test] [Cancel] [Save]          │
└──────────────────────────────────┘
```

### Layout Propuesto (900px+)
```
┌────────────────────────────────────────────────────────────┐
│  Configure Server Name                                      │
├────────────────────────┬───────────────────────────────────┤
│                        │                                   │
│  JSON Editor           │  Server Preview                   │
│  (left 50%)            │  (right 50%)                      │
│                        │                                   │
│  {                     │  ┌─────────────────────────────┐ │
│    "type": "stdio",    │  │ sequential-thinking    [🟢] │ │
│    "command": "npx",   │  │ 1 tools available           │ │
│    "args": [...]       │  │                             │ │
│  }                     │  │ [Test Connection]           │ │
│                        │  │                             │ │
│  [Validation errors]   │  │ ▼ Tools (1)                 │ │
│                        │  │   • sequentialThinking      │ │
│                        │  │     "Advanced problem..."   │ │
│                        │  └─────────────────────────────┘ │
├────────────────────────┴───────────────────────────────────┤
│  [Cancel] [Save]                                           │
└────────────────────────────────────────────────────────────┘
```

---

## 📋 Componentes a Crear/Modificar

### 1. JSONEditorPanel (modificar)

**Cambios:**
```tsx
// Antes
<SheetContent side="right" className="w-[600px]">

// Después
<SheetContent side="right" className="w-[900px] sm:max-w-[90vw]">
  <div className="grid grid-cols-2 gap-6">
    <div>{/* JSON Editor */}</div>
    <div>{/* Server Preview */}</div>
  </div>
</SheetContent>
```

**Nuevos estados:**
```tsx
const [tools, setTools] = useState<MCPTool[]>([]);
const [isLoadingTools, setIsLoadingTools] = useState(false);
```

**Mover Test Connection:**
- ❌ Eliminar del footer
- ✅ Pasar como prop a MCPServerPreview

---

### 2. MCPServerPreview (nuevo)

**Ubicación:** `src/renderer/components/mcp/config/mcp-server-preview.tsx`

**Props:**
```tsx
interface MCPServerPreviewProps {
  serverName: string;
  isValidJSON: boolean;
  testResult: { success: boolean; message: string } | null;
  tools: MCPTool[];
  isTestingConnection: boolean;
  isLoadingTools: boolean;
  onTestConnection: () => void;
}
```

**Estructura:**
```tsx
<Card>
  <CardHeader>
    <div className="flex justify-between">
      <h3>{serverName}</h3>
      <Badge>{testResult?.success ? 'Connected' : 'Disconnected'}</Badge>
    </div>
  </CardHeader>

  <CardContent>
    {!isValidJSON && (
      <p className="text-muted-foreground">Enter valid JSON to preview</p>
    )}

    {isValidJSON && !testResult && (
      <Button onClick={onTestConnection}>
        Test Connection
      </Button>
    )}

    {testResult?.success && (
      <MCPToolsList tools={tools} isLoading={isLoadingTools} />
    )}

    {testResult && !testResult.success && (
      <Alert variant="destructive">{testResult.message}</Alert>
    )}
  </CardContent>
</Card>
```

---

### 3. MCPToolsList (nuevo)

**Ubicación:** `src/renderer/components/mcp/config/mcp-tools-list.tsx`

**Props:**
```tsx
interface MCPToolsListProps {
  tools: MCPTool[];
  isLoading: boolean;
}
```

**Estructura:**
```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <h4 className="font-semibold">Tools ({tools.length})</h4>
    {isLoading && <Loader2 className="animate-spin" />}
  </div>

  <Accordion type="single" collapsible>
    {tools.map(tool => (
      <AccordionItem key={tool.name} value={tool.name}>
        <AccordionTrigger>
          <div>
            <span className="font-medium">{tool.name}</span>
            <p className="text-xs text-muted-foreground">{tool.description}</p>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <MCPToolSchema schema={tool.inputSchema} />
        </AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
</div>
```

---

### 4. MCPToolSchema (nuevo)

**Ubicación:** `src/renderer/components/mcp/config/mcp-tool-schema.tsx`

**Props:**
```tsx
interface MCPToolSchemaProps {
  schema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}
```

**Estructura:**
```tsx
{schema?.properties && (
  <div className="space-y-2 text-sm">
    <div className="font-medium">Parameters:</div>
    {Object.entries(schema.properties).map(([key, value]) => (
      <div key={key} className="pl-4">
        <span className="font-mono">{key}</span>
        {schema.required?.includes(key) && (
          <Badge variant="destructive" className="ml-2">required</Badge>
        )}
        <p className="text-muted-foreground text-xs">{value.description}</p>
      </div>
    ))}
  </div>
)}
```

---

## 🔄 Flujo de Interacción

### Escenario 1: Usuario edita JSON

```
1. Usuario escribe/edita JSON
   ↓
2. Validación en tiempo real
   ↓ (si válido)
3. Preview muestra nombre del servidor
4. Botón "Test Connection" disponible
```

### Escenario 2: Test Connection

```
1. Click "Test Connection" en preview
   ↓
2. isTestingConnection = true (spinner en botón)
   ↓
3. Llama testConnection(config)
   ↓ (si success)
4. Badge cambia a "Connected" 🟢
5. isLoadingTools = true
6. Llama listTools(serverId)
   ↓
7. Muestra lista de tools expandible
```

### Escenario 3: Explorar tools

```
1. Lista de tools visible
   ↓
2. Click en tool → Expande accordion
   ↓
3. Muestra schema con parámetros
4. Badge "required" en campos obligatorios
```

---

## 🛠️ Cambios en mcpStore

**Verificar si existe `listTools`:**

```tsx
// En mcpStore.ts
interface MCPStore {
  // ... existing
  listTools: (serverId: string) => Promise<MCPTool[]>; // ¿Existe?
}
```

**Si NO existe, añadir:**

```tsx
listTools: async (serverId: string) => {
  try {
    const result = await window.levante.mcp.listTools(serverId);
    if (result.success && result.data) {
      return result.data;
    }
    return [];
  } catch (error) {
    console.error('Failed to list tools:', error);
    return [];
  }
}
```

---

## 📝 Implementación Paso a Paso

### Fase 1: Ampliar JSONEditorPanel
- [ ] Cambiar width de 600px a 900px
- [ ] Crear grid de 2 columnas (50/50)
- [ ] Mover JSON editor a columna izquierda
- [ ] Preparar columna derecha para preview

### Fase 2: Crear MCPServerPreview
- [ ] Crear componente base
- [ ] Integrar Card con header (nombre + badge)
- [ ] Botón Test Connection
- [ ] Estados: not tested, testing, success, error
- [ ] Pasar props desde JSONEditorPanel

### Fase 3: Crear MCPToolsList
- [ ] Componente con Accordion de shadcn/ui
- [ ] Item por cada tool
- [ ] Loading state con spinner
- [ ] Empty state si no hay tools

### Fase 4: Crear MCPToolSchema
- [ ] Mostrar properties del schema
- [ ] Badge "required" en campos obligatorios
- [ ] Formato legible de tipos

### Fase 5: Integración completa
- [ ] handleTestConnection actualizado para cargar tools
- [ ] Estado tools[] en JSONEditorPanel
- [ ] Pasar tools a MCPServerPreview → MCPToolsList
- [ ] Verificar mcpStore tiene listTools()

### Fase 6: Testing
- [ ] Test con servidor válido (sequential-thinking)
- [ ] Test con JSON inválido
- [ ] Test con servidor que falla conexión
- [ ] Verificar lista de tools se expande correctamente
- [ ] Verificar schema se muestra bien

---

## 🎨 Estados del Preview

| Estado | Badge | Contenido |
|--------|-------|-----------|
| **No valid JSON** | - | "Enter valid JSON to preview" |
| **Valid, not tested** | Disconnected 🔴 | Botón "Test Connection" |
| **Testing** | Connecting 🟡 | Spinner en botón |
| **Test Success** | Connected 🟢 | Tools list expandible |
| **Test Failed** | Error 🔴 | Alert con mensaje de error |

---

## 📦 Tipos a Añadir/Verificar

```typescript
// En src/renderer/types/mcp.ts

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}
```

---

## 💡 Mejoras Futuras (Opcionales)

1. **Search tools**: Input para filtrar tools por nombre
2. **Copy tool name**: Botón para copiar nombre del tool al clipboard
3. **Try tool**: Mini formulario para probar el tool directamente
4. **Tool statistics**: Mostrar cuántas veces se ha usado cada tool
5. **Favoritos**: Marcar tools favoritos

---

## 🔍 Ejemplo Visual Completo

```
┌────────────────────────────────────────────────────────────────────┐
│  Configure Sequential Thinking                                      │
├────────────────────────┬───────────────────────────────────────────┤
│                        │                                           │
│ Server Configuration   │  Server Preview                           │
│ (JSON)                 │                                           │
│                        │  ┌─────────────────────────────────────┐ │
│ {                      │  │ Sequential Thinking        [🟢 Live] │ │
│   "type": "stdio",     │  │ @modelcontextprotocol/server-seq... │ │
│   "command": "npx",    │  │                                     │ │
│   "args": [            │  │ [✓ Test Connection Successful]      │ │
│     "-y",              │  │                                     │ │
│     "@modelcontext..." │  │ ▼ Tools (1)                         │ │
│   ],                   │  │                                     │ │
│   "env": {}            │  │   ▶ sequentialThinking              │ │
│ }                      │  │       Advanced problem-solving...   │ │
│                        │  │                                     │ │
│ ✓ Valid JSON           │  │   [Click to expand schema]          │ │
│                        │  └─────────────────────────────────────┘ │
├────────────────────────┴───────────────────────────────────────────┤
│  [Cancel] [Save]                                                   │
└────────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ Consideraciones

1. **Performance**: Si hay muchos tools (>20), considerar virtualización
2. **Responsive**: En mobile, apilar columnas verticalmente
3. **Error handling**: Si listTools falla, mostrar mensaje claro
4. **Loading states**: Spinners claros durante test y load tools
5. **Accessibility**: Accordion keyboard navigable

---

## 🚀 Resultado Esperado

**Antes:**
- Panel angosto (600px)
- Test Connection en footer
- Sin preview del servidor
- Sin visualización de tools

**Después:**
- Panel amplio (900px+)
- Split view: JSON | Preview
- Test Connection integrado en preview
- Lista interactiva de tools con schemas
- UX más rica y profesional
