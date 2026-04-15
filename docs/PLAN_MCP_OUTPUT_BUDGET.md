# Plan: presupuesto de tokens para outputs MCP

Replica en Levante el patrón de Claude Code descrito por el arquitecto: dos capas (MCP-específica + genérica por-turno), persistir>truncar, estimación barata con fallback a count exacto, declarativo por-tool, con bypass por nombre y por contenido (imágenes).

## Resumen de decisiones

- **Dónde:** en `processToolResult` (adapter MCP), antes de que el output entre al historial. No en el sanitizer pre-provider.
- **Dos modos:** persistir a disco (default) con preview + schema inferido; truncado inline como fallback.
- **Medición:** chars/4 como filtro barato. Sin llamada a `countTokens` externa (Levante es multi-provider, no hay API común); `estTokens = ceil(chars/4) + imageParts*IMAGE_TOKEN_ESTIMATE`. Umbral al 100% (no 50%) porque no hay double-check API.
- **Declarativo:** cap por tool vía `maxResultSizeChars` en el wrapper; clamp global; override por env / settings MCP. `Infinity` = opt-out duro.
- **Por turno:** cap agregado `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS` con poda "los mayores primero". Aplica sobre los resultados que se construyen en un mismo `generate`/`stream`.
- **Bypass:** por contenido (si hay imágenes → solo truncar texto, no persistir JSON con base64), por nombre de tool (ej. futuras tools "IDE-like"), y por `Infinity` declarado.
- **Telemetría:** `logger.mcp.info("mcp_large_result_handled", {outcome, reason, toolName, serverId, sizeEstimateTokens, persistedSizeChars?})`.

## Paso 1 — Constantes y configuración

**Archivo:** `src/main/services/image/providerImageLimits.ts` (renombrable a `mcpBudgetLimits.ts` en un PR posterior; hoy ya contiene `DEFAULT_MAX_MCP_OUTPUT_TOKENS`, lo ampliamos).

```ts
// añadir al final del archivo existente
export const DEFAULT_MAX_RESULT_SIZE_CHARS = 50_000;      // clamp global por tool
export const MCP_TOOL_DEFAULT_CAP_CHARS = 100_000;        // techo declarativo para tools MCP genéricos
export const MAX_TOOL_RESULTS_PER_MESSAGE_CHARS = 200_000; // presupuesto agregado por turno
export const TOKEN_CHARS_RATIO = 4;                        // 1 token ≈ 4 chars (heurística)
```

**Nuevo archivo:** `src/main/services/mcp/budget/mcpBudgetConfig.ts`

```ts
import {
  DEFAULT_MAX_MCP_OUTPUT_TOKENS,
  DEFAULT_MAX_RESULT_SIZE_CHARS,
  MCP_TOOL_DEFAULT_CAP_CHARS,
  MAX_TOOL_RESULTS_PER_MESSAGE_CHARS,
  TOKEN_CHARS_RATIO,
} from "../../image/providerImageLimits";

export function getMaxMcpOutputTokens(): number {
  const env = Number(process.env.MAX_MCP_OUTPUT_TOKENS);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_MAX_MCP_OUTPUT_TOKENS;
}

export function getMaxResultSizeCharsForTool(
  toolName: string,
  declared: number | undefined,
  overrides: Record<string, number> | undefined,
): number {
  if (declared === Infinity) return Infinity;              // hard opt-out
  const override = overrides?.[toolName];
  if (typeof override === "number" && override > 0) return override;
  if (typeof declared === "number" && declared > 0) return declared;
  return DEFAULT_MAX_RESULT_SIZE_CHARS;
}

export function isPersistenceEnabled(): boolean {
  return process.env.ENABLE_MCP_LARGE_OUTPUT_FILES !== "false";
}

export {
  MCP_TOOL_DEFAULT_CAP_CHARS,
  MAX_TOOL_RESULTS_PER_MESSAGE_CHARS,
  TOKEN_CHARS_RATIO,
};
```

## Paso 2 — Store en disco con `wx` y schema inference

**Nuevo archivo:** `src/main/services/mcp/budget/mcpOutputStore.ts`

