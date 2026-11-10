import { describe, expect, it } from 'vitest';
import { ACCENT_MAX_LUMINANCE, ACCENT_MIN_LUMINANCE, contrastRatio, deriveAccent, relativeLuminance } from './accent';

const DARK_SURFACE = '#0f1115';
const LIGHT_SURFACE = '#f4ecd8';

describe('deriveAccent', () => {
  it('keeps an in-band accent and derives lighter hover and darker active shades', () => {
    const p = deriveAccent('#00b4d8');
    expect(p.accent).toBe('#00b4d8');
    expect(relativeLuminance(p.hover)).toBeGreaterThan(relativeLuminance(p.accent));
    expect(relativeLuminance(p.active)).toBeLessThan(relativeLuminance(p.accent));
    expect(p.soft).toBe('rgba(0, 180, 216, 0.12)');
    expect(p.glow).toBe('rgba(0, 180, 216, 0.35)');
    expect(p.focus).toBe('rgba(0, 180, 216, 0.7)');
    expect(p.border).toBe('rgba(0, 180, 216, 0.45)');
  });

  it('keeps the default cyan readable with dark text on it', () => {
    expect(deriveAccent('#00b4d8').on).toBe('#000000');
  });

  it('lifts a too-dark accent into the visible band and puts white text on it', () => {
    const p = deriveAccent('#001020');
    const lum = relativeLuminance(p.accent);
    expect(lum).toBeGreaterThanOrEqual(ACCENT_MIN_LUMINANCE - 0.001);
    expect(p.on).toBe('#ffffff');
    expect(contrastRatio(p.on, p.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.accent, DARK_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it('pulls a too-light accent down into the band and puts black text on it', () => {
    const p = deriveAccent('#f5f5f0');
    expect(relativeLuminance(p.accent)).toBeLessThanOrEqual(ACCENT_MAX_LUMINANCE + 0.001);
    expect(p.on).toBe('#000000');
    expect(contrastRatio(p.on, p.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps text on the accent at 4.5:1 or better across a colour grid', () => {
    const steps = [0, 51, 102, 153, 204, 255];
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
          const p = deriveAccent(hex);
          expect(contrastRatio(p.on, p.accent), hex).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(p.accent, DARK_SURFACE), hex).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('keeps a dark brown accent visible on the light sepia paper', () => {
    expect(contrastRatio(deriveAccent('#8a4b12').accent, LIGHT_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it('rejects anything that is not #rrggbb', () => {
    expect(() => deriveAccent('red')).toThrow(RangeError);
    expect(() => deriveAccent('#fff')).toThrow(RangeError);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });
});
