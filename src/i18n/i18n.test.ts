import { describe, expect, it } from 'vitest';
import { en } from './en';
import { translate } from './format';
import { getLocale, setLocale, t } from './i18n';
import { directionOf, parseLanguageSetting, resolveLocale } from './locale';

describe('t()', () => {
  it('interpolates named placeholders and keeps unknown tokens visible', async () => {
    await setLocale('en');
    expect(t('settings.lastSync', { time: '5m' })).toBe('Last sync: 5m');
    expect(t('nav.noMatch', { query: 'rust' })).toBe('No feeds match “rust”.');
    expect(t('nav.noMatch')).toBe('No feeds match “{query}”.');
  });

  it('uses English plural variants by count', async () => {
    await setLocale('en');
    expect(t('plural.articles', { count: 1 })).toBe('1 article');
    expect(t('plural.articles', { count: 0 })).toBe('0 articles');
    expect(t('plural.articles', { count: 5 })).toBe('5 articles');
  });

  it('applies Romanian one / few / other rules after loading ro', async () => {
    await setLocale('ro');
    expect(getLocale()).toBe('ro');
    expect(t('plural.articles', { count: 1 })).toBe('1 articol');
    expect(t('plural.articles', { count: 3 })).toBe('3 articole');
    expect(t('plural.articles', { count: 19 })).toBe('19 articole');
    expect(t('plural.articles', { count: 20 })).toBe('20 de articole');
    expect(t('plural.articles', { count: 0 })).toBe('0 articole');
    await setLocale('en');
  });

  it('applies Arabic zero / one / two / few / many / other rules after loading ar', async () => {
    await setLocale('ar');
    expect(t('plural.articles', { count: 1 })).toBe('1 مقال');
    expect(t('plural.articles', { count: 2 })).toBe('2 مقالان');
    expect(t('plural.articles', { count: 4 })).toBe('4 مقالات');
    expect(t('plural.articles', { count: 11 })).toBe('11 مقالة');
    expect(t('plural.articles', { count: 100 })).toBe('100 مقال');
    await setLocale('en');
  });

  it('returns the key itself for an unknown key', () => {
    expect(t('does.not.exist' as never)).toBe('does.not.exist');
  });

  it('falls back to English for a key a locale does not define', () => {
    const sparse = { 'settings.title': 'Setări' } as Record<string, string>;
    expect(translate(sparse, en, 'ro', 'settings.title')).toBe('Setări');
    expect(translate(sparse, en, 'ro', 'settings.sync')).toBe('Sync');
    expect(translate(sparse, en, 'ro', 'plural.feeds', { count: 4 })).toBe('4 feeds');
  });

  it('sets document lang and dir when the locale changes', async () => {
    await setLocale('ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    await setLocale('ro');
    expect(document.documentElement.dir).toBe('ltr');
    await setLocale('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('locale resolution', () => {
  it('uses an explicit setting as is', () => {
    expect(resolveLocale('ro', ['ar'])).toBe('ro');
  });

  it('maps auto to the first supported browser language by primary subtag', () => {
    expect(resolveLocale('auto', ['ro-MD', 'en'])).toBe('ro');
    expect(resolveLocale('auto', ['fr-FR', 'ar-EG'])).toBe('ar');
    expect(resolveLocale('auto', ['de'])).toBe('en');
    expect(resolveLocale('auto', [])).toBe('en');
  });

  it('validates the stored language setting', () => {
    expect(parseLanguageSetting('ro')).toBe('ro');
    expect(parseLanguageSetting('fr')).toBe('auto');
    expect(parseLanguageSetting(42)).toBe('auto');
  });

  it('reports the text direction of each locale', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });
});
