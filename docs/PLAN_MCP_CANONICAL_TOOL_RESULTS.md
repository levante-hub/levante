# Runbook de implementación — Canonicalización de tool results MCP con imágenes

**Fecha:** 2026-04-14  
**Estado del documento:** listo para implementar  
**Objetivo:** eliminar el doble formato de resultados de tools MCP con imágenes, evitar persistir base64 en historial y hacer que la misma conversión a formato de modelo se use tanto en ejecución viva como en replay desde historial.

## 1. Principio de ejecución

Este documento es el runbook completo de implementación.  
Si una tarea no aparece aquí, **no forma parte del trabajo**.

El fix debe cumplir simultáneamente estas condiciones:

1. Un resultado de tool MCP con imágenes se transforma **una sola vez** al entrar al historial.
2. El historial persistido **no contiene base64 raw** de imágenes MCP.
3. La conversión a formato para provider/modelo usa **una sola fuente de verdad**.
4. El replay desde historial y la ejecución viva producen el **mismo `ToolResultOutput` efectivo**.
5. Los historiales ya persistidos con el formato legacy que aún contenga `images[]` siguen funcionando y se normalizan sin romper conversaciones existentes.
6. La solución no depende de “arreglar en caliente” el replay con una segunda implementación del resize.

## 2. Diagnóstico verificado en el repositorio

### 2.1. El bug no está en el origen MCP, está en la persistencia y el replay

Hoy `chrome-devtools_take_screenshot` sí entra por `getMCPTools(...)` en:

- `src/main/services/aiService.ts`

Y el adapter MCP sí sabe producir salida multimodal válida para AI SDK en:

- `src/main/services/ai/mcpToolsAdapter.ts`

`createAISDKTool(...).toModelOutput(...)` ya convierte el formato transitorio rico actual a:

```ts
{
  type: "content",
  value: [
    { type: "text", text: "..." },
    { type: "image-data", data: "...", mediaType: "image/png" },
  ],
}
```

### 2.2. El replay actual esquiva `toModelOutput()`

En `aiService` se llama hoy:

```ts
const modelMessages = await convertToModelMessages(sanitizedMessages);
```

sin pasar `options.tools`.

Eso hace que `convertToModelMessages()` no use `tool.toModelOutput(...)` para los `tool-result` históricos y caiga al fallback string/json del AI SDK.

Archivo afectado:

- `src/main/services/aiService.ts`

### 2.3. El historial sigue guardando imágenes raw en `tool_calls`

Hoy el renderer persiste:

- `part.output` casi tal cual
- solo limpia `content[].image`
- **no limpia `images[].data`**

Esto ocurre en:

- `src/renderer/stores/chatStore.ts`
- `src/shared/toolOutputSanitizer.ts`

Efecto:

1. la DB puede contener base64 enorme;
2. al rehidratar mensajes desde DB, ese payload vuelve a `part.output`;
3. el siguiente turno puede reinyectarlo al modelo.

### 2.4. La rehidratación desde DB reconstruye `tool-{name}` genérico

Al leer historial, `chatStore` hace:

```ts
parts.push({
  type: `tool-${tc.name}`,
  toolCallId: tc.id,
  toolName: tc.name,
  input: tc.arguments,
  output: tc.result,
  state: 'output-available',
});
```

Archivo afectado:

- `src/renderer/stores/chatStore.ts`

Esto es válido como contenedor UI, pero exige que `tc.result` ya sea un formato persistido limpio y canónico.

### 2.5. La raíz del problema es la coexistencia de dos formatos

Hoy conviven estos dos formatos:

1. **Formato transitorio de ejecución viva del adapter MCP**: objeto rico con texto y lista derivada de imágenes.
2. **Formato persistido/replayado**: `tool-{name}` genérico con `output` serializado.

El adapter MCP solo actúa en la ruta viva.  
El replay usa el `output` persistido como fuente y por eso reinyecta base64.

## 3. Decisión de diseño

La implementación correcta para Levante será esta:

