import { useMemo } from 'react';
import { db } from '@/db/db';
import type { Feed, Folder } from '@/db/schema';
import { queryUnreadByFeed } from '@/features/articles/articleQueries';
import { useLive } from '@/hooks/useLive';

export interface UnreadCounts {
  /** Unread articles across all feeds. */
  total: number;
  /** Unread count per feed id. */
  byFeed: Map<string, number>;
  /** Unread count per folder id (feeds in the folder, summed). */
  byFolder: Map<string, number>;
}

/**
 * Feeds in nav order: by folder, then `sortOrder`, unfiled first.
 *
 * ARCHITECTURE §3 names `orderBy('[folderId+sortOrder]')`, but IndexedDB does not index `null`,
 * so unfiled feeds (folderId null) would be silently missing from that index. The table is small,
 * so the order is applied in memory instead.
 */
export async function queryFeeds(): Promise<Feed[]> {
  const feeds = await db.feeds.toArray();
  return feeds.sort((a, b) => {
    const fa = a.folderId ?? '';
    const fb = b.folderId ?? '';
    if (fa !== fb) return fa < fb ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export async function queryFolders(): Promise<Folder[]> {
  return db.folders.orderBy('sortOrder').toArray();
}

export async function queryUnreadCounts(): Promise<UnreadCounts> {
  const [byFeed, feeds] = await Promise.all([queryUnreadByFeed(), db.feeds.toArray()]);
  const folderOf = new Map(feeds.map((f) => [f.id, f.folderId] as const));
  const byFolder = new Map<string, number>();
  let total = 0;
  for (const [feedId, n] of byFeed) {
    total += n;
    const folderId = folderOf.get(feedId);
    if (folderId) byFolder.set(folderId, (byFolder.get(folderId) ?? 0) + n);
  }
  return { total, byFeed, byFolder };
}

export function useFeeds(): Feed[] | undefined {
  return useLive(queryFeeds, []);
}

export function useFolders(): Folder[] | undefined {
  return useLive(queryFolders, []);
}

/** Feeds keyed by id. Derived from `useFeeds`, so it updates with the live query. */
export function useFeedMap(): Map<string, Feed> {
  const feeds = useFeeds();
  return useMemo(() => new Map((feeds ?? []).map((f) => [f.id, f] as const)), [feeds]);
}

export function useUnreadCounts(): UnreadCounts | undefined {
  return useLive(queryUnreadCounts, []);
}
