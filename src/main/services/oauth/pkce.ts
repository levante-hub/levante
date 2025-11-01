import crypto from 'crypto';

/**
 * PKCE (Proof Key for Code Exchange) Utilities
 * RFC 7636 - S256 method
 *
 * Shared utilities for OAuth flows (OpenRouter, MCP OAuth, etc.)
 */

/**
 * Base64 URL-safe encoding
 * Converts buffer to base64 and makes it URL-safe by replacing +/= characters
 */
export function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
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
  const buffer = crypto.randomBytes(32);
  return base64UrlEncode(buffer);
}

/**
 * Generate code challenge from verifier using S256 method
 * SHA-256 hash of the verifier, then base64url encode
 *
 * @param verifier - The code verifier to hash
 * @returns Code challenge string (base64url encoded)
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Generate a random state parameter for CSRF protection
 * Length: 16 bytes (128 bits) → 22 characters base64url
 *
 * @returns State string (base64url encoded)
 */
export function generateState(): string {
  const buffer = crypto.randomBytes(16);
  return base64UrlEncode(buffer);
}
