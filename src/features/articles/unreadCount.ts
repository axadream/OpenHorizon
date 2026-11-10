import Dexie from 'dexie';
import { db } from '@/db/db';

/**
 * Unread articles across all feeds, from the [isRead+publishedAt] index. Plain Dexie with no React,
 * so the service worker can call it after a background sync.
 */
export function countUnreadArticles(): Promise<number> {
  return db.articles.where('[isRead+publishedAt]').between([0, Dexie.minKey], [0, Dexie.maxKey], true, true).count();
}
