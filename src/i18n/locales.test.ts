import { describe, expect, it } from 'vitest';
import { en } from './en';
import { he } from './he';
import { ro } from './ro';
import { zhCN } from './zh-CN';

/*
 * Every locale must define exactly the English base keys with the same {placeholders}.
 * Plural variants (plural.<group>.<category>) may differ per locale, but each group needs an
 * `other` form and each variant must keep the placeholders of the English `other` form.
 * Romanian uses one / few / other, Hebrew uses one / two / other, Chinese uses other only.
 */

const PLURAL = /^plural\.[^.]+\.(zero|one|two|few|many|other)$/;
const CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

function placeholders(text: string): string {
  return [...text.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1] ?? '')
    .sort()
    .join(',');
}

function baseKeys(dict: Record<string, string | undefined>): string[] {
  return Object.keys(dict)
    .filter((k) => !PLURAL.test(k))
    .sort();
}

const locales = { ro, he, 'zh-CN': zhCN } as const;

describe('locale dictionaries', () => {
  for (const [name, dict] of Object.entries(locales)) {
    it(`${name} has exactly the English base keys`, () => {
      expect(baseKeys(dict)).toEqual(baseKeys(en));
    });

    it(`${name} keeps the English placeholders for every string`, () => {
      for (const key of baseKeys(en)) {
        const source = en[key as keyof typeof en];
        const value = dict[key as keyof typeof dict];
        expect(value, key).toBeTypeOf('string');
        expect(placeholders(value as string), key).toBe(placeholders(source));
      }
    });

    it(`${name} plural groups have an other form with the English placeholders`, () => {
      const groups = new Set(Object.keys(en).filter((k) => PLURAL.test(k)).map((k) => k.replace(/\.[^.]+$/, '')));
      for (const group of groups) {
        const other = dict[`${group}.other` as keyof typeof dict];
        expect(other, group).toBeTypeOf('string');
        expect(placeholders(other as string), group).toBe(placeholders(en[`${group}.other` as keyof typeof en]));
      }
    });

    it(`${name} plural variants are valid CLDR categories and keep placeholders`, () => {
      for (const key of Object.keys(dict)) {
        const match = PLURAL.exec(key);
        if (!match) continue;
        expect(CATEGORIES).toContain(match[1]);
        const group = key.replace(/\.[^.]+$/, '');
        const variant = dict[key as keyof typeof dict] as string | undefined;
        if (variant === undefined) continue;
        expect(placeholders(variant), key).toBe(placeholders(en[`${group}.other` as keyof typeof en]));
      }
    });
  }
});
