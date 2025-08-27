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
 */
export function normalizeSearchText(text: string): string {
  let normalized = text.toLowerCase();
  
  for (const [accented, base] of ACCENT_MAP) {
    normalized = normalized.replace(new RegExp(accented, 'g'), base);
  }
  
  return normalized;
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
 * Build SQL REPLACE chain for accent-insensitive database queries
 * Uses the same ACCENT_MAP for consistency with client-side normalization
 */
export function buildAccentInsensitiveSqlLike(columnName: string = 'content'): string {
  const sql = ACCENT_MAP.reduce((acc, [accented, base]) => {
    return `REPLACE(${acc}, '${accented}', '${base}')`;
  }, columnName);
  
  return `LOWER(${sql})`;
}