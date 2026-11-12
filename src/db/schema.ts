import Dexie, { type Table } from 'dexie';
import { DB_NAME, STORES_V1, STORES_V2 } from './migrations';

/** IndexedDB cannot index booleans, so indexed flags are 0 | 1. */
export type Flag = 0 | 1;

/** Kind of a local list feed (Feed.listKind). */
export type ListKind = 'saved' | 'watch';

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
  /**
   * Local list feeds (manual, never synced or exported): 'saved' for saved pages, 'watch' for
   * YouTube watch lists. Unindexed, so no Dexie version bump is needed.
   */
  listKind?: ListKind;
  /**
   * BCP 47 language of the feed: declared by the feed (channel language / xml:lang), otherwise
   * detected from article text at sync time (lib/lang/detectLanguage). Undefined when unknown.
   */
  language?: string;
  /** 1 when `language` was detected from article text, not declared by the feed; 0 when declared. Unindexed. */
  languageDetected?: Flag;
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
  /**
   * Full article text fetched from the original page (sanitized HTML), set by "Load full article"
   * or by saving a page. Unindexed. Kept by retention like favorites.
   */
  fullContent?: string;
  /** When fullContent was stored (epoch ms). */
  fullContentAt?: number;
  /**
   * Cached AI summary (features/ai). Unindexed, so no Dexie version bump. Kept by retention like
   * favorites. Reused only while the source text hash and the UI language still match.
   */
  ai?: AiArticleCache;
}

/** Provider ids of the AI summary feature (Settings > AI). */
export type AiProviderId =
  | 'auto'
  | 'chrome-builtin'
  | 'openrouter'
  | 'ollama'
  | 'lmstudio'
  | 'openai'
  | 'mistral'
  | 'deepseek'
  | 'gemini'
  | 'custom';

/** AI summary stored on an article row. */
export interface AiArticleCache {
  summary: string;
  takeaways: string[];
  tags: string[];
  /** Provider id that produced the result (or 'heuristic' for the offline fallback). */
  provider: string;
  model: string;
  /** Where the text went when it was produced, shown as a badge on cached results. */
  privacy: 'on-device' | 'local' | 'cloud';
  /** UI language the result is written in (a Locale id: en, ro, he, zh-CN or custom). */
  lang: string;
  /** When it was generated (epoch ms). */
  at: number;
  /** fnv1a32 of the cleaned source text; a changed source invalidates the cache. */
  hash: string;
}

export interface Settings {
  syncFrequency: '15m' | '30m' | '1h' | 'manual';
  notificationsEnabled: boolean;
  density: 'comfortable' | 'compact';
  retentionPerFeed: 100 | 200 | 500 | 1000;
  lastSyncAt: number | null;
  onboardingDone: boolean;
  installDismissedAt: number | null;
  /** Show the unread count on the installed app icon (Badging API, where supported). */
  appBadge: boolean;
  /** When the app last asked the browser for persistent storage (retried at most every 14 days). */
  storagePersistAskedAt: number | null;
  /** Play the short synthesized chimes (sync, bookmarks, deletes, errors). Off by default. */
  soundsEnabled: boolean;
  /** Chime volume, 0..100. */
  soundVolume: number;
  /** AI summaries (Settings > AI). Off by default; see docs/AI.md. */
  aiEnabled: boolean;
  aiProvider: AiProviderId;
  /** Endpoint base URL for local and custom providers. Empty means the preset default. */
  aiBaseUrl: string;
  aiModel: string;
  /** Custom instructions. Empty means the default instructions in the interface language. */
  aiInstructions: string;
  /** Persist the API key in this browser profile. Off means the key lives in sessionStorage for this tab. */
  aiRememberKey: boolean;
  /** API key. Written to this table only while aiRememberKey is on. Never exported. */
  aiApiKey: string;
  /** Cloud consent: consent key (provider id, or custom:<host>) -> epoch ms when accepted. */
  aiCloudConsent: Record<string, number>;
  /**
   * On-device model (wllama, SmolLM2) opted in (Settings > AI). Used when the provider is
   * 'chrome-builtin' but the browser has no built-in Summarizer (phones, Safari, Firefox).
   */
  aiOnDeviceModel: boolean;
  /** Cloud service the user signed in to through OAuth ('' when none). Set on a successful sign-in, cleared on sign-out. */
  aiSignedInProvider: '' | 'openrouter';
  /** Model used by the OpenRouter sign-in provider (auto mode and the openrouter provider). */
  aiOpenRouterModel: string;
  /** Show only feeds whose language matches the app language in the feed list. Off = show all. */
  feedLanguageFilter: boolean;
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
