import type { KeyboardEvent, RefObject } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Popover } from '@/components/ui/Popover';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  type FontSizeStep,
  type LineHeightStep,
  type ReaderPrefs,
} from '@/features/reader/readerPrefs';
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

const SIZE_LABELS = ['XS', 'S', 'M', 'L', 'XL'] as const;
const LINE_LABELS = ['Compact', 'Normal', 'Relaxed'] as const;
const FONT_LABELS = { serif: 'Aa Serif', sans: 'Aa Sans' } as const;
const WIDTH_LABELS = { narrow: 'Narrow', wide: 'Wide' } as const;

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
  const prefs = useReaderPrefs();
  const setPrefs = useUiStore((s) => s.setReaderPrefs);
  const resetPrefs = useUiStore((s) => s.resetReaderPrefs);

  const setSize = (n: number) => setPrefs({ fontSize: clampSize(n) });
  const onSliderKey = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault();
        setSize(prefs.fontSize - 1);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        setSize(prefs.fontSize + 1);
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
  const fonts = ['serif', 'sans'] as const;
  const widths = ['narrow', 'wide'] as const;
  const fontIndex = fonts.indexOf(prefs.font);
  const widthIndex = widths.indexOf(prefs.width);

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      label="Reading preferences"
      className="flex w-[280px] flex-col gap-3 p-3"
    >
      <div className="flex flex-col gap-1.5">
        <span id="prefs-size-label" className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          Text size
        </span>
        <div className="flex items-center gap-2">
          <IconButton
            label="Smaller text"
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
            aria-valuetext={SIZE_LABELS[prefs.fontSize]}
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
            label="Larger text"
            icon={Plus}
            size="sm"
            disabled={prefs.fontSize === FONT_SIZES.length - 1}
            onClick={() => setSize(prefs.fontSize + 1)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">Line spacing</span>
        <div
          role="radiogroup"
          aria-label="Line spacing"
          className="flex gap-1.5"
          onKeyDown={radioKeyHandler(LINE_LABELS.length, lineIndex, (i) => setPrefs({ lineHeight: clampLine(i) }))}
        >
          {LINE_LABELS.map((label, i) => (
            <Chip
              key={label}
              role="radio"
              selected={lineIndex === i}
              className="flex-1 justify-center px-2"
              onClick={() => setPrefs({ lineHeight: clampLine(i) })}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">Font</span>
        <div
          role="radiogroup"
          aria-label="Font"
          className="flex gap-1.5"
          onKeyDown={radioKeyHandler(fonts.length, fontIndex, (i) => setPrefs({ font: fonts[i] }))}
        >
          {fonts.map((f) => (
            <Chip
              key={f}
              role="radio"
              selected={prefs.font === f}
              className="flex-1 justify-center px-2 text-sm"
              style={{ fontFamily: FONT_FAMILIES[f] }}
              onClick={() => setPrefs({ font: f })}
            >
              {FONT_LABELS[f]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex max-md:hidden flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">Width</span>
        <div
          role="radiogroup"
          aria-label="Width"
          className="flex gap-1.5"
          onKeyDown={radioKeyHandler(widths.length, widthIndex, (i) => setPrefs({ width: widths[i] }))}
        >
          {widths.map((w) => (
            <Chip
              key={w}
              role="radio"
              selected={prefs.width === w}
              className="flex-1 justify-center px-2"
              onClick={() => setPrefs({ width: w as ReaderPrefs['width'] })}
            >
              {WIDTH_LABELS[w]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">Images</span>
        <div
          role="radiogroup"
          aria-label="Images"
          className="flex gap-1.5"
          onKeyDown={radioKeyHandler(2, showImages ? 0 : 1, (i) => onShowImagesChange(i === 0))}
        >
          {(['Show', 'Hide'] as const).map((label, i) => (
            <Chip
              key={label}
              role="radio"
              selected={showImages === (i === 0)}
              className="flex-1 justify-center px-2"
              onClick={() => onShowImagesChange(i === 0)}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={RotateCcw}
          onClick={() => resetPrefs()}
        >
          Reset
        </Button>
      </div>
    </Popover>
  );
}
