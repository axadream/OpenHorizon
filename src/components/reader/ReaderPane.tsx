import { useEffect, useRef, useState, type CSSProperties, type UIEvent } from 'react';
import { BookOpen, Bookmark, Share2 } from 'lucide-react';
import { FeedAvatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReaderSkeleton } from '@/components/ui/Skeleton';
import { ReaderContent } from '@/components/reader/ReaderContent';
import { ReaderToolbar } from '@/components/reader/ReaderToolbar';
import { markRead, setReadLater } from '@/features/articles/articleActions';
import { useArticle } from '@/features/articles/articleQueries';
import { useFeedMap } from '@/features/feeds/feedQueries';
import { readerPrefsToCssVars } from '@/features/reader/readerPrefs';
import { share } from '@/features/sharing/share';
import { cn } from '@/lib/cn';
import { formatFull } from '@/lib/time';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useMobilePane, useReaderFullscreen, useReaderPrefs, useSelectedArticleId } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';

/** Delay before an opened unread article is marked read (DESIGN §6.4). */
export const AUTO_READ_MS = 800;

/** Scroll offset after which the toolbar switches from steel to glass. */
const SCROLLED_THRESHOLD = 8;

export interface ReaderPaneProps {
  className?: string;
  /** Set by AppShell ("active" | "left" | "right"). */
  'data-state'?: string;
  /** Set by AppShell on mobile when the pane is not the active one. */
  inert?: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Reader pane (DESIGN §6.6). Shows the selected article: toolbar, header, sanitized body and
 * footer. Marks the article read after AUTO_READ_MS. Named export, no required props.
 */
export function ReaderPane({ className, 'data-state': dataState, inert }: ReaderPaneProps = {}) {
  const selectedId = useSelectedArticleId();
  const article = useArticle(selectedId);
  const feeds = useFeedMap();
  const prefs = useReaderPrefs();
  const fullscreen = useReaderFullscreen();
  const isMobile = useIsMobile();
  const mobilePane = useMobilePane();

  // Keep the screen on while an article is open in the reader. On mobile only when the reader pane is showing.
  useWakeLock(selectedId !== null && prefs.keepScreenOn && (!isMobile || mobilePane === 'reader'));

  const showImages = prefs.images;
  const setShowImages = (on: boolean) => useUiStore.getState().setReaderPrefs({ images: on });
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const articleId = article?.id;

  // New article: scroll to top and move focus to the heading for screen readers. Desktop keeps
  // focus where it is when it sits in the timeline listbox, so J/K navigation keeps working.
  useEffect(() => {
    if (!articleId) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrolled(false);
    const heading = headingRef.current;
    if (!heading) return;
    const active = document.activeElement;
    const inListbox = active instanceof HTMLElement && active.closest('[role="listbox"]') !== null;
    const mobile = window.matchMedia('(max-width: 767.98px)').matches;
    if (mobile || !inListbox) heading.focus({ preventScroll: true });
  }, [articleId]);

  // Auto mark-read: keyed on the article id only, so flipping read state by hand afterwards
  // does not trigger it again. markRead() skips articles that are already read.
  useEffect(() => {
    if (!articleId) return;
    const t = window.setTimeout(() => {
      void markRead(articleId);
    }, AUTO_READ_MS);
    return () => window.clearTimeout(t);
  }, [articleId]);

  // Escape (fullscreen exit included) is handled by the Esc chain in useKeyboardShortcuts.

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > SCROLLED_THRESHOLD);
  };

  const paneClass = cn('flex min-h-0 flex-col overflow-hidden bg-bg', className);

  if (!selectedId) {
    return (
      <section aria-label="Reader" data-state={dataState} inert={inert} className={paneClass}>
        <EmptyState
          icon={BookOpen}
          title="Select an article"
          description="Choose something from the timeline to start reading."
        />
      </section>
    );
  }

  if (!article) {
    return (
      <section aria-label="Reader" data-state={dataState} inert={inert} className={paneClass}>
        <div className="steel h-[var(--toolbar-h)] shrink-0 border-b border-border" aria-hidden="true" />
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-6 md:px-8 md:py-10">
          <ReaderSkeleton />
        </div>
      </section>
    );
  }

  const feed = feeds.get(article.feedId);
  const shareUrl = article.link || feed?.siteUrl || '';
  const showHero = showImages && !!article.thumbnailUrl && !article.contentRaw.includes(article.thumbnailUrl);
  const cssVars = readerPrefsToCssVars(prefs) as CSSProperties;

  return (
    <section aria-label="Reader" data-state={dataState} inert={inert} className={paneClass}>
      <ReaderToolbar
        article={article}
        feed={feed}
        isMobile={isMobile}
        fullscreen={fullscreen}
        scrolled={scrolled}
        showImages={showImages}
        onShowImagesChange={setShowImages}
      />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 md:px-8 md:py-10"
      >
        <article id="reader-article" tabIndex={-1} aria-labelledby="reader-title" className="mx-auto w-full outline-none" style={cssVars}>
          <header className="mx-auto mb-6 max-w-[var(--reader-measure)]">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-text-muted">
              <FeedAvatar title={feed?.title ?? ''} src={feed?.faviconUrl} size={16} />
              <span className="min-w-0 truncate">{feed?.title ?? 'Unknown feed'}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={new Date(article.publishedAt).toISOString()}>{formatFull(article.publishedAt)}</time>
              {article.author ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="min-w-0 truncate">{article.author}</span>
                </>
              ) : null}
            </div>
            <h1
              id="reader-title"
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 font-sans text-2xl font-bold leading-tight tracking-[-0.01em] text-text outline-none lg:text-3xl"
            >
              {article.link ? (
                <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  {article.title}
                </a>
              ) : (
                article.title
              )}
            </h1>
            {showHero ? (
              <img
                src={article.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="mt-5 w-full rounded-lg ring-1 ring-border"
              />
            ) : null}
          </header>

          <ReaderContent article={article} prefs={prefs} showImages={showImages} />

          <footer className="mx-auto mt-10 flex max-w-[var(--reader-measure)] flex-wrap items-center gap-2 border-t border-border pt-6">
            {article.link ? (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="steel focus-ring inline-flex h-9 items-center gap-2 rounded-sm px-3 text-base font-medium text-text hover:brightness-110"
              >
                Read on {hostOf(article.link) || 'the web'}
              </a>
            ) : null}
            <Button
              variant="ghost"
              leadingIcon={Share2}
              disabled={!shareUrl}
              onClick={() => void share({ title: article.title, url: shareUrl, text: article.title })}
            >
              Share
            </Button>
            <Button
              variant="ghost"
              leadingIcon={Bookmark}
              onClick={() => void setReadLater(article.id, article.isReadLater !== 1)}
              title={article.isReadLater === 1 ? 'Remove from read later' : 'Read later'}
            >
              {article.isReadLater === 1 ? 'Remove from read later' : 'Read later'}
            </Button>
            {!isMobile ? (
              <p className="w-full pt-2 text-xs text-text-faint">J / K to move between articles</p>
            ) : null}
          </footer>
        </article>
      </div>
    </section>
  );
}
