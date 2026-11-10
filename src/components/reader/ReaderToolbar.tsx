import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Bookmark, Circle, CircleCheck, ExternalLink, FileText, List, ListVideo, Maximize2, Minimize2, Share2, Star, Type, ArrowLeft } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { ReaderPrefsPopover } from '@/components/reader/ReaderPrefsPopover';
import { markRead, markUnread, setFavorite, setReadLater } from '@/features/articles/articleActions';
import type { Article, Feed } from '@/db/schema';
import { describeLoadError, loadFullArticle } from '@/features/reader/fullArticle';
import { share } from '@/features/sharing/share';
import { t, useT } from '@/i18n/i18n';
import { cn } from '@/lib/cn';
import { cleanText } from '@/lib/text';
import { timeAgo } from '@/lib/time';
import { toast } from '@/lib/toast';
import { youTubeVideoIdOf } from '@/lib/youtube';
import { useTimelineOverlay } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';

/** Feed text shorter than this (in characters, markup removed) is flagged as "load the full article". */
export const SHORT_TEXT_CHARS = 700;

export interface ReaderToolbarProps {
  article: Article;
  feed: Feed | undefined;
  isMobile: boolean;
  fullscreen: boolean;
  /** Reading layout: the toolbar shows the button that opens the timeline slide-over. */
  readingLayout: boolean;
  /** True once the reader body has scrolled; switches the steel bar to glass. */
  scrolled: boolean;
  showImages: boolean;
  onShowImagesChange(show: boolean): void;
}

const LINK_CLASS =
  'focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-muted transition-[background-color,color] duration-[var(--duration-instant)] ease-standard hover:bg-card hover:text-text';

/** Arrow keys move between toolbar controls (WAI-ARIA toolbar pattern). Inverted in RTL. */
function onToolbarKey(e: KeyboardEvent<HTMLDivElement>): void {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (index === -1) return;
  const rtl = document.documentElement.dir === 'rtl';
  const forward = (e.key === 'ArrowRight') !== rtl;
  const step = forward ? 1 : -1;
  e.preventDefault();
  items[(index + step + items.length) % items.length]?.focus();
}

/** Article actions bar (DESIGN §6.6). Toggles use aria-pressed; the icon fills when pressed. */
export function ReaderToolbar({
  article,
  feed,
  isMobile,
  fullscreen,
  readingLayout,
  scrolled,
  showImages,
  onShowImagesChange,
}: ReaderToolbarProps) {
  useT();
  const overlayOpen = useTimelineOverlay();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const prefsButtonRef = useRef<HTMLButtonElement>(null);

  const isRead = article.isRead === 1;
  const isFavorite = article.isFavorite === 1;
  const isLater = article.isReadLater === 1;
  const shareUrl = article.link || feed?.siteUrl || '';
  const videoId = youTubeVideoIdOf(article.link);
  const shortText = useMemo(() => cleanText(article.contentRaw).length < SHORT_TEXT_CHARS, [article.contentRaw]);

  const onLoadFull = async () => {
    if (!article.link || loadingFull) return;
    setLoadingFull(true);
    try {
      await loadFullArticle(article.id, article.link);
    } catch (err) {
      const info = describeLoadError(err);
      toast.error(info.title, info.detail ? { description: info.detail } : undefined);
    } finally {
      setLoadingFull(false);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label={t('reader.toolbar')}
      onKeyDown={onToolbarKey}
      className={cn(
        'flex h-[var(--toolbar-h)] shrink-0 items-center gap-1 border-b border-border px-2',
        'transition-[background-color,box-shadow] duration-[var(--duration-base)] ease-standard',
        scrolled ? 'glass' : 'steel',
      )}
    >
      {isMobile ? (
        <IconButton
          label={t('reader.back')}
          icon={ArrowLeft}
          size="sm"
          className="rtl:-scale-x-100"
          onClick={() => useUiStore.getState().setMobilePane('timeline')}
        />
      ) : null}

      {readingLayout && !isMobile && !fullscreen ? (
        <IconButton
          label={overlayOpen ? t('timeline.hideList') : t('timeline.showList')}
          icon={List}
          size="sm"
          pressed={overlayOpen}
          aria-expanded={overlayOpen}
          onClick={() => useUiStore.getState().toggleTimelineOverlay()}
        />
      ) : null}

      <p className="hidden min-w-0 flex-1 truncate px-2 text-xs text-text-muted md:block">
        {feed?.title ? <span className="text-silver">{feed.title}</span> : null}
        {feed?.title ? ' · ' : null}
        <time dateTime={new Date(article.publishedAt).toISOString()}>{timeAgo(article.publishedAt)}</time>
      </p>

      <div className="ms-auto flex items-center gap-0.5">
        {article.link ? (
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('reader.openOriginal')}
            title={t('reader.openOriginal')}
            className={LINK_CLASS}
          >
            <ExternalLink aria-hidden="true" size={16} strokeWidth={1.75} />
          </a>
        ) : (
          <IconButton label={t('reader.openOriginal')} icon={ExternalLink} size="sm" disabled />
        )}

        {article.link ? (
          <IconButton
            label={loadingFull ? t('reader.loadingFull') : t('reader.loadFull')}
            icon={FileText}
            size="sm"
            active={shortText && article.fullContent === undefined}
            disabled={loadingFull}
            onClick={() => void onLoadFull()}
          />
        ) : null}
        {videoId ? (
          <IconButton
            label={t('lists.add')}
            icon={ListVideo}
            size="sm"
            onClick={() => useUiStore.getState().openDialog('watchList', { url: article.link })}
          />
        ) : null}

        <IconButton
          label={t('reader.favorite')}
          icon={Star}
          size="sm"
          pressed={isFavorite}
          active={isFavorite}
          className={isFavorite ? '[&_svg]:fill-current' : undefined}
          onClick={() => void setFavorite(article.id, !isFavorite)}
        />
        <IconButton
          label={t('reader.readLater')}
          icon={Bookmark}
          size="sm"
          pressed={isLater}
          active={isLater}
          className={isLater ? '[&_svg]:fill-current' : undefined}
          onClick={() => void setReadLater(article.id, !isLater)}
        />
        <IconButton
          label={isRead ? t('article.markUnread') : t('article.markRead')}
          icon={isRead ? Circle : CircleCheck}
          size="sm"
          onClick={() => void (isRead ? markUnread(article.id) : markRead(article.id))}
        />
        <IconButton
          label={t('reader.share')}
          icon={Share2}
          size="sm"
          disabled={!shareUrl}
          onClick={() => void share({ title: article.title, url: shareUrl, text: article.title })}
        />
        <IconButton
          ref={prefsButtonRef}
          label={t('reader.prefs')}
          icon={Type}
          size="sm"
          aria-haspopup="dialog"
          aria-expanded={prefsOpen}
          active={prefsOpen}
          onClick={() => setPrefsOpen((o) => !o)}
        />
        <IconButton
          label={fullscreen ? t('reader.exitFullscreen') : t('reader.enterFullscreen')}
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
