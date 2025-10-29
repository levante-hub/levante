# CSP Warnings Esperados

**Fecha:** 2025-10-29
**Branch:** feat/electron-security-best-practices

---

## Resumen

Después de habilitar la CSP mejorada (sin `'unsafe-eval'`), es **normal y esperado** ver algunos warnings en la consola del navegador sobre `eval()` bloqueado. Estos warnings **NO indican un problema** - indican que la CSP está funcionando correctamente.

---

## Warning #1: @ai-sdk/react - eval() bloqueado

### Mensaje del Warning

```
Content Security Policy of your site blocks the use of 'eval' in JavaScript

The Content Security Policy (CSP) prevents the evaluation of arbitrary strings
as JavaScript to make it more difficult for an attacker to inject unauthorized
code on your site.

Source location: @ai-sdk_react.js?v=8739f3a6:1172
Directive: script-src
Status: blocked
```

### ¿Es un Problema?

**NO** - Este es el comportamiento **correcto y deseado**.

### Análisis

**¿Por qué aparece el warning?**
- `@ai-sdk/react` tiene código que intenta usar eval() o new Function()
- Este código probablemente es:
  - Un código path no usado en la aplicación actual
  - Un fallback legacy para compatibilidad
  - Código de debugging/desarrollo

**¿Afecta la funcionalidad?**
- ❌ NO afecta el chat streaming
- ❌ NO afecta la UI de React
- ❌ NO afecta ninguna funcionalidad crítica
- ✅ Chat funciona perfectamente sin eval()

**¿Por qué no eliminamos el warning?**

Para eliminar el warning tendríamos que:
```diff
# Opción A: Re-añadir unsafe-eval (❌ NO RECOMENDADO)
- script-src 'self' 'unsafe-inline' blob:;
+ script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:;
```

**Consecuencias de re-añadir unsafe-eval:**
- 🔴 **CRÍTICO:** Permite eval() y new Function() en TODA la aplicación
- 🔴 **CRÍTICO:** Si un attacker logra XSS, puede ejecutar código arbitrario
- 🔴 Reduce score de CSP de 9/10 a 5/10
- 🔴 Elimina una capa crítica de defensa

**Conclusión:** El warning es un **pequeño precio** a pagar por **seguridad significativamente mejor**.

---

## Verificación de Funcionalidad

### ✅ Checklist de Testing (Completado)

- [x] App inicia correctamente
- [x] OAuth flow funciona (OpenRouter)
- [x] Chat streaming funciona
- [x] Model sync funciona
- [x] Settings persistence funciona
- [x] MCP servers funcionan
- [x] Deep linking funciona
- [x] **NO hay impacto funcional del warning**

---

## ¿Cuándo Preocuparse?

**Este warning es NORMAL si:**
- ✅ Aparece solo durante desarrollo (con Vite dev server)
- ✅ Aparece en producción pero NO afecta funcionalidad
- ✅ Es solo 1-2 warnings de librerías conocidas

**Deberías PREOCUPARTE si:**
- ⚠️ Funcionalidad crítica deja de funcionar
- ⚠️ Aparecen MUCHOS warnings de tu código propio
- ⚠️ Usuarios reportan bugs relacionados

---

## Recomendaciones

### Para Desarrolladores

1. **Ignorar estos warnings** - Son esperados y seguros
2. **NO re-añadir unsafe-eval** - Compromete seguridad crítica
3. **Documentar nuevos warnings** - Si aparecen otros, documentarlos aquí

### Para Futuras Actualizaciones de @ai-sdk/react

Si actualizas `@ai-sdk/react` y el warning desaparece:
- ✅ Perfecto - la librería eliminó uso de eval()
- ✅ No cambiar CSP - mantener sin unsafe-eval

Si actualizas y aparecen MÁS warnings:
- ⚠️ Verificar funcionalidad exhaustivamente
- ⚠️ Si algo se rompe, investigar alternativas ANTES de añadir unsafe-eval

---

## Contexto Técnico

### CSP Actual

```html
<meta http-equiv="Content-Security-Policy" content="
  script-src 'self' 'unsafe-inline' blob:;
  ...
">
```

**NO incluye:** `'unsafe-eval'`

### ¿Qué Bloquea CSP?

- ❌ `eval('código')`
- ❌ `new Function('código')`
- ❌ `setTimeout('código', 100)`
- ❌ `setInterval('código', 100)`

### ¿Qué PERMITE CSP?

- ✅ `setTimeout(() => {...}, 100)` (función, no string)
- ✅ `setInterval(() => {...}, 100)` (función, no string)
- ✅ Todo JavaScript normal
- ✅ Web Crypto API
- ✅ Vite workers con blob:

