# Plan de implementación: API Key opcional para Local Provider

> Objetivo: permitir que el usuario configure una **API key opcional** en el Local Provider para poder conectarse a endpoints privados detrás de VPN u otros servidores OpenAI-compatible que requieran autenticación, sin romper el flujo actual (Ollama sin key).
>
> **Fecha:** 2026-04-17
> **Estado:** Propuesta — pendiente de implementación.

---

## Resumen

Hoy el Local Provider ignora `ProviderConfig.apiKey`. Hay que propagar la key en **tres rutas**:

1. **Inferencia** (streaming vía Vercel AI SDK).
2. **Descubrimiento de modelos** (`/api/tags` + `/v1/models`).
3. **Validación manual** de endpoint.

Y exponer el campo en la **UI** (`LocalConfig`).

La encriptación en disco ya la aplica `PreferencesService` automáticamente a `providers[].apiKey` — **no hay que tocar almacenamiento ni añadir migraciones**.

---

## Archivos afectados (resumen)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `src/renderer/pages/ModelPage/ProviderConfigs.tsx` | Añadir input `apiKey` opcional en `LocalConfig` |
| 2 | `src/main/services/ai/providerResolver.ts` | Pasar `Authorization` header en `configureLocalProvider` |
| 3 | `src/main/services/modelFetchService.ts` | Aceptar `apiKey?` en `fetchLocalModels` y enviar header |
| 4 | `src/main/ipc/modelHandlers.ts` | Reenviar `apiKey` desde IPC |
| 5 | `src/preload/api/models.ts` | Ampliar firma `fetchLocal(endpoint, apiKey?)` |
| 6 | `src/renderer/services/model/providers/localProvider.ts` | `discoverLocalModels(endpoint, apiKey?)` |
| 7 | `src/renderer/services/modelService.ts` | Pasar `provider.apiKey` al discover |
| 8 | `src/main/services/apiValidation/providers/local.ts` | Aceptar `apiKey?` y enviar header |
| 9 | `src/renderer/locales/en/models.json` | Strings i18n |
| 10 | `src/renderer/locales/es/models.json` | Strings i18n |
| 11 | `src/types/models.ts` *(opcional)* | Actualizar comentario sobre `apiKey` |
| 12 | `docs/developer/local-provider-architecture.md` *(opcional)* | Refrescar doc |

---

## Paso a paso

### Paso 1 — Preload: ampliar firma del bridge IPC

**Archivo:** `src/preload/api/models.ts`

**Cambio (línea 8-9):**

```ts
// Antes
fetchLocal: (endpoint: string) =>
  ipcRenderer.invoke('levante/models/local', endpoint),
```

```ts
// Después
fetchLocal: (endpoint: string, apiKey?: string) =>
  ipcRenderer.invoke('levante/models/local', endpoint, apiKey),
```

> Sin esto, el renderer no podría mandar la key al main process.

---

### Paso 2 — IPC handler: reenviar `apiKey`

**Archivo:** `src/main/ipc/modelHandlers.ts` (líneas 44-60)

**Cambio:**

```ts
// Antes
ipcMain.handle('levante/models/local', async (_, endpoint: string) => {
  try {
    const models = await ModelFetchService.fetchLocalModels(endpoint);
    return { success: true, data: models };
  } catch (error) {
    logger.ipc.error('Failed to fetch local models', { endpoint, error: error instanceof Error ? error.message : error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});
```

```ts
// Después
ipcMain.handle('levante/models/local', async (_, endpoint: string, apiKey?: string) => {
  try {
    const models = await ModelFetchService.fetchLocalModels(endpoint, apiKey);
    return { success: true, data: models };
  } catch (error) {
    logger.ipc.error('Failed to fetch local models', { endpoint, error: error instanceof Error ? error.message : error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});
```

> No loguear la `apiKey` nunca — mantener solo `endpoint` en el log.

---

### Paso 3 — Descubrimiento: enviar `Authorization` en Ollama y OpenAI-compatible

**Archivo:** `src/main/services/modelFetchService.ts` (líneas 105-203)

**Cambios:**

1. Firma del método (línea 106):

```ts
// Antes
static async fetchLocalModels(endpoint: string): Promise<any[]> {
```

```ts
// Después
static async fetchLocalModels(endpoint: string, apiKey?: string): Promise<any[]> {
```

2. Construir headers helper (justo después de validar el endpoint, alrededor de la línea 121):

```ts
const authHeaders: Record<string, string> = {
  "Content-Type": "application/json",
};
if (apiKey) {
  authHeaders.Authorization = `Bearer ${apiKey}`;
}
```

3. Usar `authHeaders` en ambos `safeFetch`:

```ts
// Línea ~127-133 (Ollama)
const response = await safeFetch(
  ollamaUrl,
  { headers: authHeaders },
  2000
);
```

```ts
// Línea ~167-171 (OpenAI-compatible fallback)
const response = await safeFetch(url, {
  headers: authHeaders,
});
```

> Ollama ignora el header `Authorization`, así que no rompe el flujo existente.

---

### Paso 4 — Renderer provider service: propagar `apiKey`

