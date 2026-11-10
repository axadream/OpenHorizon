import Dexie from 'dexie';
import { db } from '@/db/db';
import type { Article } from '@/db/schema';
import { useLive } from '@/hooks/useLive';
import { viewKey, type TimelineFilter, type TimelineSort, type View } from '@/store/types';

export type { View };

/*
 * Pure article queries (ARCHITECTURE §3). They take no React state, so the service worker and
 * tests can call them directly. Every view reads through a compound index from §2.1; no view
 * scans the whole table. The only in-memory work is merging per-feed slices for folder views.
 */

const MIN = Dexie.minKey;
const MAX = Dexie.maxKey;

export interface ArticleCounts {
  /** Unread articles across all feeds. */
  unread: number;
  /** All favorited articles. */
  favorites: number;
  /** All read-later articles. */
  readLater: number;
  /** Unread count per feed id (feeds with zero unread are absent). */
  byFeed: Map<string, number>;
}

export const EMPTY_COUNTS: ArticleCounts = { unread: 0, favorites: 0, readLater: 0, byFeed: new Map() };

/** Newest first = publishedAt desc, then primary key desc (matches IndexedDB reverse order). */
function compareArticles(a: Article, b: Article, sort: TimelineSort): number {
  const byDate = sort === 'newest' ? b.publishedAt - a.publishedAt : a.publishedAt - b.publishedAt;
  if (byDate !== 0) return byDate;
  if (a.id === b.id) return 0;
  const asc = a.id < b.id ? -1 : 1;
  return sort === 'newest' ? -asc : asc;
}

/** Feed ids in a folder, via the `folderId` index. Unfiled feeds have no index entry, so they never match. */
async function feedIdsInFolder(folderId: string): Promise<string[]> {
  return db.feeds.where('folderId').equals(folderId).primaryKeys();
}

/** Top `n` articles of one feed in the requested order, through `[feedId+publishedAt]` or `[feedId+isRead+publishedAt]`. */
async function feedSlice(feedId: string, filter: TimelineFilter, sort: TimelineSort, n: number): Promise<Article[]> {
  if (filter === 'unread') {
    const range = db.articles
      .where('[feedId+isRead+publishedAt]')
      .between([feedId, 0, MIN], [feedId, 0, MAX], true, true);
    return (sort === 'newest' ? range.reverse() : range).limit(n).toArray();
  }
  const range = db.articles.where('[feedId+publishedAt]').between([feedId, MIN], [feedId, MAX], true, true);
  return (sort === 'newest' ? range.reverse() : range).limit(n).toArray();
}

/**
 * One page of articles for a view. `filter` is ignored by the `unread` view (it is already an
 * unread view). For every other view, `filter === 'unread'` restricts the results to unread rows.
 * Favorites and read-later use their range plus a per-row read check, since no index covers
 * `[isFavorite+isRead+publishedAt]`; the range itself is still index-bounded.
 */
export async function queryArticles(
  view: View,
  filter: TimelineFilter,
  sort: TimelineSort,
  limit: number,
  offset = 0,
): Promise<Article[]> {
  if (limit <= 0) return [];
  const newest = sort === 'newest';

  switch (view.type) {
    case 'all': {
      if (filter === 'unread') {
        const c = db.articles.where('[isRead+publishedAt]').between([0, MIN], [0, MAX], true, true);
        return (newest ? c.reverse() : c).offset(offset).limit(limit).toArray();
      }
      const c = db.articles.orderBy('publishedAt');
      return (newest ? c.reverse() : c).offset(offset).limit(limit).toArray();
    }
    case 'unread': {
      const c = db.articles.where('[isRead+publishedAt]').between([0, MIN], [0, MAX], true, true);
      return (newest ? c.reverse() : c).offset(offset).limit(limit).toArray();
    }
    case 'favorites': {
      const base = db.articles.where('[isFavorite+publishedAt]').between([1, MIN], [1, MAX], true, true);
      const c = filter === 'unread' ? base.and((a) => a.isRead === 0) : base;
      return (newest ? c.reverse() : c).offset(offset).limit(limit).toArray();
    }
    case 'readLater': {
      const base = db.articles.where('[isReadLater+publishedAt]').between([1, MIN], [1, MAX], true, true);
      const c = filter === 'unread' ? base.and((a) => a.isRead === 0) : base;
      return (newest ? c.reverse() : c).offset(offset).limit(limit).toArray();
    }
    case 'feed': {
      const page = await feedSlice(view.feedId, filter, sort, offset + limit);
      return page.slice(offset, offset + limit);
    }
    case 'folder': {
      const feedIds = await feedIdsInFolder(view.folderId);
      if (feedIds.length === 0) return [];
      // The top (offset + limit) of every feed always contains the global page.
      const slices = await Promise.all(feedIds.map((id) => feedSlice(id, filter, sort, offset + limit)));
      return slices.flat().sort((a, b) => compareArticles(a, b, sort)).slice(offset, offset + limit);
    }
  }
}

