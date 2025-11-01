# MCP OAuth - Próximas Fases de Implementación

## Estado Actual

✅ **Fase 1:** OAuth Token Storage
✅ **Fase 2:** OAuth Core Service
✅ **Fase 3:** MCP Transport con OAuth (Inyección Automática)

**Sistema funcional:** Los MCPs remotos HTTP/SSE pueden usar OAuth 2.0 + PKCE de forma automática y transparente.

---

## Fase 4: IPC Handlers (OPCIONAL - Ya Implementados)

**Estado:** ✅ Completado en Fase 2

Los siguientes handlers ya están disponibles en `src/main/ipc/oauthHandlers.ts`:

```typescript
levante/mcp/oauth/authorize      // Iniciar OAuth manualmente
levante/mcp/oauth/get-token      // Obtener token guardado
levante/mcp/oauth/delete-token   // Revocar y eliminar token
levante/mcp/oauth/refresh-token  // Forzar refresh manual
levante/mcp/oauth/get-status     // Check estado del token
```

**Uso desde renderer:**
```typescript
// Verificar si MCP tiene token OAuth
const { hasToken, isValid } = await window.levante.invoke(
  'levante/mcp/oauth/get-status',
  serverId
);

// Eliminar token (desconectar)
await window.levante.invoke('levante/mcp/oauth/delete-token', serverId);
```

---

## Fase 5: UI Components

**Objetivo:** Crear componentes React para gestionar OAuth en la UI de MCP servers.

### Archivos a Crear

#### 1. `src/renderer/hooks/useMcpOAuth.ts`

Hook reutilizable para manejar OAuth de MCP servers:

```typescript
import { useState, useEffect } from 'react';

interface UseMcpOAuthOptions {
  serverId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function useMcpOAuth({ serverId, onSuccess, onError }: UseMcpOAuthOptions) {
  const [status, setStatus] = useState<'idle' | 'connected' | 'connecting' | 'error'>('idle');
  const [hasToken, setHasToken] = useState(false);
  const [isValid, setIsValid] = useState(false);

  // Check token status on mount
  useEffect(() => {
    checkStatus();
  }, [serverId]);

  const checkStatus = async () => {
    try {
      const result = await window.levante.invoke('levante/mcp/oauth/get-status', serverId);
      setHasToken(result.hasToken);
      setIsValid(result.isValid);
      setStatus(result.isValid ? 'connected' : 'idle');
    } catch (error) {
      console.error('Failed to check OAuth status:', error);
    }
  };

  const disconnect = async () => {
    try {
      await window.levante.invoke('levante/mcp/oauth/delete-token', serverId);
      setHasToken(false);
      setIsValid(false);
      setStatus('idle');
      onSuccess?.();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to disconnect');
    }
  };

  return {
    status,
    hasToken,
    isValid,
    disconnect,
    checkStatus
  };
}
```

#### 2. `src/renderer/components/mcp/McpOAuthStatus.tsx`

Componente para mostrar estado OAuth:

```typescript
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMcpOAuth } from '@/hooks/useMcpOAuth';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface McpOAuthStatusProps {
  serverId: string;
  onDisconnect?: () => void;
}

export function McpOAuthStatus({ serverId, onDisconnect }: McpOAuthStatusProps) {
  const { status, hasToken, isValid, disconnect } = useMcpOAuth({
    serverId,
    onSuccess: onDisconnect
  });

  if (!hasToken) return null;

  const handleDisconnect = async () => {
    if (confirm('¿Desconectar servidor OAuth?')) {
      await disconnect();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isValid ? (
        <>
          <Badge variant="success" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            Connected
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDisconnect}
          >
            Disconnect
          </Button>
        </>
      ) : (
        <Badge variant="warning" className="gap-1">
          <XCircle className="h-3 w-3" />
          Token Expired
        </Badge>
      )}
    </div>
  );
}
```

#### 3. Integrar en MCP Server Card

Modificar el componente que muestra los MCP servers para incluir `<McpOAuthStatus>`:

```typescript
// En el componente que lista servidores MCP
import { McpOAuthStatus } from '@/components/mcp/McpOAuthStatus';

// Dentro del render de cada servidor:
<div className="flex items-center justify-between">
  <div>
    <h3>{server.name || server.id}</h3>
    <p className="text-sm text-muted-foreground">{server.baseUrl}</p>
  </div>

  <div className="flex items-center gap-2">
    {/* Estado OAuth (solo para HTTP/SSE) */}
    {(server.transport === 'http' || server.transport === 'sse') && (
      <McpOAuthStatus serverId={server.id} />
    )}

    {/* Botones de conectar/desconectar existentes */}
  </div>
</div>
```

---

## Fase 6: Integración con MCP Manager

**Objetivo:** Mejorar UX del flujo OAuth automático en la gestión de servidores MCP.

### Cambios Recomendados

#### 1. Notificaciones de OAuth

Cuando se inicia OAuth automáticamente (en un 401), mostrar notificación al usuario:

```typescript
// En MCPService o donde se gestione la UI
import { toast } from 'sonner';

// Cuando se detecta 401 y se inicia OAuth:
toast.info('Autenticación requerida', {
  description: `Abriendo navegador para autorizar ${serverId}...`,
  duration: 10000
});

// Cuando se completa:
toast.success('Conectado', {
  description: `${serverId} autenticado correctamente`
});
```

#### 2. Indicador Visual Durante OAuth

Mostrar spinner/loading state mientras se completa el flujo OAuth:

```typescript
// En el estado del servidor
interface McpServerState {
  id: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'authenticating';
  // ...
}

// Actualizar a 'authenticating' cuando se inicia OAuth
// Actualizar a 'connected' cuando se completa
```

