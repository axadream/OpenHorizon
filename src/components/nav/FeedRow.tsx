import type { KeyboardEvent, MouseEvent } from 'react';
import { AlertTriangle, Loader2, MoreHorizontal, Star } from 'lucide-react';
import { FeedAvatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Feed } from '@/db/schema';
import { cn } from '@/lib/cn';
import { InlineRename, NavRowBadge, NavRowButton } from '@/components/nav/NavRow';

export interface FeedRowProps {
  feed: Feed;
  unreadCount: number;
  selected: boolean;
  depth: 0 | 1;
  /** Folder the feed sits in, or null when unfiled. Used by arrow-key tree navigation. */
  parentFolderId: string | null;
  rail: boolean;
  syncing: boolean;
  renaming: boolean;
  onSelect(feedId: string): void;
  onContextMenu(e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, feed: Feed): void;
  onRenameCommit(title: string): void;
  onRenameCancel(): void;
}

/** One subscribed feed in the nav: favicon or letter avatar, title, unread badge, error and state marks. */
export function FeedRow({
  feed,
  unreadCount,
  selected,
  depth,
  parentFolderId,
  rail,
  syncing,
  renaming,
  onSelect,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
}: FeedRowProps) {
  const hasError = !!feed.lastError;
  const label = `${feed.title}, ${unreadCount} unread${hasError ? ', feed has an error' : ''}`;

  if (renaming) {
    return (
      <li className="px-2" style={{ paddingLeft: 8 + depth * 12 }}>
        <InlineRename label="Feed name" initial={feed.title} onCommit={onRenameCommit} onCancel={onRenameCancel} />
      </li>
    );
  }

  const avatar = syncing ? (
    <Loader2 aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0 animate-spin-slow text-accent" />
  ) : (
    <span className="relative inline-flex shrink-0">
      <FeedAvatar title={feed.title} src={feed.faviconUrl} size={18} />
      {feed.isFavorite === 1 ? (
        <Star aria-hidden="true" size={10} strokeWidth={1.75} className="absolute -top-1 -right-1 fill-accent text-accent" />
      ) : null}
    </span>
  );

  const button = (
    <NavRowButton
      data-nav-item
      data-feed-id={feed.id}
      data-parent-folder={parentFolderId ?? ''}
      depth={rail ? undefined : depth}
      selected={selected}
      rail={rail}
      aria-label={label}
      title={feed.lastError ?? undefined}
      className={cn(!rail && 'flex-1', !selected && unreadCount === 0 && 'text-text-muted')}
      onClick={() => onSelect(feed.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, feed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
          e.preventDefault();
          onContextMenu(e, feed);
        }
      }}
    >
      {avatar}
      {rail ? null : (
        <span className={cn('min-w-0 flex-1 truncate', unreadCount > 0 && 'font-medium text-silver')}>{feed.title}</span>
      )}
      {rail || !hasError ? null : <AlertTriangle aria-hidden="true" size={14} strokeWidth={1.75} className="shrink-0 text-warning" />}
      {rail ? null : <NavRowBadge count={unreadCount} selected={selected} />}
    </NavRowButton>
  );

  return (
    <li className={cn('group relative', rail ? 'flex justify-center' : 'flex items-center')}>
      {rail ? <Tooltip content={feed.title}>{button}</Tooltip> : button}
      {rail ? null : (
        <IconButton
          label={`More actions for ${feed.title}`}
          icon={MoreHorizontal}
          size="sm"
          tabIndex={-1}
          aria-haspopup="menu"
          className="ml-0.5 opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100"
          onClick={(e) => onContextMenu(e, feed)}
        />
      )}
    </li>
  );
}