/** Ids of every unread article in a view (used by markAllRead). Uses the same indexes. */
export async function queryUnreadIds(view: View): Promise<string[]> {
  switch (view.type) {
    case 'all':
    case 'unread':
      return db.articles.where('[isRead+publishedAt]').between([0, MIN], [0, MAX], true, true).primaryKeys();
    case 'feed':
      return unreadIdsForFeed(view.feedId);
    case 'folder': {
      const feedIds = await feedIdsInFolder(view.folderId);
      return (await Promise.all(feedIds.map(unreadIdsForFeed))).flat();
    }
    case 'favorites':
      return db.articles
        .where('[isFavorite+publishedAt]')
        .between([1, MIN], [1, MAX], true, true)
        .and((a) => a.isRead === 0)
        .primaryKeys();
    case 'readLater':
      return db.articles
        .where('[isReadLater+publishedAt]')
        .between([1, MIN], [1, MAX], true, true)
        .and((a) => a.isRead === 0)
        .primaryKeys();
  }
}

function unreadIdsForFeed(feedId: string): Promise<string[]> {
  return db.articles.where('[feedId+isRead+publishedAt]').between([feedId, 0, MIN], [feedId, 0, MAX], true, true).primaryKeys();
}

/** Unread counts per feed from one index read on `[isRead+feedId]`. */
export async function queryUnreadByFeed(): Promise<Map<string, number>> {
  const keys = await db.articles.where('[isRead+feedId]').between([0, MIN], [0, MAX], true, true).keys();
  const counts = new Map<string, number>();
  for (const key of keys) {
    const feedId = (key as unknown as [number, string])[1];
    counts.set(feedId, (counts.get(feedId) ?? 0) + 1);
  }
  return counts;
}

/** Unread count per feed plus totals for the smart views. */
export async function queryCounts(): Promise<ArticleCounts> {
  const [unread, favorites, readLater, byFeed] = await Promise.all([
    db.articles.where('[isRead+publishedAt]').between([0, MIN], [0, MAX], true, true).count(),
    db.articles.where('[isFavorite+publishedAt]').between([1, MIN], [1, MAX], true, true).count(),
    db.articles.where('[isReadLater+publishedAt]').between([1, MIN], [1, MAX], true, true).count(),
    queryUnreadByFeed(),
  ]);
  return { unread, favorites, readLater, byFeed };
}

export function useArticles(view: View, filter: TimelineFilter, sort: TimelineSort, limit: number): Article[] | undefined {
  return useLive(() => queryArticles(view, filter, sort, limit), [viewKey(view), filter, sort, limit]);
}

export function useArticle(id: string | null): Article | undefined {
  return useLive(() => (id ? db.articles.get(id) : undefined), [id]);
}

/** Live counts for nav badges. Zero values are the default while loading. */
export function useCounts(): ArticleCounts {
  return useLive(queryCounts, [], EMPTY_COUNTS);
}