1. **Introducir un formato canónico interno de tool result persistido**.
2. **Persistir imágenes MCP a disco por handle determinista**, no en `tool_calls`.
3. **Hacer que `toModelOutput()` sea la única fuente de verdad** para convertir el resultado canónico a `ToolResultOutput`.
4. **Pasar siempre `tools` a `convertToModelMessages(...)`**, para que el replay use el mismo `toModelOutput()` que la ejecución viva.
5. **Mantener compatibilidad temporal con outputs legacy que aún contengan `images[]`**, pero solo como lectura/transición.
6. **Eliminar `images[]` del formato nuevo**, tanto en persistencia como en el contrato interno compartido.
7. **Normalizar perezosamente** historiales legacy al leerlos y al volver a persistirlos.

Consecuencia de diseño:

- `images[]` deja de existir como salida nueva de `processToolResult()`.
- `images[]` deja de existir como contrato compartido entre main, renderer y replay.
- solo se acepta como forma legacy de entrada durante la migración.

### 3.1. Qué NO se va a hacer

No se va a:

- reimplementar resize en `sanitizeMessagesForModel()`;
- mantener `images[]` como formato nuevo del proyecto;
- hacer un “si aparece una lista legacy de imágenes entonces convierto a image-data aquí mismo” duplicando lógica;
- persistir `ContentBlockParam[]` provider-específico;
- guardar rutas absolutas o base64 raw en DB.

## 4. Formato canónico exacto

Se añade un formato versionado y provider-agnostic:

**Archivo nuevo:**

- `src/shared/canonicalToolResult.ts`

```ts
export const CANONICAL_TOOL_RESULT_VERSION = 1 as const;

export interface CanonicalImageAssetRef {
  kind: "image-ref";
  assetId: string;          // sha256 estable
  mediaType: string;        // image/png, image/jpeg...
  byteSize: number;         // bytes reales del fichero
  base64Length: number;     // tamaño equivalente si se rehidrata
  sha256: string;
  width?: number;
  height?: number;
}

export type CanonicalToolModelPart =
  | {
      type: "text";
      text: string;
    }
  | CanonicalImageAssetRef;

export type CanonicalToolModelOutput =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "json";
      value: unknown;
    }
  | {
      type: "content";
      value: CanonicalToolModelPart[];
    };

export interface CanonicalToolResultV1 {
  __levanteToolResult: 1;
  text?: string; // resumen para UI / fallback sin visión
  structuredContent?: Record<string, unknown>;
  uiResources?: unknown[];
  content?: unknown[]; // content[] saneado, nunca base64 raw
  modelOutput: CanonicalToolModelOutput;
}
```

### 4.1. Invariantes del formato canónico

1. `modelOutput` es la representación semántica canónica del resultado.
2. `content` solo existe para compatibilidad/render/widget y jamás lleva base64 raw.
3. `uiResources` sigue disponible para widgets.
4. Las imágenes no viajan como `images[].data` persistido.
5. `images[]` queda prohibido como salida nueva; solo puede aparecer como input legacy a migrar.
6. El único lugar donde reaparece base64 de imagen es en la materialización final a `image-data` para el provider.
7. `text` es siempre fallback útil para UI y modelos sin visión.

## 5. Alcance exacto

### 5.1. Archivos nuevos

- `docs/PLAN_MCP_CANONICAL_TOOL_RESULTS.md`
- `src/shared/canonicalToolResult.ts`
- `src/main/services/toolResults/toolResultAssetStore.ts`
- `src/main/services/toolResults/canonicalToolResultService.ts`
- `src/main/services/toolResults/historicalToolReplayTools.ts`
- `src/main/services/toolResults/__tests__/toolResultAssetStore.test.ts`
- `src/main/services/toolResults/__tests__/canonicalToolResultService.test.ts`
- `src/main/services/ai/__tests__/historicalToolReplay.test.ts`

### 5.2. Archivos modificados

- `src/main/services/ai/mcpToolsAdapter.ts`
- `src/main/services/ai/toolMessageSanitizer.ts`
- `src/main/services/aiService.ts`
- `src/main/services/chatService.ts`
- `src/types/database.ts`
- `src/renderer/stores/chatStore.ts`
- `src/shared/toolOutputSanitizer.ts`
- `src/main/services/compactionService.ts`
- `src/main/services/ai/__tests__/mcpToolsAdapter.image.test.ts`
- `src/main/services/ai/__tests__/toolMessageSanitizer.test.ts`

### 5.3. Fuera de alcance

