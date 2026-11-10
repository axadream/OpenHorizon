import { useId } from 'react';
import { BookOpen, LayoutGrid, List, Rows3, Rows4 } from 'lucide-react';
import type { Settings } from '@/db/schema';
import {
  FONTS,
  LAYOUT_MODES,
  THEMES,
  type AppFont,
  type LayoutMode,
  type Theme,
} from '@/features/appearance/appearance';
import { useAppearanceStore } from '@/features/appearance/appearanceStore';
import { useSetting } from '@/features/settings/settings';
import { parseLanguageSetting, LANGUAGE_SETTINGS, type LanguageSetting } from '@/i18n/locale';
import { t, useT } from '@/i18n/i18n';
import { ChoiceGroup, type ChoiceOption } from './ChoiceGroup';
import { AccentPicker, Field } from './AccentPicker';
import { Row, Section, save } from './SettingsParts';

/** A small circle showing the preset's surface and accent. Halves for `system` (metallic | sepia). */
function ThemeSwatch({ preset }: { preset: Theme }) {
  const halves: readonly string[] = preset === 'system' ? ['metallic', 'sepia'] : [preset];
  return (
    <span aria-hidden="true" className="inline-flex size-4 shrink-0 overflow-hidden rounded-full ring-1 ring-border-strong">
      {halves.map((p) => (
        <span key={p} data-theme={p} className="relative block h-full flex-1 bg-bg">
          <span className="absolute inset-0 m-auto size-1.5 rounded-full bg-accent" />
        </span>
      ))}
    </span>
  );
}

function themeLabel(theme: Theme): string {
  switch (theme) {
    case 'metallic':
      return t('settings.themeMetallic');
    case 'oled':
      return t('settings.themeOled');
    case 'sepia':
      return t('settings.themeSepia');
    case 'contrast':
      return t('settings.themeContrast');
    case 'system':
      return t('settings.themeSystem');
  }
}

function themeOptions(): ChoiceOption<Theme>[] {
  return THEMES.map((theme) => ({ value: theme, label: themeLabel(theme), leading: <ThemeSwatch preset={theme} /> }));
}

/** Each label is set in its own font. */
const FONT_FAMILY: Record<AppFont, string> = {
  sans: 'var(--font-sans-base)',
  serif: 'var(--font-reading)',
  mono: 'var(--font-mono)',
  dyslexic: 'var(--font-dyslexic)',
};

function fontLabel(font: AppFont): string {
  switch (font) {
    case 'sans':
      return t('settings.fontSans');
    case 'serif':
      return t('settings.fontSerif');
    case 'mono':
      return t('settings.fontMono');
    case 'dyslexic':
      return t('settings.fontDyslexic');
  }
}

function fontOptions(): ChoiceOption<AppFont>[] {
  return FONTS.map((font) => ({ value: font, label: fontLabel(font), style: { fontFamily: FONT_FAMILY[font] } }));
}

const LAYOUT_ICON: Record<LayoutMode, typeof List> = {
  comfortable: Rows3,
  list: List,
  cards: LayoutGrid,
  reading: BookOpen,
};

function layoutLabel(mode: LayoutMode): string {
  switch (mode) {
    case 'comfortable':
      return t('settings.layoutComfortable');
    case 'list':
      return t('settings.layoutList');
    case 'cards':
      return t('settings.layoutCards');
    case 'reading':
      return t('settings.layoutReading');
  }
}

function layoutOptions(): ChoiceOption<LayoutMode>[] {
  return LAYOUT_MODES.map((mode) => ({ value: mode, label: layoutLabel(mode), icon: LAYOUT_ICON[mode] }));
}

/** Language names are shown in their own language, so a user can find theirs whatever the UI language. */
const LANGUAGE_NAME: Record<Exclude<LanguageSetting, 'auto'>, string> = {
  en: 'English',
  ro: 'Română',
  ar: 'العربية',
};

const DENSITY_ICON: Record<Settings['density'], typeof List> = { comfortable: Rows3, compact: Rows4 };

function densityOptions(): ChoiceOption<Settings['density']>[] {
  return [
    { value: 'comfortable', label: t('settings.densityComfortable'), icon: DENSITY_ICON.comfortable },
    { value: 'compact', label: t('settings.densityCompact'), icon: DENSITY_ICON.compact },
  ];
}

/** Theme, accent, font, layout, density and language. Appearance is stored locally (see appearanceStore); density is a Dexie setting. */
export function AppearanceSettings() {
  useT();
  const density = useSetting('density');
  const theme = useAppearanceStore((s) => s.theme);
  const font = useAppearanceStore((s) => s.font);
  const layoutMode = useAppearanceStore((s) => s.layoutMode);
  const language = useAppearanceStore((s) => s.language);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const setFont = useAppearanceStore((s) => s.setFont);
  const setLayoutMode = useAppearanceStore((s) => s.setLayoutMode);
  const setLanguage = useAppearanceStore((s) => s.setLanguage);
  const languageId = useId();

  return (
    <Section id="appearance" title={t('settings.appearance')}>
      <Field label={t('settings.theme')}>
        <ChoiceGroup label={t('settings.theme')} value={theme} options={themeOptions()} onChange={setTheme} />
      </Field>

      <AccentPicker />

      <Field label={t('settings.layout')}>
        <ChoiceGroup label={t('settings.layout')} value={layoutMode} options={layoutOptions()} onChange={setLayoutMode} />
      </Field>

      <Field label={t('settings.font')}>
        <ChoiceGroup label={t('settings.font')} value={font} options={fontOptions()} onChange={setFont} />
      </Field>

      <Row label={t('settings.density')} hint={t('settings.densityHint')}>
        <ChoiceGroup label={t('settings.density')} value={density} options={densityOptions()} onChange={(v) => save('density', v)} />
      </Row>

      <Row label={<label htmlFor={languageId}>{t('settings.language')}</label>}>
        <select
          id={languageId}
          value={language}
          onChange={(e) => setLanguage(parseLanguageSetting(e.target.value))}
          className="h-[30px] rounded-sm border border-border-strong bg-bg px-2 text-sm text-text shadow-[var(--inner-well)] focus-ring"
        >
          {LANGUAGE_SETTINGS.map((value) => (
            <option key={value} value={value}>
              {value === 'auto' ? t('settings.languageAuto') : LANGUAGE_NAME[value]}
            </option>
          ))}
        </select>
      </Row>
    </Section>
  );
}
