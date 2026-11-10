/*
 * Custom accent derivation. Pure functions (no DOM), unit-tested in accent.test.ts.
 *
 * The accent is kept inside a luminance band so it stays visible on the dark surfaces (too dark is
 * lifted towards white) and on the light sepia paper (too light is pulled towards black). The text
 * placed on top of the accent is whichever of black or white has the higher WCAG contrast.
 */

export interface AccentPalette {
  /** The accent after band clamping, #rrggbb. */
  accent: string;
  /** Hover: lighter. */
  hover: string;
  /** Pressed: darker. */
  active: string;
  /** Soft background behind selected items (rgba). */
  soft: string;
  /** Glow used by the pulse animation (rgba). */
  glow: string;
  /** Focus ring colour (rgba). */
  focus: string;
  /** Accent border (rgba). */
  border: string;
  /** Readable foreground for text and icons on the accent, #000000 or #ffffff. */
  on: string;
}

export const ACCENT_MIN_LUMINANCE = 0.12;
export const ACCENT_MAX_LUMINANCE = 0.7;

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG 2.x relative luminance of a #rrggbb colour (0 for black, 1 for white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

/** Mix towards `target` by the smallest amount that reaches `predicate` (binary search, luminance is monotonic). */
function mixUntil(hex: string, target: Rgb, predicate: (hex: string) => boolean): string {
  const from = hexToRgb(hex);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (predicate(rgbToHex(mix(from, target, mid)))) hi = mid;
    else lo = mid;
  }
  return rgbToHex(mix(from, target, hi));
}

/** Clamp an accent into the luminance band, lifting too-dark colours and pulling too-light ones down. */
export function clampAccent(hex: string): string {
  const lum = relativeLuminance(hex);
  if (lum < ACCENT_MIN_LUMINANCE) return mixUntil(hex, [255, 255, 255], (c) => relativeLuminance(c) >= ACCENT_MIN_LUMINANCE);
  if (lum > ACCENT_MAX_LUMINANCE) return mixUntil(hex, [0, 0, 0], (c) => relativeLuminance(c) <= ACCENT_MAX_LUMINANCE);
  return hex;
}

/** Black or white, whichever reads better on the accent. Both candidates are pure colours. */
export function readableOn(accent: string): '#000000' | '#ffffff' {
  return contrastRatio(accent, '#000000') >= contrastRatio(accent, '#ffffff') ? '#000000' : '#ffffff';
}

/**
 * Derive the full accent palette from a #rrggbb input. Throws on invalid input; callers validate
 * with normalizeHex first.
 */
export function deriveAccent(input: string): AccentPalette {
  if (!/^#[0-9a-f]{6}$/i.test(input)) throw new RangeError(`Not a #rrggbb colour: ${input}`);
  const accent = clampAccent(input.toLowerCase());
  const [r, g, b] = hexToRgb(accent);
  return {
    accent,
    hover: rgbToHex(mix([r, g, b], [255, 255, 255], 0.12)),
    active: rgbToHex(mix([r, g, b], [0, 0, 0], 0.18)),
    soft: `rgba(${r}, ${g}, ${b}, 0.12)`,
    glow: `rgba(${r}, ${g}, ${b}, 0.35)`,
    focus: `rgba(${r}, ${g}, ${b}, 0.7)`,
    border: `rgba(${r}, ${g}, ${b}, 0.45)`,
    on: readableOn(accent),
  };
}
