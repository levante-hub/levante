import { getLogger } from '../services/logging';

const logger = getLogger();

/**
 * Private IP ranges to block for SSRF prevention
 *
 * Security: Blocks access to:
 * - Private networks (RFC 1918)
 * - Localhost/loopback
 * - Link-local addresses
 * - Cloud metadata endpoints (AWS, GCP, Azure)
 * - Docker internal networks
 *
 * References:
 * - OWASP SSRF Prevention Cheat Sheet
 * - CWE-918: Server-Side Request Forgery (SSRF)
 */
const PRIVATE_IP_RANGES = [
  // IPv4 Private ranges (RFC 1918)
  /^10\./,                        // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
  /^192\.168\./,                  // 192.168.0.0/16

  // IPv4 Localhost
  /^127\./,                       // 127.0.0.0/8 (loopback)
  /^0\.0\.0\.0$/,                 // 0.0.0.0

  // IPv4 Link-local
  /^169\.254\./,                  // 169.254.0.0/16

  // IPv6 patterns
  /^::1$/,                        // IPv6 loopback
  /^fe80:/i,                      // IPv6 link-local
  /^fc00:/i,                      // IPv6 unique local
  /^fd00:/i,                      // IPv6 unique local

  // Localhost aliases
  /^localhost$/i,
];

/**
 * Common cloud metadata endpoints to block
 */
const METADATA_ENDPOINTS = [
  '169.254.169.254',  // AWS, Azure, GCP metadata
  'metadata.google.internal',
  'metadata',
];

/**
 * Allowed protocols for URL validation
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:'] as const;

/**
 * Configuration for local endpoint validation
 */
interface LocalEndpointConfig {
  allowLocalhost?: boolean;
  allowedPorts?: number[];
  maxPort?: number;
}

/**
 * Validates if a hostname is a private/internal IP address
 *
 * @param hostname - Hostname to validate
 * @returns true if hostname is private/internal, false otherwise
 */
function isPrivateIP(hostname: string): boolean {
  // Check against private IP patterns
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  // Check against metadata endpoints
  if (METADATA_ENDPOINTS.includes(hostname.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * Validates a URL for SSRF protection
 *
 * Security checks:
 * - Protocol allowlist (HTTP/HTTPS only)
 * - Private IP range blocking
 * - Cloud metadata endpoint blocking
 * - Port range validation
 *
 * @param url - URL string to validate
 * @param config - Optional configuration for local endpoint exceptions
 * @returns Validation result with success status and error message
 */
export function validateUrl(
  url: string,
  config?: LocalEndpointConfig
): { valid: boolean; error?: string; parsedUrl?: URL } {
  try {
    const parsedUrl = new URL(url);

    // 1. Validate protocol
    if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol as any)) {
      return {
        valid: false,
        error: `Protocol "${parsedUrl.protocol}" is not allowed. Only HTTP and HTTPS are permitted.`
      };
    }

    // 2. Check for private IPs (with localhost exception if configured)
    const hostname = parsedUrl.hostname.toLowerCase();

    if (config?.allowLocalhost && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')) {
      // Localhost is explicitly allowed, continue validation
      logger.core.debug('Allowing localhost endpoint', { hostname });
    } else if (isPrivateIP(hostname)) {
      return {
        valid: false,
        error: `Access to private IP addresses and internal networks is not allowed: ${hostname}`
      };
    }

    // 3. Validate port if specified
    if (parsedUrl.port) {
      const port = parseInt(parsedUrl.port, 10);

      if (config?.allowedPorts && !config.allowedPorts.includes(port)) {
        return {
          valid: false,
          error: `Port ${port} is not in the allowed list: ${config.allowedPorts.join(', ')}`
        };
      }

      if (config?.maxPort && port > config.maxPort) {
        return {
          valid: false,
          error: `Port ${port} exceeds maximum allowed port ${config.maxPort}`
        };
      }
    }

    return { valid: true, parsedUrl };

  } catch (error) {
    return {
      valid: false,
      error: 'Invalid URL format'
    };
  }
}

/**
 * Validates a local endpoint URL (Ollama, custom AI endpoints)
 *
 * Allows localhost connections but blocks all other private IPs
 *
 * @param endpoint - Endpoint URL to validate
 * @returns Validation result with success status and error message
 */
export function validateLocalEndpoint(
  endpoint: string
): { valid: boolean; error?: string; parsedUrl?: URL } {
  return validateUrl(endpoint, {
    allowLocalhost: true,
    allowedPorts: [11434, 8080, 8000, 5000, 3000], // Common AI endpoint ports
    maxPort: 65535
  });
}

/**
 * Validates a public API endpoint URL
 *
 * Blocks all private IPs including localhost
 *
 * @param url - URL to validate
 * @returns Validation result with success status and error message
 */
export function validatePublicUrl(
  url: string
): { valid: boolean; error?: string; parsedUrl?: URL } {
  return validateUrl(url, {
    allowLocalhost: false
  });
}

/**
 * Logs a blocked URL attempt for security auditing
 *
 * @param url - Blocked URL
 * @param reason - Reason for blocking
 * @param context - Where the URL came from
 */
export function logBlockedUrl(url: string, reason: string, context: string): void {
  logger.core.warn('Blocked potentially malicious URL', {
    url: url.substring(0, 100), // Log first 100 chars only
    reason,
    context,
    timestamp: new Date().toISOString()
  });
}

/**
 * Adds timeout to fetch requests for SSRF mitigation
 *
 * Prevents indefinite hanging on malicious endpoints
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns Fetch promise with timeout
 */
export async function safeFetch(
  url: string,
  options?: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
