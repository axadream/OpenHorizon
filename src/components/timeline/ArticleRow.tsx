import { memo, useState, type MouseEvent } from 'react';
import { Bookmark, Circle, CircleCheck, Star } from 'lucide-react';
import type { Article } from '@/db/schema';
import { FeedAvatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { useNow } from '@/hooks/useNow';
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

/**
 * One timeline row (DESIGN §6.5). Memoised: parents pass stable callbacks and primitive props,
 * so only rows whose article or selection changed re-render. Rows never read the store.
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

  // Clicks on the quick actions must not bubble to the row's select handler.
  const stopClick = (e: MouseEvent) => e.stopPropagation();

  return (
    <li
      id={`article-${id}`}
      role="option"
      aria-selected={selected}
      aria-label={label}
      tabIndex={-1}
      data-selected={selected || undefined}
      onClick={() => onSelect(id)}
      className={cn(
        'group relative hairline-b cursor-pointer select-none',
        'transition-[background-color,transform] duration-[var(--duration-instant)] ease-standard',
        'hover:bg-card-hover/60 active:scale-[0.995]',
        compact
          ? '[contain-intrinsic-size:auto_56px] [content-visibility:auto]'
          : '[contain-intrinsic-size:auto_84px] [content-visibility:auto]',
        selected && 'bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]',
      )}
    >
      <div
        className={cn(
          'animate-fade-up grid grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-x-2.5 px-3',
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
    </li>
  );
});