**Archivo:** `src/renderer/services/model/providers/localProvider.ts`

**Reemplazo completo de `discoverLocalModels`:**

```ts
export async function discoverLocalModels(
  endpoint: string,
  apiKey?: string
): Promise<Model[]> {
  try {
    const result = await window.levante.models.fetchLocal(endpoint, apiKey);

    if (!result.success) {
      logger.models.warn('Failed to discover local models', {
        endpoint,
        error: result.error
      });
      return [];
    }

    const data = result.data || [];

    return data.map((model: any): Model => ({
      id: model.name,
      name: model.name,
      provider: 'local',
      contextLength: model.details?.context_length || 0,
      capabilities: ['text'],
      isAvailable: true,
      userDefined: false
    }));
  } catch (error) {
    logger.models.error('Failed to discover local models', {
      endpoint,
      error: error instanceof Error ? error.message : error
    });
    return [];
  }
}
```

---

### Paso 5 — `ModelService._doSyncProviderModels`: pasar la key

**Archivo:** `src/renderer/services/modelService.ts` (líneas 591-595)

**Cambio:**

```ts
// Antes
case 'local':
  if (provider.baseUrl) {
    models = await discoverLocalModels(provider.baseUrl);
  }
  break;
```

```ts
// Después
case 'local':
  if (provider.baseUrl) {
    models = await discoverLocalModels(provider.baseUrl, provider.apiKey);
  }
  break;
```

---

### Paso 6 — Inferencia: inyectar `Authorization` en el AI SDK

**Archivo:** `src/main/services/ai/providerResolver.ts` (líneas 147-172)

**Reemplazo completo de `configureLocalProvider`:**

```ts
function configureLocalProvider(provider: ProviderConfig, modelId: string) {
  if (!provider.baseUrl) {
    throw new Error(
      `Local provider endpoint missing for provider ${provider.name}`
    );
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

> **Nunca** loguear `provider.apiKey`. Solo `hasApiKey: boolean`.

---

### Paso 7 — Validación manual: enviar header si hay key

**Archivo:** `src/main/services/apiValidation/providers/local.ts`

**Reemplazo completo:**

```ts
import { getLogger } from '../../logging';
import type { ValidationResult, ModelsResponse } from '../types';

const logger = getLogger();

/**
 * Validate local endpoint (Ollama, LM Studio, private OpenAI-compatible).
 */
