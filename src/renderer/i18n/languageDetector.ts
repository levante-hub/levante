/**
 * Detect system language from OS locale
 * Returns 'en' or 'es', defaults to 'en' for unsupported languages
 */
export function detectSystemLanguage(): 'en' | 'es' {
  // Check navigator.language or the first language in navigator.languages
  const systemLocale = navigator.language || (navigator.languages && navigator.languages[0]) || 'en';

  // Extract language code (e.g., 'es-ES' -> 'es', 'en-US' -> 'en')
  const languageCode = systemLocale.split('-')[0].toLowerCase();

  // Return 'es' if Spanish, otherwise default to 'en'
  return languageCode === 'es' ? 'es' : 'en';
}
