import { useRef, useState, type KeyboardEvent } from 'react';
import { Bookmark, Circle, CircleCheck, ExternalLink, Maximize2, Minimize2, Share2, Star, Type, ArrowLeft } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { ReaderPrefsPopover } from '@/components/reader/ReaderPrefsPopover';
import { markRead, markUnread, setFavorite, setReadLater } from '@/features/articles/articleActions';
import type { Article, Feed } from '@/db/schema';
import { share } from '@/features/sharing/share';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/time';
import { useUiStore } from '@/store/uiStore';

export interface ReaderToolbarProps {
  article: Article;
  feed: Feed | undefined;
  isMobile: boolean;
  fullscreen: boolean;
  /** True once the reader body has scrolled; switches the steel bar to glass. */
  scrolled: boolean;
  showImages: boolean;
  onShowImagesChange(show: boolean): void;
}

const LINK_CLASS =
  'focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-muted transition-[background-color,color] duration-[var(--duration-instant)] ease-standard hover:bg-card hover:text-text';

/** Left/Right arrows move between toolbar controls (WAI-ARIA toolbar pattern). */
function onToolbarKey(e: KeyboardEvent<HTMLDivElement>): void {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (index === -1) return;
  const step = e.key === 'ArrowRight' ? 1 : -1;
  e.preventDefault();
  items[(index + step + items.length) % items.length]?.focus();
}

/** Article actions bar (DESIGN §6.6). Toggles use aria-pressed; the icon fills when pressed. */
export function ReaderToolbar({
  article,
  feed,
  isMobile,
  fullscreen,
  scrolled,
  showImages,
  onShowImagesChange,
}: ReaderToolbarProps) {
  const [prefsOpen, setPrefsOpen] = useState(false);
  const prefsButtonRef = useRef<HTMLButtonElement>(null);

  const isRead = article.isRead === 1;
  const isFavorite = article.isFavorite === 1;
  const isLater = article.isReadLater === 1;
  const shareUrl = article.link || feed?.siteUrl || '';

  return (
    <div
      role="toolbar"
      aria-label="Article actions"
      onKeyDown={onToolbarKey}
      className={cn(
        'flex h-[var(--toolbar-h)] shrink-0 items-center gap-1 border-b border-border px-2',
        'transition-[background-color,box-shadow] duration-[var(--duration-base)] ease-standard',
        scrolled ? 'glass' : 'steel',
      )}
    >
      {isMobile ? (
        <IconButton
          label="Back to timeline"
          icon={ArrowLeft}
          size="sm"
          onClick={() => useUiStore.getState().setMobilePane('timeline')}
        />
      ) : null}

      <p className="hidden min-w-0 flex-1 truncate px-2 text-xs text-text-muted md:block">
        {feed?.title ? <span className="text-silver">{feed.title}</span> : null}
        {feed?.title ? ' · ' : null}
        <time dateTime={new Date(article.publishedAt).toISOString()}>{timeAgo(article.publishedAt)}</time>
      </p>

      <div className="ml-auto flex items-center gap-0.5">
        {article.link ? (
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open original"
            title="Open original"
            className={LINK_CLASS}
          >
            <ExternalLink aria-hidden="true" size={16} strokeWidth={1.75} />
          </a>
        ) : (
          <IconButton label="Open original" icon={ExternalLink} size="sm" disabled />
        )}

        <IconButton
          label="Favorite"
          icon={Star}
          size="sm"
          pressed={isFavorite}
          active={isFavorite}
          className={isFavorite ? '[&_svg]:fill-current' : undefined}
          onClick={() => void setFavorite(article.id, !isFavorite)}
        />
        <IconButton
          label="Read later"
          icon={Bookmark}
          size="sm"
          pressed={isLater}
          active={isLater}
          className={isLater ? '[&_svg]:fill-current' : undefined}
          onClick={() => void setReadLater(article.id, !isLater)}
        />
        <IconButton
          label={isRead ? 'Mark as unread' : 'Mark as read'}
          icon={isRead ? Circle : CircleCheck}
          size="sm"
          onClick={() => void (isRead ? markUnread(article.id) : markRead(article.id))}
        />
        <IconButton
          label="Share"
          icon={Share2}
          size="sm"
          disabled={!shareUrl}
          onClick={() => void share({ title: article.title, url: shareUrl, text: article.title })}
        />
        <IconButton
          ref={prefsButtonRef}
          label="Reading preferences"
          icon={Type}
          size="sm"
          aria-haspopup="dialog"
          aria-expanded={prefsOpen}
          active={prefsOpen}
          onClick={() => setPrefsOpen((o) => !o)}
        />
        <IconButton
          label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          icon={fullscreen ? Minimize2 : Maximize2}
          size="sm"
          className="hidden md:inline-flex"
          onClick={() => useUiStore.getState().setReaderFullscreen(!fullscreen)}
        />
      </div>

      <ReaderPrefsPopover
        open={prefsOpen}
        onOpenChange={setPrefsOpen}
        triggerRef={prefsButtonRef}
        showImages={showImages}
        onShowImagesChange={onShowImagesChange}
      />
    </div>
  );
}
