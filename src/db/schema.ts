import Dexie, { type Table } from 'dexie';
import { DB_NAME, STORES_V1, STORES_V2 } from './migrations';

/** IndexedDB cannot index booleans, so indexed flags are 0 | 1. */
export type Flag = 0 | 1;

export interface Feed {
  id: string;
  /** Canonical feed URL (normalized). For pasted XML without a source: "manual:<uuid>" */
  url: string;
  siteUrl?: string;
  title: string;
  description?: string;
  faviconUrl?: string;
  folderId: string | null;
  sortOrder: number;
  /** "favorite feed" = notify on new items */
  isFavorite: Flag;
  /** 1 = created from pasted XML without URL; never synced */
  manual: Flag;
  language?: string;
  etag?: string;
  lastModified?: string;
  lastFetchedAt?: number;
  lastSuccessAt?: number;
  lastError?: string | null;
  errorCount: number;
  /** 1 once the user renamed the feed; sync must not overwrite the title then (ARCHITECTURE §8.1). */
  titleCustomized: Flag;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  sortOrder: number;
  collapsed: Flag;
  createdAt: number;
}

export interface Article {
  id: string;
  feedId: string;
  /** Dedup key, unique per feed. Never empty. */
  guid: string;
  link: string;
  title: string;
  author?: string;
  summary: string;
  /** Best available HTML, UNSANITIZED; sanitized at render time. */
  contentRaw: string;
  thumbnailUrl?: string;
  publishedAt: number;
  fetchedAt: number;
  isRead: Flag;
  isReadLater: Flag;
  isFavorite: Flag;
  readAt?: number;
  enclosures?: { url: string; type?: string; length?: number }[];
}

export interface Settings {
  syncFrequency: '15m' | '30m' | '1h' | 'manual';
  notificationsEnabled: boolean;
  density: 'comfortable' | 'compact';
  retentionPerFeed: 100 | 200 | 500 | 1000;
  lastSyncAt: number | null;
  onboardingDone: boolean;
  installDismissedAt: number | null;
}

/**
 * Tombstone written when the user deletes one article. syncFeed skips items whose
 * [feedId+guid] is listed here, so a deleted article is not re-inserted by the next sync.
 */
export interface DeletedArticle {
  feedId: string;
  guid: string;
  deletedAt: number;
}

export interface SettingRow<K extends keyof Settings = keyof Settings> {
  key: K;
  value: Settings[K];
}

export interface SyncLogEntry {
  id?: number;
  feedId: string;
  startedAt: number;
  finishedAt: number;
  status: 'ok' | 'notModified' | 'error';
  newCount: number;
  via: 'direct' | 'env' | 'local' | 'jina' | 'alloriginsget' | 'allorigins' | 'corsproxy' | 'codetabs' | 'rss2json' | 'cache';
  error?: string;
  origin: 'page' | 'sw';
}

export class OpenHorizonDB extends Dexie {
  feeds!: Table<Feed, string>;
  folders!: Table<Folder, string>;
  articles!: Table<Article, string>;
  settings!: Table<SettingRow, string>;
  syncLog!: Table<SyncLogEntry, number>;
  deletedArticles!: Table<DeletedArticle, [string, string]>;

  constructor() {
    super(DB_NAME);
    // Index strings are defined once in migrations.ts (ARCHITECTURE §2.1).
    this.version(1).stores(STORES_V1);
    this.version(2).stores(STORES_V2);
  }
}
