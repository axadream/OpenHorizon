import { db } from '@/db/db';
import type { Article, Feed } from '@/db/schema';
import { AlreadySubscribedError } from './addFeed';

/** Everything needed to undo an unsubscribe (Undo toast). */
export interface RemovedFeed {
  feed: Feed;
  articles: Article[];
}

/**
 * Unsubscribe: delete the feed, its articles and its sync log. Returns a snapshot
 * for restoreFeed, or null when the feed does not exist.
 */
export async function removeFeed(feedId: string): Promise<RemovedFeed | null> {
  return db.transaction('rw', [db.feeds, db.articles, db.syncLog], async () => {
    const feed = await db.feeds.get(feedId);
    if (!feed) return null;
    const articles = await db.articles.where('feedId').equals(feedId).toArray();
    await db.articles.where('feedId').equals(feedId).delete();
    await db.syncLog.where('feedId').equals(feedId).delete();
    await db.feeds.delete(feedId);
    return { feed, articles };
  });
}

/** Undo removeFeed. Throws AlreadySubscribedError if the URL was subscribed again meanwhile. */
export async function restoreFeed(snapshot: RemovedFeed): Promise<void> {
  await db.transaction('rw', [db.feeds, db.articles], async () => {
    const clash = await db.feeds.where('url').equals(snapshot.feed.url).first();
    if (clash && clash.id !== snapshot.feed.id) throw new AlreadySubscribedError(snapshot.feed.url, clash.id);
    await db.feeds.put(snapshot.feed);
    await db.articles.bulkPut(snapshot.articles);
  });
}
