import { getLogger } from '../services/logging';

const logger = getLogger();

/**
 * Escapes special characters in SQL LIKE patterns
 *
 * Security: Prevents LIKE clause injection by escaping wildcards.
 * Without escaping, an attacker could:
 * - Use '%' to match all records (DoS via excessive results)
 * - Use '_' to perform character-by-character data exfiltration
 * - Bypass search filters
 *
 * Example attack:
 * - Search for "%" returns ALL messages instead of literal '%' character
 * - Search for "a_c" matches "abc", "adc", "a1c" instead of literal "a_c"
 *
 * References:
 * - OWASP SQL Injection Prevention Cheat Sheet
 * - CWE-89: SQL Injection
 *
 * @param value - User input for LIKE pattern
 * @param escapeChar - Escape character (default: '\')
 * @returns Sanitized value with wildcards escaped
 */
export function escapeLikePattern(value: string, escapeChar: string = '\\'): string {
  if (!value) {
    return value;
  }

  // Escape the escape character itself first
  let escaped = value.replace(new RegExp(`\\${escapeChar}`, 'g'), `${escapeChar}${escapeChar}`);

  // Escape SQL LIKE wildcards
  escaped = escaped
    .replace(/%/g, `${escapeChar}%`)    // % matches zero or more characters
    .replace(/_/g, `${escapeChar}_`);   // _ matches exactly one character

  logger.database.debug('Escaped LIKE pattern', {
    original: value.substring(0, 50),
    escaped: escaped.substring(0, 50),
    originalLength: value.length,
    escapedLength: escaped.length
  });

  return escaped;
}

/**
 * Creates a safe LIKE pattern with wildcards
 *
 * @param value - User input to search for
 * @param matchType - Type of match: 'contains', 'starts_with', 'ends_with', 'exact'
 * @param escapeChar - Escape character (default: '\')
 * @returns Object with sanitized pattern and escape character
 */
export function createLikePattern(
  value: string,
  matchType: 'contains' | 'starts_with' | 'ends_with' | 'exact' = 'contains',
  escapeChar: string = '\\'
): { pattern: string; escapeChar: string } {
  const escaped = escapeLikePattern(value, escapeChar);

  let pattern: string;
  switch (matchType) {
    case 'contains':
      pattern = `%${escaped}%`;
      break;
    case 'starts_with':
      pattern = `${escaped}%`;
      break;
    case 'ends_with':
      pattern = `%${escaped}`;
      break;
    case 'exact':
      pattern = escaped;
      break;
    default:
      pattern = `%${escaped}%`;
  }

  return { pattern, escapeChar };
}

/**
 * Validates and sanitizes SQL identifiers (table/column names)
 *
 * Security: Prevents SQL injection via dynamic table/column names
 *
 * @param identifier - Table or column name
 * @returns Sanitized identifier
 * @throws Error if identifier contains invalid characters
 */
export function sanitizeIdentifier(identifier: string): string {
  // Only allow alphanumeric characters and underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    logger.database.error('Invalid SQL identifier detected', { identifier });
    throw new Error('Invalid SQL identifier: must start with letter or underscore and contain only alphanumeric characters and underscores');
  }

  return identifier;
}

/**
 * Validates SQL LIMIT value
 *
 * Security: Prevents DoS via excessive result sets
 *
 * @param limit - Requested limit
 * @param maxLimit - Maximum allowed limit (default: 1000)
 * @returns Validated limit
 */
export function validateLimit(limit: number | undefined, maxLimit: number = 1000): number {
  if (limit === undefined || limit === null) {
    return 100; // Default limit
  }

  if (!Number.isInteger(limit) || limit < 1) {
    logger.database.warn('Invalid LIMIT value, using default', { limit });
    return 100;
  }

  if (limit > maxLimit) {
    logger.database.warn('LIMIT exceeds maximum, capping', { requested: limit, max: maxLimit });
    return maxLimit;
  }

  return limit;
}

/**
 * Validates SQL OFFSET value
 *
 * Security: Prevents invalid offset values
 *
 * @param offset - Requested offset
 * @returns Validated offset
 */
export function validateOffset(offset: number | undefined): number {
  if (offset === undefined || offset === null) {
    return 0;
  }

  if (!Number.isInteger(offset) || offset < 0) {
    logger.database.warn('Invalid OFFSET value, using 0', { offset });
    return 0;
  }

  return offset;
}