export async function validateLocal(
  endpoint: string,
  apiKey?: string
): Promise<ValidationResult> {
  try {
    if (!endpoint) {
      return {
        isValid: false,
        error: 'Endpoint is required for local models',
      };
    }

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    // Try Ollama endpoint first
    const response = await fetch(`${endpoint}/api/tags`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Try OpenAI-compatible endpoint as fallback
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

      const fallbackData = await fallbackResponse.json() as ModelsResponse;
      const modelsCount = fallbackData.data?.length || 0;

      logger.core.info('Local validation successful (OpenAI-compatible)', {
        endpoint,
        modelsCount,
        hasApiKey: Boolean(apiKey),
      });

      return { isValid: true, modelsCount };
    }

    const data = await response.json() as ModelsResponse;
    const modelsCount = data.models?.length || 0;

    logger.core.info('Local validation successful (Ollama)', {
      endpoint,
      modelsCount,
      hasApiKey: Boolean(apiKey),
    });

    return { isValid: true, modelsCount };
  } catch (error) {
    logger.core.error('Local validation error', {
      error: error instanceof Error ? error.message : error,
      endpoint,
    });

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        isValid: false,
        error: `Connection timeout. Is your local server running at ${endpoint}?`,
      };
    }

    return {
      isValid: false,
      error: `Cannot connect to local server. Make sure it's running at ${endpoint}`,
    };
  }
}
```

> Buscar callers de `validateLocal` con `Grep` y añadirles `provider.apiKey` como segundo argumento (todos deberían estar en el flujo de "Validar endpoint" del UI).

---

### Paso 8 — UI: añadir input opcional de API key

**Archivo:** `src/renderer/pages/ModelPage/ProviderConfigs.tsx` (líneas 177-224)

**Reemplazo completo de `LocalConfig`:**

```tsx
export const LocalConfig = ({ provider }: { provider: ProviderConfig }) => {
  const { t } = useTranslation('models');
  const { updateProvider, syncProviderModels, syncing } = useModelStore();
  const [baseUrl, setBaseUrl] = React.useState(provider.baseUrl || 'http://localhost:11434');
  const [apiKey, setApiKey] = React.useState(provider.apiKey || '');

  // Sync local state when provider changes
  React.useEffect(() => {
    setBaseUrl(provider.baseUrl || 'http://localhost:11434');
    setApiKey(provider.apiKey || '');
  }, [provider.baseUrl, provider.apiKey]);

  const handleSave = async () => {
    await updateProvider(provider.id, {
      baseUrl,
      apiKey: apiKey.trim() || undefined,
    });
    if (baseUrl) {
      syncProviderModels(provider.id);
    }
  };

  const handleSync = () => {
    syncProviderModels(provider.id);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="local-url">{t('base_url.label')}</Label>
        <Input
          id="local-url"
          type="url"
          placeholder="http://localhost:11434"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('base_url.help_local')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="local-api-key">{t('api_key.label_local')}</Label>
        <Input
          id="local-api-key"
          type="password"
          placeholder={t('api_key.placeholder_local')}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">{t('api_key.help_local')}</p>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave}>{t('stats.save')}</Button>
        {provider.baseUrl && (
          <Button onClick={handleSync} disabled={syncing} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {t('models.discover')}
          </Button>
        )}
      </div>
    </div>
  );
};
```

> El `apiKey.trim() || undefined` permite **borrar** la key dejando el campo vacío y guardando.

---

### Paso 9 — i18n: strings en inglés y español

**Archivo:** `src/renderer/locales/en/models.json`

Añadir bajo la clave `api_key` (crearla si no existe):

```json
{
  "api_key": {
    "label_local": "API Key (optional)",
    "placeholder_local": "Leave empty if your server does not require authentication",
    "help_local": "Only needed for private endpoints behind VPN or gateways that require a Bearer token. Not required for local Ollama/LM Studio."
  }
}
```

**Archivo:** `src/renderer/locales/es/models.json`

```json
{
  "api_key": {
    "label_local": "API Key (opcional)",
    "placeholder_local": "Déjalo vacío si tu servidor no requiere autenticación",
    "help_local": "Solo es necesaria para endpoints privados detrás de VPN o gateways que requieran un Bearer token. No hace falta para Ollama/LM Studio local."
  }
}
```

> Si ya existen otras subclaves dentro de `api_key` en los JSON, hacer **merge** en lugar de sobrescribir.

---

### Paso 10 *(opcional)* — Limpiar comentario desactualizado en types

**Archivo:** `src/types/models.ts` (líneas 34-51)

Si el comentario dice "No utilizado en local" sobre `apiKey`, actualizarlo:

```ts
apiKey?: string;  // Cloud providers + optional for private local endpoints behind VPN
```

---

### Paso 11 *(opcional)* — Refrescar la doc existente

**Archivo:** `docs/developer/local-provider-architecture.md`

Secciones a actualizar:

- **§1 "Interfaz `ProviderConfig`"**: cambiar la nota de `apiKey` a "opcional; usado si el endpoint privado requiere Bearer token".
- **§2.1**: reflejar el nuevo input en `LocalConfig`.
- **§3.2** y **§3.4**: añadir que ahora se envía `Authorization: Bearer {apiKey}` si existe.
- **§4.2**: reflejar que `createOpenAICompatible` recibe `headers`.
- **§8**: añadir un nuevo edge case "Autenticación opcional para endpoints privados".

---

## Pruebas manuales

Después de implementar, validar:

1. **Ollama local sin key**: funciona igual que antes (no se envía `Authorization`). Discover muestra modelos. Chat stream OK.
2. **Endpoint privado con key correcta**:
   - Guardar URL + API key.
   - Click "Discover" → aparecen modelos.
   - Enviar mensaje → respuesta en streaming.
3. **Endpoint privado con key incorrecta**: Discover falla con 401; mensaje de error visible en UI.
4. **Borrar la key**: vaciar el input + Save → `provider.apiKey === undefined`, siguiente request no envía header.
5. **Persistencia**: reiniciar la app → la key sigue ahí, encriptada (`ENCRYPTED:` prefix en `~/levante/ui-preferences.json`).

## Tests unitarios recomendados (opcional, PR aparte)

- `fetchLocalModels(endpoint, apiKey)` con mock de `safeFetch` comprobando que el header `Authorization` se envía solo cuando hay key.
- `configureLocalProvider` con y sin `provider.apiKey`: verificar el argumento `headers` pasado a `createOpenAICompatible`.
- `validateLocal` con 401 → `isValid: false`.

---

## Consideraciones de seguridad

- **Nunca loguear la key**: usar `hasApiKey: Boolean(...)` en los `logger.*.debug/info`.
- **TLS con CA corporativa**: si el endpoint HTTPS usa un cert de CA privada de la VPN, puede fallar por TLS. **No** añadir `rejectUnauthorized: false` como primera opción — primero verificar que Electron pueda confiar en la CA del sistema. Si aparece el problema, abrir issue aparte.
- **SSRF**: `validateLocalEndpoint` ya es permisivo (documentado en §8.6 de `local-provider-architecture.md`), así que IPs privadas de la VPN siguen permitidas.
- **Backwards compatibility**: al ser `apiKey` opcional y la rama OLLAMA ignorar el header, no se rompe ninguna instalación existente.

---

## Orden sugerido de commits

1. **feat(local): thread optional apiKey through ipc + discover** — Pasos 1-5.
2. **feat(local): send Bearer token in inference and validation** — Pasos 6-7.
3. **feat(local): add optional api key input to LocalConfig UI** — Pasos 8-9.
4. **docs(local): document optional api key for private endpoints** — Pasos 10-11.

Cada commit debe ser verde en `pnpm typecheck` y `pnpm lint` de forma independiente.
