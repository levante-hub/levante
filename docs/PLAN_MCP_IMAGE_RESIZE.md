# Runbook de implementación — Resize y entrega multimodal de imágenes MCP

**Fecha:** 2026-04-14  
**Estado del documento:** corregido y listo para implementar  
**Objetivo:** evitar errores `prompt too long` y pérdida de multimodalidad cuando un tool MCP devuelve imágenes inline grandes, sin dejar trabajo implícito fuera de este plan.

## 1. Principio de ejecución

Este documento es el runbook completo de implementación.  
Si una tarea no aparece aquí, **no se considera parte del trabajo**.

El fix debe cubrir estos casos:

1. Tools MCP estándar que devuelven bloques `content[]` con imágenes inline.
2. Conversaciones nuevas y recargadas desde historial persistido.
3. Ambos backends MCP soportados por Levante:
   - `mcp-use`
   - `official-sdk`
4. Ejecución con `streamText()` y con `generateText()`.
5. Entorno empaquetado Electron + Forge + Vite.

## 2. Diagnóstico verificado en el repositorio

### 2.1. El problema real en `mcpToolsAdapter`

En [src/main/services/ai/mcpToolsAdapter.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/ai/mcpToolsAdapter.ts:963), `processToolResult()`:

1. No tiene rama específica para `item.type === "image"`.
2. Cualquier bloque desconocido cae en el `else` final y se serializa con `JSON.stringify(...)`.
3. Si el bloque contiene base64, ese base64 termina convertido en texto para el modelo.

Efecto actual:

- el modelo no recibe la imagen como imagen;
- el prompt crece con el base64 embebido;
- la petición puede fallar por contexto excesivo.

### 2.2. `toolMessageSanitizer` no preserva imágenes útiles

En [src/main/services/ai/toolMessageSanitizer.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/ai/toolMessageSanitizer.ts:121), el sanitizer:

- solo trata explícitamente outputs con `uiResources`;
- reconstruye texto útil desde `content[]`;
- no tiene ruta explícita para preservar un payload `images` pensado para `toModelOutput`.

Efecto actual:

- si empezamos a devolver imágenes procesadas en `part.output`, hay que preservar esa forma;
- si no, la recarga histórica romperá la multimodalidad.

### 2.3. Ambos servicios MCP pisan `content` cuando existe `structuredContent`

En [src/main/services/mcp/mcpUseService.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/mcp/mcpUseService.ts:446) y [src/main/services/mcp/mcpLegacyService.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/mcp/mcpLegacyService.ts:211), si existe `structuredContent`:

- se reemplaza `content` por un único bloque `text` con `JSON.stringify(structuredContent)`.

Eso es incorrecto para este fix porque:

1. puede ocultar imágenes o recursos embebidos presentes en `content[]`;
2. impide que `processToolResult()` vea el resultado MCP real;
3. afecta tanto a `mcp-use` como a `official-sdk`.

### 2.4. La persistencia actual guardaría demasiado payload

En [src/renderer/stores/chatStore.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/renderer/stores/chatStore.ts:500), el store persiste `part.output` entero dentro de `tool_calls.result`.

Si implementamos solo `images` comprimidas pero mantenemos `content` original con base64:

- guardaríamos la imagen original gigante;
- además guardaríamos la imagen ya comprimida;
- duplicaríamos tamaño en DB y en memoria;
- el historial seguiría siendo peligroso.

### 2.5. El empaquetado de `sharp` no está resuelto con tocar solo `asar.unpack`

Levante usa:

- `vite.main.config.ts` con `rollupOptions.external` ([vite.main.config.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/vite.main.config.ts:23));
- `forge.config.js` con copia manual de dependencias externas en `packageAfterCopy` ([forge.config.js](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/forge.config.js:16)).

Por tanto, añadir `sharp` a `package.json` no basta. Hay que decidir y documentar explícitamente:

1. si `sharp` será `external` en Vite;
2. cómo se copiarán `sharp` y `@img/*` al paquete;
3. cómo quedará `asar.unpack`.

### 2.6. El contrato correcto del AI SDK ya está disponible y hay que usarlo bien

La versión instalada es `ai@6.0.105` ([package.json](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/package.json:81)).

Según el SDK local:

