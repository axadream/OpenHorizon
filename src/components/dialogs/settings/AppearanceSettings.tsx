import { useId, useRef, useState, type ChangeEvent } from 'react';
import { BookOpen, Download, LayoutGrid, List, Rows3, Rows4, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
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
import {
  buildExportFile,
  clearCustomLocale,
  InvalidTranslationError,
  loadCustomLocale,
  parseTranslationFile,
  saveCustomLocale,
  type CustomLocalePack,
} from '@/i18n/customLocale';
import { parseLanguageSetting, type LanguageSetting } from '@/i18n/locale';
import { setLocale, t, useT } from '@/i18n/i18n';
import { SUPPORTED_LOCALES } from '@/i18n/types';
import { toast } from '@/lib/toast';
import { ChoiceGroup, type ChoiceOption } from './ChoiceGroup';
import { AccentPicker, Field } from './AccentPicker';
import { Row, Section, errorText, save } from './SettingsParts';

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
const LANGUAGE_NAME: Record<Exclude<LanguageSetting, 'auto' | 'custom'>, string> = {
  en: 'English',
  ro: 'Română',
  he: 'עברית',
  'zh-CN': '简体中文',
};

const DENSITY_ICON: Record<Settings['density'], typeof List> = { comfortable: Rows3, compact: Rows4 };

function densityOptions(): ChoiceOption<Settings['density']>[] {
  return [
    { value: 'comfortable', label: t('settings.densityComfortable'), icon: DENSITY_ICON.comfortable },
    { value: 'compact', label: t('settings.densityCompact'), icon: DENSITY_ICON.compact },
  ];
}

function feedLanguageOptions(): ChoiceOption<'all' | 'match'>[] {
  return [
    { value: 'all', label: t('settings.feedLangAll') },
    { value: 'match', label: t('settings.feedLangMatch') },
  ];
}

/** Export the English strings, import a translation file, or remove the imported one. */
function TranslationTools({ pack, onPackChange }: { pack: CustomLocalePack | null; onPackChange(pack: CustomLocalePack | null): void }) {
  const language = useAppearanceStore((s) => s.language);
  const setLanguage = useAppearanceStore((s) => s.setLanguage);
  const fileInput = useRef<HTMLInputElement>(null);

  function exportStrings(): void {
    const url = URL.createObjectURL(new Blob([buildExportFile()], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openhorizon-en.json';
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onFileChosen(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = e.currentTarget;
    try {
      const file = input.files?.[0];
      if (!file) return;
      const raw: unknown = JSON.parse(await file.text());
      const result = parseTranslationFile(raw);
      saveCustomLocale(result.pack);
      setLanguage('custom');
      await setLocale('custom');
      onPackChange(result.pack);
      toast.success(t('settings.translationImported', { name: result.pack.meta.name }));
      if (result.missing.length > 0) toast.info(t('plural.missingKeys', { count: result.missing.length }));
    } catch (err) {
      if (err instanceof InvalidTranslationError) toast.error(t('settings.translationInvalid'));
      else toast.error(t('settings.translationFailed'), { description: errorText(err) });
    } finally {
      input.value = '';
    }
  }

  function removeTranslation(): void {
    clearCustomLocale();
    if (language === 'custom') setLanguage('auto');
    onPackChange(null);
    toast.success(t('settings.translationRemoved'));
  }

  return (
    <Row label={t('settings.translationTools')} hint={t('settings.translationHint')}>
      <Button variant="steel" size="sm" leadingIcon={Download} onClick={exportStrings}>
        {t('settings.exportStrings')}
      </Button>
      <Button variant="steel" size="sm" leadingIcon={Upload} onClick={() => fileInput.current?.click()}>
        {t('settings.importTranslation')}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onFileChosen(e)}
      />
      {pack ? (
        <Button variant="ghost" size="sm" leadingIcon={Trash2} onClick={removeTranslation}>
          {t('settings.removeTranslation')}
        </Button>
      ) : null}
    </Row>
  );
}

/** Theme, accent, font, layout, density and language. Appearance is stored locally (see appearanceStore); density and feed language filter are Dexie settings. */
export function AppearanceSettings() {
  useT();
  const density = useSetting('density');
  const feedLanguageFilter = useSetting('feedLanguageFilter');
  const theme = useAppearanceStore((s) => s.theme);
  const font = useAppearanceStore((s) => s.font);
  const layoutMode = useAppearanceStore((s) => s.layoutMode);
  const language = useAppearanceStore((s) => s.language);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const setFont = useAppearanceStore((s) => s.setFont);
  const setLayoutMode = useAppearanceStore((s) => s.setLayoutMode);
  const setLanguage = useAppearanceStore((s) => s.setLanguage);
  const [pack, setPack] = useState<CustomLocalePack | null>(loadCustomLocale);
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
          <option value="auto">{t('settings.languageAuto')}</option>
          {SUPPORTED_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {LANGUAGE_NAME[locale]}
            </option>
          ))}
          {pack ? <option value="custom">{t('settings.languageCustom', { name: pack.meta.name })}</option> : null}
        </select>
      </Row>

      <TranslationTools pack={pack} onPackChange={setPack} />

      <Row label={t('settings.feedLanguages')} hint={t('settings.feedLangHint')}>
        <ChoiceGroup
          label={t('settings.feedLanguages')}
          value={feedLanguageFilter ? 'match' : 'all'}
          options={feedLanguageOptions()}
          onChange={(v) => save('feedLanguageFilter', v === 'match')}
        />
      </Row>
    </Section>
  );
}