- migración SQL de esquema: `tool_calls` sigue siendo `TEXT`;
- rediseño de widgets MCP-UI;
- preview visual de screenshots en chat;
- migración offline de toda la base histórica en una sola pasada al arrancar.

## 6. Estrategia general de implementación

La solución tendrá cuatro capas:

1. **Canonicalización** del resultado rico en main.
2. **Persistencia a disco** de imágenes por handle.
3. **Materialización a `ToolResultOutput`** con un helper único.
4. **Replay con `convertToModelMessages(..., { tools })`** usando tools reales o adapters históricos.

## 7. Paso a paso

### Paso 1 — Añadir el schema canónico compartido

**Archivo nuevo:**

- `src/shared/canonicalToolResult.ts`

**Implementar:**

1. Tipos `CanonicalToolResultV1`, `CanonicalImageAssetRef`, `CanonicalToolModelOutput`.
2. Guards:

```ts
export function isCanonicalToolResult(value: unknown): value is CanonicalToolResultV1;
export function isCanonicalImageRef(value: unknown): value is CanonicalImageAssetRef;
```

3. Helpers de legacy:

```ts
export function looksLikeLegacyRichToolOutput(value: unknown): boolean;
export function extractLegacyImages(value: unknown): Array<{ data: string; mediaType: string }>;
```

**Objetivo:** que todo el código deje de adivinar por forma informal si un output es canónico o legacy.

### Paso 2 — Crear el store de assets para imágenes MCP

**Archivo nuevo:**

- `src/main/services/toolResults/toolResultAssetStore.ts`

**Responsabilidad:**

- persistir bytes redimensionados a disco con nombre determinista;
- leerlos para rehidratación;
- borrar assets huérfanos conocidos.

**Ubicación en disco:**

```ts
app.getPath("userData") + "/tool-result-assets/images"
```

**API a implementar:**

```ts
export interface PersistedImageAsset {
  assetId: string; // sha256
  sha256: string;
  mediaType: string;
  byteSize: number;
  base64Length: number;
  width?: number;
  height?: number;
}

export async function persistImageAsset(params: {
  dataBase64: string;
  mediaType: string;
}): Promise<PersistedImageAsset>;

export async function readImageAsset(params: {
  assetId: string;
  mediaType: string;
}): Promise<{ dataBase64: string; mediaType: string }>;

export async function deleteImageAssetsIfUnused(assetIds: string[]): Promise<void>;
```

**Reglas obligatorias:**

1. usar `sha256(bytes)` como `assetId`;
2. escribir con `flag: "wx"` o estrategia equivalente idempotente;
3. no guardar path absoluto en DB;
4. deduplicar automáticamente si ya existe el asset;
5. mapear extensión a partir de `mediaType`.

### Paso 3 — Crear el servicio único de canonicalización y materialización

**Archivo nuevo:**

- `src/main/services/toolResults/canonicalToolResultService.ts`

**Responsabilidad:**

1. convertir outputs ricos legacy a formato canónico;
2. materializar formato canónico a `ToolResultOutput`;
3. mantener compatibilidad de lectura con outputs legacy que aún tengan `images[]`.

**API a implementar:**

```ts
import type { ToolResultOutput } from "@ai-sdk/provider-utils";
import type { CanonicalToolResultV1 } from "../../../shared/canonicalToolResult";

export async function canonicalizeRichToolOutput(params: {
  text?: string;
  structuredContent?: Record<string, unknown>;
  uiResources?: unknown[];
  content?: unknown[];
  legacyImages?: Array<{ data: string; mediaType: string }>;
}): Promise<CanonicalToolResultV1>;

export async function normalizeToolCallResultForStorage(
  value: unknown,
): Promise<{ normalized: unknown; changed: boolean; assetIds: string[] }>;

export async function materializeToolResultForModel(params: {
  output: unknown;
  supportsVision: boolean;
}): Promise<ToolResultOutput>;
```

**Reglas de `materializeToolResultForModel(...)`:**

1. Si el output es canónico con `modelOutput.type === "content"` y `supportsVision === true`:

```ts
return {
  type: "content",
  value: [
    { type: "text", text: "..." },
    { type: "image-data", data: "...", mediaType: "image/png" },
  ],
};
```

2. Si es canónico y `supportsVision === false`:

```ts
return {
  type: "text",
  value: output.text || "[Tool returned images, but the active model does not support vision.]",
};
```

