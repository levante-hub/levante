/**
 * Normalize text by removing accents and converting to lowercase for search purposes
 */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áàäâãåāăą]/g, 'a')
    .replace(/[éèëêēėę]/g, 'e')
    .replace(/[íìïîīįĩ]/g, 'i')
    .replace(/[óòöôõōő]/g, 'o')
    .replace(/[úùüûūųũű]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/ñń/g, 'n')
    .replace(/[çćč]/g, 'c')
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .replace(/ř/g, 'r')
    .replace(/ł/g, 'l')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'd');
}

/**
 * Check if a text contains a search query (accent-insensitive)
 */
export function searchTextMatch(text: string, query: string): boolean {
  const normalizedText = normalizeSearchText(text);
  const normalizedQuery = normalizeSearchText(query);
  return normalizedText.includes(normalizedQuery);
}