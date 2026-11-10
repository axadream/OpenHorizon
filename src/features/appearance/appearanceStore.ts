import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LanguageSetting } from '@/i18n/locale';
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearance,
  type AppFont,
  type Appearance,
  type LayoutMode,
  type Theme,
} from './appearance';

export interface AppearanceState extends Appearance {
  setTheme(theme: Theme): void;
  /** Lowercase #rrggbb, or null to use the theme's accent. Callers validate with normalizeHex. */
  setAccent(accent: string | null): void;
  setFont(font: AppFont): void;
  setLayoutMode(mode: LayoutMode): void;
  setLanguage(language: LanguageSetting): void;
}

/**
 * Appearance preferences, persisted synchronously under APPEARANCE_STORAGE_KEY so the boot script
 * in index.html can apply them before the first paint. Read with selectors (`useAppearanceStore(s => s.font)`).
 */
export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      ...DEFAULT_APPEARANCE,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setFont: (font) => set({ font }),
      setLayoutMode: (layoutMode) => set({ layoutMode }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: APPEARANCE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Appearance => ({
        theme: s.theme,
        accent: s.accent,
        font: s.font,
        layoutMode: s.layoutMode,
        language: s.language,
      }),
      merge: (persisted, current) => ({ ...current, ...parseAppearance(persisted) }),
    },
  ),
);
