# Handoff — Estado de implementación de `PLAN_MCP_IMAGE_RESIZE`

**Fecha:** 2026-04-14  
**Objetivo de este documento:** dar a otra IA el contexto suficiente para retomar la corrección sin tener que reconstruir el análisis previo.

## Resumen ejecutivo

El plan de resize/entrega multimodal de imágenes MCP está **mayormente implementado**, pero **todavía no debe considerarse cerrado**.

La mayor parte del trabajo estructural ya está hecha:

- `sharp` añadido y cableado en packaging.
- normalización compartida del resultado MCP creada.
- resizer y validation safety-net creados.
- `mcpToolsAdapter` ya convierte imágenes MCP en `image-data`.
- `toolOutputSanitizer` compartido entre main y renderer.
- tests unitarios principales añadidos.

Sin embargo, siguen quedando **dos problemas funcionales importantes** y **un problema de validación/test**:

1. `processToolResult()` pierde `structuredContent` al devolver outputs saneados con `uiResources` o `images`.
2. `validateImagesForAPI()` solo hace `warn`; no bloquea ni corrige payloads oversized.
3. `imageResizer.test.ts` termina con error global por el logger real escribiendo fuera del workspace.

## Plan fuente

El runbook que se intentó implementar es:

- [docs/PLAN_MCP_IMAGE_RESIZE.md](docs/PLAN_MCP_IMAGE_RESIZE.md)

## Archivos ya modificados

Estado visible por `git status` / `git diff --stat` durante esta revisión:

- `forge.config.js`
- `package.json`
- `pnpm-lock.yaml`
- `src/main/services/ai/__tests__/toolMessageSanitizer.test.ts`
- `src/main/services/ai/mcpToolsAdapter.ts`
- `src/main/services/ai/toolMessageSanitizer.ts`
- `src/main/services/aiService.ts`
- `src/main/services/mcp/mcpLegacyService.ts`
- `src/main/services/mcp/mcpUseService.ts`
- `src/main/types/mcp.ts`
- `src/renderer/stores/chatStore.ts`
- `vite.main.config.ts`
- nuevos directorios:
  - `src/main/services/image/`
  - `src/main/services/mcp/shared/`
  - `src/shared/`
  - tests asociados

## Qué sí está implementado

### 1. Packaging de `sharp`

Se añadió `sharp` a dependencias:

- [package.json](package.json)

Vite lo deja como `external`:

- [vite.main.config.ts](vite.main.config.ts:39)

Forge copia `sharp` y `@img/*`, y amplía `asar.unpack`:

- [forge.config.js](forge.config.js:146)
- [forge.config.js](forge.config.js:188)

### 2. Normalización MCP compartida

Existe el helper:

- [src/main/services/mcp/shared/normalizeToolResult.ts](src/main/services/mcp/shared/normalizeToolResult.ts:1)

Y ambos servicios MCP lo usan:

- [src/main/services/mcp/mcpUseService.ts](src/main/services/mcp/mcpUseService.ts:446)
- [src/main/services/mcp/mcpLegacyService.ts](src/main/services/mcp/mcpLegacyService.ts:211)

Esto corrige el bug original donde `structuredContent` pisaba `content[]`.

### 3. Sanitizer compartido main/renderer

Existe el helper compartido:

- [src/shared/toolOutputSanitizer.ts](src/shared/toolOutputSanitizer.ts:1)

Contiene:

- `stripInlineImagesFromContent(...)`
- `sanitizeToolOutput(...)`

El renderer ya lo usa al persistir `tool_calls.result`:

- [src/renderer/stores/chatStore.ts](src/renderer/stores/chatStore.ts:507)

### 4. Resizer y límites

Se añadieron:

- [src/main/services/image/providerImageLimits.ts](src/main/services/image/providerImageLimits.ts)
- [src/main/services/image/imageResizer.ts](src/main/services/image/imageResizer.ts:1)
- [src/main/services/image/imageValidation.ts](src/main/services/image/imageValidation.ts:1)

### 5. Integración en `mcpToolsAdapter`

`mcpToolsAdapter` ya:

- recibe `supportsVision`;
- convierte imágenes MCP inline;
- usa `image-data` en `toModelOutput`;
- degrada a texto si no hay visión.

Referencias:

