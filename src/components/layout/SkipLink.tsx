import { useT, t } from '@/i18n/i18n';

/** First focusable element: jumps past the navigation pane to the timeline. Hidden until focused. */
export function SkipLink() {
  useT();
  return (
    <a
      href="#main"
      className="focus-ring sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[var(--z-skip-link)] steel rounded-sm px-3 py-2 text-base font-medium text-text"
    >
      {t('common.skipToArticles')}
    </a>
  );
}
