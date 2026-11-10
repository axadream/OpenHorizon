import { memo, type MouseEvent } from 'react';
import { Bookmark, Circle, CircleCheck, Star, Trash2 } from 'lucide-react';
import type { Article } from '@/db/schema';
import { IconButton } from '@/components/ui/IconButton';
import { useLongPress, type GesturePoint } from '@/hooks/useLongPress';
import { useSwipeActions } from '@/hooks/useSwipeActions';
import type { Locale } from '@/i18n/types';
import { t } from '@/i18n/i18n';
import type { LayoutMode } from '@/features/appearance/appearance';
import { cn } from '@/lib/cn';
import { cleanText } from '@/lib/text';
import { formatFull } from '@/lib/time';
import { FeedMeta, RowThumb, SwipeBackdrop, UnreadMarker, useThumbState } from './ArticleRowParts';

const STAGGER_MS = 18;
const STAGGER_CAP = 10;

export interface ArticleRowProps {
  article: Article;
  feedTitle: string;
  feedFaviconUrl?: string;
  selected: boolean;
  /** Position in the list; drives the capped fade-up stagger. */
  index: number;
  /** Layout mode from the appearance settings. `reading` renders as `comfortable` (slide-over list). */
  layout: LayoutMode;
  /** Spacing only: `compact` tightens the padding of every layout. */
  density: 'comfortable' | 'compact';
  /** Store value `recentlyFetchedCutoff`; 0 when no sync has run yet. */
  recentCutoff: number;
  /** Writing direction of the UI: swipe actions and their sides follow it. */
  rtl: boolean;
  /** Active locale. Passed so memoised rows re-render when the language changes. */
  locale: Locale;
  onSelect(id: string): void;
  onToggleFavorite(id: string): void;
  onToggleReadLater(id: string): void;
  onToggleRead(id: string): void;
  /** Swipe towards the delete side (right in LTR, left in RTL): delete with undo. Touch only. */
  onSwipeDelete(id: string): void;
  /** Swipe towards the favorite side: toggle favorite. Touch only. */
  onSwipeFavorite(id: string): void;
  /** Long press (touch) or context menu (mouse, Menu key): open the action sheet at the point. */
  onOpenActions(id: string, point: GesturePoint): void;
}

/** Row geometry per layout and density. Density only changes spacing. */
function geometry(layout: LayoutMode, compact: boolean): { box: string; intrinsic: string; summary: number; thumb: 'md' | 'lg' | null } {
  switch (layout) {
    case 'list':
      return {
        box: compact ? 'min-h-9 py-1' : 'min-h-11 py-2',
        intrinsic: '[contain-intrinsic-size:auto_40px]',
        summary: 0,
        thumb: null,
      };
    case 'cards':
      return {
        box: compact ? 'min-h-[104px] py-2' : 'min-h-[120px] py-3',
        intrinsic: '[contain-intrinsic-size:auto_120px]',
        summary: 3,
        thumb: 'lg',
      };
    default:
      return {
        box: compact ? 'min-h-14 py-1.5' : 'min-h-[84px] py-2.5',
        intrinsic: '[contain-intrinsic-size:auto_84px]',
        summary: 2,
        thumb: 'md',
      };
  }
}

/**
 * One timeline row (DESIGN §6.5). Memoised: parents pass stable callbacks and primitive props,
 * so only rows whose article, selection, layout or locale changed re-render. Rows never read the store.
 *
 * Touch gestures: swipe deletes or favorites (sides follow the writing direction), long press opens
 * the action sheet. The row content is the layer that moves; the action backdrops sit behind it.
 */
