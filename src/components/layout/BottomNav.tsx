import { BookOpen, Newspaper, Rss, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useUnreadCounts } from '@/features/feeds/feedQueries';
import { useIsMobile } from '@/hooks/useIsMobile';
import { t, useT } from '@/i18n/i18n';
import type { TranslationKey } from '@/i18n/i18n';
import { cn } from '@/lib/cn';
import { useReaderFullscreen, useSelectedArticleId, useMobilePane } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import type { MobilePane } from '@/store/types';

interface TabDef {
  pane: MobilePane;
  labelKey: TranslationKey;
  icon: LucideIcon;
}

const TABS: readonly TabDef[] = [
  { pane: 'nav', labelKey: 'bottom.feeds', icon: Rss },
  { pane: 'timeline', labelKey: 'bottom.timeline', icon: Newspaper },
  { pane: 'reader', labelKey: 'bottom.reader', icon: BookOpen },
];

/**
 * Mobile primary navigation (DESIGN 6.8). Three tabs map onto the mobile pane stack. Shown only
 * below 768 px and hidden in reader fullscreen. The Reader tab is disabled until an article is
 * selected.
 */
export function BottomNav() {
  useT();
  const isMobile = useIsMobile();
  const fullscreen = useReaderFullscreen();
  const active = useMobilePane();
  const selectedId = useSelectedArticleId();
  const unread = useUnreadCounts()?.total ?? 0;

  if (!isMobile || fullscreen) return null;

  return (
    <nav
      aria-label={t('bottom.label')}
      className={cn(
        'glass fixed inset-x-0 bottom-0 z-[var(--z-bottom-nav)] rounded-none border-x-0 border-b-0',
        'h-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul role="list" className="grid h-[var(--bottom-nav-h)] grid-cols-3">
        {TABS.map(({ pane, labelKey, icon: Icon }) => {
          const isActive = active === pane;
          const disabled = pane === 'reader' && selectedId === null;
          const badge = pane === 'timeline' ? unread : 0;
          const label = t(labelKey);
          return (
            <li key={pane} className="h-full">
              <button
                type="button"
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={disabled || undefined}
                onClick={() => {
                  if (disabled) return;
                  useUiStore.getState().setMobilePane(pane);
                }}
                className={cn(
                  'focus-ring relative flex h-full w-full flex-col items-center justify-center gap-1 text-xs font-medium active:scale-95',
                  'transition-transform duration-[var(--duration-fast)] ease-standard',
                  disabled ? 'cursor-default text-text-faint' : isActive ? 'text-accent' : 'text-text-muted',
                )}
              >
                {isActive ? (
                  <span aria-hidden="true" className="absolute top-0 h-0.5 w-5 rounded-full bg-accent" />
                ) : null}
                <span className="relative inline-flex">
                  <Icon aria-hidden="true" size={22} strokeWidth={isActive ? 2.25 : 1.75} className="rtl:-scale-x-100" />
                  {badge > 0 ? (
                    <Badge
                      count={badge}
                      tone="accent"
                      className="absolute -top-1.5 -end-3 h-4 min-w-4 px-1 text-[10px] leading-none"
                    />
                  ) : null}
                </span>
                <span>{label}</span>
                {badge > 0 ? <span className="sr-only">, {t('bottom.unread', { count: badge })}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
