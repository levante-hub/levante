import { getLogger } from '../services/logging';
import { shell } from 'electron';

const logger = getLogger();

/**
 * Protocols allowed for external URL opening
 *
 * Security: Only web protocols and email are permitted.
 * file:// and custom protocols are blocked to prevent:
 * - Local file access/exposure
 * - Arbitrary application execution
 * - Protocol handler exploitation
 *
 * References:
 * - CVE-2020-25019: Jitsi Meet file:// URL execution vulnerability
 * - Electron Security Guidelines: shell.openExternal() best practices
 */
export const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const;

/**
 * Validates if a URL is safe to open externally
 *
 * @param url - URL string to validate
 * @returns true if URL uses allowed protocol, false otherwise
 */
export function isUrlSafe(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsedUrl.protocol as any);
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Safely opens external URL with protocol validation
 *
 * Security: Validates protocol allowlist before opening.
 * Logs all attempts for security auditing.
 *
 * @param url - URL to open
 * @param context - Where the URL came from (for logging)
 * @returns Success/failure status
 */
export async function safeOpenExternal(
  url: string,
  context: string = 'unknown'
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsedUrl = new URL(url);

    if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol as any)) {
      logger.core.warn('Blocked non-HTTP(S) protocol', {
        protocol: parsedUrl.protocol,
        host: parsedUrl.host,
        context
      });

      return {
        success: false,
        error: `Protocol "${parsedUrl.protocol}" is not allowed. Only HTTP, HTTPS, and mailto URLs can be opened.`
      };
    }

    logger.core.info('Opening external URL', {
      protocol: parsedUrl.protocol,
      host: parsedUrl.host,
      context
    });

    await shell.openExternal(url);
    return { success: true };

  } catch (error) {
    logger.core.error('Invalid URL format', {
      url: url.substring(0, 50), // Log first 50 chars only
      error: error instanceof Error ? error.message : String(error),
      context
    });

    return {
      success: false,
      error: 'Invalid URL format'
    };
  }
}

/**
 * Get user-friendly message for blocked protocol
 */
export function getBlockedProtocolMessage(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol.replace(':', '');

    const messages: Record<string, string> = {
      'file': 'Local file links are disabled for security. Files cannot be opened from chat.',
      'ftp': 'FTP links are not supported. Use HTTP/HTTPS instead.',
      'javascript': 'JavaScript links are blocked for security.',
      'data': 'Data URLs are blocked for security.',
    };

    return messages[protocol] || `Links with "${protocol}://" protocol are not allowed.`;
  } catch {
    return 'Invalid URL format.';
  }
}
