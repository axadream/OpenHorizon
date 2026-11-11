import type { Locale, PluralCategory } from './types';
import { intlTag } from './locale';
import type { MessageParams } from './types';

/** Lookup table of template strings; plural variants are optional entries. */
export type Table = Readonly<Record<string, string | undefined>>;

/* Cached per BCP 47 tag, not per locale id: the `custom` locale's tag changes with every import. */
const pluralRules = new Map<string, Intl.PluralRules>();

/** CLDR plural category for a count in a locale (Intl.PluralRules, cached per language tag). */
export function pluralCategory(locale: Locale, count: number): PluralCategory {
  const tag = intlTag(locale);
  let rules = pluralRules.get(tag);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(tag);
    } catch {
      rules = new Intl.PluralRules('en-US');
    }
    pluralRules.set(tag, rules);
  }
  return rules.select(count) as PluralCategory;
}

/** Replace `{name}` tokens with params. Unknown tokens stay visible so missing params are easy to spot. */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (token, name: string) => {
    const value = params[name];
    return value === undefined ? token : String(value);
  });
}

/**
 * Resolve a key against the active table, then English. Plural keys take the CLDR variant for
 * `count`, falling back to `other`, in the active locale first and in English second.
 */
export function translate(
  active: Table | undefined,
  english: Table,
  locale: Locale,
  key: string,
  params?: MessageParams,
): string {
  const count = params?.count;
  let template: string | undefined;

  if (typeof count === 'number') {
    const variant = `${key}.${pluralCategory(locale, count)}`;
    const other = `${key}.other`;
    template =
      active?.[variant] ??
      active?.[other] ??
      english[variant] ??
      english[other];
  }

  template ??= active?.[key] ?? english[key];
  return interpolate(template ?? key, params);
}