3. Si el output es legacy y aún trae `images[]`, convertirlo temporalmente con la misma semántica.
4. Si es `structuredContent`/`json`, devolver `type: "json"`.
5. Si es string, devolver `type: "text"`.

**Importante:**  
La compatibilidad legacy solo materializa.  
La canonicalización/storage debe reescribir legacy a canónico cuando toque persistir.

### Paso 4 — Cambiar `mcpToolsAdapter` para producir formato canónico

**Archivo modificado:**

- `src/main/services/ai/mcpToolsAdapter.ts`

**Cambios obligatorios:**

1. Dejar de devolver cualquier objeto nuevo que exponga `images[]`.
2. Después de construir `text`, `uiResources`, `structuredContent`, `content` saneado e `imageParts`, llamar a:

```ts
return await canonicalizeRichToolOutput({
  text,
  content: result.content,
  structuredContent: result.structuredContent,
  ...(uiResources.length > 0 ? { uiResources } : {}),
  ...(imageParts.length > 0 ? { legacyImages: imageParts } : {}),
});
```

3. Reemplazar la lógica actual de `toModelOutput(...)` por delegación al helper único:

```ts
toModelOutput: async ({ output }) => {
  return materializeToolResultForModel({
    output,
    supportsVision,
  });
},
```

4. Mantener el TODO de budget fuera de este PR solo si no se toca; si se mantiene, documentarlo como deuda separada y no mezclarlo con esta implementación.

**Resultado esperado:**

- la ejecución viva y el replay usan la misma ruta de materialización;
- `processToolResult()` deja de emitir base64 persistible.

### Paso 5 — Hacer que `convertToModelMessages()` use realmente las tools

**Archivo modificado:**

- `src/main/services/aiService.ts`

**Cambios obligatorios:**

Reemplazar:

```ts
const modelMessages = await convertToModelMessages(sanitizedMessages);
```

por:

```ts
const replayTools = await buildHistoricalReplayTools({
  messages: sanitizedMessages,
  liveTools: tools,
  supportsVision: modelInfo?.capabilities?.supportsVision === true,
});

const modelMessages = await convertToModelMessages(sanitizedMessages, {
  tools: replayTools,
});
```

Y análogamente en `sendSingleMessage(...)`:

```ts
const singleMsgReplayTools = await buildHistoricalReplayTools({
  messages: singleMsgSanitized,
  liveTools: allSingleMsgTools,
  supportsVision: modelInfo?.capabilities?.supportsVision === true,
});

const singleMsgModelMessages = await convertToModelMessages(singleMsgSanitized, {
  tools: singleMsgReplayTools,
});
```

### Paso 6 — Añadir adapters históricos para tools ausentes

**Archivo nuevo:**

- `src/main/services/toolResults/historicalToolReplayTools.ts`

**Motivación:**

Si un historial contiene un tool result canónico pero la tool ya no está disponible, `convertToModelMessages(..., { tools })` no podrá llamar al `toModelOutput()` original.

**API:**

```ts
export async function buildHistoricalReplayTools(params: {
  messages: Array<{ role: string; parts?: unknown[] }>;
  liveTools: Record<string, any>;
  supportsVision: boolean;
}): Promise<Record<string, any>>;
```

**Comportamiento:**

1. clonar `liveTools`;
2. escanear `messages` buscando `tool-*` / `tool-invocation` con `output-available`;
3. si `toolName` no existe en `liveTools` y el output es canónico o legacy rico, registrar un adapter mínimo:

```ts
tools[toolName] = {
  type: "dynamic",
  description: "Historical tool replay adapter",
  inputSchema: jsonSchema({ type: "object", additionalProperties: true }),
  async toModelOutput({ output }) {
    return materializeToolResultForModel({
      output,
      supportsVision: params.supportsVision,
    });
  },
};
```

**Objetivo:**  
Que el replay no dependa de que la tool MCP siga conectada para reconstruir outputs históricos.

### Paso 7 — Reducir `toolMessageSanitizer` a limpieza, no transformación semántica

**Archivo modificado:**

- `src/main/services/ai/toolMessageSanitizer.ts`

**Cambio de criterio:**

`sanitizeMessagesForModel()` ya no debe “interpretar” imágenes.  
Su trabajo será:

