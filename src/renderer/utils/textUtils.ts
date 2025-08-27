/**
 * Comprehensive accent mapping for search normalization
 */
export const ACCENT_MAP = [
  // A variations
  ['á', 'a'], ['à', 'a'], ['ä', 'a'], ['â', 'a'], ['ã', 'a'], ['å', 'a'], ['ā', 'a'], ['ă', 'a'], ['ą', 'a'],
  // E variations  
  ['é', 'e'], ['è', 'e'], ['ë', 'e'], ['ê', 'e'], ['ē', 'e'], ['ė', 'e'], ['ę', 'e'],
  // I variations
  ['í', 'i'], ['ì', 'i'], ['ï', 'i'], ['î', 'i'], ['ī', 'i'], ['į', 'i'], ['ĩ', 'i'],
  // O variations
  ['ó', 'o'], ['ò', 'o'], ['ö', 'o'], ['ô', 'o'], ['õ', 'o'], ['ō', 'o'], ['ő', 'o'],
  // U variations
  ['ú', 'u'], ['ù', 'u'], ['ü', 'u'], ['û', 'u'], ['ū', 'u'], ['ų', 'u'], ['ũ', 'u'], ['ű', 'u'],
  // Y variations
  ['ý', 'y'], ['ÿ', 'y'],
  // Other letters
  ['ñ', 'n'], ['ń', 'n'],
  ['ç', 'c'], ['ć', 'c'], ['č', 'c'],
  ['ș', 's'], ['ş', 's'],
  ['ț', 't'], ['ţ', 't'],
  ['ř', 'r'],
  ['ł', 'l'],
  ['ž', 'z'],
  ['đ', 'd']
] as const;

/**
 * Normalize text by removing accents and converting to lowercase for search purposes
 * Uses efficient single-pass replacement with pre-compiled regex
 */
export function normalizeSearchText(text: string): string {
  // Create a single regex that matches all accented characters
  const accentRegex = new RegExp(`[${ACCENT_MAP.map(([accented]) => accented).join('')}]`, 'g');
  
  // Create lookup map for faster replacements
  const accentLookup = new Map<string, string>(ACCENT_MAP);
  
  // Single pass: lowercase and replace accents
  return text.toLowerCase().replace(accentRegex, (match) => accentLookup.get(match) || match);
}

/**
 * Check if a text contains a search query (accent-insensitive)
 */
export function searchTextMatch(text: string, query: string): boolean {
  const normalizedText = normalizeSearchText(text);
  const normalizedQuery = normalizeSearchText(query);
  return normalizedText.includes(normalizedQuery);
}

/**
 * Build SQL expression for accent-insensitive database queries
 * Uses simpler LOWER() only and relies on pre-normalized search terms
 */
export function buildAccentInsensitiveSqlLike(columnName: string = 'content'): string {
  return `LOWER(${columnName})`;
}