#### 3. Manejo de Errores OAuth

Mostrar errores de OAuth de forma user-friendly:

```typescript
// Si OAuth falla:
toast.error('Autenticación fallida', {
  description: 'No se pudo autorizar el servidor. Por favor, intenta de nuevo.',
  action: {
    label: 'Reintentar',
    onClick: () => reconnectServer(serverId)
  }
});
```

---

## Fase 7: Testing & Documentation

### Testing Manual

**Checklist de pruebas:**

- [ ] **Conexión sin OAuth** - MCP server normal conecta sin problemas
- [ ] **Primera conexión OAuth** - 401 → Browser abre → Autorizar → Conectado
- [ ] **Reconexión con token** - Cierra app → Reabre → Conecta automáticamente
- [ ] **Token refresh** - Espera cerca de expiración → Auto-refresh transparente
- [ ] **Token expirado** - Desactiva network → Espera expiry → Reconecta → Re-auth
- [ ] **Desconexión manual** - Botón disconnect → Token eliminado → 401 en próxima conexión
- [ ] **Múltiples MCPs OAuth** - 2+ servidores OAuth simultáneos

### Testing Automatizado (Opcional)

#### Unit Tests

```typescript
// src/main/services/mcp/oauth/__tests__/mcpOAuthService.test.ts
describe('MCPOAuthService', () => {
  it('should discover OAuth metadata from .well-known endpoint', async () => {
    // Mock fetch
    // Test discoverOAuthMetadata()
  });

  it('should generate valid PKCE parameters', () => {
    // Test generateCodeVerifier, generateCodeChallenge
  });

  it('should refresh tokens successfully', async () => {
    // Mock token_endpoint
    // Test refreshToken()
  });
});
```

#### E2E Tests

```typescript
// tests/e2e/mcp-oauth.spec.ts
test('MCP OAuth flow completo', async ({ page }) => {
  // 1. Agregar servidor MCP con OAuth
  // 2. Intentar conectar
  // 3. Verificar que abre browser
  // 4. Mock OAuth callback
  // 5. Verificar conexión exitosa
  // 6. Verificar token guardado
});
```

### Documentación

#### 1. User Guide

Crear `docs/user-guides/mcp-oauth.md`:

```markdown
# Conectar Servidores MCP con OAuth

Algunos servidores MCP (como Figma MCP) requieren autenticación OAuth.
Levante maneja esto automáticamente.

## Primera Conexión

1. Agrega el servidor MCP normalmente
2. Al conectar, se abrirá tu navegador
3. Autoriza la aplicación en el proveedor
4. Vuelve a Levante - ya estás conectado

## Gestión de Tokens

- **Auto-refresh**: Los tokens se renuevan automáticamente
- **Desconectar**: Click en "Disconnect" para revocar acceso
- **Re-conectar**: Si falla, repite el proceso de autorización
```

#### 2. Developer Guide

Crear `docs/developer/mcp-oauth-implementation.md`:

```markdown
# MCP OAuth Implementation Guide

## Architecture

[Diagrama del flujo]

## Adding OAuth Support to MCP Servers

### Server Requirements

1. Implement RFC 8414 (OAuth 2.0 Authorization Server Metadata)
2. Support PKCE (RFC 7636) with S256 method
3. Return WWW-Authenticate header on 401 responses

### Example Configuration

\`\`\`json
{
  "mcpServers": {
    "my-oauth-server": {
      "transport": "http",
      "baseUrl": "https://api.example.com/mcp",
      "oauthMetadata": {
        "authorization_endpoint": "https://auth.example.com/oauth/authorize",
        "token_endpoint": "https://auth.example.com/oauth/token"
      }
    }
  }
}
\`\`\`

## Troubleshooting

### Token Refresh Failures

Check logs: `DEBUG_MCP=true pnpm dev`

### PKCE Errors

Verify server supports code_challenge_method=S256
```

---

## Prioridades

**Crítico (hacer ahora):**
- ✅ Fase 3 ya completa - sistema funcional

**Alta prioridad (semana 1):**
- Fase 5: UI Components básicos (hook + status badge)
- Fase 6: Notificaciones toast para feedback al usuario

**Media prioridad (semana 2):**
- Fase 7: Testing manual con checklist
- Documentación user guide básica

**Baja prioridad (futuro):**
- Testing automatizado completo
- Developer documentation extensa
- Soporte para más proveedores OAuth específicos

---

## Notas de Implementación

### Consideraciones de UX

1. **Transparencia:** El usuario debe saber cuándo se inicia OAuth
2. **Feedback:** Mostrar estado durante todo el proceso
3. **Recovery:** Fácil reintento si algo falla
4. **Privacidad:** Explicar qué permisos se solicitan

### Consideraciones de Seguridad

1. **Token Expiry:** Buffer de 5min es conservador, ajustar si es necesario
2. **Revocation:** Implementar llamada a revocation_endpoint cuando usuario desconecta
3. **State Validation:** Ya implementado, mantener activo
4. **HTTPS Only:** Validar que OAuth servers usen HTTPS

### Performance

1. **Lazy Loading:** UI components solo cargan cuando hay servidores OAuth
2. **Caching:** Tokens y metadata ya se cachean en preferences
3. **Parallel Auth:** Múltiples servidores OAuth pueden autorizar simultáneamente

---

## Recursos

- **MCP Spec:** https://modelcontextprotocol.io/
- **RFC 6749:** OAuth 2.0 Authorization Framework
- **RFC 7636:** PKCE for OAuth Public Clients
- **RFC 8414:** OAuth 2.0 Authorization Server Metadata

---

*Documento creado: 2025-01-10*
*Última actualización: Fase 3 completada*
