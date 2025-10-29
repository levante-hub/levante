# PRD: Electron Security Hardening & Best Practices

**Documento:** PRD-2025-001
**Fecha Creación:** 2025-10-29
**Última Actualización:** 2025-10-29
**Estado:** 🟢 En Progreso - Fase 1 Completada
**Autor:** Levante Development Team
**Versión:** 1.1.0

---

## Resumen Ejecutivo

Este PRD define las mejoras de seguridad y optimización que se implementarán en Levante para alinear la aplicación con las mejores prácticas de desarrollo de Electron.js. El objetivo es fortalecer la postura de seguridad de la aplicación, mejorar el rendimiento y garantizar una distribución confiable mediante la implementación de medidas de defensa en profundidad.

**Impacto esperado:**
- 🔒 Reducción de superficie de ataque mediante aislamiento estricto
- ⚡ Mejora del rendimiento de arranque y tiempo de respuesta
- 🛡️ Protección robusta contra escalada de privilegios (XSS → RCE)
- 📦 Optimización del tamaño de paquetes distribuibles
- 🔐 Proceso de actualización seguro y automatizado

---

## 1. Contexto y Motivación

### 1.1. Modelo de Amenaza Actual

Levante es una aplicación Electron que combina el motor de renderizado Chromium con Node.js. Esta arquitectura híbrida introduce una superficie de ataque única donde vulnerabilidades web comunes (XSS) pueden escalar a Ejecución Remota de Código (RCE) si no se implementan las defensas adecuadas.

**Riesgos identificados:**
- Potencial escalada de XSS a RCE en procesos renderer
- Exposición innecesaria de APIs privilegiadas
- Falta de validación exhaustiva en canales IPC
- Content Security Policy permisiva (`unsafe-inline`)
- Posible ingeniería inversa del código fuente
- Dependencias con vulnerabilidades conocidas

### 1.2. Estado Actual de Seguridad

**Configuraciones en Levante (Actualizado 2025-10-29):**

| Característica | Estado Inicial | Estado Actual | Estado Objetivo | Progreso |
|---------------|----------------|---------------|-----------------|----------|
| `nodeIntegration` | ✅ `false` | ✅ `false` | `false` | ✅ COMPLETO |
| `contextIsolation` | ✅ `true` | ✅ `true` | `true` | ✅ COMPLETO |
| `sandbox` | ❌ `false` | ✅ `true` | `true` | ✅ **FASE 1** |
| `webSecurity` | ✅ `true` | ✅ `true` | `true` | ✅ COMPLETO |
| CSP | 🟡 Permisiva (5/10) | ✅ Restrictiva (9/10) | Restrictiva | ✅ **FASE 1** |
| Navigation Guards | ❌ Sin implementar | ✅ Implementado | Implementado | ✅ **FASE 1** |
| IPC Validation | 🟡 Parcial | 🟡 Parcial | Completa | ⏳ Fase 2 |
| Code Signing | ❌ Sin implementar | ❌ Sin implementar | Implementado | ⏳ Fase 5 |
| Auto-updates | ✅ Básico | ✅ Básico | Seguras (HTTPS) | ⏳ Fase 5 |

### 1.3. Motivación del Proyecto

- **Seguridad por Defecto:** Alinear con la filosofía moderna de Electron (v12+)
- **Cumplimiento:** Adherir a la checklist oficial de seguridad de Electron
- **Confianza del Usuario:** Firma de código y actualizaciones verificadas
- **Defensa en Profundidad:** Múltiples capas de protección contra amenazas
- **Rendimiento:** Optimizar arranque y uso de recursos

---

## 2. Objetivos

### 2.1. Objetivos Primarios

1. **Implementar Aislamiento Arquitectónico Completo**
   - Configurar `contextIsolation: true` en todos los BrowserWindows
   - Habilitar `sandbox: true` para todos los renderers
   - Eliminar cualquier uso de `nodeIntegration: true`
   - Verificar `webSecurity: true` en todas las ventanas

2. **Reforzar Comunicación IPC Segura**
   - Auditar y validar todos los handlers de `ipcMain`
   - Implementar sanitización en operaciones de filesystem
   - Usar `contextBridge` exclusivamente para exponer APIs
   - Añadir rate limiting en canales sensibles

3. **Implementar Content Security Policy Restrictiva**
   - Eliminar `unsafe-inline` de la CSP actual
   - Configurar CSP para todas las ventanas
   - Restringir fuentes de scripts a `'self'`
   - Deshabilitar plugins y eval

4. **Asegurar Distribución y Actualizaciones**
   - Implementar code signing para macOS (notarización)
   - Implementar code signing para Windows (certificado EV)
   - Configurar auto-updates seguras sobre HTTPS
   - Validar integridad de paquetes

### 2.2. Objetivos Secundarios