- `toModelOutput` recibe `{ toolCallId, input, output }` ([node_modules/@ai-sdk/provider-utils/src/types/tool.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/node_modules/@ai-sdk/provider-utils/src/types/tool.ts:191));
- el content part correcto para imagen inline es `type: "image-data"` ([node_modules/@ai-sdk/provider-utils/src/types/content-part.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/node_modules/@ai-sdk/provider-utils/src/types/content-part.ts:311));
- `type: "media"` existe, pero está deprecado ([node_modules/@ai-sdk/provider-utils/src/types/content-part.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/node_modules/@ai-sdk/provider-utils/src/types/content-part.ts:246)).

## 3. Decisión de diseño

La implementación correcta será esta:

1. **Preservar `content[]` original** en los servicios MCP cuando exista.
   - `structuredContent` se sigue conservando aparte.
   - Solo se sintetiza texto desde `structuredContent` cuando `content` no exista o llegue vacío.

2. **Redimensionar imágenes MCP solo en el main process**.
   - Se usará `sharp`.
   - El resizer opera sobre bloques `{ type: "image", data, mimeType }`.

3. **Entregar las imágenes al modelo como resultado multimodal de tool**.
   - Se usará `toModelOutput`.
   - El part será `image-data`.

4. **Persistir solo output saneado**.
   - Nunca guardar en DB el bloque raw de imagen grande si ya existe una versión comprimida.
   - El historial debe contener una representación segura y rehidratable.

5. **Aplicar un safety-net pre-request**.
   - Debe cubrir:
     - imágenes en outputs de tools;
     - imágenes de usuario en `file/url` con data URLs base64.

6. **Degradar limpiamente en modelos sin visión**.
   - Si el modelo activo no soporta visión, el output para modelo debe convertirse a texto placeholder.
   - La UI e historial pueden seguir mostrando el resultado saneado.

## 4. Alcance exacto de implementación

### 4.1. En alcance

- `package.json`
- `vite.main.config.ts`
- `forge.config.js`
- `src/main/types/mcp.ts`
- `src/main/services/mcp/mcpUseService.ts`
- `src/main/services/mcp/mcpLegacyService.ts`
- `src/main/services/mcp/shared/normalizeToolResult.ts` (nuevo, helper compartido)
- `src/main/services/image/providerImageLimits.ts` (antes `apiLimits.ts`)
- `src/main/services/image/imageResizer.ts`
- `src/main/services/image/imageValidation.ts`
- `src/main/services/ai/mcpToolsAdapter.ts`
- `src/shared/toolOutputSanitizer.ts` (nuevo, sanitizer unificado — ubicación única, consumido por main y renderer)
- `src/main/services/ai/toolMessageSanitizer.ts`
- `src/main/services/aiService.ts`
- `src/renderer/stores/chatStore.ts`
- tests Vitest asociados

### 4.2. Fuera de alcance

- migración retroactiva de la base de datos para recomprimir filas antiguas;
- soporte genérico para formatos MCP de imagen distintos al bloque inline `{ type:"image", data, mimeType }`;
- rediseño del sistema de context budget;
- cambios en widgets MCP-UI fuera de lo necesario para no romper persistencia.

## 5. Runbook paso a paso

### Paso 1 — Añadir `sharp` y cerrar su empaquetado

**Archivos:**

- [package.json](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/package.json)
- [vite.main.config.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/vite.main.config.ts)
- [forge.config.js](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/forge.config.js)

**Acciones:**

1. Añadir `sharp` a `dependencies`.
2. Marcar `sharp` y `@img/*` como `external` en `vite.main.config.ts`.
3. Extender `packageAfterCopy` para copiar:
   - `sharp`
   - `@img/*`
   - dependencias transitivas necesarias de `sharp`
4. Ampliar `packagerConfig.asar.unpack` para incluir:
   - `**/node_modules/sharp/**/*`
   - `**/node_modules/@img/**/*`

**Decisión explícita de packaging:**

En este proyecto `sharp` debe tratarse como dependencia externa de runtime, igual que hoy se hace con otros módulos sensibles en packaging.  
No confiar solo en `asar.unpack`.

### Paso 2 — Ampliar tipos MCP para soportar imagen inline

**Archivo:**

- [src/main/types/mcp.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/types/mcp.ts)

**Cambios obligatorios:**

Ampliar `ToolResult.content` para permitir al menos:

