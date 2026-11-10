import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, normalizeHex, parseAppearance, resolveTheme } from './appearance';

describe('parseAppearance', () => {
  it('returns the defaults for missing or non-object input', () => {
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('oled')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps valid values and lowercases the accent', () => {
    expect(
      parseAppearance({ theme: 'oled', accent: '#ABCDEF', font: 'dyslexic', layoutMode: 'cards', language: 'ro' }),
    ).toEqual({ theme: 'oled', accent: '#abcdef', font: 'dyslexic', layoutMode: 'cards', language: 'ro' });
  });

  it('replaces each malformed field with its default without touching the others', () => {
    expect(
      parseAppearance({ theme: 'neon', accent: 'red', font: 'comic', layoutMode: 'grid', language: 'fr' }),
    ).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: 'sepia', font: 'mono' })).toEqual({
      ...DEFAULT_APPEARANCE,
      theme: 'sepia',
      font: 'mono',
    });
  });
});

describe('normalizeHex', () => {
  it('accepts six digit hex with or without the hash and returns lowercase #rrggbb', () => {
    expect(normalizeHex('#00B4D8')).toBe('#00b4d8');
    expect(normalizeHex('00b4d8')).toBe('#00b4d8');
    expect(normalizeHex('  #FF5C6C ')).toBe('#ff5c6c');
  });

  it('rejects short hex, names and non-strings', () => {
    expect(normalizeHex('#fff')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('#00b4d8ff')).toBeNull();
    expect(normalizeHex(5)).toBeNull();
  });
});

describe('resolveTheme', () => {
  const dark = { prefersLight: false, prefersMoreContrast: false };
  const light = { prefersLight: true, prefersMoreContrast: false };
  const more = { prefersLight: false, prefersMoreContrast: true };

  it('returns explicit themes unchanged', () => {
    expect(resolveTheme('oled', light)).toBe('oled');
    expect(resolveTheme('metallic', more)).toBe('metallic');
  });

  it('follows the colour scheme for system: sepia for light, metallic for dark', () => {
    expect(resolveTheme('system', light)).toBe('sepia');
    expect(resolveTheme('system', dark)).toBe('metallic');
  });

  it('prefers high contrast for system when more contrast is requested', () => {
    expect(resolveTheme('system', more)).toBe('contrast');
    expect(resolveTheme('system', { prefersLight: true, prefersMoreContrast: true })).toBe('contrast');
  });
});
