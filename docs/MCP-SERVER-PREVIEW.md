# MCP Server Preview Component

## 📋 Descripción

El **Server Preview** es un sistema de componentes que permite visualizar y validar la configuración de un servidor MCP antes de guardarlo. Muestra información en tiempo real sobre el estado de conexión y las herramientas disponibles.

---

## 🏗️ Arquitectura de Componentes

```
JSONEditorPanel
├── JSON Editor (left 50%)
│   ├── Textarea (JSON config)
│   └── Validation Alert
│
└── MCPServerPreview (right 50%)
    ├── Server Header (name + status badge)
    ├── Conditional Content:
    │   ├── Invalid JSON → Message
    │   ├── Valid JSON → Test Connection Button
    │   ├── Testing → Spinner
    │   ├── Success → MCPToolsList
    │   └── Error → Error Alert
    │
    └── MCPToolsList
        └── Accordion Items
            ├── Tool Name + Description
            └── MCPToolSchema (expandable)
                └── Parameters Details
```

---

## 🧩 Componentes

### 1. **JSONEditorPanel** (Parent)
**Ubicación:** `src/renderer/components/mcp/config/json-editor-panel.tsx`

**Responsabilidades:**
- Manejar edición del JSON
- Validar sintaxis y campos requeridos
- Ejecutar test de conexión
- Gestionar estado de tools y resultados

**Estados clave:**
```tsx
const [jsonText, setJsonText] = useState('');              // JSON editado
const [jsonError, setJsonError] = useState<string | null>(); // Error validación
const [isTestingConnection, setIsTestingConnection] = useState(false);
const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>();
const [tools, setTools] = useState<MCPTool[]>([]);         // Tools del servidor
const [isLoadingTools, setIsLoadingTools] = useState(false);
```

**Flujo de Test Connection:**
```tsx
handleTestConnection() {
  1. Validar JSON
  2. Llamar window.levante.mcp.testConnection(config)
  3. Recibir { success: boolean, data?: MCPTool[], error?: string }
  4. Actualizar testResult y tools
}
```

---

### 2. **MCPServerPreview**
**Ubicación:** `src/renderer/components/mcp/config/mcp-server-preview.tsx`

**Props:**
```tsx
interface MCPServerPreviewProps {
  serverName: string;                    // Nombre del servidor
  isValidJSON: boolean;                  // Si el JSON es válido
  testResult: { success: boolean; message: string } | null;
  tools: MCPTool[];                      // Lista de tools
  isTestingConnection: boolean;          // Si está testeando
  isLoadingTools: boolean;               // Si está cargando tools
  onTestConnection: () => void;          // Callback para test
}
```

**Estados del Badge:**
| Condición | Variant | Icono | Texto |
|-----------|---------|-------|-------|
| No testeado | `outline` | - | Not tested |
| Conectando | `secondary` | Loader2 | Connecting... |
| Éxito | `default` | CheckCircle | Connected |
| Error | `destructive` | AlertCircle | Error |

**Lógica de Renderizado:**
```tsx
{!isValidJSON && <Message>Enter valid JSON...</Message>}

{isValidJSON && !testResult && <Button>Test Connection</Button>}

{testResult?.success && (
  <>
    <Alert variant="success">Connection successful!</Alert>
    <MCPToolsList tools={tools} isLoading={isLoadingTools} />
    <Button variant="outline">Test Again</Button>
  </>
)}

{testResult && !testResult.success && (
  <>
    <Alert variant="destructive">{testResult.message}</Alert>
    <Button variant="outline">Retry Connection</Button>
  </>
)}
```

---