```ts
type MCPContentItem =
  | {
      type: "text";
      text?: string;
    }
  | {
      type: "image";
      data?: string;
      mimeType?: string;
    }
  | {
      type: "resource";
      data?: any;
      resource?: {
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
      };
    }
  | {
      type: string;
      text?: string;
      data?: any;
      mimeType?: string;
      resource?: {
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
      };
    };
```

No dejar el tipo antiguo limitado a texto y resource, porque el adapter ya va a procesar imágenes explícitamente.

### Paso 3 — Extraer `normalizeToolResult()` compartido y aplicarlo en ambos servicios MCP

**Motivación:**

El bug original (ambos servicios pisan `content[]` con `structuredContent`) existe **por duplicado** porque la lógica de normalización del result MCP estaba copiada en dos sitios. La corrección no puede repetir esa duplicación: debe extraer un helper compartido y que ambos servicios lo llamen.

**Archivo nuevo:**

- `src/main/services/mcp/shared/normalizeToolResult.ts`

**Archivos modificados:**

- [src/main/services/mcp/mcpUseService.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/mcp/mcpUseService.ts)
- [src/main/services/mcp/mcpLegacyService.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/mcp/mcpLegacyService.ts)

**Regla nueva:**

1. Si `result.content` es array, preservarlo tal cual.
2. Si no hay `content[]` pero sí `structuredContent`, generar fallback textual desde `structuredContent`.
3. Seguir preservando:
   - `structuredContent`
   - `_meta`

**Implementación del helper (`normalizeToolResult.ts`):**

```ts
import type { MCPContentItem } from "../../../types/mcp";

export interface NormalizedToolResult {
  content: MCPContentItem[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
}

export function normalizeToolResult(result: {
  content?: unknown;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
}): NormalizedToolResult {
  let content: MCPContentItem[];

  if (Array.isArray(result.content)) {
    content = result.content as MCPContentItem[];
  } else if (result.content !== undefined && result.content !== null) {
    content = [{
      type: "text",
      text: typeof result.content === "string"
        ? result.content
        : JSON.stringify(result.content),
    }];
  } else if (result.structuredContent) {
    content = [{
      type: "text",
      text: JSON.stringify(result.structuredContent, null, 2),
    }];
  } else {
    content = [];
  }

  return {
    content,
    structuredContent: result.structuredContent,
    _meta: result._meta,
    isError: result.isError,
  };
}
```

**Uso en ambos servicios:**

Reemplazar el bloque actual que pisa `content` por:

```ts
import { normalizeToolResult } from "./shared/normalizeToolResult";

const normalized = normalizeToolResult(rawResult);
return normalized;
```

**Regla:** cualquier corrección futura de normalización del result MCP debe vivir en ese helper, no en los servicios.

### Paso 4 — Crear constantes y resizer de imágenes

**Archivos nuevos:**

- `src/main/services/image/providerImageLimits.ts`
- `src/main/services/image/imageResizer.ts`

**Requisitos de `providerImageLimits.ts`:**

El archivo se llama así (y **no** `apiLimits.ts`) porque los valores son específicos de lo que aceptan los providers de LLM para imágenes inline. El floor lo fija Anthropic (5MB base64); OpenAI y Google aceptan más, por eso usar el floor es seguro para todos. Si en el futuro se soporta un provider con límite menor, este archivo es el único punto a ajustar.

```ts
// Floor impuesto por Anthropic (5MB base64). OpenAI (~20MB) y Google aceptan más,
// por lo que cumplir el floor de Anthropic es suficiente para todos los providers soportados.
// Si se añade un provider con límite menor, ajustar aquí.
export const API_IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024;
export const IMAGE_TARGET_RAW_SIZE = Math.floor((API_IMAGE_MAX_BASE64_SIZE * 3) / 4);
export const IMAGE_MAX_WIDTH = 2000;
export const IMAGE_MAX_HEIGHT = 2000;
export const DEFAULT_MAX_MCP_OUTPUT_TOKENS = 25_000;
export const IMAGE_TOKEN_ESTIMATE = 1_600;
```

**Requisitos de `imageResizer.ts`:**

1. Importar logger correctamente desde:
   - `import { getLogger } from "../logging";`
   - `const logger = getLogger();`
2. Soportar formatos:
   - `png`
   - `jpeg`
   - `gif`
   - `webp`
3. Exponer:
   - `resizeMCPImage(buffer, ext?)`
   - `resizeMCPImageBlock({ data, mimeType })`
