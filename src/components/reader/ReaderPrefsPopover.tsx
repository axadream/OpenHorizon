import { useId, type KeyboardEvent, type RefObject } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Popover } from '@/components/ui/Popover';
import { Switch } from '@/components/ui/Switch';
import { isWakeLockSupported } from '@/hooks/useWakeLock';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  READER_FONTS,
  type FontSizeStep,
  type LineHeightStep,
  type ReaderFont,
  type ReaderPrefs,
} from '@/features/reader/readerPrefs';
import { t, useT } from '@/i18n/i18n';
import { useReaderPrefs } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { cn } from '@/lib/cn';

export interface ReaderPrefsPopoverProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The "Reading preferences" button; focus returns here on close. */
  triggerRef: RefObject<HTMLElement | null>;
  /** Mirrors `readerPrefs.images` (persisted in the UI store). */
  showImages: boolean;
  onShowImagesChange(show: boolean): void;
}

const SIZE_KEYS = ['prefs.sizeXs', 'prefs.sizeS', 'prefs.sizeM', 'prefs.sizeL', 'prefs.sizeXl'] as const;
const LINE_KEYS = ['prefs.lineCompact', 'prefs.lineNormal', 'prefs.lineRelaxed'] as const;
const FONT_KEYS: Record<ReaderFont, 'prefs.fontSerif' | 'prefs.fontSans' | 'prefs.fontMono' | 'prefs.fontDyslexic'> = {
  serif: 'prefs.fontSerif',
  sans: 'prefs.fontSans',
  mono: 'prefs.fontMono',
  dyslexic: 'prefs.fontDyslexic',
};
const WIDTHS = ['narrow', 'wide'] as const;

const clampSize = (n: number): FontSizeStep => Math.min(FONT_SIZES.length - 1, Math.max(0, n)) as FontSizeStep;
const clampLine = (n: number): LineHeightStep => Math.min(LINE_HEIGHTS.length - 1, Math.max(0, n)) as LineHeightStep;

/** Arrow keys move the selection within a radiogroup (WAI-ARIA radio pattern). */
function radioKeyHandler(count: number, current: number, select: (index: number) => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % count;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + count) % count;
    if (next === null) return;
    e.preventDefault();
    select(next);
    const group = e.currentTarget;
    group.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
}

