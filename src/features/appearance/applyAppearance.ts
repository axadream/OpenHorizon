import { deriveAccent } from './accent';
import { THEME_META_COLOR, resolveTheme, type Appearance, type ResolvedTheme, type SystemPreferences } from './appearance';

/** Custom properties written by the accent override. Removing them restores the theme's own accent. */
const ACCENT_PROPERTIES = [
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-active',
  '--color-accent-soft',
  '--color-accent-glow',
  '--color-focus',
  '--color-border-accent',
  '--color-on-accent',
  '--gradient-accent',
] as const;

/**
 * Write the appearance onto <html>: data-theme, data-font, data-layout, the accent overrides and the
 * theme-color meta tag (the browser status bar colour). Returns the resolved theme.
 */
export function applyAppearanceToRoot(
  root: HTMLElement,
  appearance: Appearance,
  system: SystemPreferences,
): ResolvedTheme {
  const resolved = resolveTheme(appearance.theme, system);
  root.dataset.theme = resolved;
  root.dataset.font = appearance.font;
  root.dataset.layout = appearance.layoutMode;

  if (appearance.accent) {
    const p = deriveAccent(appearance.accent);
    const values: Record<(typeof ACCENT_PROPERTIES)[number], string> = {
      '--color-accent': p.accent,
      '--color-accent-hover': p.hover,
      '--color-accent-active': p.active,
      '--color-accent-soft': p.soft,
      '--color-accent-glow': p.glow,
      '--color-focus': p.focus,
      '--color-border-accent': p.border,
      '--color-on-accent': p.on,
      '--gradient-accent': `linear-gradient(180deg, ${p.hover} 0%, ${p.accent} 60%, ${p.active} 100%)`,
    };
    for (const name of ACCENT_PROPERTIES) root.style.setProperty(name, values[name]);
  } else {
    for (const name of ACCENT_PROPERTIES) root.style.removeProperty(name);
  }

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_META_COLOR[resolved]);
  return resolved;
}
