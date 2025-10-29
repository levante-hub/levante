# Auditoría de Seguridad IPC - Fase 2

**Fecha:** 2025-10-29
**Branch:** feat/electron-security-best-practices
**Auditor:** Levante Security Team

---

## Resumen Ejecutivo

Auditoría exhaustiva de 8 archivos de IPC handlers reveló **postura de seguridad mixta** con **2 vulnerabilidades CRÍTICAS**, **3 HIGH**, **4 MEDIUM**, y **1 LOW**.

### Vulnerabilidades Críticas Identificadas

1. **🔴 SSRF en Model Handlers** - Arbitrary URL fetching sin validación
2. **🔴 API Key Exposure** - Google API key en URL query string
3. **🔴 API Key en process.env** - Exposición a child processes
4. **🔴 SSRF en MCP Extraction** - URL fetching sin protección

### Score de Seguridad IPC

| Categoría | Score | Estado |
|-----------|-------|--------|
| **Input Validation** | 4/10 | ⚠️ Insuficiente |
| **Output Sanitization** | 6/10 | 🟡 Parcial |
| **Access Control** | 3/10 | 🔴 Ausente |
| **Rate Limiting** | 0/10 | 🔴 No implementado |
| **Network Security** | 2/10 | 🔴 Vulnerable |

**Score Global:** **3/10** 🔴 **CRÍTICO**

---

## 1. Handlers Auditados

