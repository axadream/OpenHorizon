/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './accent';
import { THEME_META_COLOR, type ResolvedTheme } from './appearance';

/*
 * Reads the preset tokens straight from theme.css and checks the WCAG contrast the presets promise.
 * The base (metallic) values come from the @theme block; the other presets from their own blocks.
 * (Read with fs: vitest blanks *.css imports, even with ?raw.)
 */

// Vitest runs from the repository root.
const css = readFileSync(resolve(process.cwd(), 'src/app/theme.css'), 'utf8');

function baseValue(name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m?.[1]) throw new Error(`missing ${name} in the base layer`);
  return m[1];
}

function presetBlock(theme: Exclude<ResolvedTheme, 'metallic'>): string {
  const m = new RegExp(`:root\\[data-theme='${theme}'\\][^{]*\\{([^}]*)\\}`).exec(css);
  if (!m?.[1]) throw new Error(`no block for ${theme}`);
  return m[1];
}

function tokens(theme: ResolvedTheme): Record<string, string> {
  const names = ['--color-bg', '--color-panel', '--color-text', '--color-silver', '--color-text-muted', '--color-text-faint', '--color-accent'];
  const block = theme === 'metallic' ? '' : presetBlock(theme);
  const out: Record<string, string> = {};
  for (const name of names) {
    const local = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block);
    out[name] = local?.[1] ?? baseValue(name);
  }
  return out;
}

describe('theme presets', () => {
  it('meets the body text contrast target on each surface', () => {
    const contrast = tokens('contrast');
    for (const fg of ['--color-text', '--color-silver', '--color-text-muted', '--color-text-faint']) {
      expect(contrastRatio(contrast[fg]!, contrast['--color-bg']!), `contrast ${fg} on bg`).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(contrast[fg]!, contrast['--color-panel']!), `contrast ${fg} on panel`).toBeGreaterThanOrEqual(7);
    }

    for (const theme of ['oled', 'sepia'] as const) {
      const t = tokens(theme);
      for (const fg of ['--color-text', '--color-silver']) {
        expect(contrastRatio(t[fg]!, t['--color-bg']!), `${theme} ${fg} on bg`).toBeGreaterThanOrEqual(7);
      }
      for (const fg of ['--color-text-muted', '--color-text-faint']) {
        expect(contrastRatio(t[fg]!, t['--color-panel']!), `${theme} ${fg} on panel`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the accent readable against each surface', () => {
    for (const theme of ['metallic', 'oled', 'sepia', 'contrast'] as const) {
      const t = tokens(theme);
      expect(contrastRatio(t['--color-accent']!, t['--color-bg']!), theme).toBeGreaterThanOrEqual(3);
    }
  });

  it('has a theme-color for every resolved theme', () => {
    expect(Object.keys(THEME_META_COLOR).sort()).toEqual(['contrast', 'metallic', 'oled', 'sepia']);
  });

  it('keeps the OLED background pure black', () => {
    expect(tokens('oled')['--color-bg']).toBe('#000000');
    expect(THEME_META_COLOR.oled).toBe('#000000');
  });
});
