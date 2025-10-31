import { getLogger } from '../services/logging';
import { validatePublicUrl, logBlockedUrl, safeFetch } from './urlValidator';

const logger = getLogger();

/**
 * Allowed domains for MCP documentation extraction
 *
 * Security: Only allow fetching from known MCP-related documentation sources
 * to prevent SSRF attacks and data exfiltration
 */
const ALLOWED_DOMAINS = [
  'github.com',
  'raw.githubusercontent.com',
  'gist.github.com',
  'docs.anthropic.com',
  'modelcontextprotocol.io',
  'npmjs.com',
  'registry.npmjs.org',
] as const;

/**
 * Check if a URL's domain is in the allowed list
 *
 * @param url - URL to check
 * @returns true if domain is allowed, false otherwise
 */
function isDomainAllowed(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();

  for (const allowedDomain of ALLOWED_DOMAINS) {
    // Allow exact match or subdomain
    if (hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Fetch and extract text content from a URL
 * Converts HTML to markdown-like text format
 *
 * Security: Only allows fetching from whitelisted domains to prevent SSRF
 */
export async function fetchUrlContent(url: string): Promise<string | null> {
  try {
    logger.mcp.debug('Fetching URL content', { url });

    // Security: Validate URL for SSRF protection
    const validation = validatePublicUrl(url);
    if (!validation.valid || !validation.parsedUrl) {
      logBlockedUrl(url, validation.error || 'Invalid URL', 'fetchUrlContent');
      logger.mcp.error('URL validation failed', {
        url,
        error: validation.error
      });
      return null;
    }

    // Security: Check domain allowlist
    if (!isDomainAllowed(validation.parsedUrl)) {
      const blockedDomain = validation.parsedUrl.hostname;
      logBlockedUrl(url, `Domain not in allowlist: ${blockedDomain}`, 'fetchUrlContent');
      logger.mcp.warn('Blocked URL from non-whitelisted domain', {
        domain: blockedDomain,
        allowedDomains: ALLOWED_DOMAINS
      });
      return null;
    }

    // Security: Use safeFetch with 30s timeout
    const response = await safeFetch(url, {
      headers: {
        'User-Agent': 'Levante-MCP-Extractor/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      logger.mcp.error('Failed to fetch URL', {
        url,
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const html = await response.text();
    logger.mcp.debug('URL content fetched', {
      url,
      contentLength: html.length,
    });

    // Convert HTML to plain text (simple extraction)
    const text = htmlToText(html);

    return text;
  } catch (error: any) {
    logger.mcp.error('Error fetching URL content', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Convert HTML to plain text
 * Preserves code blocks, URLs, and important structural information
 */
function htmlToText(html: string): string {
  let text = html;

  // Remove script and style tags with their content
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Extract code blocks and preserve them (pre, code tags)
  const codeBlocks: string[] = [];
  text = text.replace(/<(pre|code)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, content) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    // Decode HTML entities in code blocks
    let decoded = content
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    // Remove inner HTML tags from code content
    decoded = decoded.replace(/<[^>]+>/g, '');
    codeBlocks.push(`\n\`\`\`\n${decoded.trim()}\n\`\`\`\n`);
    return placeholder;
  });

  // Convert headings to markdown-style
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');

  // Convert lists
  text = text.replace(/<li[^>]*>/gi, '\n- ');

  // Convert common block elements to newlines
  text = text.replace(/<\/?(div|p|br|tr|ul|ol)[^>]*>/gi, '\n');

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

  // Restore code blocks
  codeBlocks.forEach((block, index) => {
    text = text.replace(`__CODE_BLOCK_${index}__`, block);
  });

  // Clean up whitespace
  text = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  // Collapse multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