1. normalizar estados de tool (`approval-requested`, `output-error`, etc.);
2. retirar `providerMetadata` problemática;
3. preservar `CanonicalToolResultV1` intacto;
4. dejar compatibilidad legacy mínima sin introducir una segunda ruta semántica.

**Cambios obligatorios:**

1. Si `part.output` es canónico, **devolverlo sin modificar**.
2. Si `part.output` es legacy con `uiResources` o `images[]`, mantener solo una ruta de compatibilidad temporal:
   - conservar `text`;
   - conservar `structuredContent`;
   - conservar `uiResources`;
   - no producir ni persistir un formato nuevo con `images[]`;
   - **no** inventar `image-data` aquí.
3. Añadir comentario explícito:

```ts
// IMPORTANT:
// Tool output semantic conversion happens in materializeToolResultForModel()
// via tool.toModelOutput(). This sanitizer must not duplicate image handling.
```

### Paso 8 — Mover la normalización persistida al main process

**Archivo modificado:**

- `src/main/services/chatService.ts`

**Objetivo:**  
Garantizar que la DB nunca guarde nuevo base64 raw aunque un caller siga enviando formato legacy.

**Cambios obligatorios en `createMessage(...)`:**

Antes de `JSON.stringify(input.tool_calls)`:

```ts
const normalizedToolCalls = input.tool_calls
  ? await normalizeToolCallsForStorage(input.tool_calls)
  : null;
```

Y persistir `normalizedToolCalls.value`.

**Cambios obligatorios en `updateMessage(...)`:**

1. normalizar `tool_calls` nuevos;
2. calcular assets candidatos a borrar comparando old/new;
3. tras update, borrar assets ya no referenciados si quedaron huérfanos.

**Cambios obligatorios en `getMessages(...)` y `searchMessages(...)`:**

1. parsear `tool_calls`;
2. si contienen formato legacy rico, normalizarlos a canónico;
3. reescribir la fila en DB si hubo cambios;
4. devolver al renderer el JSON ya reescrito.

**Importante:**  
Esto sustituye la necesidad de una migración SQL/DDL.  
La migración será **lazy, idempotente y en main process**.

### Paso 9 — Ajustar tipos de DB

**Archivo modificado:**

- `src/types/database.ts`

**Cambios obligatorios:**

Introducir tipos explícitos para `tool_calls`:

```ts
export interface PersistedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: string;
}

export interface CreateMessageInput {
  ...
  tool_calls?: PersistedToolCall[] | null;
}

export interface UpdateMessageInput {
  ...
  tool_calls?: PersistedToolCall[];
}
```

**Objetivo:**  
Dejar de tratar `tool_calls` como `object[]` sin contrato.

### Paso 10 — Ajustar persistencia en renderer para no volver a mutar el formato canónico

**Archivo modificado:**

- `src/renderer/stores/chatStore.ts`

**Cambios obligatorios:**

1. Al persistir `tool_calls`, si `part.output` es canónico, guardarlo tal cual.
2. Mantener `sanitizeToolOutput(...)` solo como compatibilidad para outputs legacy no canónicos.
3. Añadir comentario:

```ts
// New rich tool results are canonicalized in main before hitting the DB.
// Renderer must not re-shape canonical outputs or reintroduce inline base64.
```

4. En la rehidratación desde DB, seguir reconstruyendo:

```ts
{
  type: `tool-${tc.name}`,
  ...
  output: tc.result,
}
```

sin reinterpretar el contenido. El `output` ya debe venir limpio/canónico desde `chatService`.

### Paso 11 — Mantener `toolOutputSanitizer.ts` solo para compatibilidad legacy

**Archivo modificado:**

- `src/shared/toolOutputSanitizer.ts`

**Cambios obligatorios:**

1. Mantener `stripInlineImagesFromContent(...)`.
2. Documentar `sanitizeToolOutput(...)` como helper legacy/transicional.
3. No usar `sanitizeToolOutput(...)` como formato persistido nuevo.

**Comentario a añadir:**

```ts
// Legacy helper:
// kept only to neutralize old raw MCP content[] image blocks.
// New rich tool outputs must use CanonicalToolResultV1 instead.
```

### Paso 12 — Revisión mínima de compaction

**Archivo modificado:**

- `src/main/services/compactionService.ts`