4. Cascada:
   - pass-through si ya cabe;
   - PNG palette si aplica;
   - JPEG `80 -> 60 -> 40 -> 20`;
   - resize `inside` a `2000x2000`;
   - repetir compresión;
   - último recurso: `1000px + jpeg q20`.
5. Si el resize falla pero el base64 original ya cabe, devolver original.
6. Si no cabe y el resize falla, lanzar `ImageResizeError`.

### Paso 5 — Crear sanitizer unificado (`toolOutputSanitizer`)

**Motivación:**

Había tres sanitizers pensados originalmente (adapter, `toolMessageSanitizer`, `chatStore`) que hacían casi lo mismo: recorrer `content[]` y aligerar bloques `image`. Esa duplicación es deuda y fuente de bugs futuros (arreglas uno, olvidas los otros). Consolidamos en un único helper que se reutiliza desde los tres sitios.

**Archivo nuevo:**

- `src/shared/toolOutputSanitizer.ts`

**Ubicación y reglas de dependencia (decisión única):**

- El helper vive en `src/shared/` porque lo consumen **tanto el main (adapter) como el renderer (chatStore)**. No hay versión "main-only".
- Código puro TypeScript: **prohibido importar** `fs`, `path`, `electron`, logger del main o cualquier API que no exista en ambos procesos.
- Tests co-localizados en `src/shared/__tests__/toolOutputSanitizer.test.ts`.
- Todos los consumidores importan desde `@/shared/toolOutputSanitizer` (main) o la ruta relativa equivalente (renderer). **No se permite redefinir el helper localmente en ningún consumidor.**

**Implementación obligatoria:**

```ts
export interface ToolOutputShape {
  text?: string;
  content?: unknown[];
  uiResources?: unknown[];
  structuredContent?: Record<string, unknown>;
  images?: Array<{ data: string; mediaType: string }>;
}

/**
 * Deja una "lápida" (`omitted: true`) en vez del base64 para cada bloque `image`
 * dentro de `content[]`. No muta el input. Única fuente de verdad sobre cómo
 * se aligera el output de tool antes de persistir o rehidratar.
 */
export function stripInlineImagesFromContent(content: unknown[]): unknown[] {
  return content.map((item) => {
    if (
      item &&
      typeof item === "object" &&
      (item as { type?: string }).type === "image"
    ) {
      return {
        type: "image",
        mimeType: (item as { mimeType?: string }).mimeType,
        omitted: true,
      };
    }
    return item;
  });
}

/**
 * Sanea un output de tool completo: preserva text/uiResources/structuredContent/images
 * y aligera `content[]` via `stripInlineImagesFromContent`. Usar este helper tanto
 * cuando el adapter devuelve el resultado como cuando el renderer va a persistirlo.
 */
export function sanitizeToolOutput(output: ToolOutputShape): ToolOutputShape {
  const cleanContent = Array.isArray(output.content)
    ? stripInlineImagesFromContent(output.content)
    : undefined;

  return {
    ...(output.text ? { text: output.text } : {}),
    ...(cleanContent ? { content: cleanContent } : {}),
    ...(output.uiResources ? { uiResources: output.uiResources } : {}),
    ...(output.structuredContent ? { structuredContent: output.structuredContent } : {}),
    ...(output.images ? { images: output.images } : {}),
  };
}
```

**Regla:**

- El objeto que salga de `execute()` en el adapter debe pasar por `sanitizeToolOutput()` antes de devolverse (consumido en Paso 6).
- El renderer en `chatStore` usa el **mismo** helper antes de persistir (consumido en Paso 11) — no redefine un sanitizer local.
- `toolMessageSanitizer` (Paso 8) reutiliza `stripInlineImagesFromContent` para neutralizar historial legacy.
- Si mañana cambia el formato del bloque imagen MCP, **se toca un solo archivo**.

### Paso 6 — Integrar imagen inline en `mcpToolsAdapter`

**Archivo:**

- [src/main/services/ai/mcpToolsAdapter.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/ai/mcpToolsAdapter.ts)

**Cambios obligatorios:**

1. Añadir imports:

```ts
import { resizeMCPImageBlock } from "../image/imageResizer.js";
import {
  DEFAULT_MAX_MCP_OUTPUT_TOKENS,
  IMAGE_TOKEN_ESTIMATE,
} from "../image/providerImageLimits.js";
```

