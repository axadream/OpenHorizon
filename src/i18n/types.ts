/** Supported UI languages. `auto` is only a setting value; it resolves to one of these. */
export const SUPPORTED_LOCALES = ['en', 'ro', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Languages written right to left. */
export const RTL_LOCALES: readonly Locale[] = ['ar'];

/** CLDR plural categories. English uses only one/other; Romanian and Arabic add the rest. */
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