**Cambio requerido:**

No cambiar la estrategia de compaction, pero sí asegurar que la serialización no vuelva a expandir payloads.

Añadir un helper:

```ts
function summarizeToolCallsForCompaction(toolCallsJson: string): string
```

Reglas:

1. Si detecta `CanonicalToolResultV1` con `image-ref`, serializar una forma breve:
   - tool name
   - `text`
   - número de imágenes
2. Nunca reinyectar bytes ni base64.

**Motivo:**  
Evitar que el contexto de compaction vuelva a inflarse por el JSON completo del resultado canónico.

### Paso 13 — Actualizar diagnósticos de contexto

**Archivo modificado:**

- `src/main/services/aiService.ts`

**Cambio requerido:**

Ampliar `collectImagePayloads(...)` para distinguir:

1. `tool-images` legacy con base64;
2. `tool-image-ref` canónico sin base64.

**Objetivo:**  
Que los logs posteriores permitan comprobar visualmente que:

- ya no aparecen `output.images[].data` en flujos nuevos;
- sí aparecen `image-ref` con `assetId`.

## 8. Código exacto a introducir en los puntos críticos

### 8.1. Forma final de `toModelOutput()` en `mcpToolsAdapter`

```ts
toModelOutput: async ({ output }) => {
  return materializeToolResultForModel({
    output,
    supportsVision,
  });
},
```

### 8.2. Forma final de `convertToModelMessages()` en `aiService`

```ts
const replayTools = await buildHistoricalReplayTools({
  messages: sanitizedMessages,
  liveTools: tools,
  supportsVision: modelInfo?.capabilities?.supportsVision === true,
});

const modelMessages = await convertToModelMessages(sanitizedMessages, {
  tools: replayTools,
});
```

### 8.3. Forma final del resultado rico persistido

```ts
{
  __levanteToolResult: 1,
  text: "Took a screenshot of the current page's viewport.",
  content: [
    { type: "text", text: "Took a screenshot of the current page's viewport." },
    { type: "image", mimeType: "image/png", omitted: true },
  ],
  modelOutput: {
    type: "content",
    value: [
      { type: "text", text: "Took a screenshot of the current page's viewport." },
      {
        kind: "image-ref",
        assetId: "8d1c...",
        mediaType: "image/png",
        byteSize: 690744,
        base64Length: 920992,
        sha256: "8d1c...",
        width: 1568,
        height: 876,
      },
    ],
  },
}
```

### 8.4. Forma final materializada para el modelo

```ts
{
  type: "content",
  value: [
    { type: "text", text: "Took a screenshot of the current page's viewport." },
    { type: "image-data", data: "<rehydrated-base64>", mediaType: "image/png" },
  ],
}
```

## 9. Compatibilidad hacia atrás

### 9.1. Historial legacy ya existente

Debe seguir funcionando sin migración destructiva.

Ruta obligatoria:

1. `chatService.getMessages()` detecta rows legacy;
2. las canonicaliza si puede;
3. reescribe la row;
4. devuelve ya el formato nuevo.

### 9.2. Si el tool ya no existe

`buildHistoricalReplayTools(...)` debe crear un adapter histórico mínimo para el replay.

### 9.3. Si un output legacy aparece en memoria antes de persistirse

`materializeToolResultForModel()` debe soportar temporalmente outputs legacy que aún incluyan `images[]`.

## 10. Gestión de orfandad de assets

Para no dejar deuda técnica, esta implementación debe incluir limpieza básica.

### 10.1. Casos a cubrir

1. update de mensaje que reemplaza `tool_calls`;
2. borrado de mensajes tras edición;
3. borrado de sesión;
4. migración lazy de rows legacy.

### 10.2. Estrategia

1. extraer `assetId`s antes y después del cambio;
2. calcular diferencia candidata;
3. comprobar si siguen referenciados en alguna otra row;
4. borrar solo los no referenciados.

**Nota:** no hace falta un GC global en este PR si estos cuatro casos quedan cubiertos.

## 11. Tests obligatorios

### 11.1. `toolResultAssetStore.test.ts`

Casos:

1. persiste asset nuevo y devuelve metadata correcta;
2. segunda escritura con mismo contenido reutiliza el mismo `assetId`;
3. `readImageAsset()` rehidrata el mismo base64;
4. `deleteImageAssetsIfUnused()` no borra si sigue referenciado;
5. borra si ya no existe referencia.