### 3. **MCPToolsList**
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
<div>
  <h4>Tools ({tools.length})</h4>

  <Accordion type="single" collapsible>
    {tools.map(tool => (
      <AccordionItem key={tool.name} value={tool.name}>
        <AccordionTrigger>
          <span>{tool.name}</span>
          <Badge>{required.length} required</Badge>
          <p className="text-muted-foreground">{tool.description}</p>
        </AccordionTrigger>

        <AccordionContent>
          <MCPToolSchema schema={tool.inputSchema} />
        </AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
</div>
```

**Estados especiales:**
- Loading: Muestra spinner
- Empty: "No tools available"

---

### 4. **MCPToolSchema**
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

**Renderizado de Parámetros:**
```tsx
{Object.entries(schema.properties).map(([key, value]) => (
  <div key={key}>
    <span className="font-mono">{key}</span>

    {/* Badges */}
    {schema.required?.includes(key) && (
      <Badge variant="destructive">required</Badge>
    )}
    {value.type && <Badge variant="outline">{value.type}</Badge>}

    {/* Metadata */}
    <p className="text-muted-foreground">{value.description}</p>
    {value.enum && <span>Enum: {value.enum.join(', ')}</span>}
    {value.default !== undefined && <span>Default: {value.default}</span>}
    {value.items && <span>Items: {value.items.type}</span>}
  </div>
))}
```

---

## 🔄 Flujo de Datos Completo

### Escenario: Usuario testea conexión de Sequential Thinking

```
1. Usuario edita JSON:
   {
     "type": "stdio",
     "command": "npx",
     "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
     "env": {}
   }

2. JSONEditorPanel valida en tiempo real:
   ✓ Sintaxis JSON correcta
   ✓ Campo "type" presente
   ✓ Campo "command" presente (para stdio)
   → isValidJSON = true

3. MCPServerPreview muestra:
   - Server name: "Sequential Thinking"
   - Badge: "Not tested" (outline)
   - Button: "Test Connection"

4. Usuario hace click en "Test Connection"

5. JSONEditorPanel ejecuta:
   handleTestConnection() {
     setIsTestingConnection(true);
     setIsLoadingTools(true);

     const result = await window.levante.mcp.testConnection(config);

     setTestResult({ success: true, message: "..." });
     setTools(result.data); // [{ name: "sequentialThinking", ... }]

     setIsTestingConnection(false);
     setIsLoadingTools(false);
   }

6. IPC Main Process:
   - Crea ID temporal: "test-1736956200000"
   - Conecta al servidor MCP
   - Lista tools disponibles
   - Desconecta servidor
   - Retorna { success: true, data: [tools...] }

7. MCPServerPreview actualiza:
   - Badge: "Connected" (default + CheckCircle)
   - Alert verde: "Connection test successful!"
   - MCPToolsList con 1 tool

8. MCPToolsList renderiza:
   Tools (1)

   ▶ sequentialThinking
     Advanced problem-solving through thoughts
     [2 required]

     [Click para expandir]

9. Usuario expande el accordion

10. MCPToolSchema muestra:
    Parameters:

    ├─ thought (required) - string
    │  Your current thinking step
    │
    ├─ nextThoughtNeeded (required) - boolean
    │  Whether another thought step is needed
    │
    ├─ thoughtNumber (required) - integer
    │  Current thought number (minimum: 1)
    │
    └─ totalThoughts (required) - integer
       Estimated total thoughts needed
```

---

## 🎯 Estados del Preview

### Estado 1: JSON Inválido
```tsx
isValidJSON = false
```
**UI:**
```
┌─────────────────────────────────┐
│ Sequential Thinking             │
├─────────────────────────────────┤
│ ⓘ Enter valid JSON config...   │
└─────────────────────────────────┘
```

---

### Estado 2: JSON Válido, No Testeado
```tsx
isValidJSON = true
testResult = null
```
**UI:**
```
┌─────────────────────────────────┐
│ Sequential Thinking  [Not tested]│
├─────────────────────────────────┤
│ Configuration looks valid.      │
│ Test connection to verify...    │
│                                 │
│ [Test Connection]               │
└─────────────────────────────────┘
```

---

### Estado 3: Conectando
```tsx
isTestingConnection = true
```
**UI:**
```
┌─────────────────────────────────┐
│ Sequential Thinking  [⟳ Connecting...]│
├─────────────────────────────────┤
│ [⟳ Testing Connection...]       │
└─────────────────────────────────┘
```

---

### Estado 4: Conexión Exitosa
```tsx
testResult = { success: true, message: "..." }
tools = [{ name: "sequentialThinking", ... }]
```
**UI:**
```
┌─────────────────────────────────┐
│ Sequential Thinking  [✓ Connected]│
├─────────────────────────────────┤
│ ✓ Connection test successful!   │
│                                 │
│ ▼ Tools (1)                     │
│                                 │
│   ▶ sequentialThinking          │
│     Advanced problem-solving... │
│                                 │
│ [Test Again]                    │
└─────────────────────────────────┘
```

---

### Estado 5: Error de Conexión
```tsx
testResult = { success: false, message: "Connection failed..." }
```
**UI:**
```
┌─────────────────────────────────┐
│ Sequential Thinking  [✗ Error]  │
├─────────────────────────────────┤
│ ✗ Connection test failed.       │
│   Please check your config...   │
│                                 │
│ [Retry Connection]              │
└─────────────────────────────────┘
```

---

## 🔌 IPC Backend

### `test-connection`
**Handler:** `src/main/ipc/mcpHandlers.ts:180-219`

**Input:**
```tsx
config: MCPServerConfig {
  id: string;        // Temporal: "test-1736956200000"
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  baseUrl?: string;
  headers?: Record<string, string>;
}
```

**Output:**
```tsx
{
  success: boolean;
  data?: MCPTool[];  // Lista de tools si success=true
  error?: string;    // Mensaje de error si success=false
}
```

**Proceso interno:**
```typescript
1. Crear ID temporal: `test-${Date.now()}`
2. Conectar servidor: await mcpService.connectServer(testConfig)
3. Listar tools: const tools = await mcpService.listTools(testId)
4. Desconectar: await mcpService.disconnectServer(testId)
5. Retornar: { success: true, data: tools }
```

**Timeout:** 15 segundos
**Cleanup:** Siempre desconecta el servidor, incluso si hay error

---

## 📦 Tipos TypeScript

### MCPTool
```tsx
interface MCPTool {
  name: string;
  description: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, {
      type: string;
      description?: string;
      enum?: any[];
      default?: any;
      items?: { type: string };
      minimum?: number;
      maximum?: number;
    }>;
    required?: string[];
  };
}
```

### MCPServerConfig
```tsx
interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  baseUrl?: string;
  headers?: Record<string, string>;
}
```

---

## 🎨 Estilos y UX

### Colores Semánticos
- **Success:** Verde (`bg-green-50`, `text-green-800`, `border-green-200`)
- **Error:** Rojo (`variant="destructive"`)
- **Info:** Gris (`text-muted-foreground`)
- **Loading:** Azul (`text-blue-600`)

### Animaciones
- **Spinner:** `animate-spin` en botones de test y loading
- **Accordion:** Transición suave al expandir/contraer

### Espaciado
- Grid: `gap-6` entre columnas
- Cards: `p-4` interno
- Lists: `space-y-3` entre items

---

## 🧪 Testing Manual

### Caso 1: Servidor Válido
```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  "env": {}
}
```
**Resultado esperado:** ✓ Connected, 1 tool (sequentialThinking)

---

### Caso 2: JSON Inválido (sintaxis)
```json
{
  "type": "stdio"
  "command": "npx"  // Falta coma
}
```
**Resultado esperado:** Error de validación, preview muestra mensaje

---

### Caso 3: Campos Faltantes
```json
{
  "command": "npx"
  // Falta "type"
}
```
**Resultado esperado:** "Missing required field: type"

---

### Caso 4: Servidor Inexistente
```json
{
  "type": "stdio",
  "command": "nonexistent-command",
  "args": [],
  "env": {}
}
```
**Resultado esperado:** ✗ Error, mensaje de timeout o fallo de conexión

---

## 💡 Mejoras Futuras

1. **Cache de tools:** Guardar tools en localStorage para mostrar instantáneamente
2. **Search tools:** Input para filtrar tools por nombre
3. **Copy tool name:** Botón para copiar al clipboard
4. **Tool playground:** Formulario para probar tools directamente
5. **Diff viewer:** Comparar config actual vs nueva al editar
6. **Syntax highlighting:** Colorear JSON en el editor
7. **Auto-format:** Botón para formatear JSON automáticamente
8. **Template selector:** Dropdown con templates predefinidos

---

## 🐛 Troubleshooting

### "No tools available"
**Causa:** El servidor se desconectó antes de listar tools
**Solución aplicada:** `test-connection` ahora retorna tools directamente

### Timeout en test connection
**Causa:** Servidor tarda >15s en responder
**Solución:** Verificar que `transport` coincida con el servidor (stdio/http/sse)

### Badge no actualiza
**Causa:** Estado `testResult` no se está actualizando correctamente
**Debug:** Verificar que `setTestResult` se llama con valores correctos

### Tools no se expanden
**Causa:** `inputSchema` es `undefined` o no tiene `properties`
**Solución:** MCPToolSchema muestra "No parameters required" si falta schema