5. **Optimizar Rendimiento**
   - Reducir tiempo de arranque mediante lazy loading
   - Implementar bundling con Vite para reducir I/O
   - Descargar tareas pesadas a Worker Threads
   - Optimizar consumo de memoria

6. **Proteger Propiedad Intelectual**
   - Minificar código en producción
   - Ofuscar código sensible
   - Auditar contenido de app.asar

7. **Gestión de Dependencias Segura**
   - Automatizar `npm audit` en CI/CD
   - Mantener Electron actualizado (últimas versiones estables)
   - Implementar Dependabot para dependencias

---

## 3. Alcance

### 3.1. En Alcance (In Scope)

✅ **Seguridad de Procesos**
- Auditoría completa de configuración de `webPreferences`
- Implementación de aislamiento de contexto
- Habilitación de sandboxing en todos los renderers

✅ **IPC Security**
- Revisión de todos los handlers en `src/main/ipc/`
- Validación de inputs en handlers de filesystem
- Sanitización de paths y URLs
- Rate limiting en operaciones costosas

✅ **Content Security Policy**
- Definición de CSP restrictiva
- Aplicación en `index.html` de todos los renderers
- Testing de compatibilidad con UI actual

✅ **Protocol Handlers**
- Auditoría de `safeOpenExternal`
- Validación exhaustiva de URLs y protocolos
- Whitelist de dominios permitidos

✅ **Navegación y WebView**
- Implementación de navigation guards
- Handlers para eventos `will-navigate`
- Bloqueo de navegación no autorizada

✅ **Distribución**
- Configuración de code signing para macOS
- Configuración de code signing para Windows
- Setup de servidor de actualizaciones
- Integración con autoUpdater

✅ **Optimización**
- Implementación de lazy loading de módulos
- Configuración de bundling con Vite
- Optimización de tiempo de arranque
- Reducción de tamaño de paquetes

### 3.2. Fuera de Alcance (Out of Scope)

❌ **No incluido en esta fase:**
- Penetration testing externo
- Certificación de seguridad formal
- Migración a arquitectura de microservicios
- Reescritura de UI framework
- Implementación de telemetría de seguridad

---

## 4. Requisitos

### 4.1. Requisitos Funcionales

#### RF-1: Aislamiento de Procesos
- **RF-1.1:** Todos los BrowserWindows DEBEN configurarse con `contextIsolation: true`
- **RF-1.2:** Todos los BrowserWindows DEBEN configurarse con `sandbox: true`
- **RF-1.3:** Todos los BrowserWindows DEBEN configurarse con `nodeIntegration: false`
- **RF-1.4:** Todos los BrowserWindows DEBEN configurarse con `webSecurity: true`

#### RF-2: IPC Segura
- **RF-2.1:** Todos los handlers de `ipcMain` DEBEN validar inputs
- **RF-2.2:** Operaciones de filesystem DEBEN usar `path.join()` y validar rutas
- **RF-2.3:** No se DEBE exponer `ipcRenderer` directamente al renderer
- **RF-2.4:** Todas las APIs DEBEN exponerse via `contextBridge.exposeInMainWorld()`

#### RF-3: Content Security Policy
- **RF-3.1:** La CSP DEBE especificar `script-src 'self'` (sin `unsafe-inline`)
- **RF-3.2:** La CSP DEBE especificar `object-src 'none'`
- **RF-3.3:** La CSP DEBE aplicarse mediante meta tag en todos los HTML
- **RF-3.4:** La CSP DEBE permitir solo protocolos seguros (https:, levante:)