### 11.2. `canonicalToolResultService.test.ts`

Casos:

1. `canonicalizeRichToolOutput()` convierte un output legacy con `images[]` en `CanonicalToolResultV1`;
2. `materializeToolResultForModel()` devuelve `image-data` con visión;
3. degrada a `text` sin visión;
4. soporta input legacy con `images[]`;
5. soporta output canónico ya persistido sin cambiarlo.

### 11.3. `mcpToolsAdapter.image.test.ts`

Actualizar para verificar:

1. `processToolResult()` ya no devuelve `images[]` raw;
2. devuelve `CanonicalToolResultV1`;
3. `toModelOutput()` sigue produciendo `image-data`.

### 11.4. `historicalToolReplay.test.ts`

Nuevo test end-to-end mínimo:

1. construir `UIMessage` con part `tool-screenshot` y output canónico;
2. pasar por `sanitizeMessagesForModel()`;
3. llamar `convertToModelMessages(..., { tools: replayTools })`;
4. verificar que el `tool-result.output.type === "content"` y contiene `image-data`.

### 11.5. `toolMessageSanitizer.test.ts`

Actualizar para verificar:

1. output canónico se preserva intacto;
2. no reescribe `image-ref`;
3. la compatibilidad legacy sigue funcionando temporalmente.

### 11.6. `chatService` / persistencia

Añadir tests o cobertura equivalente para:

1. `createMessage()` canonicaliza antes de guardar;
2. `getMessages()` reescribe rows legacy;
3. `updateMessage()` libera assets huérfanos.

### 11.7. Verificación manual obligatoria

1. conversación nueva con `chrome-devtools_take_screenshot`;
2. enviar un segundo prompt en la misma conversación;
3. confirmar en logs:
   - no aparece `output.images[0].data`;
   - sí aparece `tool-image-ref` o equivalente;
4. recargar la conversación desde DB;
5. reenviar otro prompt;
6. confirmar que el replay sigue generando `image-data` en `modelMessages`.

## 12. Criterios de aceptación

El trabajo se considera cerrado solo si se cumplen todos:

1. No se persiste base64 raw de imágenes MCP en `messages.tool_calls`.
2. El replay usa `tool.toModelOutput()` real o adapter histórico equivalente.
3. `convertToModelMessages()` recibe `tools` en streaming y en `sendSingleMessage()`.
4. Las imágenes históricas entran al provider como `image-data`, no como JSON con base64.
5. Los historiales legacy siguen funcionando.
6. Los widgets MCP-UI siguen renderizando `uiResources`.
7. No se generan assets huérfanos al editar/borrar mensajes.
8. Los tests nuevos y existentes relevantes pasan.

## 13. Orden de implementación recomendado

Implementar en este orden exacto:

1. `src/shared/canonicalToolResult.ts`
2. `src/main/services/toolResults/toolResultAssetStore.ts`
3. `src/main/services/toolResults/canonicalToolResultService.ts`
4. `src/main/services/ai/mcpToolsAdapter.ts`
5. `src/main/services/toolResults/historicalToolReplayTools.ts`
6. `src/main/services/aiService.ts`
7. `src/main/services/chatService.ts`
8. `src/types/database.ts`
9. `src/renderer/stores/chatStore.ts`
10. `src/main/services/ai/toolMessageSanitizer.ts`
11. `src/shared/toolOutputSanitizer.ts`
12. `src/main/services/compactionService.ts`
13. tests unitarios
14. verificación manual con screenshot real

## 14. Resultado esperado final

Tras este cambio, el flujo será:

1. MCP devuelve imagen inline.
2. `processToolResult()` redimensiona y canonicaliza.
3. la imagen se guarda en disco por `assetId`.
4. el historial persiste solo el resultado canónico.
5. el renderer rehidrata ese resultado sin tocarlo.
6. `aiService` llama `convertToModelMessages(..., { tools })`.
7. `toModelOutput()` materializa desde handle a `image-data`.
8. el provider recibe multimodalidad real, no base64 embebido en JSON.

Ese es el criterio arquitectónico del fix:  
**un único formato persistido limpio, una única materialización al modelo, cero base64 raw en historial.**
