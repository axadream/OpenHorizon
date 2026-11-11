import { loadCustomLocale } from './customLocale';
import { RTL_LOCALES, SUPPORTED_LOCALES, type Locale } from './types';

/** Value of the `language` setting. `auto` follows the browser languages; `custom` is an imported file. */
export const LANGUAGE_SETTINGS = ['auto', ...SUPPORTED_LOCALES, 'custom'] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/** Validate a stored language value; anything unknown becomes `auto`. */
export function parseLanguageSetting(raw: unknown): LanguageSetting {
  return typeof raw === 'string' && (LANGUAGE_SETTINGS as readonly string[]).includes(raw)
    ? (raw as LanguageSetting)
    : 'auto';
}

/** Primary language subtag, lowercased: `zh-Hans-CN` gives `zh`. */
export function baseLanguage(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

/**
 * Resolve the setting to a locale. `auto` walks the browser languages in order and takes the first
 * whose primary subtag matches a bundled locale (`ro-MD` gives `ro`, `zh-TW` gives `zh-CN`); English
 * is the fallback. `custom` is kept as is; the i18n loader falls back to English when no pack exists.
 */
export function resolveLocale(setting: LanguageSetting, languages: readonly string[] = []): Locale {
  if (setting !== 'auto') return setting;
  for (const tag of languages) {
    const primary = baseLanguage(tag);
    const match = SUPPORTED_LOCALES.find((l) => baseLanguage(l) === primary);
    if (match) return match;
  }
  return 'en';
}

/** BCP 47 tag used for Intl formatting (dates, plural rules). */
export function intlTag(locale: Locale): string {
  switch (locale) {
    case 'ro':
      return 'ro-RO';
    case 'he':
      return 'he-IL';
    case 'zh-CN':
      return 'zh-CN';
    case 'custom':
      return loadCustomLocale()?.meta.tag ?? 'en-US';
    default:
      return 'en-US';
  }
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  if (locale === 'custom') return loadCustomLocale()?.meta.direction ?? 'ltr';
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

/**
 * Language name for prompts, in English. Bundled locales use fixed names; a custom pack is named by
 * its tag through Intl.DisplayNames (so "de" gives "German"), falling back to the pack's own name.
 */
export function languageNameOf(locale: Locale): string {
  if (locale === 'custom') {
    const pack = loadCustomLocale();
    if (!pack) return 'English';
    try {
      const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(pack.meta.tag);
      if (name && name !== pack.meta.tag) return name;
    } catch {
      // Unknown tag: use the pack's own name.
    }
    return pack.meta.name;
  }
  switch (locale) {
    case 'ro':
      return 'Romanian';
    case 'he':
      return 'Hebrew';
    case 'zh-CN':
      return 'Simplified Chinese';
    default:
      return 'English';
  }
}
