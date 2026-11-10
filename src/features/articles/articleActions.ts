import { db } from '@/db/db';
import type { View } from '@/store/types';
import { queryUnreadIds } from './articleQueries';

/*
 * Article writes (ARCHITECTURE §12). Each function writes to Dexie and returns; live queries
 * update the UI. Set-style actions (markRead, markUnread, setFavorite, setReadLater) are
 * idempotent: they only touch rows whose flag actually changes, so repeating them is a no-op
 * and does not change readAt. Toggles invert the current flag, so they are not idempotent by
 * design. Call the set-style functions when the target state is known.
 */

export type ArticleIds = string | readonly string[];

function toIds(ids: ArticleIds): string[] {
  return [...new Set(typeof ids === 'string' ? [ids] : ids)];
}

/** Mark articles read. Returns how many changed (already-read articles are skipped). */
export async function markRead(ids: ArticleIds): Promise<number> {
  const list = toIds(ids);
  if (list.length === 0) return 0;
  const now = Date.now();
  return db.articles
    .where(':id')
    .anyOf(list)
    .and((a) => a.isRead === 0)
    .modify((a) => {
      a.isRead = 1;
      a.readAt = now;
    });
}

/** Mark articles unread. Returns how many changed. */
export async function markUnread(ids: ArticleIds): Promise<number> {
  const list = toIds(ids);
  if (list.length === 0) return 0;
  return db.articles
    .where(':id')
    .anyOf(list)
    .and((a) => a.isRead === 1)
    .modify((a) => {
      a.isRead = 0;
      delete a.readAt;
    });
}

/** Flip read state of one article in a single IndexedDB modify. */
export async function toggleRead(id: string): Promise<void> {
  await db.articles.where(':id').equals(id).modify((a) => {
    if (a.isRead === 1) {
      a.isRead = 0;
      delete a.readAt;
    } else {
      a.isRead = 1;
      a.readAt = Date.now();
    }
  });
}

/** Set the favorite flag. Returns 1 if the article changed, 0 otherwise. */
export async function setFavorite(id: string, on: boolean): Promise<number> {
  const flag = on ? 1 : 0;
  return db.articles
    .where(':id')
    .equals(id)
    .and((a) => a.isFavorite !== flag)
    .modify({ isFavorite: flag });
}

export async function toggleFavorite(id: string): Promise<void> {
  await db.articles.where(':id').equals(id).modify((a) => {
    a.isFavorite = a.isFavorite === 1 ? 0 : 1;
  });
}

/** Set the read-later flag. Returns 1 if the article changed, 0 otherwise. */
export async function setReadLater(id: string, on: boolean): Promise<number> {
  const flag = on ? 1 : 0;
  return db.articles
    .where(':id')
    .equals(id)
    .and((a) => a.isReadLater !== flag)
    .modify({ isReadLater: flag });
}

export async function toggleReadLater(id: string): Promise<void> {
  await db.articles.where(':id').equals(id).modify((a) => {
    a.isReadLater = a.isReadLater === 1 ? 0 : 1;
  });
}

/**
 * Mark every unread article in a view as read. Returns the ids that changed, so the caller can
 * offer Undo through `undoMarkAllRead(ids)`. Empty when nothing was unread.
 */
export async function markAllRead(view: View): Promise<string[]> {
  // Folder views read the feeds table to find the folder's feeds, so it must be in scope too.
  return db.transaction('rw', [db.articles, db.feeds], async () => {
    const ids = await queryUnreadIds(view);
    if (ids.length === 0) return [];
    await markRead(ids);
    return ids;
  });
}

/** Undo for markAllRead: marks the given articles unread again. Returns how many changed. */
export async function undoMarkAllRead(ids: readonly string[]): Promise<number> {
  return markUnread(ids);
}
