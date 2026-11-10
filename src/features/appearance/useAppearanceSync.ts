import { useEffect } from 'react';
import { setLocale } from '@/i18n/i18n';
import { resolveLocale } from '@/i18n/locale';
import { applyAppearanceToRoot } from './applyAppearance';
import type { SystemPreferences } from './appearance';
import { useAppearanceStore } from './appearanceStore';
import './fonts';

const COLOR_SCHEME_LIGHT = '(prefers-color-scheme: light)';
const MORE_CONTRAST = '(prefers-contrast: more)';

function systemPreferences(): SystemPreferences {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { prefersLight: false, prefersMoreContrast: false };
  }
  return {
    prefersLight: window.matchMedia(COLOR_SCHEME_LIGHT).matches,
    prefersMoreContrast: window.matchMedia(MORE_CONTRAST).matches,
  };
}

/**
 * Apply the stored appearance to the document and keep it applied: on every store change (theme,
 * accent, font, layout, language) and when the OS colour scheme or contrast preference changes.
 * Returns the cleanup function. Page only.
 */
export function startAppearance(): () => void {
  const root = document.documentElement;

  const sync = (): void => {
    const state = useAppearanceStore.getState();
    applyAppearanceToRoot(root, state, systemPreferences());
    void setLocale(resolveLocale(state.language, navigator.languages));
  };

  sync();
  const unsubscribe = useAppearanceStore.subscribe(sync);

  const queries =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? [window.matchMedia(COLOR_SCHEME_LIGHT), window.matchMedia(MORE_CONTRAST)]
      : [];
  for (const query of queries) query.addEventListener('change', sync);

  return () => {
    unsubscribe();
    for (const query of queries) query.removeEventListener('change', sync);
  };
}

/** Mount once in the app shell: keeps <html> and the active locale in step with the appearance settings. */
export function useAppearanceSync(): void {
  useEffect(() => startAppearance(), []);
}
