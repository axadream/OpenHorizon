import { memo, useState, type MouseEvent } from 'react';
import { Bookmark, Circle, CircleCheck, Star, Trash2, type LucideIcon } from 'lucide-react';
import type { Article } from '@/db/schema';
import { FeedAvatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { useLongPress, type GesturePoint } from '@/hooks/useLongPress';
import { useNow } from '@/hooks/useNow';
import { useSwipeActions } from '@/hooks/useSwipeActions';
import { cn } from '@/lib/cn';
import { cleanText } from '@/lib/text';
import { formatFull, timeAgo } from '@/lib/time';

/** Articles fetched within this window pulse while unread (DESIGN §3.2). */
const RECENT_WINDOW_MS = 10 * 60_000;
const STAGGER_MS = 18;
const STAGGER_CAP = 10;

export interface ArticleRowProps {
  article: Article;
  feedTitle: string;
  feedFaviconUrl?: string;
  selected: boolean;
  /** Position in the list; drives the capped fade-up stagger. */
  index: number;
  density: 'comfortable' | 'compact';
  /** Store value `recentlyFetchedCutoff`; 0 when no sync has run yet. */
  recentCutoff: number;
  onSelect(id: string): void;
  onToggleFavorite(id: string): void;
  onToggleReadLater(id: string): void;
  onToggleRead(id: string): void;
  /** Swipe right: delete (with undo). Touch only. */
  onSwipeDelete(id: string): void;
  /** Swipe left: toggle favorite. Touch only. */
  onSwipeFavorite(id: string): void;
  /** Long press (touch) or context menu (mouse, Menu key): open the action sheet at the point. */
  onOpenActions(id: string, point: GesturePoint): void;
}

/** Relative time that re-renders only itself, on the shared 30 s tick. */
function TimeAgo({ ts }: { ts: number }) {
  const now = useNow();
  return (
    <time dateTime={new Date(ts).toISOString()} title={formatFull(ts)} className="shrink-0 tabular-nums">
      {timeAgo(ts, now)}
    </time>
  );
}

/** Unread dot. Read state shrinks it to nothing (mark-read sweep) inside a fixed hairline ring. */
function UnreadMarker({
  read,
  publishedAt,
  fetchedAt,
  cutoff,
}: {
  read: boolean;
  publishedAt: number;
  fetchedAt: number;
  cutoff: number;
}) {
  const now = useNow();
  const threshold = Math.max(cutoff, now - RECENT_WINDOW_MS);
  const pulse = !read && (fetchedAt >= threshold || publishedAt >= threshold);
  return (
    <span aria-hidden="true" className="mt-[7px] inline-flex size-3.5 items-center justify-center rounded-full ring-1 ring-border">
      <span
        className={cn(
          'size-2 rounded-full bg-accent transition-transform duration-[var(--duration-base)] ease-standard',
          read ? 'scale-0' : 'scale-100',
          pulse && 'animate-pulse-dot',
        )}
      />
    </span>
  );
}

function FeedMeta({ feedTitle, feedFaviconUrl, publishedAt, isFavorite, isReadLater }: {
  feedTitle: string;
  feedFaviconUrl?: string;
  publishedAt: number;
  isFavorite: boolean;
  isReadLater: boolean;
}) {
  return (
    <>
      <FeedAvatar title={feedTitle} src={feedFaviconUrl} size={14} />
      <span className="min-w-0 truncate">{feedTitle}</span>
      <span aria-hidden="true">·</span>
      <TimeAgo ts={publishedAt} />
      {isFavorite ? <Star aria-hidden="true" size={12} strokeWidth={1.75} className="shrink-0 fill-current text-accent" /> : null}
      {isReadLater ? <Bookmark aria-hidden="true" size={12} strokeWidth={1.75} className="shrink-0 fill-current text-accent" /> : null}
    </>
  );
}

interface SwipeBackdropProps {
  side: 'left' | 'right';
  /** This backdrop is the one the drag is revealing. */
  active: boolean;
  progress: number;
  armed: boolean;
  icon: LucideIcon;
  label: string;
  className: string;
}

/**
 * The action revealed behind the row. Hidden at rest (opacity 0): it only shows while a drag is
 * revealing it, and its opacity follows the drag distance. Decorative: the same actions exist in
 * the action sheet and on the keyboard.
 */
function SwipeBackdrop({ side, active, progress, armed, icon: Icon, label, className }: SwipeBackdropProps) {
  return (
    <div
      aria-hidden="true"
      data-armed={armed || undefined}
      style={{ opacity: active ? progress : 0 }}
      className={cn(
        'pointer-events-none absolute inset-0 flex items-center gap-2 px-4 text-sm font-semibold text-text-inverse',
        side === 'right' ? 'justify-start' : 'justify-end',
        armed && 'brightness-110',
        className,
      )}
    >
      <Icon size={20} strokeWidth={1.75} className="shrink-0" />
      <span>{label}</span>
    </div>
  );
}

/**
 * One timeline row (DESIGN §6.5). Memoised: parents pass stable callbacks and primitive props,
 * so only rows whose article or selection changed re-render. Rows never read the store.
 *
 * Touch gestures: swipe right deletes, swipe left toggles favorite, long press opens the action
 * sheet. The row content is the layer that moves; the action backdrops sit behind it.
 */
export const ArticleRow = memo(function ArticleRow({
  article,
  feedTitle,
  feedFaviconUrl,
  selected,
  index,
  density,
  recentCutoff,
  onSelect,
  onToggleFavorite,
  onToggleReadLater,
  onToggleRead,
  onSwipeDelete,
  onSwipeFavorite,
  onOpenActions,
}: ArticleRowProps) {
  const [thumbBroken, setThumbBroken] = useState(false);
  const { id } = article;
  const read = article.isRead === 1;
  const favorite = article.isFavorite === 1;
  const readLater = article.isReadLater === 1;
  const compact = density === 'compact';
  const showThumb = !compact && !!article.thumbnailUrl && !thumbBroken;
  const snippet = compact ? '' : cleanText(article.summary);
  const label = `${article.title}. ${feedTitle}, ${formatFull(article.publishedAt)}${read ? '' : ', unread'}`;
  const delay = `${Math.min(index, STAGGER_CAP) * STAGGER_MS}ms`;

  const swipe = useSwipeActions({
    onSwipeRight: () => onSwipeDelete(id),
    onSwipeLeft: () => onSwipeFavorite(id),
  });
  const press = useLongPress({ onLongPress: (point) => onOpenActions(id, point) });
  const { state: drag } = swipe;

  // Clicks on the quick actions must not bubble to the row's select handler.
  const stopClick = (e: MouseEvent) => e.stopPropagation();

  // A horizontal swipe ends in a click on some browsers; that click must not select the row.
  const onRowClick = () => {
    if (swipe.consumeClick()) return;
    onSelect(id);
  };

  return (
    <li
      id={`article-${id}`}
      role="option"
      aria-selected={selected}
      aria-label={label}
      tabIndex={-1}
      data-selected={selected || undefined}
      onClick={onRowClick}
      {...press}
      className={cn(
        'group relative hairline-b cursor-pointer select-none overflow-hidden',
        'transition-[transform] duration-[var(--duration-instant)] ease-standard active:scale-[0.995]',
        compact
          ? '[contain-intrinsic-size:auto_56px] [content-visibility:auto]'
          : '[contain-intrinsic-size:auto_84px] [content-visibility:auto]',
      )}
    >
      {/* Revealed actions. Touch only; they never show at rest. */}
      <SwipeBackdrop
        side="right"
        active={drag.direction === 'right'}
        progress={drag.progress}
        armed={drag.armed}
        icon={Trash2}
        label="Delete"
        className="bg-danger"
      />
      <SwipeBackdrop
        side="left"
        active={drag.direction === 'left'}
        progress={drag.progress}
        armed={drag.armed}
        icon={Star}
        label={favorite ? 'Unfavorite' : 'Favorite'}
        className="bg-warning"
      />

      {/* Opaque panel so the backdrops stay hidden at rest. Hover and selection tint sit on an overlay. */}
      <div {...swipe.handlers} style={swipe.contentStyle} className="relative touch-pan-y bg-panel">
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0',
            selected
              ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]'
              : 'transition-colors duration-[var(--duration-instant)] group-hover:bg-card-hover/60',
          )}
        />

        <div
          className={cn(
            'relative animate-fade-up grid grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-x-2.5 px-3',
            compact ? 'min-h-14 py-2' : 'min-h-[84px] py-2.5',
          )}
          style={{ animationDelay: delay }}
        >
          <UnreadMarker
            read={read}
            publishedAt={article.publishedAt}
            fetchedAt={article.fetchedAt}
            cutoff={recentCutoff}
          />

          <div className="min-w-0">
            {compact ? (
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-md leading-[22px]',
                    read ? 'font-medium text-silver' : 'font-semibold text-text',
                  )}
                >
                  {article.title}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
                  <FeedMeta
                    feedTitle={feedTitle}
                    feedFaviconUrl={feedFaviconUrl}
                    publishedAt={article.publishedAt}
                    isFavorite={favorite}
                    isReadLater={readLater}
                  />
                </span>
              </div>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
                  <FeedMeta
                    feedTitle={feedTitle}
                    feedFaviconUrl={feedFaviconUrl}
                    publishedAt={article.publishedAt}
                    isFavorite={favorite}
                    isReadLater={readLater}
                  />
                </div>
                <span
                  className={cn(
                    'mt-0.5 line-clamp-2 block text-md leading-[22px] transition-[font-weight] duration-[var(--duration-base)]',
                    read ? 'font-medium text-silver' : 'font-semibold text-text',
                  )}
                >
                  {article.title}
                </span>
                {snippet ? <span className="mt-1 line-clamp-2 block text-sm text-text-muted">{snippet}</span> : null}
              </>
            )}
          </div>

          {showThumb ? (
            <img
              src={article.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setThumbBroken(true)}
              className="size-[72px] rounded-md bg-card object-cover ring-1 ring-border"
            />
          ) : null}
        </div>

        {/* Quick actions: hover/focus overlay on fine pointers; a static row under the text on touch. */}
        <div
          onClick={stopClick}
          className={cn(
            'absolute right-2 top-2 flex gap-0.5 rounded-sm bg-panel/90 p-0.5 opacity-0 shadow-1',
            'transition-opacity duration-[var(--duration-instant)] ease-standard',
            'group-hover:opacity-100 group-focus-within:opacity-100',
            'pointer-coarse:static pointer-coarse:flex pointer-coarse:justify-end pointer-coarse:bg-transparent',
            'pointer-coarse:p-0 pointer-coarse:px-3 pointer-coarse:pb-2 pointer-coarse:opacity-100 pointer-coarse:shadow-none',
          )}
        >
          <IconButton
            size="sm"
            tabIndex={-1}
            label={favorite ? 'Remove favorite' : 'Favorite'}
            icon={Star}
            active={favorite}
            pressed={favorite}
            className={cn(favorite && '[&>svg]:fill-current')}
            onClick={() => onToggleFavorite(id)}
          />
          <IconButton
            size="sm"
            tabIndex={-1}
            label={readLater ? 'Remove from read later' : 'Read later'}
            icon={Bookmark}
            active={readLater}
            pressed={readLater}
            className={cn(readLater && '[&>svg]:fill-current')}
            onClick={() => onToggleReadLater(id)}
          />
          <IconButton
            size="sm"
            tabIndex={-1}
            label={read ? 'Mark as unread' : 'Mark as read'}
            icon={read ? Circle : CircleCheck}
            className="pointer-coarse:hidden"
            onClick={() => onToggleRead(id)}
          />
        </div>
      </div>
    </li>
  );
});
