import html from '../../../index.html?raw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE, parseAppearance, resolveTheme, type Appearance } from './appearance';
import { deriveAccent } from './accent';

/*
 * The inline boot script in index.html runs before React and cannot import modules. This test runs
 * that exact script against localStorage and checks it agrees with parseAppearance / resolveTheme,
 * so the two copies cannot drift apart silently.
 */

const bootSource = /<script id="oh-boot">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

function setSystem(prefs: { light?: boolean; moreContrast?: boolean }): void {
  window.matchMedia = ((query: string) => ({
    matches:
      (query.includes('prefers-color-scheme: light') && !!prefs.light) ||
      (query.includes('prefers-contrast: more') && !!prefs.moreContrast),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

function store(state: Partial<Appearance> | null): void {
  if (state === null) localStorage.removeItem(APPEARANCE_STORAGE_KEY);
  else localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ state, version: 0 }));
}

function runBoot(): HTMLElement {
  document.documentElement.removeAttribute('style');
  new Function(bootSource)();
  return document.documentElement;
}

describe('index.html boot script', () => {
  beforeEach(() => {
    localStorage.clear();
    setSystem({});
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  it('is present under the shared storage key', () => {
    expect(bootSource.length).toBeGreaterThan(0);
    expect(bootSource).toContain(`'${APPEARANCE_STORAGE_KEY}'`);
  });

  it('applies the defaults when nothing is stored', () => {
    const root = runBoot();
    expect(root.dataset.theme).toBe('metallic');
    expect(root.dataset.font).toBe('sans');
    expect(root.dataset.layout).toBe('comfortable');
    expect(root.lang).toBe('en');
    expect(root.dir).toBe('ltr');
  });

  it('applies a valid stored appearance, including accent and Hebrew direction', () => {
    store({ theme: 'sepia', accent: '#FF5C6C', font: 'mono', layoutMode: 'list', language: 'he' });
    const root = runBoot();
    expect(root.dataset.theme).toBe('sepia');
    expect(root.dataset.font).toBe('mono');
    expect(root.dataset.layout).toBe('list');
    expect(root.lang).toBe('he');
    expect(root.dir).toBe('rtl');
    expect(root.style.getPropertyValue('--color-accent')).toBe('#ff5c6c');
    expect(root.style.getPropertyValue('--color-on-accent')).toBe(deriveAccent('#ff5c6c').on);
  });

  it('ignores malformed stored values, matching parseAppearance', () => {
    store({ theme: 'neon', accent: 'red', font: 'comic', layoutMode: 'grid', language: 'fr' } as unknown as Partial<Appearance>);
    const root = runBoot();
    const parsed = parseAppearance({ theme: 'neon', accent: 'red', font: 'comic', layoutMode: 'grid', language: 'fr' });
    expect(parsed).toEqual(DEFAULT_APPEARANCE);
    expect(root.dataset.theme).toBe(parsed.theme);
    expect(root.dataset.font).toBe(parsed.font);
    expect(root.dataset.layout).toBe(parsed.layoutMode);
    expect(root.style.getPropertyValue('--color-accent')).toBe('');
  });

  it('survives unparseable storage and falls back to the defaults', () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, '{not json');
    const root = runBoot();
    expect(root.dataset.theme).toBe('metallic');
  });

  it('resolves system like resolveTheme does, for each OS preference', () => {
    const cases: { light: boolean; moreContrast: boolean }[] = [
      { light: false, moreContrast: false },
      { light: true, moreContrast: false },
      { light: false, moreContrast: true },
      { light: true, moreContrast: true },
    ];
    for (const c of cases) {
      setSystem({ light: c.light, moreContrast: c.moreContrast });
      store({ theme: 'system' });
      const root = runBoot();
      expect(root.dataset.theme).toBe(resolveTheme('system', { prefersLight: c.light, prefersMoreContrast: c.moreContrast }));
    }
  });

  it('takes the first supported browser language for auto', () => {
    Object.defineProperty(navigator, 'languages', { value: ['fr-FR', 'ro-RO', 'en'], configurable: true });
    store({ language: 'auto' });
    expect(runBoot().lang).toBe('ro');
    Object.defineProperty(navigator, 'languages', { value: ['zh-TW'], configurable: true });
    expect(runBoot().lang).toBe('zh-CN');
    Object.defineProperty(navigator, 'languages', { value: ['de-DE'], configurable: true });
    expect(runBoot().lang).toBe('en');
  });

  it('applies the stored custom translation metadata for the custom language', () => {
    localStorage.setItem(
      'oh-custom-locale',
      JSON.stringify({ meta: { name: 'Deutsch', tag: 'de', direction: 'ltr' }, messages: {} }),
    );
    store({ language: 'custom' });
    const root = runBoot();
    expect(root.lang).toBe('de');
    expect(root.dir).toBe('ltr');
  });

  it('uses rtl for a custom translation that declares it', () => {
    localStorage.setItem(
      'oh-custom-locale',
      JSON.stringify({ meta: { name: 'Farsi', tag: 'fa', direction: 'rtl' }, messages: {} }),
    );
    store({ language: 'custom' });
    const root = runBoot();
    expect(root.lang).toBe('fa');
    expect(root.dir).toBe('rtl');
  });
});
