// Language detection, deterministic layer. Detects from the words themselves,
// never from the topic (spec Section 4). The heuristic covers the clear cases;
// ambiguous text falls back to a Haiku call in the pipeline.

// Azerbaijani has highly distinctive Latin letters; 'ə' alone is near-proof.
const AZ_STRONG = /[əƏ]/;
const AZ_WEAK = /[ğĞıİşŞçÇöÖüÜ]/;
const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[a-zA-Z]/;

// Common Azerbaijani function words for ASCII-ish AZ text typed without diacritics.
const AZ_WORDS = new Set([
  'və', 'bir', 'bu', 'ki', 'da', 'də', 'men', 'mən', 'sen', 'sən', 'olan',
  'ile', 'ilə', 'ucun', 'üçün', 'amma', 'ancaq', 'niyə', 'necə', 'harada',
  'var', 'yox', 'gəl', 'gel', 'usta', 'təmir', 'temir', 'sifariş', 'sifaris',
]);

// Returns 'en' | 'ru' | 'az' | null (null = ambiguous, ask Haiku).
export function detectLanguageHeuristic(text) {
  if (!text || !text.trim()) return null;
  if (CYRILLIC.test(text)) return 'ru';
  if (AZ_STRONG.test(text)) return 'az';

  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const azHits = words.filter((w) => AZ_WORDS.has(w)).length;
  const hasAzWeak = AZ_WEAK.test(text);

  if (hasAzWeak && (azHits > 0 || words.length <= 6)) return 'az';
  if (azHits >= 2 || (azHits >= 1 && words.length <= 4)) return 'az';
  if (hasAzWeak) return null;
  if (LATIN.test(text)) {
    // Plain Latin with no AZ signals: English for anything sentence-like;
    // single-word fragments ("ok", "salam") stay ambiguous.
    if (words.length >= 2) return 'en';
    return null;
  }
  return null;
}

export const LANGUAGE_NAMES = { en: 'English', ru: 'Russian', az: 'Azerbaijani' };

export function isSupportedLanguage(lang) {
  return lang === 'en' || lang === 'ru' || lang === 'az';
}
