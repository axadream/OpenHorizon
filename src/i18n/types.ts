/** Bundled UI languages (each has a dictionary file in this folder). */
export const SUPPORTED_LOCALES = ['en', 'ro', 'he', 'zh-CN'] as const;
export type BundledLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Active UI language. `custom` is a user-imported translation (see customLocale.ts): its name, BCP 47
 * tag and direction come from the imported file. `auto` is only a setting value; it resolves to one of these.
 */
export type Locale = BundledLocale | 'custom';

/** Bundled languages written right to left. (`custom` reads its direction from the imported file.) */
export const RTL_LOCALES: readonly Locale[] = ['he'];

/** CLDR plural categories. English uses one/other; Romanian adds few; Hebrew adds two; Chinese has only other. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** Any plural variant key, e.g. `plural.articles.few`. Variants are optional per locale. */
export type PluralVariantKey = `plural.${string}.${PluralCategory}`;

/**
 * Dictionary shape: every base key of the English source must be present (missing keys fail
 * typechecking); plural variants may be added where a locale needs more CLDR categories.
 */
export type Messages<Base extends Record<string, string>> = {
  readonly [K in Exclude<keyof Base, PluralVariantKey>]: string;
} & {
  readonly [K: PluralVariantKey]: string | undefined;
};

/** Parameter values for `{placeholder}` interpolation. */
export type MessageParams = Record<string, string | number>;
