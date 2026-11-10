import { RTL_LOCALES, SUPPORTED_LOCALES, type Locale } from './types';

/** Value of the `language` setting. `auto` follows the browser languages. */
export const LANGUAGE_SETTINGS = ['auto', ...SUPPORTED_LOCALES] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/** Validate a stored language value; anything unknown becomes `auto`. */
export function parseLanguageSetting(raw: unknown): LanguageSetting {
  return typeof raw === 'string' && (LANGUAGE_SETTINGS as readonly string[]).includes(raw)
    ? (raw as LanguageSetting)
    : 'auto';
}

/**
 * Resolve the setting to a supported locale. `auto` walks the browser languages in order and takes
 * the first whose primary subtag is supported (`ro-MD` gives `ro`); English is the fallback.
 */
export function resolveLocale(setting: LanguageSetting, languages: readonly string[] = []): Locale {
  if (setting !== 'auto') return setting;
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0] ?? '';
    const match = SUPPORTED_LOCALES.find((l) => l === primary);
    if (match) return match;
  }
  return 'en';
}

/** BCP 47 tag used for Intl formatting (dates, plural rules). */
export function intlTag(locale: Locale): string {
  switch (locale) {
    case 'ro':
      return 'ro-RO';
    case 'ar':
      return 'ar';
    default:
      return 'en-US';
  }
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}