- [src/main/services/ai/mcpToolsAdapter.ts](src/main/services/ai/mcpToolsAdapter.ts:487)
- [src/main/services/ai/mcpToolsAdapter.ts](src/main/services/ai/mcpToolsAdapter.ts:499)
- [src/main/services/ai/mcpToolsAdapter.ts](src/main/services/ai/mcpToolsAdapter.ts:519)

### 6. Integración en `aiService`

`aiService` ya:

- pasa `supportsVision` a `getMCPTools(...)`;
- ejecuta `validateImagesForAPI(...)` antes de `convertToModelMessages(...)`;
- lo hace tanto en streaming como en `generateText()`.

Referencias:

- [src/main/services/aiService.ts](src/main/services/aiService.ts:1156)
- [src/main/services/aiService.ts](src/main/services/aiService.ts:1297)
- [src/main/services/aiService.ts](src/main/services/aiService.ts:2066)
- [src/main/services/aiService.ts](src/main/services/aiService.ts:2109)

## Problemas pendientes

### Problema 1 — `structuredContent` se pierde en `processToolResult()`

**Impacto:** alto

En [src/main/services/ai/mcpToolsAdapter.ts](src/main/services/ai/mcpToolsAdapter.ts:1248), cuando hay `uiResources` o `imageParts`, se hace:

```ts
return sanitizeToolOutput({
  text,
  content: result.content,
  ...(uiResources.length > 0 ? { uiResources } : {}),
  ...(imageParts.length > 0 ? { images: imageParts } : {}),
});
```

Falta `structuredContent`.

Esto es inconsistente con:

- el plan, que exige preservarlo;
- `sanitizeToolOutput(...)`, que sí sabe preservarlo si se le pasa;
- el comportamiento esperado de widgets y de outputs estructurados en turnos siguientes.

**Corrección esperada:**

En ese bloque, añadir:

```ts
...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
```

### Problema 2 — el safety-net no bloquea el envío

**Impacto:** alto

En [src/main/services/image/imageValidation.ts](src/main/services/image/imageValidation.ts:89) el comentario dice explícitamente que el safety-net “does not throw”.

La implementación actual en [imageValidation.ts](src/main/services/image/imageValidation.ts:107) solo hace `logger.aiSdk.warn(...)`.

Eso significa que si una imagen oversized se escapa del pipeline:

- se registra;
- pero igual se envía al provider;
- el fix no garantiza evitar `prompt too long`.

**Decisión pendiente para la siguiente IA:**

Elegir una de estas dos rutas y aplicarla de forma consistente:

1. `validateImagesForAPI()` debe lanzar `ImagePayloadTooLargeError`.
2. `validateImagesForAPI()` debe intentar una remediación real antes de lanzar.

La opción más directa para cerrar el fix es la 1.

Si se cambia a `throw`, revisar también:

- cómo se presenta el error al usuario;
- si `streamChat` y `generateText` ya lo convertirán en mensaje usable o si hace falta mapearlo.

### Problema 3 — test del resizer con error global del logger

**Impacto:** medio

`pnpm vitest run src/main/services/image/__tests__/imageResizer.test.ts` ejecuta los asserts correctamente, pero termina con error global:

- `EPERM: operation not permitted, open '/Users/saulgomezjimenez/levante/levante-2026-04-14.log'`

El origen es que [imageResizer.ts](src/main/services/image/imageResizer.ts:2) importa el logger real, y durante el test intenta escribir fuera del workspace permitido.

**Opciones razonables de corrección:**

1. Mockear `../logging` en `imageResizer.test.ts`.
2. Configurar logger en modo no-file para tests.
3. Introducir lazy logger o shim test-safe.

La opción más barata aquí es la 1.

## Verificaciones realizadas

### Typecheck

Ejecutado:

```bash
pnpm typecheck
```

Resultado:

- pasa

### Tests que pasan

Ejecutados y observados como correctos:

- `src/main/services/mcp/shared/__tests__/normalizeToolResult.test.ts`
- `src/shared/__tests__/toolOutputSanitizer.test.ts`
- `src/main/services/ai/__tests__/toolMessageSanitizer.test.ts`
- `src/main/services/image/__tests__/imageValidation.test.ts`
- `src/main/services/ai/__tests__/mcpToolsAdapter.image.test.ts`

### Test que no está limpio aún

Ejecutado:

```bash
pnpm vitest run src/main/services/image/__tests__/imageResizer.test.ts
```

Resultado:

- los 5 tests pasan;
- Vitest termina con error global por el logger;
- por tanto no debe contarse como “verde”.

