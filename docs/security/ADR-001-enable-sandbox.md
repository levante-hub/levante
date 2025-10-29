# ADR-001: Habilitar Sandbox en Renderer Process

**Estado:** ✅ APROBADO
**Fecha:** 2025-10-29
**Autores:** Levante Security Team
**Issue Relacionado:** [Audit Fase 1 - Issue #1](audit-fase-1.md#issue-1-sandbox-deshabilitado)

---

## Contexto y Problema

La configuración actual del `BrowserWindow` principal tiene `sandbox: false` con el comentario:

```typescript
// src/main/main.ts:80
sandbox: false, // Required for some native modules
```

Esto va contra las recomendaciones de seguridad de Electron 20+ que habilita sandbox por defecto. El sandbox de Chromium proporciona una capa crítica de defensa contra exploits en el renderer process.

**Pregunta:** ¿Podemos habilitar `sandbox: true` sin romper funcionalidad?

---

## Análisis Realizado

Se ejecutó un análisis exhaustivo documentado en [sandbox-dependency-analysis.md](./sandbox-dependency-analysis.md) que examinó:

1. ✅ Uso de `require()` en renderer → NO encontrado
2. ✅ Imports de módulos Node.js → NO encontrado
3. ✅ Uso de `process.*` → Solo build-time constants
4. ✅ Node.js globals (`__dirname`, `Buffer`) → NO encontrado
5. ✅ `@electron/remote` → NO usado
6. ✅ Módulos nativos → Todos en main process
7. ✅ Crypto APIs → Solo Web Crypto API (compatible)

**Resultado:** CERO dependencias que requieran acceso a Node.js en renderer.

---

## Decisión

**✅ HABILITAR `sandbox: true` INMEDIATAMENTE**

**Razones:**

1. **Evidencia Técnica Contundente:**
   - NO hay código en renderer que requiera Node.js
   - Toda funcionalidad crítica usa IPC o Web APIs
   - Arquitectura actual ya está correctamente diseñada

2. **Beneficio de Seguridad Significativo:**
   - Previene escalación de XSS a RCE
   - Aísla renderer comprometido del sistema
   - Cumple con mejores prácticas modernas

3. **Bajo Riesgo de Regresión:**
   - Código actual compatible
   - Testing exhaustivo confirmará
   - Fácil rollback si surge problema

4. **Comentario Incorrecto:**
   - "Required for some native modules" es **falso**
   - Posiblemente de versión antigua del código
   - NO hay evidencia de estos módulos

---

## Consecuencias

### Positivas

1. **Mejor Seguridad:**
   - Defensa en profundidad contra exploits
   - Reducción significativa de superficie de ataque
   - Alineación con industry standards

2. **Cumplimiento:**
   - Sigue recomendaciones oficiales de Electron
   - Pasa auditorías de seguridad
   - Preparado para futuras versiones de Electron

3. **Sin Costo de Performance:**
   - Sandbox tiene overhead mínimo
   - Invisible para usuarios

### Negativas (Mitigadas)

1. **Testing Requerido:**
   - **Mitigación:** Testing exhaustivo manual y automatizado
   - **Esfuerzo:** ~2-4 horas de testing

2. **Documentación:**
   - **Mitigación:** Esta ADR + actualización de CLAUDE.md
   - **Esfuerzo:** ~30 minutos

3. **Restricción Futura:**
   - Desarrolladores NO podrán usar Node.js en renderer
   - **Mitigación:** Linting rules + documentación + code review
   - **Beneficio:** Fuerza buena arquitectura

---

## Implementación

### Cambio de Código

**Archivo:** `src/main/main.ts`
**Línea:** 80

```diff
  webPreferences: {
    preload: join(__dirname, "preload.js"),
-   sandbox: false, // Required for some native modules
+   sandbox: true, // ✅ Enabled - renderer uses only Web APIs
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
  },
```

### Plan de Testing

**Fase 1: Testing Manual (Crítico)**
- [ ] Inicio de aplicación
- [ ] OAuth flow (OpenRouter) - usa Web Crypto API
- [ ] Chat streaming - usa IPC
- [ ] Model sync - usa IPC
- [ ] Settings persistence - usa IPC
- [ ] MCP server management - usa IPC
- [ ] Deep linking
- [ ] Wizard flow

**Fase 2: E2E Automatizado**
- [ ] `pnpm test:e2e` pasa completamente
- [ ] No errores en consola

**Fase 3: DevTools Verification**
- [ ] No warnings sobre sandbox
- [ ] No access denied errors
- [ ] Performance profile normal

---

## Alternativas Consideradas

### Alternativa 1: Mantener sandbox: false

**Pros:**
- Sin riesgo de regresión
- Sin testing requerido

**Cons:**
- ❌ Vulnerabilidad de seguridad conocida
- ❌ Va contra best practices
- ❌ Falla auditorías de seguridad
- ❌ NO cumple con PRD de hardening

**Decisión:** ❌ RECHAZADA

### Alternativa 2: Habilitar sandbox gradualmente

**Pros:**
- Reduce riesgo percibido
- Permite testing incremental

**Cons:**
- Aumenta complejidad innecesariamente
- Dilata timeline
- El análisis ya confirma viabilidad total

**Decisión:** ❌ RECHAZADA - innecesaria dado el análisis

### Alternativa 3: Usar UtilityProcess para tareas específicas

**Pros:**
- Permite código Node.js fuera de renderer

**Cons:**
- NO necesario - NO hay código que migrar
- Agrega complejidad arquitectural

**Decisión:** ❌ RECHAZADA - no aplicable

---

## Referencias

- [Análisis de Dependencias](sandbox-dependency-analysis.md)
- [Auditoría Fase 1](audit-fase-1.md)
- [PRD Security Hardening](../PRD/electron-security-hardening.md)
- [Electron Security Guide](https://www.electronjs.org/docs/latest/tutorial/security)
- [Chromium Sandbox Design](https://chromium.googlesource.com/chromium/src/+/master/docs/design/sandbox.md)

---

## Notas

### Para Futuros Desarrolladores

**⚠️ IMPORTANTE:** El renderer está sandboxed. Esto significa:

1. **NO puedes usar Node.js en renderer:**
   ```typescript
   // ❌ NO FUNCIONA
   import fs from 'fs';
   const data = fs.readFileSync('file.txt');

   // ✅ CORRECTO - usa IPC
   const data = await window.levante.readFile('file.txt');
   ```

2. **Usa Web APIs cuando sea posible:**
   ```typescript
   // ✅ Web Crypto API (funciona en sandbox)
   await crypto.subtle.digest('SHA-256', data);

   // ✅ Fetch API (funciona en sandbox)
   const response = await fetch('https://api.example.com');

   // ✅ sessionStorage/localStorage (funcionan en sandbox)
   sessionStorage.setItem('key', 'value');
   ```

3. **Toda lógica privilegiada va en main:**
   - File system operations
   - Network requests sensibles
   - Database access
   - Credential storage
   - Native module usage

### Linting Rules a Agregar

```javascript
// .eslintrc.js - rules para renderer
rules: {
  'no-restricted-imports': ['error', {
    patterns: [
      'fs', 'path', 'child_process', 'crypto',
      'os', 'net', 'http', 'https', 'stream'
    ]
  }],
  'no-restricted-globals': ['error', '__dirname', '__filename', 'process']
}
```

---

**Firmado:** Levante Security Team
**Estado Final:** ✅ APROBADO - Proceder con implementación
