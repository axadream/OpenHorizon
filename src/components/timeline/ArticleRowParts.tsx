import { useState } from 'react';
import { Bookmark, Star, type LucideIcon } from 'lucide-react';
import { FeedAvatar } from '@/components/ui/Avatar';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/cn';
import { formatFull, timeAgo } from '@/lib/time';

/** Articles fetched within this window pulse while unread (DESIGN §3.2). */
const RECENT_WINDOW_MS = 10 * 60_000;

/** Relative time that re-renders only itself, on the shared 30 s tick. */
export function TimeAgo({ ts }: { ts: number }) {
  const now = useNow();
  return (
    <time dateTime={new Date(ts).toISOString()} title={formatFull(ts)} className="shrink-0 tabular-nums">
      {timeAgo(ts, now)}
    </time>
  );
}

/** Unread dot. Read state shrinks it to nothing (mark-read sweep) inside a fixed hairline ring. */
export function UnreadMarker({
  read,
  publishedAt,
  fetchedAt,
  cutoff,
  compact,
}: {
  read: boolean;
  publishedAt: number;
  fetchedAt: number;
  cutoff: number;
  compact: boolean;
}) {
  const now = useNow();
  const threshold = Math.max(cutoff, now - RECENT_WINDOW_MS);
  const pulse = !read && (fetchedAt >= threshold || publishedAt >= threshold);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full ring-1 ring-border',
        compact ? 'mt-0' : 'mt-[7px]',
      )}
    >
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

export interface FeedMetaProps {
  feedTitle: string;
  feedFaviconUrl?: string;
  publishedAt: number;
  isFavorite: boolean;
  isReadLater: boolean;
}

/** Feed name, time and the favorite / read-later marks. */
export function FeedMeta({ feedTitle, feedFaviconUrl, publishedAt, isFavorite, isReadLater }: FeedMetaProps) {
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

export interface SwipeBackdropProps {
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
export function SwipeBackdrop({ side, active, progress, armed, icon: Icon, label, className }: SwipeBackdropProps) {
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

/** Article thumbnail. Hides itself after a load error so the row keeps its text layout. */
export function RowThumb({ src, size, onBroken }: { src: string; size: 'md' | 'lg'; onBroken(): void }) {
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onBroken}
      className={cn(
        'shrink-0 rounded-md bg-card object-cover ring-1 ring-border',
        size === 'lg' ? 'size-24' : 'size-[72px]',
      )}
    />
  );
}

/** Hook: thumbnail state per row. A failed image is dropped for the rest of the row's life. */
export function useThumbState(): [boolean, () => void] {
  const [broken, setBroken] = useState(false);
  return [broken, () => setBroken(true)];
}
