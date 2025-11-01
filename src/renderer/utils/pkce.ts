/**
 * PKCE (Proof Key for Code Exchange) Utilities - Browser Version
 * RFC 7636 - S256 method
 *
 * Browser-compatible implementation using Web Crypto API
 * Shared by OpenRouter OAuth and future browser-side OAuth flows
 */

/**
 * Base64 URL-safe encoding for browser
 * Converts Uint8Array to base64 and makes it URL-safe
 */
export function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(buffer)));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a cryptographically random code verifier
 * Length: 32 bytes (256 bits) → 43 characters base64url
 *
 * @returns Code verifier string (base64url encoded)
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate code challenge from verifier using S256 method
 * SHA-256 hash of the verifier, then base64url encode
 *
 * @param verifier - The code verifier to hash
 * @returns Code challenge string (base64url encoded)
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * Generate a random state parameter for CSRF protection
 * Length: 16 bytes (128 bits) → 22 characters base64url
 *
 * @returns State string (base64url encoded)
 */
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}
