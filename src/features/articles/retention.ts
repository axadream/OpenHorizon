import Dexie from 'dexie';
import { db } from '@/db/db';
import { getSetting } from '@/features/settings/settings';

/** Tombstones older than this are dropped; a deleted article reappears only if the feed still serves it. */
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Drop one feed's tombstones older than TOMBSTONE_TTL_MS. Returns how many were removed. */
export async function pruneTombstones(feedId: string, now: number = Date.now()): Promise<number> {
  const cutoff = now - TOMBSTONE_TTL_MS;
  const victims = await db.deletedArticles
    .where('[feedId+deletedAt]')
    .between([feedId, Dexie.minKey], [feedId, cutoff], true, true)
    .primaryKeys();
  if (victims.length) await db.deletedArticles.bulkDelete(victims);
  return victims.length;
}

/**
 * Delete articles of one feed beyond the newest `keep`, never touching
 * read-later or favorite articles. Unread articles are eligible. Also trims old tombstones.
 */
export async function pruneFeed(feedId: string, keep: number): Promise<number> {
  const older = await db.articles
    .where('[feedId+publishedAt]')
    .between([feedId, Dexie.minKey], [feedId, Dexie.maxKey])
    .reverse()
    .offset(keep)
    .toArray();
  const victims = older.filter(a => a.isReadLater === 0 && a.isFavorite === 0).map(a => a.id);
  if (victims.length) await db.articles.bulkDelete(victims);
  await pruneTombstones(feedId);
  return victims.length;
}

/** Prune every feed with the user's retention setting (run on app start and after syncs). */
export async function pruneAll(keep?: number): Promise<number> {
  const limit = keep ?? (await getSetting('retentionPerFeed'));
  const feeds = await db.feeds.toArray();
  let removed = 0;
  for (const feed of feeds) {
    removed += await pruneFeed(feed.id, limit);
  }
  return removed;
}
