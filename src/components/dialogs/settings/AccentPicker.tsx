import { useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ACCENT_SWATCHES, normalizeHex } from '@/features/appearance/appearance';
import { useAppearanceStore } from '@/features/appearance/appearanceStore';
import { t, useT } from '@/i18n/i18n';

/** Colour shown in the picker while no custom accent is set (the default theme accent). */
const DEFAULT_PICKER_COLOUR = '#00b4d8';

/** Label above a control, not a row. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-silver">{label}</span>
      {children}
    </div>
  );
}

/**
 * Custom accent: colour input, hex field with validation, eight presets and a reset to the theme's
 * own accent. The derived shades and the readable text colour are computed by deriveAccent().
 */
export function AccentPicker() {
  useT();
  const accent = useAppearanceStore((s) => s.accent);
  const setAccent = useAppearanceStore((s) => s.setAccent);
  const [draft, setDraft] = useState(accent ?? '');
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();

  // Follow the store when the accent changes from the picker or a preset.
  useEffect(() => {
    setDraft(accent ?? '');
    setInvalid(false);
  }, [accent]);

  const commit = (raw: string): void => {
    const hex = normalizeHex(raw);
    if (!hex) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setAccent(hex);
  };

  return (
    <Field label={t('settings.accent')}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          aria-label={t('settings.accent')}
          value={accent ?? DEFAULT_PICKER_COLOUR}
          onChange={(e) => setAccent(normalizeHex(e.target.value))}
          className="focus-ring h-8 w-10 cursor-pointer rounded-sm border border-border-strong bg-transparent p-0.5"
        />
        <input
          type="text"
          aria-label={t('settings.accentHex')}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          value={draft}
          placeholder="#00b4d8"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(draft);
            }
          }}
          className="focus-ring h-[30px] w-28 rounded-sm border border-border-strong bg-bg px-2 font-mono text-sm text-text shadow-[var(--inner-well)]"
        />
        <Button variant="ghost" size="sm" disabled={accent === null} onClick={() => setAccent(null)}>
          {t('settings.accentDefault')}
        </Button>
      </div>

      <div role="group" aria-label={t('settings.accentPresets')} className="flex flex-wrap gap-2">
        {ACCENT_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            aria-pressed={accent === hex}
            onClick={() => setAccent(hex)}
            style={{ backgroundColor: hex }}
            className="focus-ring size-7 rounded-full ring-1 ring-border-strong aria-pressed:ring-2 aria-pressed:ring-text"
          />
        ))}
      </div>

      {invalid ? (
        <p id={errorId} className="text-xs text-danger">
          {t('settings.accentInvalid')}
        </p>
      ) : null}
    </Field>
  );
}
