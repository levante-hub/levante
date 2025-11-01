# MCP OAuth Authentication System

## Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Flujo OAuth Completo](#flujo-oauth-completo)
- [Componentes Principales](#componentes-principales)
- [Almacenamiento de Tokens](#almacenamiento-de-tokens)
- [Inyección Automática de Tokens](#inyección-automática-de-tokens)
- [Refresh Automático](#refresh-automático)
- [Manejo de Errores](#manejo-de-errores)
- [Seguridad](#seguridad)
- [Ejemplos de Uso](#ejemplos-de-uso)
- [Troubleshooting](#troubleshooting)

---

## Descripción General

El sistema OAuth para MCPs (Model Context Protocol) permite que servidores MCP remotos (HTTP/SSE) requieran autenticación OAuth 2.0 con PKCE (Proof Key for Code Exchange). El sistema es **completamente automático** y **reactivo**: cuando un servidor MCP retorna un error 401 (Unauthorized), la aplicación inicia automáticamente el flujo OAuth sin intervención del usuario.

### Características Principales

- ✅ **Flujo OAuth 2.0 + PKCE (RFC 7636)** - Máxima seguridad
- ✅ **Discovery automático** de metadata OAuth (RFC 8414)
- ✅ **Inyección automática** de tokens en requests HTTP/SSE
- ✅ **Auto-refresh** de tokens antes de expiración
- ✅ **Retry logic** transparente en errores 401
- ✅ **Almacenamiento encriptado** con Electron safeStorage
- ✅ **Metadata persistence** para refresh sin re-discovery

### Diferencia con OpenRouter OAuth

| Característica | OpenRouter OAuth | MCP OAuth |
|----------------|------------------|-----------|
| Trigger | Usuario hace click "Connect" | Automático en error 401 |
| Ubicación | Frontend (renderer) | Backend (main process) |
| Flujo | Proactivo | Reactivo |
| Uso | Single provider | Multiple MCP servers |

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        LEVANTE APPLICATION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                   MAIN PROCESS                          │    │
│  │                                                         │    │
│  │  ┌──────────────────────────────────────────────┐     │    │
│  │  │          MCPService (index.ts)               │     │    │
│  │  │                                               │     │    │
│  │  │  connectServer()                             │     │    │
│  │  │    ├─> createTransport()                     │     │    │
│  │  │    │     └─> injectOAuthToken()              │     │    │
│  │  │    │           ├─> Check token               │     │    │
│  │  │    │           ├─> Auto-refresh if needed    │     │    │
│  │  │    │           └─> Inject Authorization      │     │    │
│  │  │    ├─> client.connect(transport)             │     │    │
│  │  │    └─> If 401 → authorize() → retry          │     │    │
│  │  └──────────────────────────────────────────────┘     │    │
│  │                         │                              │    │
│  │                         ▼                              │    │
│  │  ┌──────────────────────────────────────────────┐     │    │
│  │  │      MCPOAuthService (mcpOAuthService.ts)    │     │    │
│  │  │                                               │     │    │
│  │  │  authorize(serverId, baseUrl)                │     │    │
│  │  │    ├─> discoverOAuthMetadata()               │     │    │
│  │  │    ├─> Generate PKCE params                  │     │    │
│  │  │    ├─> Start callback server                 │     │    │
│  │  │    ├─> Open browser                          │     │    │
│  │  │    ├─> Wait for callback                     │     │    │
│  │  │    ├─> Exchange code for tokens              │     │    │
│  │  │    └─> Save tokens + metadata                │     │    │
│  │  │                                               │     │    │
│  │  │  refreshToken(serverId)                      │     │    │
│  │  │    ├─> Get token with metadata               │     │    │
│  │  │    ├─> POST token_endpoint                   │     │    │
│  │  │    └─> Save new tokens                       │     │    │
│  │  └──────────────────────────────────────────────┘     │    │
│  │                         │                              │    │
│  │                         ▼                              │    │
│  │  ┌──────────────────────────────────────────────┐     │    │
│  │  │  MCPOAuthTokenManager (tokenManager.ts)      │     │    │
│  │  │                                               │     │    │
│  │  │  saveToken()   - Guarda con encriptación     │     │    │
│  │  │  getToken()    - Recupera y desencripta      │     │    │
│  │  │  isTokenValid()- Valida expiración           │     │    │
│  │  └──────────────────────────────────────────────┘     │    │
│  │                         │                              │    │
│  │                         ▼                              │    │
│  │  ┌──────────────────────────────────────────────┐     │    │
│  │  │     PreferencesService                       │     │    │
│  │  │                                               │     │    │
│  │  │  ~/levante/ui-preferences.json               │     │    │
│  │  │  {                                            │     │    │
│  │  │    mcpOAuthTokens: {                         │     │    │
│  │  │      "figma-mcp": {                          │     │    │
│  │  │        access_token: "ENCRYPTED:...",        │     │    │
│  │  │        refresh_token: "ENCRYPTED:...",       │     │    │
│  │  │        expires_at: 1234567890,               │     │    │
│  │  │        metadata: {                            │     │    │
│  │  │          token_endpoint: "..."               │     │    │
│  │  │        }                                      │     │    │
│  │  │      }                                        │     │    │
│  │  │    }                                          │     │    │
│  │  │  }                                            │     │    │
│  │  └──────────────────────────────────────────────┘     │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              OAuth Callback Server                      │    │
│  │              (oauthCallbackServer)                      │    │
│  │                                                         │    │
│  │  HTTP Server @ localhost:3000                          │    │
│  │    └─> Receives authorization code                     │    │
│  │        └─> Notifies MCPOAuthService                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  User's Browser   │
                    │                   │
                    │  OAuth Provider   │
                    │  Authorization    │
                    └───────────────────┘
```

---

## Flujo OAuth Completo

### 1. Detección de Necesidad de OAuth (Reactivo)

```typescript
// El usuario intenta conectar un servidor MCP remoto
MCPService.connectServer({
  id: 'figma-mcp',
  transport: 'http',
  baseUrl: 'https://mcp.figma.com'
})

// Paso 1: Intentar conexión
→ createTransport(config)
  → injectOAuthToken(config)
    → No token found ❌
    → Return config sin cambios

→ client.connect(transport)
  → Server responde: 401 Unauthorized ❌

// Paso 2: Retry con OAuth
→ Detecta error 401
→ mcpOAuthService.authorize('figma-mcp', 'https://mcp.figma.com')
```

### 2. OAuth Discovery

```typescript
// Descubrir metadata OAuth del servidor
authorize(serverId, baseUrl) {

  // Opción 1: Discovery automático (RFC 8414)
  metadata = await fetch('https://mcp.figma.com/.well-known/oauth-authorization-server')

  // Respuesta esperada:
  {
    "issuer": "https://auth.figma.com",
    "authorization_endpoint": "https://auth.figma.com/oauth/authorize",
    "token_endpoint": "https://auth.figma.com/oauth/token",
    "code_challenge_methods_supported": ["S256"],
    "scopes_supported": ["mcp.read", "mcp.write"]
  }

  // Opción 2: Parse WWW-Authenticate header de 401
  // (si discovery falla)
}
```

### 3. PKCE Generation

```typescript
// Generar parámetros PKCE (RFC 7636)

// Code Verifier: Random 32 bytes → base64url
codeVerifier = base64url(randomBytes(32))
// Ejemplo: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

// Code Challenge: SHA256(verifier) → base64url
codeChallenge = base64url(SHA256(codeVerifier))
// Ejemplo: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

// State: Random 16 bytes → base64url (CSRF protection)
state = base64url(randomBytes(16))
// Ejemplo: "af0ifjsldkj"
```

### 4. Authorization Request

```typescript
// Construir URL de autorización
authUrl = new URL('https://auth.figma.com/oauth/authorize')
authUrl.searchParams.set('client_id', 'levante-mcp-client')
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('redirect_uri', 'http://localhost:3000')
authUrl.searchParams.set('code_challenge', codeChallenge)
authUrl.searchParams.set('code_challenge_method', 'S256')
authUrl.searchParams.set('state', state)
authUrl.searchParams.set('scope', 'mcp.read mcp.write')

// URL final:
// https://auth.figma.com/oauth/authorize?
//   client_id=levante-mcp-client&
//   response_type=code&
//   redirect_uri=http://localhost:3000&
//   code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
//   code_challenge_method=S256&
//   state=af0ifjsldkj&
//   scope=mcp.read+mcp.write

// Iniciar callback server
await oauthCallbackServer.start() // Puerto 3000 o random

// Abrir browser
await shell.openExternal(authUrl)

// Esperar callback (Promise pendiente)
return new Promise((resolve, reject) => {
  // Timeout: 5 minutos
  // Callback: handleCallback() resolverá
})
```

### 5. User Authorization

```
┌─────────────────────────────────────────────────────────┐
│  Browser opens:                                         │
│  https://auth.figma.com/oauth/authorize?...             │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Figma OAuth Authorization                     │    │
│  │                                                 │    │
│  │  Levante wants to access your Figma account    │    │
│  │                                                 │    │
│  │  Permissions requested:                        │    │
│  │  • Read MCP data                               │    │
│  │  • Write MCP data                              │    │
│  │                                                 │    │
│  │  [Cancel]              [Authorize]             │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  User clicks "Authorize"                                │
│                                                          │
│  → Redirect to:                                         │
│    http://localhost:3000?code=abc123&state=af0ifjsldkj  │
└─────────────────────────────────────────────────────────┘
```

### 6. Callback Handling

```typescript
// Callback server recibe request
GET http://localhost:3000?code=abc123&state=af0ifjsldkj

// Validar state (CSRF protection)
if (receivedState !== savedState) {
  throw new Error('State mismatch - possible CSRF attack')
}

// Notificar a mcpOAuthService
mcpOAuthService.handleCallback('figma-mcp', 'abc123', 'af0ifjsldkj')
```

### 7. Token Exchange

```typescript
// Exchange authorization code for tokens
POST https://auth.figma.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=abc123
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
&client_id=levante-mcp-client
&redirect_uri=http://localhost:3000

// Respuesta:
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "v1.MRHjJNGcwODU2NzM0OTc5MzQ4...",
  "token_type": "Bearer",
  "expires_in": 3600,  // 1 hora
  "scope": "mcp.read mcp.write"
}

// Calcular expires_at
expires_at = Date.now() + (expires_in * 1000)
// Ejemplo: 1704063600000 (2024-01-01 00:00:00)
```

### 8. Token Storage

```typescript
// Guardar tokens con metadata
await mcpOAuthTokenManager.saveToken('figma-mcp', {
  access_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  refresh_token: "v1.MRHjJNGcwODU2NzM0OTc5MzQ4...",
  expires_at: 1704063600000,
  token_type: "Bearer",
  scope: "mcp.read mcp.write",
  metadata: {
    token_endpoint: "https://auth.figma.com/oauth/token",
    revocation_endpoint: "https://auth.figma.com/oauth/revoke"
  }
})

// Storage en ~/levante/ui-preferences.json:
{
  "mcpOAuthTokens": {
    "figma-mcp": {
      "access_token": "ENCRYPTED:YWJjMTIz...",  // Encriptado
      "refresh_token": "ENCRYPTED:ZGVmNDU2...", // Encriptado
      "expires_at": 1704063600000,
      "token_type": "Bearer",
      "scope": "mcp.read mcp.write",
      "metadata": {
        "token_endpoint": "https://auth.figma.com/oauth/token",
        "revocation_endpoint": "https://auth.figma.com/oauth/revoke"
      }
    }
  }
}
```

### 9. Connection Retry

```typescript
// Retry conexión con token OAuth
→ createTransport(config)
  → injectOAuthToken(config)
    → Token found ✓
    → Token valid ✓
    → config.headers['Authorization'] = 'Bearer eyJhbGci...'

→ client.connect(transport)
  → Server responde: 200 OK ✓
  → Connected successfully! 🎉
```

---

## Componentes Principales

### MCPOAuthService

**Ubicación:** `src/main/services/mcp/oauth/mcpOAuthService.ts`

**Responsabilidades:**
- Orquestar flujo OAuth completo
- Discovery de metadata
- Generación PKCE
- Manejo de callbacks
- Token exchange y refresh

**API Pública:**

```typescript
class MCPOAuthService {
  /**
   * Iniciar flujo OAuth para un servidor MCP
   * @param serverId - ID del servidor (ej: "figma-mcp")
   * @param unauthorizedResponse - Response 401 (opcional)
   * @param baseUrl - URL base del servidor
   * @param scopes - Scopes a solicitar (opcional)
   * @returns Tokens OAuth
   */
  async authorize(
    serverId: string,
    unauthorizedResponse?: Response,
    baseUrl?: string,
    scopes?: string[]
  ): Promise<OAuthTokenData>

  /**
   * Refrescar token expirado
   * @param serverId - ID del servidor
   * @returns Tokens actualizados
   */
  async refreshToken(serverId: string): Promise<OAuthTokenData>

  /**
   * Revocar token de un servidor
   * @param serverId - ID del servidor
   */
  async revokeToken(serverId: string): Promise<void>

  /**
   * Obtener token válido (o null si no existe/expiró)
   * @param serverId - ID del servidor
   * @returns Token válido o null
   */
  async getValidToken(serverId: string): Promise<OAuthTokenData | null>

  /**
   * Verificar si servidor tiene token válido
   * @param serverId - ID del servidor
   * @returns true si tiene token válido
   */
  async hasValidToken(serverId: string): Promise<boolean>
}
```

### MCPOAuthTokenManager

**Ubicación:** `src/main/services/mcp/oauth/tokenManager.ts`

**Responsabilidades:**
- CRUD de tokens OAuth
- Integración con PreferencesService
- Validación de expiración

**API Pública:**

```typescript
class MCPOAuthTokenManager {
  /**
   * Guardar token (encriptado si security.encryptApiKeys enabled)
   */
  async saveToken(serverId: string, token: OAuthTokenData): Promise<void>

  /**
   * Obtener token (desencriptado automáticamente)
   */
  async getToken(serverId: string): Promise<OAuthTokenData | null>

  /**
   * Eliminar token
   */
  async deleteToken(serverId: string): Promise<void>

  /**
   * Verificar si token es válido (existe y no expiró)
   * Buffer de 5 minutos antes de expiración
   */
  async isTokenValid(serverId: string): Promise<boolean>

  /**
   * Obtener todos los tokens
   */
  async getAllTokens(): Promise<Record<string, OAuthTokenData>>

  /**
   * Eliminar todos los tokens
   */
  async clearAllTokens(): Promise<void>
}
```

### OAuth Metadata Discovery

**Ubicación:** `src/main/services/mcp/oauth/metadata.ts`

**Funciones:**

```typescript
/**
 * Descubrir metadata OAuth de un servidor
 * RFC 8414: /.well-known/oauth-authorization-server
 */
async function discoverOAuthMetadata(
  baseUrl: string
): Promise<OAuthMetadataWithEndpoints | null>

/**
 * Descubrir metadata desde response 401
 * Parse WWW-Authenticate header
 */
async function discoverFromUnauthorizedResponse(
  response: Response
): Promise<OAuthMetadataWithEndpoints | null>

/**
 * Parsear header WWW-Authenticate
 */
function parseWWWAuthenticate(
  header: string
): WWWAuthenticateData | null

/**
 * Validar metadata OAuth
 */
function validateOAuthMetadata(
  metadata: any
): metadata is OAuthMetadataWithEndpoints
```

---

## Almacenamiento de Tokens

### Ubicación

Tokens se almacenan en: **`~/levante/ui-preferences.json`**

### Estructura de Datos

```typescript
interface OAuthTokenData {
  access_token: string;        // Token de acceso (ENCRIPTADO)
  refresh_token?: string;      // Token de refresh (ENCRIPTADO)
  expires_at?: number;         // Unix timestamp (ms)
  scope?: string;              // Scopes otorgados
  token_type: string;          // "Bearer"
  metadata?: {                 // Metadata para refresh
    token_endpoint: string;
    revocation_endpoint?: string;
  };
}
```

### Encriptación

**Control:** Toggle `security.encryptApiKeys` en Settings

**Método:** Electron `safeStorage` API
- macOS: Keychain
- Windows: DPAPI
- Linux: libsecret

**Campos encriptados:**
- `access_token`
- `refresh_token`

**Formato encriptado:**
```json
{
  "access_token": "ENCRYPTED:YWJjMTIzNDU2Nzg5MA==",
  "refresh_token": "ENCRYPTED:ZGVmMTIzNDU2Nzg5MA=="
}
```

**Campos NO encriptados:**
- `expires_at`
- `scope`
- `token_type`
- `metadata`

---

## Inyección Automática de Tokens

### Ubicación

`src/main/services/mcp/transports.ts` → función `injectOAuthToken()`

### Flujo de Inyección

```typescript
async function injectOAuthToken(config: MCPServerConfig): Promise<MCPServerConfig> {

  // 1. Obtener token del servidor
  let token = await mcpOAuthTokenManager.getToken(config.id)

  if (!token) {
    return config // Sin cambios
  }

  // 2. Validar token (buffer 5 minutos)
  const isValid = await mcpOAuthTokenManager.isTokenValid(config.id)

  if (!isValid) {
    // 3. Auto-refresh si expiró
    try {
      token = await mcpOAuthService.refreshToken(config.id)
    } catch (refreshError) {
      // Refresh falló → conexión fallará con 401 → re-auth
      return config
    }
  }

  // 4. Inyectar Authorization header
  return {
    ...config,
    headers: {
      ...config.headers,
      'Authorization': `Bearer ${token.access_token}`
    }
  }
}
```

### Cuándo se Inyecta

**Siempre** antes de crear transport HTTP/SSE:

```typescript
export async function createTransport(config: MCPServerConfig) {
  const transportType = config.transport

  // Inyectar token para HTTP/SSE
  if (transportType === 'http' || transportType === 'sse') {
    config = await injectOAuthToken(config)
  }

  // Crear transport con headers modificados
  transport = new StreamableHTTPClientTransport(baseUrl, {
    requestInit: {
      headers: config.headers  // Incluye Authorization
    }
  })
}
```

---

## Refresh Automático

### Trigger de Refresh

Token se considera **"expirando pronto"** si:

```typescript
const REFRESH_BUFFER = 5 * 60 * 1000 // 5 minutos en ms

function isTokenValid(token: OAuthTokenData): boolean {
  if (!token.expires_at) return true // No expira

  return Date.now() < (token.expires_at - REFRESH_BUFFER)
}

// Ejemplo:
// Token expira: 2024-01-01 12:00:00 (1704110400000)
// Buffer:       5 minutos (300000 ms)
// Refresh at:   2024-01-01 11:55:00 (1704110100000)
```

### Flujo de Refresh

```typescript
async refreshToken(serverId: string): Promise<OAuthTokenData> {

  // 1. Obtener token actual con metadata
  const currentToken = await mcpOAuthTokenManager.getToken(serverId)

  if (!currentToken.refresh_token) {
    throw new Error('No refresh token - re-authorization required')
  }

  if (!currentToken.metadata?.token_endpoint) {
    throw new Error('Token metadata missing - re-authorization required')
  }

  // 2. Request refresh
  const response = await fetch(currentToken.metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentToken.refresh_token,
      client_id: 'levante-mcp-client'
    })
  })

  // 3. Parse response
  const tokenResponse = await response.json()

  // 4. Build new token data
  const newToken = {
    access_token: tokenResponse.access_token,
    // Algunos servers rotan refresh_token, otros no
    refresh_token: tokenResponse.refresh_token || currentToken.refresh_token,
    expires_at: Date.now() + (tokenResponse.expires_in * 1000),
    token_type: tokenResponse.token_type,
    scope: tokenResponse.scope || currentToken.scope,
    // Preservar metadata para futuros refreshes
    metadata: currentToken.metadata
  }

  // 5. Guardar tokens actualizados
  await mcpOAuthTokenManager.saveToken(serverId, newToken)

  return newToken
}
```

### Refresh Token Rotation

Algunos servidores OAuth **rotan** el refresh_token en cada refresh:

```typescript
// Respuesta de refresh incluye NUEVO refresh_token
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token",  // ← NUEVO
  "expires_in": 3600
}

// Sistema usa nuevo refresh_token:
newToken.refresh_token = tokenResponse.refresh_token || currentToken.refresh_token
//                        ↑ Nuevo si existe        ↑ Mantener el anterior
```

---

## Manejo de Errores

### Errores en Authorization

```typescript
try {
  await mcpOAuthService.authorize(serverId, baseUrl)
} catch (error) {

  // 1. Discovery failed
  if (error.message.includes('Could not discover OAuth metadata')) {
    // Servidor no soporta OAuth o metadata inválida
    // Solución: Configuración manual de endpoints
  }

  // 2. Callback timeout (5 minutos)
  if (error.message.includes('timed out')) {
    // Usuario no completó autorización
    // Solución: Reintentar
  }

  // 3. State mismatch
  if (error.message.includes('State mismatch')) {
    // Posible ataque CSRF
    // Solución: Reintentar, verificar seguridad
  }

  // 4. Token exchange failed
  if (error.message.includes('Token exchange failed')) {
    // Server rechazó código de autorización
    // Solución: Verificar configuración, reintentar
  }
}
```

### Errores en Refresh

```typescript
try {
  await mcpOAuthService.refreshToken(serverId)
} catch (error) {

  // 1. No refresh token
  if (error.message.includes('No refresh token')) {
    // Token original no incluía refresh_token
    // Solución: Re-autorizar
    await mcpOAuthService.authorize(serverId, baseUrl)
  }

  // 2. Metadata missing
  if (error.message.includes('Token metadata missing')) {
    // Token guardado sin metadata (legacy)
    // Solución: Re-autorizar para obtener metadata
    await mcpOAuthService.authorize(serverId, baseUrl)
  }

  // 3. Refresh failed (401/403)
  if (error.message.includes('Token refresh failed')) {
    // Refresh token inválido/expirado/revocado
    // Solución: Re-autorizar
    await mcpOAuthService.authorize(serverId, baseUrl)
  }
}
```

### Errores en Conexión

```typescript
// MCPService.connectServer() con retry automático

try {
  // Intento 1
  await _attemptConnection(config)

} catch (error) {

  if (is401Error(error)) {
    // Error de autenticación detectado

    try {
      // Iniciar OAuth automáticamente
      await mcpOAuthService.authorize(serverId, baseUrl)

      // Intento 2: Retry con token
      return await _attemptConnection(config)

    } catch (oauthError) {
      // OAuth falló - Error final al usuario
      throw new Error(`Authentication failed: ${oauthError.message}`)
    }
  }

  // No es 401 - Error de otro tipo
  throw error
}
```

---

## Seguridad

### PKCE (Proof Key for Code Exchange)

**Por qué:** Previene ataques de interceptación de código de autorización

**Implementación:**

```typescript
// 1. Cliente genera code_verifier random
codeVerifier = base64url(randomBytes(32))

// 2. Calcula code_challenge
codeChallenge = base64url(SHA256(codeVerifier))

// 3. Envía challenge en authorization request
authUrl.searchParams.set('code_challenge', codeChallenge)
authUrl.searchParams.set('code_challenge_method', 'S256')

// 4. Envía verifier en token exchange
body.set('code_verifier', codeVerifier)

// 5. Server valida: SHA256(verifier) === challenge
```

**Ataque prevenido:**
- Atacante intercepta `code` del redirect
- Atacante NO tiene `code_verifier` (solo cliente lo conoce)
- Token exchange falla sin verifier correcto

### State Parameter (CSRF Protection)

**Por qué:** Previene ataques Cross-Site Request Forgery

**Implementación:**

```typescript
// 1. Generar state random
state = base64url(randomBytes(16))

// 2. Guardar en memoria (Map)
pendingFlows.set(serverId, { state, ... })

// 3. Incluir en authorization URL
authUrl.searchParams.set('state', state)

// 4. Validar en callback
if (receivedState !== savedState) {
  throw new Error('State mismatch - possible CSRF attack')
}
```

**Ataque prevenido:**
- Atacante crea authorization URL malicioso
- Víctima lo abre y autoriza
- Redirect va a attackerCallback, no a app
- State mismatch detectado

### Encriptación de Tokens

**Método:** Electron `safeStorage` API

**Algoritmos por plataforma:**
- **macOS:** AES-256-GCM via Keychain
- **Windows:** DPAPI (Data Protection API)
- **Linux:** AES-256-GCM via libsecret

**Ventajas:**
- Keys manejadas por OS
- No requiere password del usuario
- Tied to user account
- Sobrevive reinstalaciones de app

**Limitaciones:**
- Tokens accesibles si atacante tiene acceso al user account del OS
- No protege contra malware con permisos de usuario

### Seguridad del Callback Server

**Puerto:** 3000 (recomendado por OpenRouter) o random

**Binding:** `localhost` únicamente (no accesible desde red)

**Timeout:** 5 minutos máximo

**Cleanup:** Server se cierra después de callback exitoso

**Content-Type:** HTML responses (no ejecuta código)

---

## Ejemplos de Uso

### Ejemplo 1: Servidor MCP sin OAuth

```typescript
// Config
const config = {
  id: 'simple-mcp',
  transport: 'http',
  baseUrl: 'https://simple-mcp.example.com'
}

// Conexión
await mcpService.connectServer(config)

// Flujo:
// 1. injectOAuthToken() → No token → No changes
// 2. client.connect() → 200 OK → Connected ✓
```

### Ejemplo 2: Servidor MCP con OAuth (Primera vez)

```typescript
// Config
const config = {
  id: 'figma-mcp',
  transport: 'http',
  baseUrl: 'https://mcp.figma.com'
}

// Conexión
await mcpService.connectServer(config)

// Flujo:
// 1. injectOAuthToken() → No token → No changes
// 2. client.connect() → 401 Unauthorized
// 3. Detecta 401 → authorize('figma-mcp', 'https://mcp.figma.com')
//    a. Discovery metadata
//    b. PKCE generation
//    c. Open browser → User authorizes
//    d. Callback → Exchange code
//    e. Save tokens
// 4. Retry connection
//    a. injectOAuthToken() → Token found → Inject header
//    b. client.connect() → 200 OK → Connected ✓
```

### Ejemplo 3: Servidor MCP con OAuth (Conexiones posteriores)

```typescript
// Config (mismo servidor)
const config = {
  id: 'figma-mcp',
  transport: 'http',
  baseUrl: 'https://mcp.figma.com'
}

// Conexión
await mcpService.connectServer(config)

// Flujo:
// 1. injectOAuthToken()
//    a. Token found ✓
//    b. Token valid ✓ (no expiró)
//    c. Inject Authorization header
// 2. client.connect() → 200 OK → Connected ✓
// No OAuth flow necesario! 🎉
```

### Ejemplo 4: Token Expirando (Auto-refresh)

```typescript
// Token expira en 3 minutos
// Buffer de refresh: 5 minutos
// → Trigger auto-refresh

await mcpService.connectServer(config)

// Flujo:
// 1. injectOAuthToken()
//    a. Token found ✓
//    b. Token valid? ❌ (expira en <5min)
//    c. Auto-refresh:
//       i.  POST token_endpoint con refresh_token
//       ii. Save new tokens
//    d. Inject Authorization header (nuevo token)
// 2. client.connect() → 200 OK → Connected ✓
```

### Ejemplo 5: Refresh Token Expirado (Re-authorization)

```typescript
// Refresh token expirado o revocado

await mcpService.connectServer(config)

// Flujo:
// 1. injectOAuthToken()
//    a. Token found ✓
//    b. Token valid? ❌
//    c. Auto-refresh attempt:
//       i.  POST token_endpoint → 401 Unauthorized
//       ii. Refresh failed ❌
//    d. Return config without token
// 2. client.connect() → 401 Unauthorized
// 3. Detecta 401 → Re-authorize (OAuth flow completo)
// 4. Retry connection → Connected ✓
```

### Ejemplo 6: Revocar Token

```typescript
// Desconectar servidor OAuth
await mcpOAuthService.revokeToken('figma-mcp')

// Efectos:
// 1. Token eliminado de storage
// 2. Próxima conexión requerirá OAuth completo
// 3. (Opcional) POST revocation_endpoint si disponible
```

---

## Troubleshooting

### Problema: "Could not discover OAuth metadata"

**Causa:** Servidor no tiene endpoint `/.well-known/oauth-authorization-server` o formato inválido

**Solución:**
1. Verificar que servidor soporta RFC 8414
2. Verificar respuesta 401 incluye header `WWW-Authenticate`
3. Configurar endpoints manualmente en `config.oauthMetadata`

```typescript
config.oauthMetadata = {
  authorization_endpoint: 'https://auth.example.com/authorize',
  token_endpoint: 'https://auth.example.com/token',
  scopes: ['read', 'write']
}
```

### Problema: "OAuth authorization timed out"

**Causa:** Usuario no completó autorización en 5 minutos

**Solución:**
1. Reintentar conexión
2. Verificar browser se abrió correctamente
3. Verificar redirect_uri está permitido en servidor OAuth

### Problema: "State mismatch - possible CSRF attack"

**Causa:** State parameter no coincide (raro en uso legítimo)

**Solución:**
1. Reintentar - puede ser timing issue
2. Verificar no hay proxies/redirects modificando URL
3. Verificar callback server port correcto

### Problema: "No refresh token available"

**Causa:** Token original no incluía `refresh_token`

**Solución:**
1. Verificar scopes incluyen "offline_access" o equivalente
2. Re-autorizar con scopes correctos
3. Algunos servers requieren prompt=consent

### Problema: Token refresh falla constantemente

**Causa:** Metadata faltante o refresh_token inválido

**Solución:**
1. Eliminar token: `await mcpOAuthService.revokeToken(serverId)`
2. Re-conectar → OAuth flow completo
3. Verificar logs para detalles específicos

### Problema: "Authentication failed" después de OAuth exitoso

**Causa:** Token válido pero server lo rechaza (permisos insuficientes)

**Solución:**
1. Verificar scopes otorgados vs requeridos
2. Verificar cuenta de usuario tiene permisos necesarios
3. Re-autorizar con scopes adicionales

### Debugging

**Habilitar logs:**

```bash
# .env.local
DEBUG_ENABLED=true
DEBUG_MCP=true
LOG_LEVEL=debug
```

**Logs relevantes:**

```typescript
// OAuth flow
logger.mcp.info('Starting MCP OAuth authorization', { serverId, baseUrl })
logger.mcp.debug('OAuth metadata discovered', { metadata })
logger.mcp.debug('Generated PKCE parameters', { codeChallenge })
logger.mcp.info('Opening authorization URL in browser')
logger.mcp.info('Processing OAuth callback', { serverId })
logger.mcp.info('OAuth authorization completed successfully')

// Token injection
logger.mcp.debug('OAuth token injected into request headers', { serverId })

// Refresh
logger.mcp.info('OAuth token expired, attempting refresh', { serverId })
logger.mcp.info('OAuth token refreshed successfully')

// Errors
logger.mcp.error('OAuth authorization failed', { error })
logger.mcp.error('Token refresh failed', { error })
```

---

## Referencias

- **RFC 6749:** OAuth 2.0 Authorization Framework
- **RFC 7636:** PKCE (Proof Key for Code Exchange)
- **RFC 8414:** OAuth 2.0 Authorization Server Metadata
- **MCP Specification:** https://modelcontextprotocol.io
- **Electron safeStorage:** https://www.electronjs.org/docs/latest/api/safe-storage

---

## Changelog

**v1.0.0** (2024-01)
- Initial implementation
- OAuth 2.0 + PKCE support
- Auto-refresh tokens
- Retry logic on 401
- Encrypted storage
- Metadata persistence