2. Extender `GetMCPToolsOptions` y `CreateAISDKToolOptions` con:

```ts
supportsVision?: boolean;
```

3. Propagar `supportsVision` hasta `createAISDKTool()`.

4. En `processToolResult()`:
   - declarar `imageParts`;
   - añadir rama explícita para `item.type === "image"`;
   - redimensionar con `resizeMCPImageBlock`;
   - añadir placeholder textual corto;
   - nunca serializar el base64 original como texto.

**Rama correcta:**

```ts
} else if (item.type === "image" && typeof item.data === "string") {
  try {
    const { data, mediaType } = await resizeMCPImageBlock({
      data: item.data,
      mimeType: item.mimeType,
    });

    imageParts.push({
      data,
      mediaType,
    });

    textParts.push(`[Image received from ${mcpTool.name}]`);
  } catch (error) {
    logger.mcp.error("Failed to resize MCP tool image", {
      serverId,
      toolName: mcpTool.name,
      error: error instanceof Error ? error.message : String(error),
    });

    textParts.push(
      `[Image from ${mcpTool.name} could not be included because it exceeded API limits.]`,
    );
  }
}
```

5. Al final de `processToolResult()`:
   - calcular `text`;
   - aplicar presupuesto básico de salida (ver abajo);
   - devolver objeto estructurado cuando haya `uiResources` o `images`;
   - pasar ese objeto por `sanitizeToolOutput()` (del Paso 5) antes de devolverlo.

**Presupuesto mínimo obligatorio en esta fase:**

```ts
const maxTokens =
  Number(process.env.MAX_MCP_OUTPUT_TOKENS) || DEFAULT_MAX_MCP_OUTPUT_TOKENS;

const estTokens =
  imageParts.length * IMAGE_TOKEN_ESTIMATE + Math.ceil(text.length / 4);

if (estTokens > maxTokens) {
  // TODO(mcp-image-budget): hoy solo loggea. Un tool que devuelva N imágenes
  // pasa el filtro por-imagen y puede romper el agregado sin truncado.
  // Abrir issue para implementar truncado multi-imagen (recortar imageParts
  // y/o text cuando el estimado supera el presupuesto). No bloquea este fix.
  logger.mcp.warn("MCP output exceeded token budget", {
    serverId,
    toolName: mcpTool.name,
    estTokens,
    maxTokens,
  });
}
```

En esta fase no hace falta truncado sofisticado, pero el `TODO` debe estar anotado explícitamente para que no se pierda.

### Paso 7 — Implementar `toModelOutput` con el contrato correcto del SDK

**Archivo:**

- [src/main/services/ai/mcpToolsAdapter.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/ai/mcpToolsAdapter.ts)

**No usar la firma antigua.**  
La firma correcta es:

```ts
toModelOutput: ({ output }) => { ... }
```

**Implementación requerida:**

```ts
toModelOutput: ({ output }) => {
  if (
    output &&
    typeof output === "object" &&
    "images" in output &&
    Array.isArray((output as any).images)
  ) {
    const o = output as {
      text?: string;
      images: Array<{ data: string; mediaType: string }>;
    };

    if (!supportsVision) {
      return {
        type: "text",
        value:
          o.text ||
          "[Tool returned an image, but the active model does not support vision.]",
      };
    }

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "image-data"; data: string; mediaType: string }
    > = [];

    if (o.text) {
      parts.push({ type: "text", text: o.text });
    }

    for (const image of o.images) {
      parts.push({
        type: "image-data",
        data: image.data,
        mediaType: image.mediaType,
      });
    }

    return {
      type: "content",
      value: parts,
    };
  }

  if (typeof output === "string") {
    return { type: "text", value: output };
  }

  if (output && typeof output === "object") {
    const o = output as {
      text?: string;
      structuredContent?: Record<string, unknown>;
      uiResources?: unknown[];
    };

    // IMPORTANTE: uiResources es payload de UI, no debe llegar al modelo.
    // Si no hay imágenes, solo reenviar lo útil para el LLM.
    if (o.structuredContent) {
      return {
        type: "json",
        value: o.structuredContent as any,
      };
    }

    if (o.text) {
      return {
        type: "text",
        value: o.text,
      };
    }
  }

  return {
    type: "json",
    value: output as any,
  };
},
```

**Importante:**