/** Reading preferences (DESIGN §6.7). Every change applies immediately and persists. */
export function ReaderPrefsPopover({
  open,
  onOpenChange,
  triggerRef,
  showImages,
  onShowImagesChange,
}: ReaderPrefsPopoverProps) {
  useT();
  const prefs = useReaderPrefs();
  const setPrefs = useUiStore((s) => s.setReaderPrefs);
  const resetPrefs = useUiStore((s) => s.resetReaderPrefs);
  const keepAwakeId = useId();
  const wakeLockSupported = isWakeLockSupported();

  const setSize = (n: number) => setPrefs({ fontSize: clampSize(n) });
  const onSliderKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // The slider reads left to right in LTR and right to left in RTL: ArrowLeft/Right follow the direction.
    const rtl = document.documentElement.dir === 'rtl';
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault();
        setSize(prefs.fontSize + (e.key === 'ArrowLeft' && rtl ? 1 : -1));
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        setSize(prefs.fontSize + (e.key === 'ArrowRight' && rtl ? -1 : 1));
        break;
      case 'Home':
        e.preventDefault();
        setSize(0);
        break;
      case 'End':
        e.preventDefault();
        setSize(FONT_SIZES.length - 1);
        break;
    }
  };

  const lineIndex = prefs.lineHeight;
  const fontIndex = READER_FONTS.indexOf(prefs.font);
  const widthIndex = WIDTHS.indexOf(prefs.width);

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      label={t('reader.prefs')}
      className="flex w-[280px] flex-col gap-3 p-3"
    >
      <div className="flex flex-col gap-1.5">
        <span id="prefs-size-label" className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          {t('prefs.textSize')}
        </span>
        <div className="flex items-center gap-2">
          <IconButton
            label={t('prefs.smaller')}
            icon={Minus}
            size="sm"
            disabled={prefs.fontSize === 0}
            onClick={() => setSize(prefs.fontSize - 1)}
          />
          <div
            role="slider"
            tabIndex={0}
            aria-labelledby="prefs-size-label"
            aria-valuemin={0}
            aria-valuemax={FONT_SIZES.length - 1}
            aria-valuenow={prefs.fontSize}
            aria-valuetext={t(SIZE_KEYS[prefs.fontSize])}
            onKeyDown={onSliderKey}
            className="focus-ring flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1"
          >
            {FONT_SIZES.map((_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={cn('h-1.5 flex-1 rounded-full', i <= prefs.fontSize ? 'bg-accent' : 'bg-card')}
              />
            ))}
          </div>
          <IconButton
            label={t('prefs.larger')}
            icon={Plus}
            size="sm"
            disabled={prefs.fontSize === FONT_SIZES.length - 1}
            onClick={() => setSize(prefs.fontSize + 1)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">{t('prefs.lineSpacing')}</span>
        <div
          role="radiogroup"
          aria-label={t('prefs.lineSpacing')}
          className="flex gap-1.5"
          onKeyDown={radioKeyHandler(LINE_KEYS.length, lineIndex, (i) => setPrefs({ lineHeight: clampLine(i) }))}
        >
          {LINE_KEYS.map((key, i) => (
            <Chip
              key={key}
              role="radio"
              selected={lineIndex === i}
              className="flex-1 justify-center px-2"
              onClick={() => setPrefs({ lineHeight: clampLine(i) })}
            >
              {t(key)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">{t('prefs.font')}</span>
        <div
          role="radiogroup"
          aria-label={t('prefs.font')}
          className="grid grid-cols-2 gap-1.5"
          onKeyDown={radioKeyHandler(READER_FONTS.length, fontIndex, (i) => setPrefs({ font: READER_FONTS[i] }))}
        >
          {READER_FONTS.map((f) => (
            <Chip
              key={f}
              role="radio"
              selected={prefs.font === f}
              className="justify-center px-2 text-sm"
              style={{ fontFamily: FONT_FAMILIES[f] }}
              onClick={() => setPrefs({ font: f })}
            >
              {t(FONT_KEYS[f])}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex max-md:hidden flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">{t('prefs.width')}</span>
        <div
          role="radiogroup"
          aria-label={t('prefs.width')}
          className="flex gap-1.5"
          onKeyDown={radioKeyHandler(WIDTHS.length, widthIndex, (i) => setPrefs({ width: WIDTHS[i] as ReaderPrefs['width'] }))}
        >
          {WIDTHS.map((w) => (
            <Chip
              key={w}
              role="radio"
              selected={prefs.width === w}
              className="flex-1 justify-center px-2"
              onClick={() => setPrefs({ width: w })}
            >
              {w === 'narrow' ? t('prefs.narrow') : t('prefs.wide')}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">{t('prefs.images')}</span>
        <div
          role="radiogroup"
          aria-label={t('prefs.images')}
          className="flex gap-1.5"
          onKeyDown={radioKeyHandler(2, showImages ? 0 : 1, (i) => onShowImagesChange(i === 0))}
        >
          {(['prefs.show', 'prefs.hide'] as const).map((key, i) => (
            <Chip
              key={key}
              role="radio"
              selected={showImages === (i === 0)}
              className="flex-1 justify-center px-2"
              onClick={() => onShowImagesChange(i === 0)}
            >
              {t(key)}
            </Chip>
          ))}
        </div>
      </div>

      {wakeLockSupported ? (
        <div className="flex items-center justify-between gap-3">
          <span id={keepAwakeId} className="text-sm text-silver">
            {t('prefs.keepAwake')}
          </span>
          <Switch
            checked={prefs.keepScreenOn}
            onCheckedChange={(on) => setPrefs({ keepScreenOn: on })}
            aria-labelledby={keepAwakeId}
          />
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" leadingIcon={RotateCcw} onClick={() => resetPrefs()}>
          {t('prefs.reset')}
        </Button>
      </div>
    </Popover>
  );
}