| Handler | Archivo | Riesgo | Vulnerabilidades Clave |
|---------|---------|--------|------------------------|
| Logger | loggerHandlers.ts | 🟢 LOW | Config sin validar, no rate limit |
| Database | databaseHandlers.ts | 🟡 MEDIUM-HIGH | LIKE injection, no limits |
| Debug | debugHandlers.ts | 🟡 MEDIUM | Information disclosure |
| Preferences | preferencesHandlers.ts | 🟡 MEDIUM | Import sin validar |
| **Models** | **modelHandlers.ts** | **🔴 CRITICAL** | **SSRF, API key en URL** |
| Wizard | wizardHandlers.ts | 🟡 MEDIUM | Debug endpoint en prod |
| **MCP** | **mcpHandlers/*.ts** | **🔴 CRITICAL** | **SSRF, command exec** |
| Profile | profileHandlers.ts | 🟡 MEDIUM | shell.openPath sin validar |

---

## 2. Vulnerabilidades CRÍTICAS (Requieren Acción Inmediata)

### 2.1. SSRF en Model Handlers (modelHandlers.ts)

**Severidad:** 🔴 **CRÍTICA**
**Archivo:** `src/main/ipc/modelHandlers.ts:46-60`
**CWE:** CWE-918 (Server-Side Request Forgery)

**Código Vulnerable:**
```typescript
ipcMain.handle('levante/models/local', async (_, endpoint: string) => {
  const models = await ModelFetchService.fetchLocalModels(endpoint);  // ❌ UNVALIDATED
});

// modelFetchService.ts
static async fetchLocalModels(endpoint: string): Promise<any[]> {
  const response = await fetch(`${endpoint}/api/tags`);  // ❌ SSRF
}
```

**Vector de Ataque:**
```typescript
// Attacker can probe internal services:
window.levante.models.fetchLocalModels('http://192.168.1.1');      // Internal network
window.levante.models.fetchLocalModels('http://127.0.0.1:27017');  // MongoDB
window.levante.models.fetchLocalModels('http://169.254.169.254/latest/meta-data'); // AWS metadata
window.levante.models.fetchLocalModels('file:///etc/passwd');      // Local files
```

**Impacto:**
- Escaneo de red interna
- Acceso a servicios privados (databases, APIs internas)
- Exfiltración de metadata de cloud (AWS, GCP, Azure)
- Lectura de archivos locales via file://

**Remediación:**
```typescript
function validateLocalEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);

  // Only allow http/https
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP/HTTPS protocols allowed');
  }

  // Block private IP ranges
  const hostname = url.hostname;
  const privateIPPatterns = [
    /^localhost$/i,
    /^127\./,
    /^192\.168\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^0\.0\.0\.0$/,
    /^169\.254\.169\.254$/, // AWS metadata
  ];

  if (privateIPPatterns.some(pattern => pattern.test(hostname))) {
    throw new Error('Private IP ranges not allowed');
  }

  return url;
}
```

---

### 2.2. API Key en URL Query String (modelHandlers.ts)

**Severidad:** 🔴 **CRÍTICA**
**Archivo:** `src/main/services/modelFetchService.ts`
**CWE:** CWE-598 (Information Exposure Through Query Strings)

**Código Vulnerable:**
```typescript
static async fetchGoogleModels(apiKey: string): Promise<any[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,  // ❌ KEY IN URL
    { method: 'GET' }
  );
}
```

**Impacto:**
- API key logged en browser HTTP logs
- API key logged en proxy/CDN logs
- API key visible en browser history
- API key puede ser interceptado

**Remediación:**
```typescript
static async fetchGoogleModels(apiKey: string): Promise<any[]> {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1/models',
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,  // ✅ SECURE
        'X-Goog-Api-Key': apiKey,             // Alternative
      }
    }
  );
}
```

---

### 2.3. API Key Exposure en process.env (mcpHandlers/extraction.ts)

**Severidad:** 🔴 **CRÍTICA**
**Archivo:** `src/main/ipc/mcpHandlers/extraction.ts:120-129`
**CWE:** CWE-526 (Information Exposure Through Environmental Variables)

**Código Vulnerable:**
```typescript
const envVarName = `${finalProvider.toUpperCase()}_API_KEY`;
process.env[envVarName] = finalApiKey;  // ❌ EXPOSES TO CHILD PROCESSES

try {
  const result = await generateStructuredOutput(...);
} finally {
  delete process.env[envVarName];  // ❌ NOT GUARANTEED ON CRASH
}
```

**Impacto:**
- API key heredado por todos los child processes
- API key visible a otros procesos del sistema
- No se limpia si el proceso crashea
- Potencial logging de env vars

**Remediación:**
```typescript
// Option 1: Pass directly to function (best)
const result = await generateStructuredOutput(
  prompt,
  finalProvider,
  finalApiKey  // Pass as parameter, don't use env
);

// Option 2: Use secure in-memory storage
const apiKeyStore = new Map<string, string>();
apiKeyStore.set('request-id', finalApiKey);
// ... use from map ...
apiKeyStore.delete('request-id');
```

---

### 2.4. SSRF en MCP URL Fetching (mcpHandlers/extraction.ts)

**Severidad:** 🔴 **CRÍTICA**
**Archivo:** `src/main/ipc/mcpHandlers/extraction.ts:48-86`
**CWE:** CWE-918 (Server-Side Request Forgery)

**Código Vulnerable:**
```typescript
const urlRegex = /^https?:\/\/.+/i;
if (urlRegex.test(text.trim())) {
  const { fetchUrlContent } = await import("../../utils/urlContentFetcher.js");
  const fetchedContent = await fetchUrlContent(text.trim());  // ❌ UNVALIDATED
}
```

**Vector de Ataque:**
Similar a 2.1, permite fetching de URLs arbitrarias.

**Remediación:**
Usar misma validación que en 2.1, más allowlist de dominios permitidos.

---

## 3. Vulnerabilidades HIGH

### 3.1. LIKE Clause Injection (databaseHandlers.ts)

**Severidad:** 🟡 **HIGH**
**Archivo:** `src/main/services/chatService.ts:316-331`
**CWE:** CWE-89 (SQL Injection - variant)

**Código Vulnerable:**
```typescript
async searchMessages(searchQuery: string, sessionId?: string, limit = 50) {
  let sql = 'SELECT * FROM messages WHERE content LIKE ?';
  const params: InValue[] = [`%${searchQuery}%` as InValue];  // ❌ NO ESCAPE
}
```

**Problema:**
Los caracteres especiales de LIKE (`%` y `_`) no se escapan, permitiendo wildcard bypass.

**Ataque:**
```typescript
// Attacker input: "a%" matches anything starting with "a"
// Attacker input: "a_b" matches "a" + any char + "b"
```

**Remediación:**
```typescript
function escapeLikeString(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

async searchMessages(searchQuery: string, sessionId?: string, limit = 50) {
  const escaped = escapeLikeString(searchQuery);
  let sql = 'SELECT * FROM messages WHERE content LIKE ? ESCAPE "\\"';
  const params: InValue[] = [`%${escaped}%` as InValue];
  // ...
}
```

---

### 3.2. MCP Command Execution (mcpHandlers/connection.ts)

**Severidad:** 🟡 **HIGH**
**Archivo:** `src/main/ipc/mcpHandlers/connection.ts`
**CWE:** CWE-78 (OS Command Injection)

**Mitigaciones Existentes (GOOD):**
- ✅ Blocked commands list
- ✅ Blocked flags validation
- ✅ Runtime security checks

**Vulnerabilidades Restantes:**
1. **Whitelist solo para deep links** - Manual UI addition bypasses whitelist
2. **Env variable injection** - No validation de `config.env`
3. **Path escaping** - `ls ${tryPath}` sin escapar en commandResolver.ts:54

**Recomendaciones:**
- Aplicar whitelist a TODAS las configuraciones (no solo deep links)
- Validar nombres y valores de env variables
- Usar spawn con array de args en lugar de string interpolation

---

### 3.3. Debug Information Disclosure (debugHandlers.ts)

**Severidad:** 🟡 **HIGH** (en producción)
**Archivo:** `src/main/ipc/debugHandlers.ts`
**CWE:** CWE-200 (Information Exposure)

**Problema:**
```typescript
// Exposes ALL application paths to renderer
paths: {
  database: directoryService.getDatabasePath(),
  preferences: directoryService.getPreferencesPath(),
  mcpConfig: directoryService.getMcpConfigPath(),
  // ...
}
```

**Remediación:**
```typescript
// Guard with environment check
ipcMain.handle('levante/debug/directory-info', async () => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Debug endpoints disabled in production');
  }
  // ... existing code ...
});
```

---

## 4. Vulnerabilidades MEDIUM

### 4.1. Unvalidated Preferences Import (preferencesHandlers.ts)

**Severidad:** 🟡 **MEDIUM**
**Archivo:** `src/main/ipc/preferencesHandlers.ts:138`

**Problema:**
```typescript
ipcMain.handle('levante/preferences/import', (_, preferences: Partial<UIPreferences>) => {
  preferencesService.import(preferences);  // ❌ NO VALIDATION
});
```

**Remediación:**
Usar Zod para validar estructura antes de import.

---

### 4.2. Wizard Reset sin Auth (wizardHandlers.ts)

**Severidad:** 🟡 **MEDIUM**
**Archivo:** `src/main/ipc/wizardHandlers.ts:87-107`

**Problema:**
Reset endpoint available en producción sin confirmation.

**Remediación:**
```typescript
if (process.env.NODE_ENV !== 'development') {
  throw new Error('Reset only available in development');
}
```

---

### 4.3. Unvalidated shell.openPath (profileHandlers.ts)

**Severidad:** 🟡 **MEDIUM**
**Archivo:** `src/main/ipc/profileHandlers.ts:85-100`

**Problema:**
```typescript
const baseDir = directoryService.getBaseDir();
await shell.openPath(baseDir);  // ❌ NO VALIDATION
```

**Remediación:**
Validar que baseDir es exactamente el esperado antes de abrir.

---

### 4.4. Unvalidated Tool Execution (mcpHandlers/tools.ts)

**Severidad:** 🟡 **MEDIUM**
**Archivo:** `src/main/ipc/mcpHandlers/tools.ts`

**Problema:**
No hay allowlist de tools, cualquier tool puede ser ejecutado.

**Remediación:**
- Implementar allowlist de tools seguros
- Validar argumentos de tools
- Logging de todas las ejecuciones

---

## 5. Issues Transversales

### 5.1. Rate Limiting Ausente (TODOS LOS HANDLERS)

**Severidad:** 🔴 **CRÍTICA**
**Impacto:** DoS vulnerability en todos los endpoints

**Problema:**
Ningún handler implementa rate limiting. Attacker puede spamear operaciones.

**Remediación:**
```typescript
import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiters = {
  database: new RateLimiterMemory({ points: 100, duration: 60 }), // 100 req/min
  models: new RateLimiterMemory({ points: 50, duration: 60 }),
  mcp: new RateLimiterMemory({ points: 10, duration: 60 }),
};

// Apply to handler
ipcMain.handle('levante/db/messages/search', async (event, query) => {
  await rateLimiters.database.consume(event.sender.id);
  // ... rest of handler ...
});
```

---

### 5.2. Input Type Validation Ausente

**Severidad:** 🟡 **MEDIUM**
**Impacto:** Type confusion, unexpected behavior

**Handlers Afectados:**
- loggerHandlers.ts:47 - `config: any`
- mcpHandlers/configuration.ts - multiple `config: any`
- preferencesHandlers.ts:138 - `preferences: Partial<UIPreferences>`

**Remediación:**
Usar Zod para runtime validation:
```typescript
import { z } from 'zod';

const LoggerConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  categories: z.array(z.string()),
});

ipcMain.handle('levante/logger/configure', (_, config) => {
  const validated = LoggerConfigSchema.parse(config); // ✅ THROWS ON INVALID
  // ... use validated ...
});
```

---

### 5.3. Network Timeout Ausente

**Severidad:** 🟡 **MEDIUM**
**Impacto:** Hang vulnerability

**Problema:**
Todos los `fetch()` calls carecen de timeout explícito.

**Remediación:**
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30s

try {
  const response = await fetch(url, { signal: controller.signal });
  // ...
} finally {
  clearTimeout(timeout);
}
```

---

## 6. Patrones de Código Seguros Observados

**✅ Buenas prácticas a mantener:**

1. **Parameterized database queries** - La mayoría de SQL usa parámetros
2. **Type safety con TypeScript** - Strong typing en toda la aplicación
3. **Package whitelisting** - MCP packages restringidos (parcialmente)
4. **Runtime command validation** - Bloqueo de comandos peligrosos
5. **Encrypted API key storage** - Keys encriptadas en reposo
6. **Error handling** - Try-catch blocks en handlers
7. **Detailed logging** - Logging de eventos de seguridad

---

## 7. Plan de Remediación (Priorizado)

### Prioridad INMEDIATA (Esta Semana)

1. ✅ **Fix SSRF en modelHandlers.ts** - Validar URLs, block private IPs
2. ✅ **Fix API key en URL** - Mover a Authorization header
3. ✅ **Fix API key en process.env** - Usar in-memory storage
4. ✅ **Fix SSRF en MCP extraction** - Validar URLs

**Esfuerzo:** 4-6 horas
**Impacto:** Elimina 4 vulnerabilidades CRÍTICAS

---

### Prioridad ALTA (Próxima Semana)

5. ✅ **Implementar rate limiting** - Todos los handlers
6. ✅ **Fix LIKE injection** - Escapar wildcards
7. ✅ **Guard debug endpoints** - Solo en development
8. ✅ **Validar MCP whitelist** - Aplicar a UI también

**Esfuerzo:** 1-2 días
**Impacto:** Previene DoS + information disclosure

---

### Prioridad MEDIA (2-3 Semanas)

9. ✅ **Input validation con Zod** - Todos los handlers
10. ✅ **Network timeouts** - Todos los fetch()
11. ✅ **MCP tool allowlist** - Restringir tools peligrosos
12. ✅ **Preferences validation** - Schema en import

**Esfuerzo:** 3-4 días
**Impacto:** Defensa en profundidad

---

## 8. Métricas de Progreso

| Métrica | Baseline | Objetivo Fase 2 |
|---------|----------|------------------|
| Handlers con rate limiting | 0/8 | 8/8 |
| Handlers con input validation | 2/8 | 8/8 |
| Vulnerabilidades CRÍTICAS | 4 | 0 |
| Vulnerabilidades HIGH | 3 | 0 |
| Network requests con timeout | 0% | 100% |
| Score de seguridad IPC | 3/10 | 8/10 |

---

## 9. Referencias

- **OWASP Top 10 2021:** A01 (Access Control), A03 (Injection), A09 (Components)
- **CWE-918:** Server-Side Request Forgery (SSRF)
- **CWE-89:** SQL Injection
- **CWE-78:** OS Command Injection
- **CWE-598:** Information Exposure Through Query Strings
- **CWE-526:** Information Exposure Through Env Variables
- **CWE-200:** Information Exposure

---

**Auditoría completada:** 2025-10-29
**Próximo paso:** Implementar fixes de vulnerabilidades CRÍTICAS
**Estado:** 🔴 **ACCIÓN REQUERIDA**