- no usar `type: "media"`;
- no usar `toModelOutput: (output) => ...`;
- no dejar que el fallback genérico envíe `uiResources` al modelo;
- no convertir objetos complejos a string por defecto salvo que sea necesario.

### Paso 8 — Preservar `images` en `toolMessageSanitizer`

**Archivo:**

- [src/main/services/ai/toolMessageSanitizer.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/ai/toolMessageSanitizer.ts)

**Dependencia:** importar `stripInlineImagesFromContent` del Paso 5 para **no reimplementar** la lógica de aligerado de `content[]`. Si aparece un bloque `image` legacy en el historial, se reemplaza por su lápida usando ese helper.

**Cambios obligatorios:**

1. La rama especial debe activarse cuando exista `uiResources` **o** `images`.
2. Si `output.images` existe, debe preservarse.
3. Si el output histórico trae `content[]` con bloques `image` legacy y no trae `images`, el sanitizer debe:
   - extraer solo texto útil;
   - eliminar el base64 de esos bloques para el modelo (via `stripInlineImagesFromContent`);
   - dejar placeholder textual.

**Comportamiento requerido:**

```ts
if (
  output &&
  typeof output === "object" &&
  ("uiResources" in output || "images" in output)
) {
  const cleanOutput: Record<string, unknown> = {};

  if ((output as any).structuredContent) {
    cleanOutput.structuredContent = (output as any).structuredContent;
  }

  if (Array.isArray((output as any).content)) {
    const contentTexts = (output as any).content
      .filter((item: any) => item?.type === "text" && item?.text)
      .map((item: any) => item.text);

    const hadLegacyImages = (output as any).content.some(
      (item: any) => item?.type === "image",
    );

    if (hadLegacyImages) {
      contentTexts.push("[Legacy MCP image omitted from historical tool output]");
    }

    if (contentTexts.length > 0) {
      cleanOutput.text = contentTexts.join("\n");
    }
  }

  if (!cleanOutput.text && (output as any).text) {
    cleanOutput.text = (output as any).text;
  }

  if (Array.isArray((output as any).images) && (output as any).images.length > 0) {
    cleanOutput.images = (output as any).images;
  }

  let outputForModel: unknown;

  if (cleanOutput.images) {
    outputForModel = {
      text: cleanOutput.text ?? "",
      images: cleanOutput.images,
    };
  } else if (cleanOutput.structuredContent) {
    outputForModel = cleanOutput.structuredContent;
  } else if (cleanOutput.text) {
    outputForModel = cleanOutput.text;
  } else {
    outputForModel = "[Widget rendered]";
  }

  return {
    ...part,
    output: outputForModel,
  };
}
```

### Paso 9 — Añadir validation safety-net pre-request

**Archivo nuevo:**

- `src/main/services/image/imageValidation.ts`

**Archivo modificado:**

- [src/main/services/aiService.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/aiService.ts)

**Objetivo:**

Detectar imágenes que hayan escapado al pipeline, tanto en:

- outputs de tools;
- adjuntos de usuario convertidos a `file` con data URL base64.

**Implementación requerida:**

1. Crear `validateImagesForAPI(messages)` que recorra recursivamente los mensajes saneados.
2. Detectar estos casos:
   - `{ type: "image-data", data }`
   - `{ type: "image", data }`
   - `{ type: "file", url }` con `url` tipo `data:image/...;base64,...`
   - objetos `images[]` dentro de outputs de tool antes de `convertToModelMessages`
3. Validar tamaño sobre el payload base64 real.

**Helper recomendado:**

```ts
function getBase64SizeFromDataUrl(url: string): number | null {
  const match = /^data:[^;]+;base64,(.*)$/.exec(url);
  return match ? match[1].length : null;
}
```

**Puntos de invocación obligatorios:**

1. flujo streaming:
   - justo después de `sanitizeMessagesForModel(updatedMessages)`
   - antes de `convertToModelMessages(...)`
   - en [src/main/services/aiService.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/aiService.ts:1295)

2. flujo single-shot:
   - antes de `convertToModelMessages(...)`
   - en [src/main/services/aiService.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/aiService.ts:2098)

### Paso 10 — Propagar `supportsVision` desde `aiService`

**Archivos:**

- [src/main/services/aiService.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/aiService.ts)
- [src/main/services/ai/mcpToolsAdapter.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/ai/mcpToolsAdapter.ts)

**Cambios obligatorios:**

