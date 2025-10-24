import { getLogger } from '../services/logging';

const logger = getLogger();

export interface SensitivePattern {
  pattern: RegExp;
  type: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface DetectionResult {
  hasSensitiveData: boolean;
  detections: Array<{
    type: string;
    confidence: 'high' | 'medium' | 'low';
    match: string;
    position: number;
  }>;
}

/**
 * Patterns for detecting sensitive data
 */
const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // High confidence (99%) - Specific API key formats
  {
    pattern: /sk-[a-zA-Z0-9]{32,}/gi,
    type: 'OpenAI API Key',
    confidence: 'high',
  },
  {
    pattern: /ghp_[a-zA-Z0-9]{36}/gi,
    type: 'GitHub Personal Access Token',
    confidence: 'high',
  },
  {
    pattern: /gho_[a-zA-Z0-9]{36}/gi,
    type: 'GitHub OAuth Token',
    confidence: 'high',
  },
  {
    pattern: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/gi,
    type: 'Slack Bot Token',
    confidence: 'high',
  },
  {
    pattern: /xoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/gi,
    type: 'Slack User Token',
    confidence: 'high',
  },
  {
    pattern: /AKIA[0-9A-Z]{16}/gi,
    type: 'AWS Access Key',
    confidence: 'high',
  },

  // Medium confidence (70%) - Generic patterns
  {
    pattern: /api[_-]?key\s*[=:]\s*["']?[a-zA-Z0-9]{16,}["']?/gi,
    type: 'Generic API Key',
    confidence: 'medium',
  },
  {
    pattern: /token\s*[=:]\s*["']?[a-zA-Z0-9]{16,}["']?/gi,
    type: 'Generic Token',
    confidence: 'medium',
  },
  {
    pattern: /password\s*[=:]\s*["']?.+["']?/gi,
    type: 'Password',
    confidence: 'medium',
  },
  {
    pattern: /auth\s*[=:]\s*["']?[a-zA-Z0-9]{16,}["']?/gi,
    type: 'Auth Credential',
    confidence: 'medium',
  },

  // Low confidence (40%) - Ask user
  {
    pattern: /secret[_-]?key/gi,
    type: 'Possible Secret',
    confidence: 'low',
  },
  {
    pattern: /bearer\s+[a-zA-Z0-9]/gi,
    type: 'Possible Bearer Token',
    confidence: 'low',
  },
];

/**
 * Whitelist patterns - these are NOT sensitive even if they match sensitive keywords
 */
const WHITELIST_PATTERNS: RegExp[] = [
  // Documentation keywords
  /token[-_]?type/gi,
  /api[-_]?key[-_]?name/gi,
  /password[-_]?hash/gi,
  /secret[-_]?name/gi,

  // Common words in context
  /tokenize/gi,
  /authentication/gi,

  // MCP-specific package names
  /server[-_]token/gi,
  /@[\w-]+\/.*token/gi, // npm package names with 'token'
];

/**
 * Check if a match is whitelisted
 */
function isWhitelisted(text: string, match: string, position: number): boolean {
  // Check a window around the match for whitelist patterns
  const windowStart = Math.max(0, position - 20);
  const windowEnd = Math.min(text.length, position + match.length + 20);
  const window = text.substring(windowStart, windowEnd);

  return WHITELIST_PATTERNS.some(pattern => pattern.test(window));
}

/**
 * Detect sensitive data in text
 */
export function detectSensitiveData(text: string): DetectionResult {
  const detections: DetectionResult['detections'] = [];

  for (const { pattern, type, confidence } of SENSITIVE_PATTERNS) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(text)) !== null) {
      // Check if this match is whitelisted
      if (isWhitelisted(text, match[0], match.index)) {
        continue;
      }

      // Truncate match for logging (don't log actual secrets)
      const truncatedMatch = match[0].length > 20
        ? match[0].substring(0, 10) + '...' + match[0].substring(match[0].length - 5)
        : match[0];

      detections.push({
        type,
        confidence,
        match: truncatedMatch,
        position: match.index,
      });

      logger.core.debug('Sensitive data detected', {
        type,
        confidence,
        position: match.index,
        matchLength: match[0].length,
      });
    }
  }

  return {
    hasSensitiveData: detections.length > 0,
    detections,
  };
}

/**
 * Sanitize text by replacing sensitive data with placeholders
 */
export function sanitizeSensitiveData(text: string): {
  sanitized: string;
  replacements: number;
} {
  let sanitized = text;
  let replacements = 0;

  // Only auto-replace high confidence patterns
  const highConfidencePatterns = SENSITIVE_PATTERNS.filter(p => p.confidence === 'high');

  for (const { pattern, type } of highConfidencePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sanitized)) !== null) {
      if (isWhitelisted(text, match[0], match.index)) {
        continue;
      }

      // Determine placeholder based on type
      let placeholder = 'YOUR_API_KEY_HERE';
      if (type.includes('Token')) {
        placeholder = 'YOUR_TOKEN_HERE';
      } else if (type.includes('Password')) {
        placeholder = 'YOUR_PASSWORD_HERE';
      } else if (type.includes('Secret')) {
        placeholder = 'YOUR_SECRET_HERE';
      }

      sanitized = sanitized.substring(0, match.index) + placeholder + sanitized.substring(match.index + match[0].length);
      replacements++;

      logger.core.info('Sanitized sensitive data', {
        type,
        position: match.index,
        placeholder,
      });

      // Reset regex to avoid infinite loops
      regex.lastIndex = match.index + placeholder.length;
    }
  }

  return {
    sanitized,
    replacements,
  };
}

/**
 * Get confidence level for detections
 */
export function getHighestConfidence(detections: DetectionResult['detections']): 'high' | 'medium' | 'low' | null {
  if (detections.length === 0) return null;

  if (detections.some(d => d.confidence === 'high')) return 'high';
  if (detections.some(d => d.confidence === 'medium')) return 'medium';
  return 'low';
}
