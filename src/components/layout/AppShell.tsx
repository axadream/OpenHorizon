import { useEffect, type CSSProperties } from 'react';
import { ReaderPane } from '@/components/reader/ReaderPane';
import { TimelinePane } from '@/components/timeline/TimelinePane';
import { BottomNav } from '@/components/layout/BottomNav';
import { SkipLink } from '@/components/layout/SkipLink';
import { UpdatePrompt } from '@/components/layout/UpdatePrompt';
import { NavPane, TABLET_QUERY, useNavRail } from '@/components/nav/NavPane';
import { AppDialogs } from '@/components/dialogs/AppDialogs';
import { ShareSheet } from '@/components/sharing/ShareSheet';
import { ToastRegion } from '@/components/ui/Toast';
import { db } from '@/db/db';
import { OPEN_ARTICLE_EVENT } from '@/features/sync/protocol';
import { useSyncScheduler } from '@/features/sync/scheduler';
import { useServiceWorkerBridge } from '@/features/sync/swBridge';
import { useBootUrl } from '@/hooks/useBootUrl';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useMobileHistory } from '@/hooks/useMobileHistory';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';
import { useMobilePane, useReaderFullscreen } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import type { MobilePane } from '@/store/types';

type PaneState = 'active' | 'left' | 'right';

const PANE_ORDER: readonly MobilePane[] = ['nav', 'timeline', 'reader'];

/** Mobile stack position of a pane relative to the active one (DESIGN 4.3). */
function paneState(pane: MobilePane, active: MobilePane): PaneState {
  const i = PANE_ORDER.indexOf(pane);
  const a = PANE_ORDER.indexOf(active);
  if (i === a) return 'active';
  return i < a ? 'left' : 'right';
}

const PANE_STATE_CLASS: Record<PaneState, string> = {
  active: 'z-[var(--z-pane)] translate-x-0 opacity-100 visible pointer-events-auto',
  left: '-translate-x-[30%] opacity-0 invisible pointer-events-none',
  right: 'translate-x-full opacity-0 invisible pointer-events-none',
};

/** Mobile-only absolute stacking classes for a pane; desktop panes lay out in the grid instead. */
function mobilePaneClass(state: PaneState, fullscreen: boolean): string {
  return cn(
    'absolute inset-x-0 top-0 min-h-0',
    'transition-[transform,opacity,visibility] duration-[var(--duration-slow)] ease-standard will-change-transform motion-reduce:transition-none',
    fullscreen ? 'bottom-0' : 'bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))]',
    PANE_STATE_CLASS[state],
  );
}

/**
 * Root layout. Desktop and tablet: a 3-column grid (nav 260 px or 64 px rail, timeline 380/340/420 px,
 * reader 1fr). Mobile: a single-pane stack driven by `mobilePane`. Reader fullscreen collapses the
 * nav and timeline columns and makes them inert. `main` uses display: contents so the grid still applies.
 */
export function AppShell() {
  useSyncScheduler();
  useServiceWorkerBridge();
  useBootUrl();
  useMobileHistory();
  useKeyboardShortcuts();

  // Notification clicks (relayed by the service worker) open the article in the reader.
  useEffect(() => {
    const onOpenArticle = (event: Event) => {
      const articleId = (event as CustomEvent<{ articleId?: unknown }>).detail?.articleId;
      if (typeof articleId !== 'string') return;
      db.articles.get(articleId).then(
        (article) => {
          if (article) useUiStore.getState().selectArticle(article.id, { openOnMobile: true });
          else toast.error('That article is no longer available');
        },
        () => toast.error('Could not open that article'),
      );
    };
    window.addEventListener(OPEN_ARTICLE_EVENT, onOpenArticle);
    return () => window.removeEventListener(OPEN_ARTICLE_EVENT, onOpenArticle);
  }, []);

  const isMobile = useIsMobile();
  const tablet = useMediaQuery(TABLET_QUERY);
  const wide = useMediaQuery('(min-width: 1440px)');
  const rail = useNavRail();
  const fullscreen = useReaderFullscreen();
  const mobilePane = useMobilePane();

  const navState: PaneState = isMobile ? paneState('nav', mobilePane) : 'active';
  const timelineState: PaneState = isMobile ? paneState('timeline', mobilePane) : 'active';
  const readerState: PaneState = isMobile ? paneState('reader', mobilePane) : 'active';

  const navWidth = fullscreen ? 0 : rail ? 64 : 260;
  const timelineWidth = fullscreen ? 0 : tablet ? 340 : wide ? 420 : 380;
  const gridStyle: CSSProperties | undefined = isMobile
    ? undefined
    : { gridTemplateColumns: `${navWidth}px ${timelineWidth}px minmax(0,1fr)` };

  const navInert = (isMobile && navState !== 'active') || fullscreen;
  const timelineInert = (isMobile && timelineState !== 'active') || fullscreen;
  const readerInert = isMobile && readerState !== 'active';

  return (
    <>
      <SkipLink />
      <div
        className={cn(
          'relative h-dvh overflow-hidden bg-bg',
          !isMobile &&
            'grid grid-rows-[minmax(0,1fr)] transition-[grid-template-columns] duration-[var(--duration-slow)] ease-standard motion-reduce:transition-none',
        )}
        style={gridStyle}
      >
        <NavPane
          className={isMobile ? mobilePaneClass(navState, fullscreen) : undefined}
          data-state={navState}
          inert={navInert || undefined}
        />
        <main id="main" className="contents">
          <TimelinePane
            className={isMobile ? mobilePaneClass(timelineState, fullscreen) : undefined}
            data-state={timelineState}
            inert={timelineInert || undefined}
          />
          <ReaderPane
            className={isMobile ? mobilePaneClass(readerState, fullscreen) : undefined}
            data-state={readerState}
            inert={readerInert || undefined}
          />
        </main>
      </div>

      <BottomNav />
      <ShareSheet />
      <AppDialogs />
      <ToastRegion />
      <UpdatePrompt />
    </>
  );
}