1. Cuando `aiService` llame a `getMCPTools(...)`, pasar:

```ts
supportsVision: modelInfo?.capabilities?.supportsVision === true
```

2. Corregir también el call site de `generateText()` para que use el mismo objeto de opciones, no un argumento positional incorrecto.

**Regla final:**

Si el modelo no soporta visión:

- el tool puede seguir ejecutándose;
- la UI puede seguir mostrando un resultado saneado;
- el modelo debe recibir solo texto fallback.

### Paso 11 — Sanear persistencia en `chatStore`

**Archivo:**

- [src/renderer/stores/chatStore.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/renderer/stores/chatStore.ts)

**Objetivo:**

No persistir un `tool_calls.result` con base64 raw antiguo o duplicado.

**Cambios obligatorios:**

1. **No redefinir un sanitizer local.** Importar `sanitizeToolOutput` desde `src/shared/toolOutputSanitizer.ts` (ubicación única definida en Paso 5).

2. Persistir:

```ts
import { sanitizeToolOutput } from "@/shared/toolOutputSanitizer";

// ...
result: sanitizeToolOutput(part.output),
```

3. Si al implementar aparece un problema de resolución de imports entre main y renderer (alias, tsconfig, bundler), resolverlo **en la configuración de build**, no moviendo el archivo. La ubicación del helper es fija.

**Resultado esperado:**

- el historial nuevo conserva `images` comprimidas;
- elimina el bloque raw gigante de `content[]`;
- evita duplicación.

### Paso 12 — Compatibilidad con historial existente

No habrá migración de DB en esta fase.

**Comportamiento requerido para historial legacy:**

1. Si se recarga una conversación antigua con `content[]` que incluya imágenes raw:
   - el sanitizer debe evitar reenviar el base64 al modelo;
   - debe reemplazarlo por placeholder textual.
2. No intentar recomprimir filas antiguas al cargar.

Esto es suficiente para:

- evitar nuevos `prompt too long`;
- no introducir migraciones de datos en este fix.

## 6. Tests obligatorios

### 6.1. Unit tests del resizer

**Archivo nuevo:**

- `src/main/services/image/__tests__/imageResizer.test.ts`

**Casos mínimos:**

1. imagen pequeña pasa sin cambios;
2. PNG grande se comprime por debajo del target;
3. imagen gigante se redimensiona por debajo de `IMAGE_MAX_WIDTH/HEIGHT`;
4. buffer vacío lanza error;
5. si el resize falla pero el base64 ya cabe, se devuelve original.

### 6.2. Unit tests del sanitizer

**Archivo existente a ampliar:**

- [src/main/services/ai/__tests__/toolMessageSanitizer.test.ts](/Users/saulgomezjimenez/proyectos/clai/proyectos/levante/levante/src/main/services/ai/__tests__/toolMessageSanitizer.test.ts)

**Casos mínimos:**

1. preserva `images` en output con `uiResources`;
2. convierte output histórico con `content[].image` legacy a texto placeholder seguro;
3. no muta el input original;
4. mantiene `structuredContent` preferente cuando no hay `images`.

### 6.3. Tests del adapter MCP

**Archivo nuevo:**

- `src/main/services/ai/__tests__/mcpToolsAdapter.image.test.ts`

**Casos mínimos:**

1. `processToolResult()` transforma bloque `image` en:
   - `text` placeholder;
   - `images[]` comprimidas;
2. no serializa el base64 raw en `text`;
3. aplica fallback textual cuando el resize falla;
4. `toModelOutput` genera `image-data` cuando `supportsVision === true`;
5. `toModelOutput` degrada a texto cuando `supportsVision === false`.

### 6.4. Tests del sanitizer unificado

**Archivo nuevo:**

- `src/shared/__tests__/toolOutputSanitizer.test.ts`

**Casos mínimos:**

1. `stripInlineImagesFromContent` reemplaza cada bloque `image` por su lápida y preserva bloques `text` y `resource` intactos.
2. `sanitizeToolOutput` conserva `text`, `uiResources`, `structuredContent` e `images` tal cual.
3. `sanitizeToolOutput` no muta el input.
4. Output sin `content` ni `images` se devuelve sin propiedades basura.

### 6.5. Tests del normalizador MCP

**Archivo nuevo:**

- `src/main/services/mcp/shared/__tests__/normalizeToolResult.test.ts`