## Riesgo adicional a vigilar

### `validateImagesForAPI.test.ts` está alineado con el comportamiento actual, no con el objetivo final

Los tests actuales de [imageValidation.test.ts](src/main/services/image/__tests__/imageValidation.test.ts:1) verifican que se haga `warn`, no que se lance error.

Si se cambia `validateImagesForAPI()` para cerrar el fix de verdad, habrá que actualizar estos tests.

## Próximos pasos recomendados

### Paso 1

Corregir [mcpToolsAdapter.ts](src/main/services/ai/mcpToolsAdapter.ts:1248) para preservar `structuredContent` en el objeto que pasa por `sanitizeToolOutput()`.

### Paso 2

Cambiar [imageValidation.ts](src/main/services/image/imageValidation.ts:96) para que deje de hacer solo logging y bloquee realmente el envío cuando haya payload oversized.

### Paso 3

Actualizar tests de `imageValidation` a ese nuevo contrato.

### Paso 4

Mockear el logger en `imageResizer.test.ts` para eliminar el error global y dejar la suite realmente verde.

### Paso 5

Volver a ejecutar como mínimo:

```bash
pnpm typecheck
pnpm vitest run src/main/services/mcp/shared/__tests__/normalizeToolResult.test.ts
pnpm vitest run src/shared/__tests__/toolOutputSanitizer.test.ts
pnpm vitest run src/main/services/ai/__tests__/toolMessageSanitizer.test.ts
pnpm vitest run src/main/services/image/__tests__/imageValidation.test.ts
pnpm vitest run src/main/services/image/__tests__/imageResizer.test.ts
pnpm vitest run src/main/services/ai/__tests__/mcpToolsAdapter.image.test.ts
```

## Criterio para considerar el trabajo terminado

La siguiente IA debería considerar este fix “cerrado” solo si se cumplen estas condiciones:

1. `structuredContent` ya no se pierde en `processToolResult()`.
2. `validateImagesForAPI()` bloquea o remedia de verdad payloads oversized.
3. `imageResizer.test.ts` queda sin errores globales.
4. `pnpm typecheck` pasa.
5. La suite focalizada de tests queda completamente verde.

## Actualización posterior — diagnóstico empírico con logs temporales

### Estado de este bloque

Este bloque se añade después de la primera ronda de correcciones y después de introducir logs temporales en `aiService.ts` para inspeccionar:

- `sanitizedMessages`
- `modelMessages`
- mayores strings
- payloads de imagen detectados

Los logs se añadieron temporalmente en:

- [src/main/services/aiService.ts](src/main/services/aiService.ts)

### Qué se observó en producción

#### Caso 1 — screenshot fallido por Chrome no disponible

Se registró un caso en el que `chrome-devtools_take_screenshot` falló al conectar con Chrome.

Los logs relevantes mostraron:

- `imagePayloads: []` en `sanitizedMessages`
- `imagePayloads: []` en `modelMessages`

Los strings dominantes eran:

- output de `skill_execute`
- mensajes de error del tipo:
  - `Could not connect to Chrome. Check if Chrome is running.`

Conclusión de ese caso:

- no había imagen real en contexto;
- ese intento no explica el `prompt too long`.

#### Caso 2 — screenshot exitoso con imagen real

En un intento posterior, los logs mostraron claramente la imagen problemática.

En `sanitizedMessages` apareció:

- `sanitizedMessages[1].parts[3].output.images[0].data`
- longitud aproximada: `920992`

En `modelMessages` apareció:

- `modelMessages[2].content[2].output.value.images[0].data`
- longitud aproximada: `920992`

Además, el `tool result` logueado tiene esta forma:

```json
{
  "text": "Took a screenshot of the current page's viewport.\n[Image received from take_screenshot]",
  "content": [
    {
      "type": "text",
      "text": "Took a screenshot of the current page's viewport."
    },
    {
      "type": "image",
      "mimeType": "image/png",
      "omitted": true
    }
  ],
  "images": [
    {
      "data": "iVBORw.....",
      "mediaType": "image/png"
    }
  ]
}
```

### Qué queda descartado con bastante confianza

A partir de esos logs, ya no parece probable que el problema principal sea alguno de estos:

1. **Base64 colándose como texto vía `content[]` legacy**
   - `content[]` ya aparece saneado con:
     - `type: "image"`
     - `omitted: true`
   - no se ve el base64 raw ahí.