#### RF-4: Protocol Handlers
- **RF-4.1:** `safeOpenExternal` DEBE validar protocolo (http/https/mailto)
- **RF-4.2:** URLs de dominios externos DEBEN pasar por whitelist
- **RF-4.3:** Protocolos peligrosos (file://, javascript:) DEBEN bloquearse

#### RF-5: Navegación Segura
- **RF-5.1:** DEBE implementarse handler para `will-navigate`
- **RF-5.2:** Navegación fuera de dominio permitido DEBE bloquearse
- **RF-5.3:** `webContents.setWindowOpenHandler` DEBE validar URLs

#### RF-6: Code Signing
- **RF-6.1:** Builds de macOS DEBEN firmarse con Developer ID
- **RF-6.2:** Builds de macOS DEBEN notarizarse con Apple
- **RF-6.3:** Builds de Windows DEBEN firmarse con certificado EV
- **RF-6.4:** Certificados DEBEN gestionarse de forma segura

#### RF-7: Auto-Updates
- **RF-7.1:** `autoUpdater` DEBE configurarse con URL HTTPS
- **RF-7.2:** Servidor de updates DEBE validar integridad de paquetes
- **RF-7.3:** Updates DEBEN verificarse antes de instalarse
- **RF-7.4:** Errores de actualización DEBEN manejarse gracefully

### 4.2. Requisitos No Funcionales

#### RNF-1: Rendimiento
- **RNF-1.1:** Tiempo de arranque NO DEBE aumentar más de 10%
- **RNF-1.2:** Uso de memoria NO DEBE aumentar más de 15%
- **RNF-1.3:** IPC calls NO DEBEN añadir latencia > 5ms por validación

#### RNF-2: Compatibilidad
- **RNF-2.1:** Cambios DEBEN ser retrocompatibles con versión actual
- **RNF-2.2:** UI existente NO DEBE romperse por CSP restrictiva
- **RNF-2.3:** Funcionalidades existentes DEBEN seguir funcionando

#### RNF-3: Mantenibilidad
- **RNF-3.1:** Código DEBE incluir tests para validadores IPC
- **RNF-3.2:** Configuración de seguridad DEBE documentarse en CLAUDE.md
- **RNF-3.3:** Cambios DEBEN seguir arquitectura hexagonal existente

#### RNF-4: Auditoría
- **RNF-4.1:** Configuración de seguridad DEBE ser auditada en CI
- **RNF-4.2:** Dependencias DEBEN auditarse con `npm audit` en CI
- **RNF-4.3:** Logs DEBEN incluir eventos de seguridad relevantes

---

## 5. Especificación Técnica

### 5.1. Configuración de BrowserWindow

**Archivo:** `src/main/main.ts`

```typescript
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // CRÍTICO: Aislamiento de contexto
      contextIsolation: true,

      // CRÍTICO: Sandbox habilitado
      sandbox: true,

      // CRÍTICO: Sin integración de Node en renderer
      nodeIntegration: false,

      // ALTO: Seguridad web habilitada
      webSecurity: true,

      // REQUERIDO: Preload script para IPC
      preload: path.join(__dirname, '../preload/index.js'),

      // ADICIONAL: Deshabilitar características no usadas
      enableRemoteModule: false,
      allowRunningInsecureContent: false,
    },
  });
}
```

### 5.2. Content Security Policy

**Archivo:** `src/renderer/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- CRÍTICO: CSP Restrictiva -->
    <meta
      http-equiv="Content-Security-Policy"
      content="
        default-src 'self';
        script-src 'self';
        style-src 'self' 'unsafe-inline';
        img-src 'self' data: https:;
        font-src 'self' data:;
        connect-src 'self' https:;
        object-src 'none';
        base-uri 'self';
        form-action 'self';
      "
    />

    <title>Levante</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Nota sobre `'unsafe-inline'` en styles:**
- Tailwind CSS y styled-components pueden requerir inline styles
- Evaluar uso de nonces o hashes si es posible
- Documentar excepciones claramente

### 5.3. IPC Validation Pattern

**Archivo:** `src/main/ipc/fileHandlers.ts` (nuevo)

```typescript
import { ipcMain } from 'electron';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getLogger } from '../services/logging';

const logger = getLogger();

// Directorio base seguro
const SAFE_BASE_DIR = app.getPath('userData');

/**
 * Valida y sanitiza un nombre de archivo
 * Previene path traversal
 */