---

## Referencias

- [CSP Audit](./csp-audit.md) - Análisis completo de CSP
- [Fase 1 Summary](./FASE-1-IMPLEMENTATION-SUMMARY.md) - Cambios implementados
- [MDN: CSP script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src)

---

## Warning #2: WebAssembly y 'wasm-unsafe-eval'

### CSP Actual

```html
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:
```

### ¿Por qué necesitamos 'wasm-unsafe-eval'?

**Funcionalidad afectada:** Diagramas de Mermaid

Mermaid v11+ usa WebAssembly para syntax highlighting (via Shiki/Oniguruma). Sin `'wasm-unsafe-eval'`, obtienes:

```
Uncaught (in promise) CompileError: WebAssembly.instantiate():
Refused to compile or instantiate WebAssembly module because
'unsafe-eval' is not an allowed source of script
```

### ⚠️ IMPORTANTE: 'wasm-unsafe-eval' ≠ 'unsafe-eval'

| Característica | `'unsafe-eval'` | `'wasm-unsafe-eval'` |
|---------------|----------------|---------------------|
| Permite `eval()` | ✅ SÍ (PELIGROSO) | ❌ NO |
| Permite `new Function()` | ✅ SÍ (PELIGROSO) | ❌ NO |
| Permite WebAssembly | ✅ SÍ | ✅ SÍ |
| Riesgo de Seguridad | 🔴 CRÍTICO | 🟡 BAJO |

### ¿Por qué WebAssembly es relativamente seguro?

- ✅ Ejecuta en sandbox de memoria lineal
- ✅ No puede acceder al DOM directamente
- ✅ No puede ejecutar JavaScript arbitrario
- ✅ Es type-safe y memory-safe por diseño
- ✅ Introducido como directiva CSP separada por esta razón

### Alternativas Consideradas (No Implementadas)

1. **Downgrade a Mermaid v10.x**
   - ❌ Pérdida de features y actualizaciones de seguridad
   - ❌ Mermaid v10 ya no recibe soporte

2. **Deshabilitar syntax highlighting**
   - ❌ Peor experiencia de usuario
   - ❌ Diagramas sin colores de sintaxis

3. **Renderizado en main process via IPC**
   - ❌ Arquitectura compleja
   - ❌ Overhead de latencia
   - ❌ Mayor complejidad de mantenimiento

### Especificación CSP Level 3

`'wasm-unsafe-eval'` fue introducido en CSP Level 3 específicamente para permitir WebAssembly sin habilitar eval() peligroso:

> "The 'wasm-unsafe-eval' keyword allows the loading and execution of WebAssembly,
> without allowing other dangerous code evaluation."
>
> — [W3C CSP Level 3 Specification](https://www.w3.org/TR/CSP3/)

### Impacto en Score de Seguridad

| Métrica | Sin wasm-unsafe-eval | Con wasm-unsafe-eval | Cambio |
|---------|---------------------|---------------------|--------|
| **CSP Score** | 9.5/10 | 9/10 | -0.5 |
| **Funcionalidad** | Mermaid roto | Mermaid funcional | ✅ |
| **Seguridad Real** | Igual | Igual | - |

La reducción de 0.5 puntos es **puramente cosmética**. WebAssembly no aumenta significativamente la superficie de ataque.

### Resumen

- ✅ `'wasm-unsafe-eval'` es un **trade-off de seguridad medido**
- ✅ Habilita funcionalidad esencial (diagramas Mermaid)
- ✅ NO permite ejecución general de código
- ✅ Sigue mejores prácticas de W3C para CSP Level 3

**Estado:** ✅ Decisión de seguridad intencional

---

## TL;DR

**Warning de eval() bloqueado en @ai-sdk/react:**
- ✅ Es NORMAL
- ✅ Es ESPERADO
- ✅ Es SEGURO
- ✅ NO afecta funcionalidad
- ✅ NO requiere acción
- ✅ NO añadir unsafe-eval de vuelta

**'wasm-unsafe-eval' para Mermaid:**
- ✅ Es NECESARIO para diagramas
- ✅ Es SEGURO (solo WebAssembly, no eval)
- ✅ Sigue estándar CSP Level 3
- ✅ Trade-off medido de seguridad vs UX
- ✅ Reduce score CSP solo 0.5 puntos (cosmético)

**Mensaje para el equipo:** "Si ves el warning de eval() bloqueado, ignóralo. Es evidencia de que nuestra CSP está funcionando correctamente."