**Casos mínimos:**

1. Preserva `content[]` cuando viene como array.
2. Convierte `content` string a bloque `text`.
3. Genera fallback textual desde `structuredContent` cuando `content` está ausente.
4. Preserva `_meta` y `structuredContent` en paralelo al `content`.

### 6.6. Tests de validación pre-request

**Archivo nuevo:**

- `src/main/services/image/__tests__/imageValidation.test.ts`

**Casos mínimos:**

1. acepta `images[]` pequeñas;
2. rechaza `image-data` demasiado grande;
3. rechaza `file.url` con data URL base64 demasiado grande;
4. ignora URLs no data URL.

## 7. Orden exacto de implementación

1. Añadir `sharp` y cerrar packaging en `package.json`, `vite.main.config.ts` y `forge.config.js`.
2. Ampliar tipos en `src/main/types/mcp.ts`.
3. Crear `normalizeToolResult.ts` y aplicarlo en `mcpUseService.ts` y `mcpLegacyService.ts`.
4. Crear `providerImageLimits.ts` y `imageResizer.ts`.
5. Crear `src/shared/toolOutputSanitizer.ts` (ubicación fija, consumido por main y renderer).
6. Integrar imagen inline y `toModelOutput` correcto en `mcpToolsAdapter.ts` (consume `sanitizeToolOutput`).
7. Actualizar `toolMessageSanitizer.ts` (consume `stripInlineImagesFromContent`).
8. Añadir `imageValidation.ts` e invocarlo en ambos caminos de `aiService.ts`.
9. Pasar `supportsVision` desde `aiService.ts` a `getMCPTools(...)`.
10. Sanear persistencia en `chatStore.ts` (consume `sanitizeToolOutput`).
11. Añadir y ejecutar tests.
12. Hacer verificación manual.

## 8. Verificación manual obligatoria

### Escenario A — modelo con visión

1. Arrancar app en local.
2. Conectar MCP `chrome-devtools`.
3. Ejecutar screenshot grande, por ejemplo:
   - viewport HiDPI
   - `fullPage: true`
4. Verificar en logs:
   - resize aplicado;
   - sin `prompt too long`;
   - sin serialización textual del base64.
5. Verificar que el modelo describe correctamente la imagen.

### Escenario B — modelo sin visión

1. Repetir el mismo tool call con un modelo textual.
2. Verificar:
   - no hay error de provider por imagen no soportada;
   - el modelo recibe placeholder textual;
   - la conversación continúa.

### Escenario C — recarga histórica

1. Ejecutar el tool.
2. Persistir conversación.
3. Recargar la app.
4. Verificar:
   - el tool output sigue renderizando;
   - no reaparece base64 raw en el historial;
   - al continuar la conversación no se produce `prompt too long`.

## 9. Checklist de aceptación

- `mcp-use` preserva `content[]` real.
- `official-sdk` preserva `content[]` real.
- `processToolResult()` ya no serializa imágenes como texto raw.
- `toModelOutput` usa la firma correcta del SDK.
- las imágenes se emiten como `image-data`.
- los modelos sin visión degradan a texto.
- el historial persistido no guarda base64 raw gigante en `content[]`.
- `validateImagesForAPI()` corre en `streamText()` y en `generateText()`.
- `sharp` funciona en `dev`, `package` y `make`.
- tests verdes.

## 10. Riesgos y decisiones explícitas

### Riesgo 1 — `sharp` y ABI nativa de Electron

Mitigación:

- tratar `sharp` como dependencia externa de runtime;
- copiar `sharp` y `@img/*` en `packageAfterCopy`;
- incluir sus paths en `asar.unpack`.

### Riesgo 2 — conversaciones antiguas ya contaminadas

Mitigación:

- no migrar DB en esta fase;
- neutralizar esos payloads en `toolMessageSanitizer`.

### Riesgo 3 — modelos sin visión

Mitigación:

- pasar `supportsVision` al crear tools;
- degradar en `toModelOutput`.

### Riesgo 4 — el presupuesto MCP siga siendo alto

Mitigación:

- logging del estimate ahora;
- truncado más fino queda fuera de este fix.

## 11. No implementar nada fuera de este runbook

La implementación debe limitarse a los archivos, pasos, tests y verificaciones descritos aquí.  
No asumir trabajos laterales, refactors adicionales ni migraciones no incluidas.