export const ArticleRow = memo(function ArticleRow({
  article,
  feedTitle,
  feedFaviconUrl,
  selected,
  index,
  layout,
  density,
  recentCutoff,
  rtl,
  onSelect,
  onToggleFavorite,
  onToggleReadLater,
  onToggleRead,
  onSwipeDelete,
  onSwipeFavorite,
  onOpenActions,
}: ArticleRowProps) {
  const [thumbBroken, markThumbBroken] = useThumbState();
  const { id } = article;
  const read = article.isRead === 1;
  const favorite = article.isFavorite === 1;
  const readLater = article.isReadLater === 1;
  const compact = density === 'compact';
  const geo = geometry(layout, compact);
  const singleLine = layout === 'list';
  const thumb = geo.thumb && article.thumbnailUrl && !thumbBroken ? geo.thumb : null;
  const snippet = geo.summary > 0 ? cleanText(article.summary) : '';
  const label = t('article.rowLabel', {
    title: article.title,
    feed: feedTitle,
    date: formatFull(article.publishedAt),
  }) + (read ? '' : t('article.unreadSuffix'));
  const delay = `${Math.min(index, STAGGER_CAP) * STAGGER_MS}ms`;

  // Swipe sides follow the writing direction: in RTL the drag towards the start edge favorites.
  const onDragRight = rtl ? () => onSwipeFavorite(id) : () => onSwipeDelete(id);
  const onDragLeft = rtl ? () => onSwipeDelete(id) : () => onSwipeFavorite(id);
  const swipe = useSwipeActions({ onSwipeRight: onDragRight, onSwipeLeft: onDragLeft });
  const press = useLongPress({ onLongPress: (point) => onOpenActions(id, point) });
  const { state: drag } = swipe;

  const rightBackdrop = rtl
    ? { icon: Star, label: favorite ? t('article.unfavorite') : t('article.favorite'), className: 'bg-warning' }
    : { icon: Trash2, label: t('article.delete'), className: 'bg-danger' };
  const leftBackdrop = rtl
    ? { icon: Trash2, label: t('article.delete'), className: 'bg-danger' }
    : { icon: Star, label: favorite ? t('article.unfavorite') : t('article.favorite'), className: 'bg-warning' };

  // Clicks on the quick actions must not bubble to the row's select handler.
  const stopClick = (e: MouseEvent) => e.stopPropagation();

  // A horizontal swipe ends in a click on some browsers; that click must not select the row.
  const onRowClick = () => {
    if (swipe.consumeClick()) return;
    onSelect(id);
  };

  const meta = (
    <FeedMeta
      feedTitle={feedTitle}
      feedFaviconUrl={feedFaviconUrl}
      publishedAt={article.publishedAt}
      isFavorite={favorite}
      isReadLater={readLater}
    />
  );

  return (
    <li
      id={`article-${id}`}
      role="option"
      aria-selected={selected}
      aria-label={label}
      tabIndex={-1}
      data-selected={selected || undefined}
      data-layout={layout}
      onClick={onRowClick}
      {...press}
      className={cn(
        'group relative hairline-b cursor-pointer select-none overflow-hidden',
        'transition-[transform] duration-[var(--duration-instant)] ease-standard active:scale-[0.995]',
        '[content-visibility:auto]',
        geo.intrinsic,
      )}
    >
      {/* Revealed actions. Touch only; they never show at rest. */}
      <SwipeBackdrop
        side="right"
        active={drag.direction === 'right'}
        progress={drag.progress}
        armed={drag.armed}
        icon={rightBackdrop.icon}
        label={rightBackdrop.label}
        className={rightBackdrop.className}
      />
      <SwipeBackdrop
        side="left"
        active={drag.direction === 'left'}
        progress={drag.progress}
        armed={drag.armed}
        icon={leftBackdrop.icon}
        label={leftBackdrop.label}
        className={leftBackdrop.className}
      />

      {/* Opaque panel so the backdrops stay hidden at rest. Hover and selection tint sit on an overlay. */}
      <div {...swipe.handlers} style={swipe.contentStyle} className="relative touch-pan-y bg-panel">
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0',
            selected
              ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)] rtl:shadow-[inset_-2px_0_0_var(--color-accent)]'
              : 'transition-colors duration-[var(--duration-instant)] group-hover:bg-card-hover/60',
          )}
        />

        <div
          className={cn(
            'relative animate-fade-up grid grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-x-2.5 px-3',
            singleLine && 'items-center',
            geo.box,
          )}
          style={{ animationDelay: delay }}
        >
          <UnreadMarker
            read={read}
            publishedAt={article.publishedAt}
            fetchedAt={article.fetchedAt}
            cutoff={recentCutoff}
            compact={compact || singleLine}
          />

          <div className="min-w-0">
            {singleLine ? (
              <div className="flex min-w-0 items-center gap-2">
                <span
                  dir="auto"
                  className={cn(
                    'min-w-0 flex-1 truncate text-md leading-[22px]',
                    read ? 'font-medium text-silver' : 'font-semibold text-text',
                  )}
                >
                  {article.title}
                </span>
                <span className="flex max-w-[45%] shrink-0 items-center gap-1.5 text-xs text-text-muted">{meta}</span>
              </div>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">{meta}</div>
                <span
                  dir="auto"
                  className={cn(
                    'mt-0.5 line-clamp-2 block text-md leading-[22px] transition-[font-weight] duration-[var(--duration-base)]',
                    read ? 'font-medium text-silver' : 'font-semibold text-text',
                  )}
                >
                  {article.title}
                </span>
                {snippet ? (
                  <span
                    dir="auto"
                    className={cn('mt-1 block text-sm text-text-muted', geo.summary === 3 ? 'line-clamp-3' : 'line-clamp-2')}
                  >
                    {snippet}
                  </span>
                ) : null}
              </>
            )}
          </div>

          {thumb && article.thumbnailUrl ? (
            <RowThumb src={article.thumbnailUrl} size={thumb} onBroken={markThumbBroken} />
          ) : null}
        </div>

        {/* Quick actions: hover/focus overlay on fine pointers; a static row under the text on touch. */}
        <div
          onClick={stopClick}
          className={cn(
            'absolute end-2 top-2 flex gap-0.5 rounded-sm bg-panel/90 p-0.5 opacity-0 shadow-1',
            'transition-opacity duration-[var(--duration-instant)] ease-standard',
            'group-hover:opacity-100 group-focus-within:opacity-100',
            'pointer-coarse:static pointer-coarse:flex pointer-coarse:justify-end pointer-coarse:bg-transparent',
            'pointer-coarse:p-0 pointer-coarse:px-3 pointer-coarse:pb-2 pointer-coarse:opacity-100 pointer-coarse:shadow-none',
          )}
        >
          <IconButton
            size="sm"
            tabIndex={-1}
            label={favorite ? t('article.removeFavorite') : t('article.favorite')}
            icon={Star}
            active={favorite}
            pressed={favorite}
            className={cn(favorite && '[&>svg]:fill-current')}
            onClick={() => onToggleFavorite(id)}
          />
          <IconButton
            size="sm"
            tabIndex={-1}
            label={readLater ? t('article.removeReadLater') : t('article.readLater')}
            icon={Bookmark}
            active={readLater}
            pressed={readLater}
            className={cn(readLater && '[&>svg]:fill-current')}
            onClick={() => onToggleReadLater(id)}
          />
          <IconButton
            size="sm"
            tabIndex={-1}
            label={read ? t('article.markUnread') : t('article.markRead')}
            icon={read ? Circle : CircleCheck}
            className="pointer-coarse:hidden"
            onClick={() => onToggleRead(id)}
          />
        </div>
      </div>
    </li>
  );
});