```ts
import { app } from "electron";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getLogger } from "../../logging";

const logger = getLogger();

function baseDir(): string {
  return path.join(app.getPath("userData"), "mcp-tool-results");
}

export interface PersistResult {
  filePath: string;
  originalSize: number;
  sha256: string;
  schema?: string;
}

function stableId(serverId: string, toolName: string, payload: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex")
    .slice(0, 12);
  const ts = Date.now();
  return `${serverId}-${toolName}-${ts}-${hash}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Signature inference (simplified port of inferCompactSchema):
// arrays → `[<T>]`, objects → `{k1: T1, k2: T2}`, primitives → typeof.
export function inferCompactSchema(value: unknown, depth = 0): string {
  if (depth > 3) return "...";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${inferCompactSchema(value[0], depth + 1)}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .map(([k, v]) => `${k}: ${inferCompactSchema(v, depth + 1)}`);
    return `{${entries.join(", ")}}`;
  }
  return typeof value;
}

export async function persistToolResult(params: {
  serverId: string;
  toolName: string;
  content: unknown;            // raw MCP content[] (o string)
  structuredContent?: unknown; // opcional
}): Promise<PersistResult | null> {
  try {
    await fs.mkdir(baseDir(), { recursive: true });
    const isJson = typeof params.content !== "string";
    const payload = isJson
      ? JSON.stringify(params.content, null, 2)
      : String(params.content);
    const id = stableId(params.serverId, params.toolName, payload);
    const ext = isJson ? "json" : "txt";
    const filePath = path.join(baseDir(), `${id}.${ext}`);
    const sha256 = crypto.createHash("sha256").update(payload).digest("hex");

    // 'wx' — falla si existe; así los replays de compactación no reescriben.
    if (!existsSync(filePath)) {
      await fs.writeFile(filePath, payload, { flag: "wx", encoding: "utf8" });
    }

    const schema = isJson
      ? inferCompactSchema(params.structuredContent ?? params.content)
      : undefined;

    return { filePath, originalSize: payload.length, sha256, schema };
  } catch (error) {
    logger.mcp.error("Failed to persist MCP tool result", {
      serverId: params.serverId,
      toolName: params.toolName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function largeOutputInstructions(p: PersistResult, sizeTokens: number): string {
  const schemaLine = p.schema ? `\nFormat: JSON with schema: ${p.schema}` : "";
  return `Error: result (${p.originalSize} chars, ~${sizeTokens} tokens) exceeds MCP output limit.
Output has been saved to ${p.filePath}.${schemaLine}
Use the Read tool (offset/limit) or search within the file. For JSON, jq works against the schema above.
REQUIREMENTS FOR SUMMARIZATION/ANALYSIS:
- Read the content in sequential chunks until 100% has been processed.
- Before producing any summary, explicitly state which portion you have read.`;
}

export function truncationPlaceholder(maxTokens: number): string {
  return `[OUTPUT TRUNCATED - exceeded ${maxTokens} token limit]

The tool output was truncated. If this MCP server exposes pagination or filtering,
use it to retrieve specific portions. Otherwise, inform the user that results are
incomplete.`;
}
```

## Paso 3 — Medición y decisión

**Nuevo archivo:** `src/main/services/mcp/budget/mcpBudget.ts`

```ts
import {
  TOKEN_CHARS_RATIO,
} from "./mcpBudgetConfig";
import { IMAGE_TOKEN_ESTIMATE } from "../../image/providerImageLimits";

export function estimateTokens(textChars: number, imageCount: number): number {
  return Math.ceil(textChars / TOKEN_CHARS_RATIO) + imageCount * IMAGE_TOKEN_ESTIMATE;
}

export function contentContainsImages(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some(
    (item: any) => item?.type === "image" && typeof item.data === "string",
  );
}
```

## Paso 4 — Integración en `processToolResult`

**Archivo:** `src/main/services/ai/mcpToolsAdapter.ts`

Reemplazar el bloque "Basic output budget" (líneas ~1226-1243) por el flujo decide→persist→truncate. También añadir el parámetro `budgetOverrides` propagado desde `getMCPTools`.

```ts
// imports nuevos
import { estimateTokens, contentContainsImages } from "../mcp/budget/mcpBudget";
import {
  getMaxMcpOutputTokens,
  getMaxResultSizeCharsForTool,
  isPersistenceEnabled,
} from "../mcp/budget/mcpBudgetConfig";
import {
  persistToolResult,
  largeOutputInstructions,
  truncationPlaceholder,
} from "../mcp/budget/mcpOutputStore";
```

Dentro de `processToolResult`, justo antes del bloque `if (uiResources.length > 0 || imageParts.length > 0)`:

```ts
const maxTokens = getMaxMcpOutputTokens();
const declaredCap = (mcpTool as any)._meta?.maxResultSizeChars as number | undefined;
const maxChars = getMaxResultSizeCharsForTool(mcpTool.name, declaredCap, undefined);

const estTokens = estimateTokens(text.length, imageParts.length);
const exceedsTokens = estTokens > maxTokens;
const exceedsChars = text.length > maxChars;

if (exceedsTokens || exceedsChars) {
  const reason = exceedsTokens ? "tokens" : "chars";
  const hasImages = imageParts.length > 0 || contentContainsImages(result.content);

  // Rama A: persistir (solo si no hay imágenes; un JSON con base64 rompe compresión visual)
  if (isPersistenceEnabled() && !hasImages) {
    const persisted = await persistToolResult({
      serverId,
      toolName: mcpTool.name,
      content: result.content,
      structuredContent: result.structuredContent,
    });
    if (persisted) {
      logger.mcp.info("mcp_large_result_handled", {
        outcome: "persisted",
        reason,
        toolName: mcpTool.name,
        serverId,
        sizeEstimateTokens: estTokens,
        persistedSizeChars: persisted.originalSize,
      });
      return largeOutputInstructions(persisted, estTokens);
    }
    // persistencia falló → cae a truncado
  }

  // Rama B: truncado inline (preserva imágenes resizeadas)
  const placeholder = truncationPlaceholder(maxTokens);
  logger.mcp.info("mcp_large_result_handled", {
    outcome: "truncated",
    reason: hasImages ? "contains_images" : reason,
    toolName: mcpTool.name,
    serverId,
    sizeEstimateTokens: estTokens,
  });

  if (imageParts.length > 0 || uiResources.length > 0) {
    return sanitizeToolOutput({
      text: placeholder,
      content: result.content,
      ...(uiResources.length > 0 ? { uiResources } : {}),
      ...(imageParts.length > 0 ? { images: imageParts } : {}),
    });
  }
  return placeholder;
}
```

Eliminar el `TODO(mcp-image-budget)` y el `logger.mcp.warn` anteriores — ya cubiertos.

## Paso 5 — Presupuesto agregado por turno

**Nuevo archivo:** `src/main/services/mcp/budget/mcpTurnBudget.ts`

Estructura `AsyncLocalStorage` para acumular el total de chars emitidos por tool-calls en un mismo request. Si al cerrar un tool-call el agregado supera `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS`, podar los mayores.

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import { MAX_TOOL_RESULTS_PER_MESSAGE_CHARS } from "./mcpBudgetConfig";

interface TurnEntry { id: string; chars: number; onPrune: () => void }
interface TurnCtx { entries: TurnEntry[] }

const storage = new AsyncLocalStorage<TurnCtx>();

export function runWithTurnBudget<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ entries: [] }, fn);
}

export function registerToolResult(entry: TurnEntry): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.entries.push(entry);
  let total = ctx.entries.reduce((s, e) => s + e.chars, 0);
  if (total <= MAX_TOOL_RESULTS_PER_MESSAGE_CHARS) return;
  // Poda: mayores primero, hasta bajar del presupuesto
  const sorted = [...ctx.entries].sort((a, b) => b.chars - a.chars);
  for (const e of sorted) {
    if (total <= MAX_TOOL_RESULTS_PER_MESSAGE_CHARS) break;
    e.onPrune();
    total -= e.chars;
    e.chars = 0;
  }
}
```

**Archivo:** `src/main/services/aiService.ts` — envolver el cuerpo de `streamText`/`generateText` con `runWithTurnBudget(async () => { ... })` en ambos caminos (líneas ~1303 y ~2110 según el último PR).

**Archivo:** `src/main/services/ai/mcpToolsAdapter.ts` — tras calcular el `text` final (antes de devolver), si no se ha persistido/truncado, registrar para poda diferida:

```ts
const resultId = `${serverId}:${mcpTool.name}:${Date.now()}`;
let mutableText = text;
registerToolResult({
  id: resultId,
  chars: mutableText.length,
  onPrune: () => { mutableText = truncationPlaceholder(maxTokens); },
});
// usar mutableText donde antes se usaba text
```

Nota: como `processToolResult` devuelve sincrónico desde aquí y la poda es reactiva, exponer el resultado a través de un objeto (`{ get text() { return mutableText; } }`) o resolver con una promesa post-poda. El patrón concreto depende de cómo se serializa la respuesta — ver Paso 7 (test) para validar empíricamente antes de comprometerse con una API.

## Paso 6 — Cap declarativo por tool

**Archivo:** `src/main/services/ai/mcpToolsAdapter.ts` — tipo `CreateAISDKToolOptions`:

```ts
export interface CreateAISDKToolOptions {
  // ...existente
  maxResultSizeChars?: number;   // Infinity = opt-out duro
  budgetOverrides?: Record<string, number>; // por nombre de tool, p. ej. desde settings
}
```

Pasar `maxResultSizeChars` al `mcpTool._meta` antes de invocar `processToolResult`, o bien propagarlo explícitamente como parámetro (más limpio):

```ts
export async function processToolResult(
  serverId: string,
  mcpTool: Tool,
  args: Record<string, unknown>,
  result: any,
  protocol: WidgetProtocol = "none",
  budget?: { maxResultSizeChars?: number; overrides?: Record<string, number> },
) { /* ... */ }
```

Y en las dos llamadas actuales (líneas 405, 456) pasar el `budget` derivado de las options del tool.

## Paso 7 — Tests

Nuevos en `src/main/services/mcp/budget/__tests__/`:

- `mcpBudget.test.ts`: `estimateTokens`, `contentContainsImages`.
- `mcpOutputStore.test.ts`: escribe con `wx`, idempotente ante replay, `inferCompactSchema` sobre objetos/arrays, `largeOutputInstructions` contiene filePath + schema.
- `mcpBudgetConfig.test.ts`: env override, `Infinity` hard opt-out, precedencia override→declared→default.
- `mcpTurnBudget.test.ts`: dos entries dentro del presupuesto no podan; tres que suman por encima podan la mayor primero.

Extender `mcpToolsAdapter.image.test.ts`:

- Output de texto > `maxTokens` con persistencia habilitada → devuelve instrucciones con `filePath`.
- Output de texto > `maxTokens` con `hasImages=true` → devuelve placeholder, preserva `images[]`.
- `ENABLE_MCP_LARGE_OUTPUT_FILES=false` → siempre truncado.
- `maxResultSizeChars=Infinity` → no trunca aunque exceda.

Usar `vi.mock("electron", ...)` con `getPath: () => os.tmpdir()` y `vi.mock("../../logging", ...)` (ya es el patrón del repo).

## Paso 8 — Verificación manual

1. `pnpm typecheck` y `pnpm test`.
2. En dev, conectar `chrome-devtools` MCP y ejecutar `take_snapshot` en una página compleja. Verificar:
   - Aparece fichero en `<userData>/mcp-tool-results/`.
   - El mensaje devuelto al modelo contiene `Output has been saved to ...` y `Format: JSON with schema: ...`.
   - El log `mcp_large_result_handled` con `outcome: "persisted"`.
3. Forzar `ENABLE_MCP_LARGE_OUTPUT_FILES=false` y repetir: debe aparecer el placeholder `[OUTPUT TRUNCATED ...]`.
4. Ejecutar una tool que devuelva imagen + texto pequeño: sin cambios (ruta imagen intacta).

## Fuera de alcance (PRs posteriores)

- Settings UI para `budgetOverrides` por tool (por ahora solo env var).
- `countTokens` exacto via API del provider (hoy solo chars/4).
- Limpieza de `mcp-tool-results/` por retention policy.
- Persistencia resiliente entre sesiones (session-scoped dir vs global).

## Orden de commits sugerido

1. Constantes + config (Paso 1).
2. Store + schema inference + tests (Paso 2).
3. Budget helpers + tests (Paso 3).
4. Integración en `processToolResult` + tests de adapter (Paso 4, 6).
5. Turn budget + hook en `aiService` + tests (Paso 5).
6. Docs y verificación manual (Paso 8).
