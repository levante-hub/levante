# Local Provider - Arquitectura y Funcionamiento

> Documento técnico exhaustivo sobre cómo funciona el proveedor **Local** en Levante (Ollama, LM Studio, LocalAI y cualquier endpoint OpenAI-compatible).
>
> **Última actualización:** 2026-04-17

---

## Resumen Ejecutivo

El **Local Provider** en Levante permite a los usuarios configurar endpoints locales (Ollama, LM Studio, LocalAI) para ejecutar modelos de IA **sin dependencias cloud**.

**Características clave:**

- Configuración sencilla: solo requiere URL del endpoint.
- **Dual fallback**: soporta tanto la API nativa de Ollama (`/api/tags`) como endpoints OpenAI-compatible (`/v1/models`).
- Descubrimiento automático de modelos disponibles en el servidor.
- Persistencia de configuración y selecciones en `~/levante/ui-preferences.json`.
- Integración nativa con Vercel AI SDK (`createOpenAICompatible`) para streaming.
- Clasificación automática de modelos para determinar capabilities.
- Permite agregar modelos manualmente (user-defined) si el descubrimiento automático falla.

---

## Tabla de Contenidos

1. [Definición y tipos](#1-definición-y-tipos-del-proveedor-local)
2. [Flujo de configuración](#2-flujo-de-configuración)
3. [Descubrimiento y fetching de modelos](#3-descubrimiento-y-fetching-de-modelos-locales)
4. [Inferencia y streaming](#4-inferencia-y-streaming)
5. [UI y UX](#5-ui-y-ux)
6. [ModelStore (Zustand)](#6-modelstore-zustand)
7. [Tests existentes](#7-tests-existentes)
8. [Edge cases y particularidades](#8-edge-cases-y-particularidades)
9. [Flujo completo end-to-end](#9-flujo-completo-end-to-end)
10. [Manifiesto de archivos involucrados](#10-manifiesto-de-archivos-involucrados)

---

## 1. Definición y Tipos del Proveedor Local

### Definición del tipo

**Archivo:** `src/types/models.ts:31-32`

```typescript
export type CloudProviderType = 'openai' | 'anthropic' | 'google' | 'groq' | 'xai' | 'huggingface';
export type ProviderType = 'openrouter' | 'vercel-gateway' | 'local' | 'levante-platform' | CloudProviderType;
```

El valor `'local'` es miembro del tipo unión `ProviderType`.

### Interfaz `ProviderConfig`

**Archivo:** `src/types/models.ts:34-51`

```typescript
export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;       // 'local' para proveedores locales
  apiKey?: string;          // Opcional; usado si el endpoint privado requiere Bearer token
  baseUrl?: string;         // CRÍTICO: URL del endpoint (ej: http://localhost:11434)
  models: Model[];
  selectedModelIds?: string[];
  isActive: boolean;
  settings: Record<string, any>;
  modelSource: 'dynamic' | 'user-defined';
  lastModelSync?: number;
}
```

Para proveedores locales:

- `type`: siempre `'local'`.
- `baseUrl`: URL del endpoint (ej: `http://localhost:11434`).
- `modelSource`: típicamente `'user-defined'`.
- `apiKey`: opcional; solo se envía como `Authorization: Bearer {apiKey}` si el endpoint privado (VPN/gateway) lo requiere. Ignorado por Ollama/LM Studio.

### Inicialización por defecto

**Archivo:** `src/renderer/services/modelService.ts:140-147`

```typescript
{
  id: 'local',
  name: 'Local Provider',
  type: 'local',
  models: [],
  isActive: false,
  settings: {},
  modelSource: 'user-defined'
}
```

---

## 2. Flujo de Configuración

### 2.1 Configuración desde la UI

**Componente:** `src/renderer/pages/ModelPage/ProviderConfigs.tsx:177-224`

```typescript
export const LocalConfig = ({ provider }: { provider: ProviderConfig }) => {
  const { updateProvider, syncProviderModels, syncing } = useModelStore();
  const [baseUrl, setBaseUrl] = React.useState(provider.baseUrl || 'http://localhost:11434');
  const [apiKey, setApiKey] = React.useState(provider.apiKey || '');

  const handleSave = async () => {
    await updateProvider(provider.id, {
      baseUrl,
      apiKey: apiKey.trim() || undefined,
    });
    if (baseUrl) {
      syncProviderModels(provider.id);
    }
  };

  return (
    <div className="space-y-4">
      <Label htmlFor="local-url">{t('base_url.label')}</Label>
      <Input id="local-url" type="url" placeholder="http://localhost:11434" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      <Label htmlFor="local-api-key">{t('api_key.label_local')}</Label>
      <Input id="local-api-key" type="password" placeholder={t('api_key.placeholder_local')} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
      <Button onClick={handleSave}>{t('stats.save')}</Button>
      {provider.baseUrl && (
        <Button onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {t('models.discover')}
        </Button>
      )}
    </div>
  );
};
```

**Flujo:**
1. Usuario ingresa la URL del endpoint (ej: `http://localhost:11434`).
2. Opcionalmente ingresa una API key (solo para endpoints privados detrás de VPN que requieran `Authorization: Bearer`).
3. Al guardar, se llama a `updateProvider(provider.id, { baseUrl, apiKey })`. Un string vacío se guarda como `undefined` para poder borrar la key.
4. Automáticamente dispara `syncProviderModels(provider.id)`.

### 2.2 Persistencia en `ui-preferences.json`

**Archivo:** `src/main/services/preferencesService.ts:26-30`

```typescript
this.store = new Store({
  name: 'ui-preferences',
  cwd: directoryService.getBaseDir(), // ~/levante/
  defaults: DEFAULT_PREFERENCES,
});
```

La configuración se persiste en `~/levante/ui-preferences.json` dentro del array `providers`.

**Ejemplo de estructura persistida:**

```json
{
  "providers": [
    {
      "id": "local",
      "name": "Local Provider",
      "type": "local",
      "baseUrl": "http://localhost:11434",
      "models": [...],
      "selectedModelIds": ["model-id-1", "model-id-2"],
      "isActive": true,
      "modelSource": "user-defined",
      "lastModelSync": 1713358092000
    }
  ],
  "activeProvider": "local"
}
```

### 2.3 `PreferencesService`

**Archivo:** `src/main/services/preferencesService.ts`

Métodos clave:

- `get(key)` → `Promise<unknown>`: obtiene preferencias (incluye el array `providers`).
- `set(key, value)` → `Promise<{success: boolean}>`: persiste cambios.
- **Encriptación**: los API keys se encriptan mediante `encryptProvidersApiKeys()` (no aplica al Local provider, pero el pipeline atraviesa igual).

---

## 3. Descubrimiento y Fetching de Modelos Locales

### 3.1 IPC Handler: `levante/models/local`

**Archivo:** `src/main/ipc/modelHandlers.ts:44-60`

```typescript
ipcMain.handle('levante/models/local', async (_, endpoint: string, apiKey?: string) => {
  try {
    const models = await ModelFetchService.fetchLocalModels(endpoint, apiKey);
    return { success: true, data: models };
  } catch (error) {
    logger.ipc.error('Failed to fetch local models', { endpoint, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});
```

**Invocación desde el renderer** (`src/preload/api/models.ts:8-9`):

```typescript
fetchLocal: (endpoint: string, apiKey?: string) =>
  ipcRenderer.invoke('levante/models/local', endpoint, apiKey),
```

Si `apiKey` está presente, `fetchLocalModels()` añade `Authorization: Bearer {apiKey}` al header de las peticiones tanto a `/api/tags` (Ollama) como a `/v1/models` (OpenAI-compatible). Ollama ignora el header, así que no rompe el flujo sin key.

### 3.2 `ModelFetchService.fetchLocalModels()`

**Archivo:** `src/main/services/modelFetchService.ts:105-203`

Algoritmo de descubrimiento con **dual fallback**:

```
1. Normalizar endpoint (agregar http:// si falta).
2. Validar endpoint URL (SSRF prevention).
3. Intentar Ollama (/api/tags):
   - GET http://localhost:11434/api/tags
   - Timeout: 2000 ms
   - Estructura esperada: { models: [...] }
4. Si falla o retorna 0 modelos:
   - Fallback a OpenAI-compatible (/v1/models)
   - GET http://localhost:11434/v1/models
   - Estructura esperada: { data: [...] }
5. Normalizar respuesta OpenAI a formato Ollama:
   - Asegura campo 'name' (usa 'id' como fallback).
   - Asegura campo 'details'.
```

**Endpoints soportados:**

| Servidor  | `/api/tags` | `/v1/models` | Puerto por defecto |
|-----------|-------------|--------------|--------------------|
| Ollama    | ✓ (preferido) | ✗          | 11434              |
| LM Studio | ✗           | ✓            | 1234               |
| LocalAI   | ✗           | ✓            | 8080               |

**Snippets relevantes:**

```typescript
// Intento Ollama (líneas 122-149)
const ollamaUrl = `${normalizedEndpoint}/api/tags`;
const response = await safeFetch(ollamaUrl, { headers: {...} }, 2000);
if (response.ok && data.models?.length > 0) {
  return data.models;
}

// Fallback OpenAI-compatible (líneas 162-195)
const url = `${normalizedEndpoint}/v1/models`;
const response = await safeFetch(url, { headers: {...} });
const models = data.data || [];
const normalized = models.map((m: any) => ({
  ...m,
  name: m.name || m.id,
  details: m.details || { family: "unknown" },
}));
```

### 3.3 Renderer Provider Service

**Archivo:** `src/renderer/services/model/providers/localProvider.ts`

```typescript
export async function discoverLocalModels(endpoint: string): Promise<Model[]> {
  const result = await window.levante.models.fetchLocal(endpoint);

  if (!result.success) {
    logger.models.warn('Failed to discover local models', { endpoint, error: result.error });
    return [];
  }

  return (result.data || []).map((model: any): Model => ({
    id: model.name,
    name: model.name,
    provider: 'local',
    contextLength: model.details?.context_length || 0,
    capabilities: ['text'],
    isAvailable: true,
    userDefined: false
  }));
}
```

**Mapeo de campos:**

- `model.name` → `Model.id`.
- `model.details.context_length` → `Model.contextLength` (0 si no reportado).
- `capabilities` por defecto: `['text']` (se reclasifica luego en `_doSyncProviderModels`).

### 3.4 Validación del Endpoint

**Archivo:** `src/main/services/apiValidation/providers/local.ts:10-82`

```typescript
export async function validateLocal(
  endpoint: string,
  apiKey?: string
): Promise<ValidationResult> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${endpoint}/api/tags`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    // Fallback OpenAI-compatible
    const fallbackResponse = await fetch(`${endpoint}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!fallbackResponse.ok) {
      return {
        isValid: false,
        error: `Cannot connect to local server. Make sure it's running at ${endpoint}`,
      };
    }
    const fallbackData = await fallbackResponse.json();
    return { isValid: true, modelsCount: fallbackData.data?.length || 0 };
  }

  const data = await response.json();
  return { isValid: true, modelsCount: data.models?.length || 0 };
}
```

**Errores contemplados:**

- Timeout (5 s): `"Connection timeout. Is your local server running at {endpoint}?"`.
- Connection refused: `"Cannot connect to local server..."`.
- HTTP error: intenta fallback automático.

### 3.5 Sincronización en `ModelService`

**Archivo:** `src/renderer/services/modelService.ts:575-783`

Método: `_doSyncProviderModels(providerId)`

Para `provider.type === 'local'` (líneas 591-595):

```typescript
case 'local':
  if (provider.baseUrl) {
    models = await discoverLocalModels(provider.baseUrl);
  }
  break;
```

Luego:

1. **Clasificación de modelos** (líneas 639-682): invoca `classifyModel(model)` para asignar `category` y `computedCapabilities`, con caché.
2. **Restauración de selecciones** (líneas 684-716): si existen `selectedModelIds` persistidos, se usan; en la primera sincronización se auto-seleccionan modelos "top".
3. **Preservación de modelos user-defined** (líneas 718-747): se concatenan al resultado descubierto.
4. **Persistencia** (líneas 771-772):
   ```typescript
   provider.lastModelSync = Date.now();
   await this.saveProviders();
   ```

---

## 4. Inferencia y Streaming

### 4.1 Provider Resolver

**Archivo:** `src/main/services/ai/providerResolver.ts:24-54`

```
1. Resolver target del modelo (plataforma vs provider standalone).
2. Si source === 'provider':
   - Obtener ProviderConfig.
   - Switch por provider.type.
3. Si type === 'local':
   - Llamar a configureLocalProvider(provider, modelId).
```

### 4.2 `configureLocalProvider`

**Archivo:** `src/main/services/ai/providerResolver.ts:147-172`

```typescript
function configureLocalProvider(provider: ProviderConfig, modelId: string) {
  if (!provider.baseUrl) {
    throw new Error(`Local provider endpoint missing for provider ${provider.name}`);
  }

  // Ensure the baseURL has the /v1 suffix for OpenAI compatibility
  let localBaseUrl = provider.baseUrl;
  if (!localBaseUrl.endsWith('/v1')) {
    localBaseUrl = localBaseUrl.replace(/\/$/, '') + '/v1';
  }

  logger.aiSdk.debug("Creating Local provider", {
    modelId,
    baseURL: localBaseUrl,
    hasApiKey: Boolean(provider.apiKey),
  });

  const localProvider = createOpenAICompatible({
    name: "local",
    baseURL: localBaseUrl,
    headers: provider.apiKey
      ? { Authorization: `Bearer ${provider.apiKey}` }
      : undefined,
  });

  return localProvider(modelId);
}
```

**Detalles críticos:**

- Usa `createOpenAICompatible()` del Vercel AI SDK.
- Fuerza el sufijo `/v1` (ej: `http://localhost:11434` → `http://localhost:11434/v1`).
- Si `provider.apiKey` está presente, pasa `headers: { Authorization: 'Bearer ...' }` a `createOpenAICompatible`, que los reenvía en cada request de inferencia. Nunca se loguea la key (solo `hasApiKey: boolean`).

### 4.3 Streaming vía Vercel AI SDK

**Archivo:** `src/main/services/aiService.ts:~1309`

```typescript
const result = streamText({
  model: languageModel, // retornado por getModelProvider()
  system: systemPrompt,
  messages: convertedMessages,
  tools: toolsToUse,
  // ...
});
```

El modelo local realiza:

1. `POST http://localhost:11434/v1/chat/completions`.
2. Con payload OpenAI estándar.
3. Streaming de eventos SSE (`data: {...}`).

### 4.4 Validación de Capacidades

**Archivo:** `src/main/services/aiService.ts:1011-1075`

```typescript
const isLocalProvider = providerType === "local";

// Validate capabilities BEFORE execution (skip for local providers)
if (!isLocalProvider) {
  const validation = validateToolsForModel(modelCapabilities, toolsToUse);
  // ...
}

if (isLocalProvider && toolsToUse.length > 0) {
  this.logger.aiSdk.debug(
    "Attempting tool use with local model (skipping proactive validation)"
  );
}
```

**Comportamiento especial para `local`:**

- No se valida la capacidad proactivamente (los modelos locales suelen tener metadata incompleta).
- Se permite intentar tool-use sin bloquear.
- Se confía en el servidor local para rechazar requests inválidos.

---

## 5. UI y UX

### 5.1 `ProviderConfigPanel`

**Archivo:** `src/renderer/components/providers/ProviderConfigPanel.tsx:95-114`

```typescript
const renderProviderConfig = (provider: ProviderConfig) => {
  switch (provider.type) {
    case 'local':
      return <LocalConfig provider={provider} />;
    // ...
  }
};
```

### 5.2 `ModelList`

```tsx
<ModelList
  models={activeProvider.models.filter((m) => m.isAvailable)}
  showSelection={
    activeProvider.modelSource === 'dynamic' || activeProvider.type === 'local'
  }
  onModelToggle={handleModelToggle}
  searchQuery={searchQuery}
  providerType={activeProvider.type}
/>
```

**Features para `local`:**

- Checkboxes para seleccionar/deseleccionar modelos.
- Botones "Select All" / "Deselect All".
- Botón **Discover** (en lugar de "Sync") para refrescar modelos.
- Búsqueda por nombre de modelo.

### 5.3 Localizaciones

**`src/renderer/locales/en/models.json`:**

```json
{
  "provider_types": {
    "local": "Local AI models (Ollama, LM Studio, etc.)"
  },
  "base_url": {
    "label": "Base URL",
    "help_local": "Default ports: Ollama (11434), LM Studio (1234), LocalAI (8080)"
  }
}
```

**`src/renderer/locales/es/models.json`:**

```json
{
  "provider_types": {
    "local": "Modelos de IA locales (Ollama, LM Studio, etc.)"
  },
  "base_url": {
    "help_local": "Puertos predeterminados: Ollama (11434), LM Studio (1234), LocalAI (8080)"
  }
}
```

---

## 6. ModelStore (Zustand)

**Archivo:** `src/renderer/stores/modelStore.ts`

### Estado

```typescript
interface ModelState {
  providers: ProviderConfig[];
  activeProvider: ProviderConfig | null;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  success: string | null;
}
```

### Actions clave para Local

1. **`initialize()`** (líneas 38-51): carga providers desde `PreferencesService` y obtiene el `activeProvider`.
2. **`updateProvider(providerId, updates)`** (líneas 71-89): actualiza `baseUrl` y persiste via `modelService.updateProvider()`.
3. **`syncProviderModels(providerId)`** (líneas 92-112): llama a `modelService.syncProviderModels()`; para `local` dispara `discoverLocalModels(provider.baseUrl)`.
4. **`toggleModelSelection(providerId, modelId, selected)`** (líneas 115-126): marca modelos como seleccionados y persiste en `selectedModelIds`.

---

## 7. Tests Existentes

### 7.1 `modelService.firstSyncSelection.test.ts`

**Archivo:** `src/renderer/services/modelService.firstSyncSelection.test.ts`

Mock del local provider (línea 60):

```typescript
vi.mock('./model/providers/localProvider', () => ({ discoverLocalModels: vi.fn() }));
```

Casos cubiertos:

- Auto-selección en la primera sincronización.
- Preservación de estado ya persistido.
- Preservación de selecciones en memoria.

### 7.2 Huecos de cobertura

No existen tests específicos para:

- `ModelFetchService.fetchLocalModels()`.
- `localProvider.discoverLocalModels()`.
- `apiValidation/providers/local.validateLocal()`.
- `providerResolver.configureLocalProvider()`.
- Edge cases: servidor offline, timeouts, formatos inesperados.

---

## 8. Edge Cases y Particularidades

### 8.1 Estrategia de dual fallback

El código intenta primero la API nativa de Ollama (`/api/tags`) y, si falla o retorna 0 modelos, cae automáticamente al estándar OpenAI-compatible (`/v1/models`). Máxima compatibilidad con el ecosistema local.

### 8.2 `contextLength` por defecto

**`src/renderer/services/model/providers/localProvider.ts:27`**

```typescript
contextLength: model.details?.context_length || 0,
```

Si el servidor local no reporta `context_length`, se asigna **0**. Esto puede provocar edge cases aguas arriba (p. ej. estimación de tokens).

### 8.3 Capabilities por defecto

**`src/renderer/services/model/providers/localProvider.ts:28`**

```typescript
capabilities: ['text'],
```

Todos los modelos locales arrancan como `'text'`. Posteriormente `_doSyncProviderModels()` los reclasifica mediante `classifyModel()` en base al ID del modelo (p. ej. detecta familias `llava`, `mistral`, `qwen`, etc.).

### 8.4 Sin tool approval para Local

**`src/types/preferences.ts:78`**

```typescript
providersWithoutToolApproval?: ProviderType[];
```

Los usuarios pueden añadir `'local'` para desactivar la confirmación de tool execution (confiando en que el servidor local validará).

### 8.5 URL normalization

**`src/main/utils/urlValidator.ts:183-191`**

```typescript
export function normalizeEndpoint(endpoint: string): string {
  if (endpoint.match(/^https?:\/\//i)) return endpoint;
  return `http://${endpoint}`;
}
```

- Usuario ingresa `localhost:11434` → se normaliza a `http://localhost:11434`.
- En inferencia, se agrega `/v1` → `http://localhost:11434/v1`.

### 8.6 SSRF Protection (permisiva)

**`src/main/utils/urlValidator.ts:194-230`**

`validateLocalEndpoint()` es deliberadamente **permisivo**:

- Valida únicamente el protocol (`http`/`https`).
- Permite `localhost`, IPs privadas y endpoints de metadata.
- **Sin restricción de puertos.**

Rationale (líneas 199-203): "Es una aplicación desktop open-source donde los usuarios tienen control completo. Los endpoints se configuran manualmente, no desde fuentes externas."

### 8.7 Timeouts diferenciados

- **Descubrimiento en sync:** 2 segundos (`modelFetchService.ts:127-132`).
- **Validación manual:** 5 segundos (`apiValidation/providers/local.ts:21`).

Permite que endpoints lentos se descubran durante validación manual, pero fallen rápido en fetches automáticos.

### 8.8 Autenticación opcional para endpoints privados

El campo `provider.apiKey` es **opcional** para el Local provider:

- Si está vacío, no se envía ningún header `Authorization` → compatible con Ollama/LM Studio locales sin autenticación.
- Si está presente, se añade `Authorization: Bearer {apiKey}` en:
  - `fetchLocalModels()` — requests a `/api/tags` y `/v1/models`.
  - `configureLocalProvider()` — header persistente del Vercel AI SDK para todas las llamadas de inferencia.
  - `validateLocal()` — la validación manual del endpoint.
- El valor se persiste encriptado por `PreferencesService` (prefijo `ENCRYPTED:` en `~/levante/ui-preferences.json`) gracias a `encryptProvidersApiKeys()`.
- Caso de uso: conectarse a servidores OpenAI-compatible privados detrás de una VPN o gateway corporativo que requiera un Bearer token. Ollama ignora el header si se envía, por lo que no rompe el flujo sin key.
- Nunca se loguea la key en texto plano — solo `hasApiKey: Boolean(...)`.

### 8.9 Modelos user-defined

**`src/renderer/services/modelService.ts:718-750`**

```typescript
const userDefinedModels = provider.models.filter(m => m.userDefined);
// ...
provider.models = [...models, ...userDefinedModels];
```

Permite agregar modelos manualmente aunque no se descubran automáticamente (útil para modelos no estándar o servidores personalizados).

---

## 9. Flujo Completo End-to-End

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER ACTION: Ingresa "http://localhost:11434" en UI       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. ProviderConfigPanel (React) → LocalConfig.handleSave()   │
│    updateProvider(id, { baseUrl })                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. ModelStore (Zustand) → modelService.updateProvider()     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. PreferencesService (Main) → ~/levante/ui-preferences.json│
│    providers[local].baseUrl = "http://localhost:11434"      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. USER ACTION: Click "Discover"                            │
│    syncProviderModels('local')                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. ModelService (Renderer) → discoverLocalModels(baseUrl)   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. IPC: window.levante.models.fetchLocal(endpoint)          │
│    → 'levante/models/local'                                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. ModelFetchService.fetchLocalModels() (Main)              │
│    GET /api/tags (Ollama) → fallback GET /v1/models         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. Clasificación (Renderer): classifyModel() por modelo     │
│    Asigna category + computedCapabilities (cacheado)        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. Persistencia: selectedModelIds, lastModelSync           │
│     Guardado en ui-preferences.json                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 11. USER ACTION: Selecciona modelo y envía mensaje          │
│     modelRef: "local:llama2"                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 12. Chat Request (Main → aiService)                         │
│     resolveModelTarget("local:llama2")                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 13. providerResolver.configureLocalProvider()               │
│     createOpenAICompatible({ baseURL: ".../v1" })           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 14. Vercel AI SDK streamText()                              │
│     POST http://localhost:11434/v1/chat/completions         │
│     Streaming SSE de vuelta                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Manifiesto de Archivos Involucrados

### Tipos y definiciones

- `src/types/models.ts` — `ProviderType`, `ProviderConfig`, `Model`.
- `src/types/preferences.ts` — `DEFAULT_PREFERENCES`, `UIPreferences`, `providersWithoutToolApproval`.

### Main process (backend)

- `src/main/ipc/modelHandlers.ts` — IPC handler `levante/models/local` (líneas 44-60).
- `src/main/services/modelFetchService.ts` — `fetchLocalModels()` (líneas 105-203).
- `src/main/services/preferencesService.ts` — persistencia de providers.
- `src/main/services/ai/providerResolver.ts` — `configureLocalProvider()` (líneas 147-172).
- `src/main/services/ai/modelTargetResolver.ts` — resolución modelo → provider.
- `src/main/services/apiValidation/providers/local.ts` — `validateLocal()`.
- `src/main/utils/urlValidator.ts` — validación + normalización de URL.
- `src/main/services/aiService.ts` — streaming con el provider local.

### Preload / IPC bridge

- `src/preload/api/models.ts` — bridge IPC para `fetchLocal()`.

### Renderer (frontend)

- `src/renderer/services/modelService.ts` — `ModelService`, `syncProviderModels()` (líneas 559-783).
- `src/renderer/services/model/providers/localProvider.ts` — `discoverLocalModels()`.
- `src/renderer/stores/modelStore.ts` — Zustand store.
- `src/renderer/components/providers/ProviderConfigPanel.tsx` — renderiza `LocalConfig`.
- `src/renderer/pages/ModelPage/ProviderConfigs.tsx` — componente `LocalConfig` (líneas 177-224).
- `src/renderer/pages/ModelPage/ModelList.tsx` — listado de modelos con toggles.

### Localización

- `src/renderer/locales/en/models.json`.
- `src/renderer/locales/es/models.json`.

### Tests

- `src/renderer/services/modelService.firstSyncSelection.test.ts`.

---

## Apéndice: Recomendaciones Futuras

1. **Añadir tests unitarios** dedicados a:
   - `ModelFetchService.fetchLocalModels()` (ambos caminos: Ollama y fallback OpenAI).
   - `validateLocal()` con diferentes estados de conexión.
   - `configureLocalProvider()` con URLs con/sin `/v1`.
2. **Mejorar detección de capabilities** más allá de `['text']` base — p. ej. detectar `llava` automáticamente como vision.
3. **Telemetría opcional** del tipo de servidor local detectado (Ollama vs OpenAI-compatible) para monitorear uso.
4. **Exponer `contextLength` configurable** en la UI para modelos locales que no reportan este dato.
5. **Soporte para múltiples Local providers** (actualmente hay uno con `id: 'local'` fijo; usuarios pueden querer varios endpoints).
