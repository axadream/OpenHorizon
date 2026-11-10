/**
 * Dexie version chain. Version 1 is the only one for now (ARCHITECTURE §2.1).
 * Future versions are appended here as `version(n).stores(...)` / `.upgrade(...)`
 * steps; the string map below must stay in sync with §2.1.
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

export const DB_VERSION = 1;