function sanitizeFileName(fileName: string): string {
  // 1. Eliminar path components (solo basename)
  const baseName = path.basename(fileName);

  // 2. Bloquear caracteres peligrosos
  if (/[<>:"|?*\x00-\x1f]/.test(baseName)) {
    throw new Error('Invalid characters in filename');
  }

  // 3. Bloquear nombres especiales de Windows
  const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (windowsReserved.test(baseName.split('.')[0])) {
    throw new Error('Reserved filename');
  }

  return baseName;
}

/**
 * Valida que una ruta esté dentro del directorio permitido
 */
function validatePath(fullPath: string): void {
  const resolved = path.resolve(fullPath);

  if (!resolved.startsWith(SAFE_BASE_DIR)) {
    logger.core.warn('Path traversal attempt blocked', {
      attempted: fullPath,
      resolved,
      allowed: SAFE_BASE_DIR
    });
    throw new Error('Access denied: path outside allowed directory');
  }
}

/**
 * Handler seguro para leer archivos
 */
export function setupFileHandlers(): void {
  ipcMain.handle('file:read', async (event, fileName: unknown) => {
    try {
      // 1. Validar tipo de input
      if (typeof fileName !== 'string') {
        throw new Error('Invalid input: fileName must be a string');
      }

      // 2. Sanitizar nombre de archivo
      const sanitized = sanitizeFileName(fileName);

      // 3. Construir ruta segura
      const fullPath = path.join(SAFE_BASE_DIR, sanitized);

      // 4. Validar que no hay traversal
      validatePath(fullPath);

      // 5. Leer archivo
      const content = await fs.readFile(fullPath, 'utf-8');

      logger.core.debug('File read successfully', { fileName: sanitized });

      return { success: true, data: content };
    } catch (error) {
      logger.core.error('File read failed', {
        fileName,
        error: error instanceof Error ? error.message : error
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}
```

### 5.4. Navigation Guards

**Archivo:** `src/main/main.ts`

```typescript
function createWindow(): void {
  mainWindow = new BrowserWindow({ /* ... */ });

  // Guard: Prevenir navegación no autorizada
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = [
      'levante://', // Protocolo custom de la app
      'file://', // Archivos locales
      'devtools://' // DevTools en desarrollo
    ];

    const urlObj = new URL(url);
    const isAllowed = allowedOrigins.some(origin =>
      url.startsWith(origin)
    );

    if (!isAllowed) {
      logger.core.warn('Navigation blocked', {
        url,
        origin: urlObj.origin
      });
      event.preventDefault();
    }
  });

  // Guard: Validar window.open
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Solo permitir abrir URLs externas vía safeOpenExternal
    if (url.startsWith('http://') || url.startsWith('https://')) {
      safeOpenExternal(url, 'window-open-handler');
      return { action: 'deny' };
    }

    // Bloquear cualquier otro protocolo
    logger.core.warn('window.open blocked', { url });
    return { action: 'deny' };
  });
}
```

### 5.5. Rate Limiting para IPC

**Archivo:** `src/main/utils/rateLimiter.ts` (nuevo)

```typescript
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

class IPCRateLimiter {
  private requests = new Map<string, number[]>();

  constructor(private config: RateLimitConfig) {}

  /**
   * Verifica si una solicitud está dentro del límite
   */
  check(channel: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Obtener requests previas
    let timestamps = this.requests.get(channel) || [];

    // Filtrar requests fuera de la ventana
    timestamps = timestamps.filter(ts => ts > windowStart);

    // Verificar límite
    if (timestamps.length >= this.config.maxRequests) {
      logger.core.warn('Rate limit exceeded', {
        channel,
        count: timestamps.length,
        max: this.config.maxRequests
      });
      return false;
    }

    // Añadir nuevo timestamp
    timestamps.push(now);
    this.requests.set(channel, timestamps);

    return true;
  }

  /**
   * Limpiar timestamps antiguos periódicamente
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [channel, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter(ts => ts > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(channel);
      } else {
        this.requests.set(channel, filtered);
      }
    }
  }
}

// Rate limiter para canales de AI (streaming costoso)
export const aiRateLimiter = new IPCRateLimiter({
  maxRequests: 10, // 10 requests
  windowMs: 60000  // por minuto
});

// Cleanup cada 5 minutos
setInterval(() => aiRateLimiter.cleanup(), 5 * 60 * 1000);
```

**Uso en handler:**

```typescript
ipcMain.handle('levante/chat/stream', async (event, request) => {
  // Rate limiting
  if (!aiRateLimiter.check('chat/stream')) {
    return {
      success: false,
      error: 'Rate limit exceeded. Please wait before sending more messages.'
    };
  }

  // ... resto del handler
});
```

---

## 6. Plan de Implementación

### Fase 1: Auditoría y Configuración Base ✅ COMPLETADA (2025-10-29)

**Objetivo:** Establecer configuración segura base

- [x] **Tarea 1.1:** Auditoría de configuración actual de `webPreferences`
  - ✅ Revisados todos los BrowserWindows en la aplicación
  - ✅ Documentado configuración actual vs. recomendada
  - ✅ Identificado impacto de cambios (0 breaking changes)

- [x] **Tarea 1.2:** Habilitar aislamiento de contexto
  - ✅ `contextIsolation: true` ya estaba configurado
  - ✅ `contextBridge` verificado y funcionando correctamente
  - ✅ Testing de funcionalidad existente - todo OK

- [x] **Tarea 1.3:** Habilitar sandbox
  - ✅ Configurado `sandbox: true` en [src/main/main.ts:80](../../src/main/main.ts#L80)
  - ✅ Análisis exhaustivo: 0 dependencias de Node en renderer
  - ✅ No se requirió migración - arquitectura ya correcta

- [x] **Tarea 1.4:** Verificar webSecurity
  - ✅ Confirmado `webSecurity: true` en todas las ventanas
  - ✅ No hay carga de contenido remoto
  - ✅ CORS y same-origin policy verificados

- [x] **BONUS - Tarea 1.5:** Navigation Guards (planificado para Fase 4)
  - ✅ Implementado `will-navigate` handler en [src/main/main.ts:149-176](../../src/main/main.ts#L149-L176)
  - ✅ Bloquea navegación externa, abre URLs en navegador
  - ✅ Protocol allowlist implementado (http/https/mailto)

- [x] **BONUS - Tarea 1.6:** CSP Mejorada (planificado para Fase 3)
  - ✅ Añadidas 7 directivas de seguridad
  - ✅ **HALLAZGO CRÍTICO:** Eliminado `'unsafe-eval'` - confirmado NO necesario
  - ✅ CSP score: 5/10 → 9/10 (+40%)
  - ✅ Vulnerability CRÍTICA eliminada - eval() bloqueado

**Entregables:**
- ✅ [Documento de auditoría](../../docs/security/audit-fase-1.md)
- ✅ [Análisis de dependencias sandbox](../../docs/security/sandbox-dependency-analysis.md)
- ✅ [ADR-001: Enable Sandbox](../../docs/security/ADR-001-enable-sandbox.md)
- ✅ [Auditoría de CSP](../../docs/security/csp-audit.md)
- ✅ [Resumen de implementación](../../docs/security/FASE-1-IMPLEMENTATION-SUMMARY.md)
- ✅ [Documentación de warnings](../../docs/security/CSP-WARNINGS.md)
- ✅ Configuración base actualizada
- ✅ Testing manual completo - funcionalidad confirmada

**Resultados:**
- 🎯 **Score Electron:** 7/10 → 10/10 (+30%)
- 🎯 **Score CSP:** 5/10 → 9/10 (+40%)
- 🎯 **Vulnerabilidades críticas:** 2 → 0 (-100%)
- 🎯 **Issues resueltos:** 3 planificados + 1 hallazgo crítico = 4 total
- 🎯 **Archivos modificados:** 2 (main.ts, index.html)
- 🎯 **Documentación generada:** 6 archivos (~70 KB)
- 🎯 **Commit:** 2f4434f

### Fase 2: IPC Security & Validation (Semana 3-4)

**Objetivo:** Asegurar todos los canales de comunicación

- [ ] **Tarea 2.1:** Auditoría de handlers IPC
  - Listar todos los handlers en `src/main/ipc/`
  - Identificar handlers que manipulan filesystem
  - Identificar handlers que ejecutan comandos

- [ ] **Tarea 2.2:** Implementar validadores
  - Crear utility de validación de paths
  - Crear utility de sanitización de inputs
  - Implementar rate limiting para operaciones costosas

- [ ] **Tarea 2.3:** Refactorizar handlers
  - Aplicar validación a todos los handlers
  - Usar `path.join()` y `path.resolve()`
  - Añadir logging de intentos de path traversal

- [ ] **Tarea 2.4:** Testing de seguridad
  - Unit tests para validadores
  - Integration tests para handlers
  - Intentar exploits de path traversal

**Entregables:**
- ✅ Utilidades de validación
- ✅ Handlers refactorizados
- ✅ Suite de tests de seguridad

### Fase 3: Content Security Policy (Semana 5)

**Objetivo:** Implementar CSP restrictiva

- [ ] **Tarea 3.1:** Definir CSP inicial
  - Analizar recursos cargados por la aplicación
  - Definir directivas restrictivas
  - Identificar excepciones necesarias (Tailwind, etc.)

- [ ] **Tarea 3.2:** Aplicar CSP en HTML
  - Añadir meta tag en `index.html`
  - Aplicar en todas las ventanas
  - Configurar nonces si es necesario

- [ ] **Tarea 3.3:** Testing de compatibilidad
  - Verificar UI no se rompe
  - Testing de todas las funcionalidades
  - Resolver violations en console

- [ ] **Tarea 3.4:** Documentación
  - Documentar CSP en CLAUDE.md
  - Explicar excepciones
  - Añadir guía de troubleshooting

**Entregables:**
- ✅ CSP implementada y funcional
- ✅ Documentación actualizada
- ✅ UI funcionando sin violations

### Fase 4: Protocol & Navigation Guards (Semana 6)

**Objetivo:** Controlar navegación y apertura de URLs

- [ ] **Tarea 4.1:** Implementar navigation guards
  - Handler para `will-navigate`
  - Handler para `setWindowOpenHandler`
  - Whitelist de orígenes permitidos

- [ ] **Tarea 4.2:** Reforzar safeOpenExternal
  - Auditar uso actual
  - Validar protocolos permitidos
  - Añadir whitelist de dominios confiables

- [ ] **Tarea 4.3:** Testing
  - Intentar navegación maliciosa
  - Intentar abrir protocolos peligrosos
  - Verificar bloqueo correcto

**Entregables:**
- ✅ Navigation guards implementados
- ✅ safeOpenExternal reforzado
- ✅ Tests de navegación segura

### Fase 5: Code Signing & Distribution (Semana 7-8)

**Objetivo:** Configurar firma y distribución segura

- [ ] **Tarea 5.1:** Setup de code signing macOS
  - Obtener Developer ID certificate
  - Configurar notarización con Apple
  - Integrar en proceso de build

- [ ] **Tarea 5.2:** Setup de code signing Windows
  - Obtener certificado EV
  - Configurar firma en build
  - Testing de SmartScreen

- [ ] **Tarea 5.3:** Configurar auto-updates
  - Setup de servidor de updates
  - Configurar `autoUpdater` con HTTPS
  - Implementar validación de integridad

- [ ] **Tarea 5.4:** Testing de distribución
  - Verificar firma en macOS (Gatekeeper)
  - Verificar firma en Windows (SmartScreen)
  - Testing de proceso de actualización

**Entregables:**
- ✅ Code signing configurado para ambas plataformas
- ✅ Sistema de auto-updates funcionando
- ✅ Builds firmadas y verificadas

### Fase 6: Performance Optimization (Semana 9)

**Objetivo:** Optimizar sin comprometer seguridad

- [ ] **Tarea 6.1:** Lazy loading de módulos
  - Identificar módulos no críticos
  - Implementar carga diferida
  - Medir impacto en tiempo de arranque

- [ ] **Tarea 6.2:** Bundling optimization
  - Configurar Vite para producción
  - Minificación y tree-shaking
  - Code splitting si es necesario

- [ ] **Tarea 6.3:** Worker threads para tareas pesadas
  - Identificar operaciones CPU-intensive
  - Migrar a Worker Threads o UtilityProcess
  - Testing de rendimiento

- [ ] **Tarea 6.4:** Análisis de tamaño de paquete
  - Extraer y analizar app.asar
  - Identificar dependencias pesadas
  - Optimizar dependencies vs devDependencies

**Entregables:**
- ✅ Tiempo de arranque optimizado
- ✅ Paquete reducido
- ✅ Métricas de rendimiento documentadas

### Fase 7: Security Auditing & Documentation (Semana 10)

**Objetivo:** Auditar y documentar

- [ ] **Tarea 7.1:** Auditoría de dependencias
  - Setup de Dependabot
  - Integrar `npm audit` en CI
  - Resolver vulnerabilidades encontradas

- [ ] **Tarea 7.2:** Security checklist
  - Verificar cumplimiento de checklist oficial
  - Documentar excepciones justificadas
  - Crear runbook de seguridad

- [ ] **Tarea 7.3:** Actualizar documentación
  - Actualizar CLAUDE.md con mejoras
  - Documentar arquitectura de seguridad
  - Crear guía de troubleshooting

- [ ] **Tarea 7.4:** Training del equipo
  - Sesión sobre mejores prácticas
  - Review de código de seguridad
  - Establecer proceso de security review en PRs

**Entregables:**
- ✅ CI pipeline con auditoría de seguridad
- ✅ Documentación completa
- ✅ Equipo capacitado

---

## 7. Métricas de Éxito

### 7.1. Métricas de Seguridad

| Métrica | Baseline | Actual (Fase 1) | Objetivo | Estado |
|---------|----------|-----------------|----------|---------|
| Electron config score | 7/10 | **10/10** ✅ | 10/10 | ✅ Logrado |
| CSP score | 5/10 | **9/10** ✅ | 10/10 | 🟢 Casi logrado |
| Configuraciones inseguras | 3 | **0** ✅ | 0 | ✅ Logrado |
| Vulnerabilidades críticas CSP | 1 (`unsafe-eval`) | **0** ✅ | 0 | ✅ Logrado |
| Navigation guards | Sin implementar | **Implementado** ✅ | Implementado | ✅ Logrado |
| Vulnerabilidades npm audit | TBD | TBD | 0 (high/critical) | ⏳ Fase 6 |
| Handlers IPC sin validación | TBD | TBD | 0 | ⏳ Fase 2 |
| CSP violations | N/A | 1 (esperado) | 0 violations críticas | ✅ Logrado |

### 7.2. Métricas de Rendimiento

| Métrica | Baseline | Objetivo | Método de Medición |
|---------|----------|----------|-------------------|
| Tiempo de arranque | TBD | <= +10% | `electron --trace-startup` |
| Uso de memoria (idle) | TBD | <= +15% | Chrome DevTools Memory |
| Tamaño de paquete (macOS) | TBD | -20% | Análisis de .dmg |
| Tamaño de paquete (Windows) | TBD | -20% | Análisis de .exe |
| IPC latency (validación) | N/A | < 5ms | Benchmarks |

### 7.3. Métricas de Distribución

| Métrica | Baseline | Objetivo | Método de Medición |
|---------|----------|----------|-------------------|
| Builds firmadas | 0% | 100% | Verificación manual |
| Notarizaciones exitosas (macOS) | 0% | 100% | Apple Developer Portal |
| SmartScreen warnings (Windows) | TBD | 0 | Testing en máquinas limpias |
| Updates automáticas funcionando | TBD | 100% | Testing en staging |

---

## 8. Riesgos y Mitigaciones

### 8.1. Riesgos Técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **CSP rompe UI existente** | Media | Alto | Testing exhaustivo en fase 3, rollback plan |
| **Sandbox bloquea funcionalidad** | Media | Alto | Identificar early, migrar a main process |
| **Code signing falla en CI** | Media | Crítico | Usar servicio de firma en cloud, backup manual |
| **Degradación de rendimiento** | Baja | Medio | Benchmarking continuo, optimizaciones Fase 6 |
| **Breaking changes en API expuesta** | Media | Alto | Versionado de API, tests de integración |

### 8.2. Riesgos de Proyecto

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Extensión de timeline** | Media | Medio | Buffer de 2 semanas, scope reduction si necesario |
| **Falta de certificados EV** | Baja | Crítico | Comprar early, usar servicio cloud como fallback |
| **Incompatibilidades con versiones Electron** | Baja | Alto | Testing en múltiples versiones, LTS support |
| **Resistencia del equipo a cambios** | Baja | Medio | Training, documentación clara, pares en reviews |

---

## 9. Dependencias y Requisitos Previos

### 9.1. Técnicos

- Node.js >= 18.x
- Electron >= 20.x (recomendado latest stable)
- TypeScript >= 5.x
- Vite configurado correctamente
- CI/CD pipeline funcional

### 9.2. Infraestructura

- **Servidor de Updates:**
  - HTTPS obligatorio
  - Almacenamiento para paquetes (.dmg, .exe)
  - API para verificación de versiones

- **Certificados:**
  - Apple Developer Program membership ($99/año)
  - Certificado EV para Windows (~$300-500/año)
  - Almacenamiento seguro de certificados (KeyVault, 1Password, etc.)

### 9.3. Equipo

- 1 desarrollador senior (lead)
- 1 desarrollador mid-level (implementación)
- 1 QA (testing de seguridad)
- Acceso a security expert (consulta)

---

## 10. Criterios de Aceptación

### 10.1. Funcionales

- [ ] Todas las configuraciones de `webPreferences` cumplen con checklist oficial
- [ ] 100% de handlers IPC tienen validación de inputs
- [ ] CSP restrictiva implementada sin violations
- [ ] Navigation guards bloquean navegación maliciosa
- [ ] Code signing funciona en ambas plataformas
- [ ] Auto-updates funcionan sobre HTTPS

### 10.2. No Funcionales

- [ ] Tiempo de arranque <= baseline + 10%
- [ ] Uso de memoria <= baseline + 15%
- [ ] Tamaño de paquetes reducido >= 20%
- [ ] 0 vulnerabilidades high/critical en `npm audit`
- [ ] Documentación actualizada y completa
- [ ] Tests de seguridad pasando en CI

### 10.3. Documentación

- [ ] CLAUDE.md actualizado con arquitectura de seguridad
- [ ] Security checklist completado y documentado
- [ ] Runbook de troubleshooting creado
- [ ] Guía de code signing documentada
- [ ] Training del equipo completado

---

## 11. Testing Strategy

### 11.1. Security Testing

**Unit Tests:**
- Validadores de paths (sanitizeFileName, validatePath)
- Validadores de URLs (protocol checks)
- Rate limiters

**Integration Tests:**
- IPC handlers con inputs maliciosos
- Navigation attempts bloqueadas
- CSP enforcement

**Manual Security Testing:**
- Intentar path traversal (../../../etc/passwd)
- Intentar protocol injection (javascript:, file:)
- Intentar XSS en campos de input
- Verificar aislamiento de contexto

### 11.2. Performance Testing

**Benchmarks:**
- Tiempo de arranque (10 ejecuciones, promedio)
- Memoria en idle (snapshot después de 5 minutos)
- Latencia de IPC (1000 requests, percentile 95)

**Profiling:**
- Chrome DevTools Performance
- Node.js --cpu-prof
- Memory heap snapshots

### 11.3. Distribution Testing

**macOS:**
- Verificar firma: `codesign --verify --verbose /path/to/app`
- Verificar notarización: `spctl -a -v /path/to/app`
- Testing en máquina limpia (sin Xcode)

**Windows:**
- Verificar firma: Properties > Digital Signatures
- Testing con SmartScreen
- Testing en máquina limpia (sin VS)

**Auto-Updates:**
- Simular update desde versión antigua
- Verificar rollback en caso de error
- Testing de update interrumpido

---

## 12. Rollout Plan

### 12.1. Staged Rollout

**Fase Alpha (Internal):**
- Deploy a equipo de desarrollo (10 usuarios)
- Duración: 1 semana
- Objetivo: Detectar regressions obvias

**Fase Beta (Early Adopters):**
- Deploy a usuarios early adopters (~50 usuarios)
- Duración: 2 semanas
- Objetivo: Feedback de uso real, testing de updates

**Fase GA (General Availability):**
- Deploy gradual a todos los usuarios (10% → 50% → 100%)
- Duración: 1 semana
- Objetivo: Monitorear estabilidad y rendimiento

### 12.2. Rollback Plan

**Triggers de Rollback:**
- Crash rate > 5%
- Funcionalidad crítica rota
- Degradación de rendimiento > 25%
- Vulnerabilidad de seguridad descubierta

**Proceso:**
1. Pausar rollout inmediatamente
2. Notificar a usuarios en versión nueva
3. Revertir servidor de updates a versión anterior
4. Comunicar issue y timeline de fix

---

## 13. Referencias

### 13.1. Documentación Oficial

- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater)

### 13.2. Herramientas y Librerías

- [electron-vite](https://electron-vite.org/)
- [Electron Forge](https://www.electronforge.io/)
- [Electron Builder](https://www.electron.build/)
- [Dependabot](https://github.com/dependabot)

### 13.3. Security Research

- [Electronegativity](https://github.com/doyensec/electronegativity) - Security scanner
- [Electron Security Guidelines](https://github.com/moloch--/electron-security-tutorial)
- [OWASP Electron Security](https://owasp.org/www-community/vulnerabilities/Electron_Security)

### 13.4. Documentación Interna

- `docs/guides/configuration-storage.md` - Sistema de configuración actual
- `CLAUDE.md` - Arquitectura y guías de desarrollo
- `docs/PRD/security-electron.md` - Documento de referencia exhaustivo

---

## 14. Apéndices

### Apéndice A: Security Checklist Completa

Basada en la checklist oficial de Electron:

#### Configuración de BrowserWindow
- [ ] 1. Usar `contextIsolation: true`
- [ ] 2. Usar `sandbox: true`
- [ ] 3. Deshabilitar `nodeIntegration` (false)
- [ ] 4. Habilitar `webSecurity` (true)
- [ ] 5. Deshabilitar `allowRunningInsecureContent`
- [ ] 6. No usar `enableRemoteModule`
- [ ] 7. Definir `preload` script

#### IPC y Comunicación
- [ ] 8. Usar `contextBridge` para exponer APIs
- [ ] 9. No exponer `ipcRenderer` completo
- [ ] 10. Validar todos los inputs de IPC
- [ ] 11. Sanitizar paths y URLs
- [ ] 12. Usar `invoke/handle` sobre `send/on`

#### Carga de Contenido
- [ ] 13. Validar URLs antes de cargar
- [ ] 14. Implementar CSP restrictiva
- [ ] 15. No deshabilitar webSecurity
- [ ] 16. Validar protocol handlers

#### Navegación
- [ ] 17. Manejar evento `will-navigate`
- [ ] 18. Usar `setWindowOpenHandler`
- [ ] 19. Validar URLs externas
- [ ] 20. No permitir `file://` navigation

#### Dependencias
- [ ] 21. Mantener Electron actualizado
- [ ] 22. Auditar dependencias regularmente
- [ ] 23. Usar `npm audit` en CI
- [ ] 24. Revisar dependencias transitivas

#### Distribución
- [ ] 25. Firmar código (macOS)
- [ ] 26. Notarizar app (macOS)
- [ ] 27. Firmar con EV certificate (Windows)
- [ ] 28. Updates solo por HTTPS
- [ ] 29. Verificar integridad de updates

#### Código
- [ ] 30. Minificar código en producción
- [ ] 31. Ofuscar código sensible
- [ ] 32. No incluir secretos en código
- [ ] 33. Usar variables de entorno

### Apéndice B: Comandos Útiles

**Auditoría de Seguridad:**
```bash
# Auditar dependencias
npm audit

# Auditar con fix automático
npm audit fix

# Ver solo vulnerabilidades high/critical
npm audit --audit-level=high

# Scan con electronegativity
npx electronegativity -i .
```

**Análisis de Paquete:**
```bash
# Extraer app.asar
npx asar extract app.asar ./extracted

# Ver tamaño de directorios
du -sh extracted/*

# Buscar archivos grandes
find extracted -type f -size +1M
```

**Verificación de Firma:**
```bash
# macOS: Verificar firma
codesign --verify --verbose /path/to/Levante.app

# macOS: Verificar notarización
spctl -a -v /path/to/Levante.app

# macOS: Ver detalles de firma
codesign -dvvv /path/to/Levante.app

# Windows: Ver firma (PowerShell)
Get-AuthenticodeSignature -FilePath "Levante.exe"
```

**Profiling:**
```bash
# Startup profiling
electron --trace-startup app

# CPU profiling
node --cpu-prof main.js

# Heap profiling
node --heap-prof main.js
```

---

**Fin del Documento**

---

## Historial de Cambios

| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 1.0.0 | 2025-10-29 | Levante Team | Versión inicial del PRD |
