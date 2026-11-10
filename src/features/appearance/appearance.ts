import { parseLanguageSetting, type LanguageSetting } from '@/i18n/locale';

/*
 * Appearance preferences: the shape, its storage key and the pure parse/validate and theme
 * resolution. The synchronous boot script in index.html reads the same key and shape before React
 * mounts (see index.html and bootScript.test.ts); keep the two in step.
 */

/** localStorage key (zustand persist name). Shared with the inline boot script. */
export const APPEARANCE_STORAGE_KEY = 'oh-appearance';

export const THEMES = ['metallic', 'oled', 'sepia', 'contrast', 'system'] as const;
export type Theme = (typeof THEMES)[number];

/** Theme after `system` is resolved; these values name the data-theme attribute. */
export const RESOLVED_THEMES = ['metallic', 'oled', 'sepia', 'contrast'] as const;
export type ResolvedTheme = (typeof RESOLVED_THEMES)[number];

export const FONTS = ['sans', 'serif', 'mono', 'dyslexic'] as const;
export type AppFont = (typeof FONTS)[number];

/** `comfortable` is the layout the app shipped with (2-line summary, 72 px thumbnail). */
export const LAYOUT_MODES = ['comfortable', 'list', 'cards', 'reading'] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

/** Eight swatches offered next to the colour input. */
export const ACCENT_SWATCHES = [
  '#00b4d8',
  '#3ddc97',
  '#f5b84b',
  '#ff5c6c',
  '#a78bfa',
  '#f472b6',
  '#60a5fa',
  '#e5e7eb',
] as const;

export interface Appearance {
  theme: Theme;
  /** Custom accent as lowercase #rrggbb, or null for the theme's own accent. */
  accent: string | null;
  font: AppFont;
  layoutMode: LayoutMode;
  language: LanguageSetting;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'metallic',
  accent: null,
  font: 'sans',
  layoutMode: 'comfortable',
  language: 'auto',
};

/** Status bar / theme-color per resolved theme. Mirrors the surface colour of each preset in theme.css. */
export const THEME_META_COLOR: Record<ResolvedTheme, string> = {
  metallic: '#0f1115',
  oled: '#000000',
  sepia: '#f4ecd8',
  contrast: '#000000',
};

/** Accept `#rrggbb` (the leading # is optional, case is ignored). Returns lowercase #rrggbb or null. */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  return match ? `#${match[1]!.toLowerCase()}` : null;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Validate a persisted appearance object. Anything malformed falls back to the default for that
 * field, so a hand-edited or old value can never break the UI.
 */
export function parseAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Appearance, unknown>>;
  return {
    theme: oneOf(r.theme, THEMES, DEFAULT_APPEARANCE.theme),
    accent: normalizeHex(r.accent),
    font: oneOf(r.font, FONTS, DEFAULT_APPEARANCE.font),
    layoutMode: oneOf(r.layoutMode, LAYOUT_MODES, DEFAULT_APPEARANCE.layoutMode),
    language: parseLanguageSetting(r.language),
  };
}

export interface SystemPreferences {
  /** prefers-color-scheme: light */
  prefersLight: boolean;
  /** prefers-contrast: more */
  prefersMoreContrast: boolean;
}

/**
 * Resolve the chosen theme. `system` follows the OS: high contrast when more contrast is requested,
 * otherwise sepia for a light scheme and metallic for a dark one.
 */
export function resolveTheme(theme: Theme, system: SystemPreferences): ResolvedTheme {
  if (theme !== 'system') return theme;
  if (system.prefersMoreContrast) return 'contrast';
  return system.prefersLight ? 'sepia' : 'metallic';
}
