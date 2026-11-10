import { type KeyboardEvent } from 'react';
import { Chip } from '@/components/ui/Chip';
import { t, useT } from '@/i18n/i18n';

export type ReaderTextSource = 'original' | 'full';

export interface FullArticleToggleProps {
  value: ReaderTextSource;
  onChange(value: ReaderTextSource): void;
}

const SOURCES: readonly ReaderTextSource[] = ['original', 'full'];

/** Chooses between the feed text and the loaded full article (radio group, arrow keys move). */
export function FullArticleToggle({ value, onChange }: FullArticleToggleProps) {
  useT();

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const index = SOURCES.indexOf(value);
    const next = SOURCES[(index + (e.key === 'ArrowRight' ? 1 : -1) + SOURCES.length) % SOURCES.length];
    if (next) onChange(next);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[SOURCES.indexOf(next ?? value)]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('reader.textSource')}
      onKeyDown={onKeyDown}
      className="mx-auto mb-6 flex w-full max-w-[var(--reader-measure)] flex-wrap gap-1.5"
    >
      <Chip role="radio" selected={value === 'original'} className="px-3" onClick={() => onChange('original')}>
        {t('reader.viewOriginal')}
      </Chip>
      <Chip role="radio" selected={value === 'full'} className="px-3" onClick={() => onChange('full')}>
        {t('reader.viewFull')}
      </Chip>
    </div>
  );
}
