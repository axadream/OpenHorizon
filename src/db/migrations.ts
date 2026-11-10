/**
 * Dexie version chain (ARCHITECTURE §2.1). Each version keeps its own string map; a version
 * block is never edited once shipped. Version 2 adds the `deletedArticles` tombstone table.
 */
export const DB_NAME = 'openhorizon';

export const STORES_V1: Record<string, string> = {
  feeds: 'id, &url, folderId, [folderId+sortOrder], isFavorite, lastFetchedAt',
  folders: 'id, sortOrder',
  articles:
    'id, &[feedId+guid], feedId, publishedAt, [feedId+publishedAt], [isRead+publishedAt], [feedId+isRead+publishedAt], [isRead+feedId], [isReadLater+publishedAt], [isFavorite+publishedAt], link',
  settings: 'key',
  syncLog: '++id, feedId, startedAt, [feedId+startedAt]',
};

/**
 * Version 2: tombstones for deleted articles (ARCHITECTURE §2.5). Keyed by [feedId+guid] so a
 * sync can check each incoming item in one lookup; [feedId+deletedAt] drives the 90-day trim.
 */
export const STORES_V2: Record<string, string> = {
  ...STORES_V1,
  deletedArticles: '[feedId+guid], feedId, [feedId+deletedAt]',
};

export const DB_VERSION = 2;