2. **`resource.blob` o `resource.text` enormes**
   - el payload dominante detectado está en `images[0].data`.

3. **El output de `skill_execute`**
   - el skill ocupa ~8921 chars, muy inferior al screenshot.

4. **El prompt del usuario**
   - ~442 chars, irrelevante comparado con la imagen.

### Hipótesis principal actual

La hipótesis dominante ahora mismo es esta:

**la imagen sí se detecta y se redimensiona, pero en el paso hacia `modelMessages` sigue encapsulada como `output.value.images[0].data` en un `tool-result`, en lugar de estar convertida al formato multimodal final que el provider espera.**

La pista más fuerte es esta ruta de log:

- `modelMessages[2].content[2].output.value.images[0].data`

Eso sugiere que el resultado del tool llega al provider todavía como una estructura JSON parecida a:

```ts
{
  text: "...",
  images: [...]
}
```

en lugar de como un resultado multimodal ya materializado, por ejemplo:

```ts
{
  type: "content",
  value: [
    { type: "text", text: "..." },
    { type: "image-data", data: "...", mediaType: "image/png" }
  ]
}
```

### Qué significa esto técnicamente

Si esta hipótesis es correcta, entonces el problema ya no estaría en:

- `processToolResult()`
- `sanitizeToolOutput()`
- el shape saneado persistible

Sino en uno de estos puntos:

1. `toModelOutput` existe pero no se está ejecutando en el camino real de `convertToModelMessages(...)`.
2. `convertToModelMessages(...)` no está recibiendo el mapa de tools necesario para aplicar `toModelOutput`.
3. el `tool-result.output` se está quedando como `json` con `{ text, images }` en lugar de producir `content` con parts multimodales.

### Qué revisar a continuación

La siguiente IA debe comprobar, con logs adicionales o lectura directa del SDK, lo siguiente:

1. En `modelMessages`, para el `tool-result` del screenshot:
   - `output.type`
   - `toolName`
   - estructura completa de `output`

2. Verificar si el `toolName` del `tool-result` coincide exactamente con la key del tool en el mapa `tools`.
   - el AI SDK necesita encontrar el tool correcto para aplicar `toModelOutput`.

3. Verificar si `convertToModelMessages(...)` se está llamando con:
   - solo los mensajes, o
   - mensajes + tools

Si no se pasa el mapa de tools al conversor, esa sería una explicación directa de por qué `toModelOutput` no se aplica.

### Instrumentación temporal sugerida para el siguiente paso

Añadir logs que impriman, para cada `tool-result` en `modelMessages`:

- `toolName`
- `output.type`
- keys de `output.value` si `output` es objeto
- si aparece `images`
- si aparece `image-data`

Ejemplo de lo que interesa inspeccionar:

```ts
for (const msg of modelMessages) {
  if (msg.role !== "tool" || !Array.isArray((msg as any).content)) continue;

  for (const item of (msg as any).content) {
    if (item?.type !== "tool-result") continue;

    this.logger.aiSdk.info("[CTX_TOOL_RESULT_DIAGNOSTICS]", {
      toolName: item.toolName,
      outputType: item.output?.type,
      outputKeys:
        item.output && typeof item.output === "object"
          ? Object.keys(item.output)
          : null,
      outputValueKeys:
        item.output?.value && typeof item.output.value === "object"
          ? Object.keys(item.output.value)
          : null,
      hasImagesArray: Array.isArray(item.output?.value?.images),
    });
  }
}
```

### Nuevo estado de la investigación

Con la evidencia actual:

- **sí** se ha corregido el leak de base64 textual en `content[]`;
- **sí** se ha identificado empíricamente que la imagen del screenshot es el payload dominante;
- **no** está demostrado todavía que el problema restante sea el tamaño visual/dimensional de la imagen;
- la hipótesis más fuerte ahora es que **`toModelOutput` no está siendo aplicado en el camino real de serialización hacia el provider**.

### Prioridad actual para la siguiente IA

La prioridad ya no es seguir tocando el resizer a ciegas.

La prioridad correcta ahora es:

1. confirmar si `toModelOutput` se aplica o no;
2. confirmar el `output.type` real del `tool-result` en `modelMessages`;
3. solo después decidir si el siguiente fix debe ir en:
   - `convertToModelMessages` / wiring de tools,
   - `toModelOutput`,
   - o una segunda reducción de tamaño/dimensiones de imagen.
