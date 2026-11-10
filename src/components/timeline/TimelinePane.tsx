import type { ComponentPropsWithoutRef } from 'react';
import { Bookmark, CheckCheck, Inbox, Plus, RefreshCw, Rss, Star } from 'lucide-react';
import { EmptyState, type EmptyStateProps } from '@/components/ui/EmptyState';
import { ArticleRowSkeleton } from '@/components/ui/Skeleton';
import { queryUnreadIds, useArticles } from '@/features/articles/articleQueries';
import { useFeedMap, useFeeds, useFolders } from '@/features/feeds/feedQueries';
import { useSetting } from '@/features/settings/settings';
import { useLive } from '@/hooks/useLive';
import { cn } from '@/lib/cn';
import { viewKey, type TimelineFilter, type View } from '@/store/types';
import {
  useRecentlyFetchedCutoff,
  useSelectedArticleId,
  useTimelineLimit,
  useTimelineOptions,
  useView,
} from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { ArticleList } from './ArticleList';
import { refreshAll, TimelineHeader, TimelineStatus } from './TimelineHeader';

export type TimelinePaneProps = ComponentPropsWithoutRef<'section'>;

const SKELETON_ROWS = 8;

/** Unread count of the current view, from one live query (includes favorites/read-later views). */
function useViewUnreadCount(view: View): number | undefined {
  return useLive(() => queryUnreadIds(view).then((ids) => ids.length), [viewKey(view)]);
}

function viewTitle(view: View, feedTitle: (feedId: string) => string | undefined, folderName: (folderId: string) => string | undefined): string {
  switch (view.type) {
    case 'all':
      return 'All';
    case 'unread':
      return 'Unread';
    case 'favorites':
      return 'Favorites';
    case 'readLater':
      return 'Read Later';
    case 'feed':
      return feedTitle(view.feedId) ?? 'Feed';
    case 'folder':
      return folderName(view.folderId) ?? 'Folder';
  }
}

/** Empty-state copy per view (DESIGN §6.4). */
function emptyStateFor(view: View, filter: TimelineFilter, hasFeeds: boolean): EmptyStateProps {
  if (!hasFeeds) {
    return {
      icon: Rss,
      title: 'No feeds yet',
      description: 'Subscribe to a website or paste a feed URL to start reading.',
      action: { label: 'Add your first feed', icon: Plus, onClick: () => useUiStore.getState().openDialog('addFeed') },
    };
  }
  if (filter === 'unread' || view.type === 'unread') {
    return { icon: CheckCheck, title: "You're all caught up", description: 'No unread articles here.' };
  }
  if (view.type === 'favorites') {
    return { icon: Star, title: 'No favorites yet', description: 'Star an article to keep it here.' };
  }
  if (view.type === 'readLater') {
    return { icon: Bookmark, title: 'Nothing saved for later', description: 'Use Read later on an article to save it here.' };
  }
  return {
    icon: Inbox,
    title: 'Nothing here yet',
    description: 'New articles appear after a refresh.',
    action: { label: 'Refresh', icon: RefreshCw, variant: 'steel', onClick: () => void refreshAll() },
  };
}

/**
 * Timeline pane: header, sub-header, and the article listbox. Reads everything from the store
 * and from live queries; the only props are the pane-level ones the AppShell passes through.
 */
export function TimelinePane({ className, ...rest }: TimelinePaneProps) {
  const view = useView();
  const { filter, sort } = useTimelineOptions();
  const limit = useTimelineLimit();
  const selectedId = useSelectedArticleId();
  const cutoff = useRecentlyFetchedCutoff();
  const density = useSetting('density');
  const feedMap = useFeedMap();
  const feeds = useFeeds();
  const folders = useFolders();
  const articles = useArticles(view, filter, sort, limit);
  const unreadCount = useViewUnreadCount(view);

  const title = viewTitle(
    view,
    (feedId) => feedMap.get(feedId)?.title,
    (folderId) => folders?.find((f) => f.id === folderId)?.name,
  );
  const count = articles?.length ?? 0;
  const canLoadMore = count > 0 && count >= limit;

  return (
    <section
      {...rest}
      role="region"
      aria-label="Timeline"
      className={cn('flex min-h-0 flex-col overflow-hidden bg-panel hairline-r', className)}
    >
      <TimelineHeader view={view} title={title} unreadCount={unreadCount} />
      <TimelineStatus count={count} unreadCount={unreadCount} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {articles === undefined ? (
          <div aria-busy="true" className="flex flex-col">
            <span className="sr-only">Loading articles…</span>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <div key={i} className="hairline-b">
                <ArticleRowSkeleton />
              </div>
            ))}
          </div>
        ) : count === 0 ? (
          <EmptyState {...emptyStateFor(view, filter, feeds === undefined || feeds.length > 0)} />
        ) : (
          <ArticleList
            articles={articles}
            feedMap={feedMap}
            label={title}
            density={density}
            selectedId={selectedId}
            recentCutoff={cutoff}
            canLoadMore={canLoadMore}
          />
        )}
      </div>
    </section>
  );
}
