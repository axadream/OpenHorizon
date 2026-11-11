import { db } from '@/db/db';
import type { Feed } from '@/db/schema';
import { dedupeWithinFetch } from '@/features/articles/dedup';
import { toArticle } from '@/features/articles/toArticle';
import type { OpmlResult } from '@/lib/opml/parseOpml';
import { fetchWithProxy } from '@/lib/proxy/fetchWithProxy';
import { parseFeed } from '@/lib/parser/parseFeed';
import type { ParsedFeed } from '@/lib/parser/types';
import { detectLanguage, normalizeLanguageTag, sampleFeedText } from '@/lib/lang/detectLanguage';
import { hostname, normalizeFeedUrl, withWebScheme } from '@/lib/url';
import { initialFaviconUrl } from './favicon';
import { createFolder } from './folders';

export class AlreadySubscribedError extends Error {
  readonly url: string;
  readonly feedId: string;

  constructor(url: string, feedId: string) {
    super(`Already subscribed to ${url}`);
    this.name = 'AlreadySubscribedError';
    this.url = url;
    this.feedId = feedId;
  }
}

/** Steps reported while a feed is added (URL and pasted XML). */
export type AddFeedStep = 'checking' | 'fetching' | 'parsing' | 'saving';

export interface AddFeedOptions {
  folderId?: string | null;
  signal?: AbortSignal;
  onProgress?: (step: AddFeedStep) => void;
}

async function assertNotSubscribed(url: string): Promise<void> {
  const existing = await db.feeds.where('url').equals(url).first();
  if (existing) throw new AlreadySubscribedError(url, existing.id);
}

/**
 * Create the feed row. Items are not stored here: the first sync imports them
 * (etag and lastSuccessAt stay unset so the scheduler fetches the feed in full).
 */
function buildFeed(url: string, parsed: ParsedFeed, folderId: string | null, now: number): Feed {
  const siteUrl = parsed.siteUrl || undefined;
  const feed: Feed = {
    id: crypto.randomUUID(),
    url,
    title: parsed.title || hostname(url) || url,
    folderId,
    sortOrder: now,
    isFavorite: 0,
    manual: 0,
    errorCount: 0,
    lastError: null,
    titleCustomized: 0,
    createdAt: now,
    updatedAt: now,
  };
  if (siteUrl) feed.siteUrl = siteUrl;
  if (parsed.description) feed.description = parsed.description;
  const declared = normalizeLanguageTag(parsed.language);
  if (declared) {
    feed.language = declared;
    feed.languageDetected = 0;
  } else {
    const detected = detectLanguage(sampleFeedText(parsed.items));
    if (detected) {
      feed.language = detected;
      feed.languageDetected = 1;
    }
  }
  const favicon = initialFaviconUrl({ siteUrl, url }, parsed.iconUrl);
  if (favicon) feed.faviconUrl = favicon;
  return feed;
}

/** Insert in one transaction so a concurrent duplicate cannot slip past the check. */
async function insertFeed(feed: Feed): Promise<Feed> {
  await db.transaction('rw', db.feeds, async () => {
    const existing = await db.feeds.where('url').equals(feed.url).first();
    if (existing) throw new AlreadySubscribedError(feed.url, existing.id);
    await db.feeds.add(feed);
  });
  return feed;
}

/**
 * Subscribe to a feed URL. Throws AlreadySubscribedError on duplicates and the
 * parser's NotAFeedError (or FetchAllFailedError) when the URL is not a usable feed.
 */
export async function addFeedFromUrl(input: string, opts: AddFeedOptions = {}): Promise<Feed> {
  const requested = normalizeFeedUrl(withWebScheme(input));
  opts.onProgress?.('checking');
  await assertNotSubscribed(requested);

  opts.onProgress?.('fetching');
  const res = await fetchWithProxy(requested, { signal: opts.signal });
  opts.onProgress?.('parsing');
  const parsed = await parseFeed(res.text, res.finalUrl);

  const canonical = normalizeFeedUrl(res.finalUrl || requested);
  const feed = buildFeed(canonical, parsed, opts.folderId ?? null, Date.now());
  opts.onProgress?.('saving');
  return insertFeed(feed);
}

/**
 * Subscribe to pasted XML with no source URL. Stored as a manual feed that is never synced;
 * its items are written once here, since the sync scheduler skips manual feeds.
 */
export async function addManualFeedFromXml(
  xml: string,
  opts: { folderId?: string | null; onProgress?: (step: AddFeedStep) => void } = {},
): Promise<Feed> {
  opts.onProgress?.('parsing');
  const parsed = parseFeed(xml, '');
  const id = crypto.randomUUID();
  const now = Date.now();
  const feed = buildFeed(`manual:${id}`, parsed, opts.folderId ?? null, now);
  feed.id = id;
  feed.manual = 1;
  feed.lastSuccessAt = now;
  feed.lastFetchedAt = now;

  const articles = dedupeWithinFetch(parsed.items).map((item) => toArticle(id, item, now));
  opts.onProgress?.('saving');
  await db.transaction('rw', db.feeds, db.articles, async () => {
    await db.feeds.add(feed);
    if (articles.length > 0) await db.articles.bulkAdd(articles);
  });
  return feed;
}

export interface ImportOptions {
  /** xmlUrl values of the feeds to import. Default: all. */
  selected?: readonly string[];
  /** When true, call syncFeeds with the newly added feed ids. */
  fetchNow?: boolean;
  /** Injected sync entry point (syncAll from features/sync) so this module stays independent of it. */
  syncFeeds?: (feedIds: string[]) => Promise<unknown>;
  onProgress?: (done: number, total: number) => void;
}

export interface ImportSummary {
  added: number;
  skipped: number;
  foldersCreated: number;
  addedFeedIds: string[];
}

/** Import parsed OPML: create missing folders, insert feeds not already subscribed. */
export async function importOpml(result: OpmlResult, opts: ImportOptions = {}): Promise<ImportSummary> {
  const selected = opts.selected ? new Set(opts.selected) : null;
  const wanted = result.feeds.filter((f) => !selected || selected.has(f.xmlUrl));
  const total = wanted.length;

  const existingUrls = new Set((await db.feeds.toArray()).map((f) => f.url));
  const foldersBefore = new Set((await db.folders.toArray()).map((f) => f.name.toLocaleLowerCase()));

  const folderIdByName = new Map<string, string>();
  const addedIds: string[] = [];
  const now = Date.now();
  let foldersCreated = 0;
  let skipped = 0;
  let done = 0;

  const ensureFolder = async (name: string): Promise<string> => {
    const cached = folderIdByName.get(name);
    if (cached) return cached;
    const folder = await createFolder(name);
    const key = folder.name.toLocaleLowerCase();
    if (!foldersBefore.has(key)) {
      foldersCreated++;
      foldersBefore.add(key);
    }
    folderIdByName.set(name, folder.id);
    return folder.id;
  };

  // Create folders first: all OPML folders when importing everything, otherwise only the
  // folders of the selected feeds.
  const folderNames = opts.selected
    ? [...new Set(wanted.map((f) => f.folder).filter((n): n is string => !!n))]
    : result.folders;
  for (const name of folderNames) await ensureFolder(name);

  for (const f of wanted) {
    let url: string;
    try {
      url = normalizeFeedUrl(f.xmlUrl);
    } catch {
      url = f.xmlUrl;
    }

    if (existingUrls.has(url)) {
      skipped++;
    } else {
      existingUrls.add(url);

      const folderId = f.folder ? await ensureFolder(f.folder) : null;

      const siteUrl = f.htmlUrl || undefined;
      const feed: Feed = {
        id: crypto.randomUUID(),
        url,
        title: f.title || hostname(url) || url,
        folderId,
        sortOrder: now + addedIds.length,
        isFavorite: 0,
        manual: 0,
        errorCount: 0,
        lastError: null,
        titleCustomized: 0,
        createdAt: now,
        updatedAt: now,
      };
      if (siteUrl) feed.siteUrl = siteUrl;
      const favicon = initialFaviconUrl({ siteUrl, url });
      if (favicon) feed.faviconUrl = favicon;

      await db.feeds.add(feed);
      addedIds.push(feed.id);
    }

    done++;
    opts.onProgress?.(done, total);
  }

  if (opts.fetchNow && opts.syncFeeds && addedIds.length > 0) {
    await opts.syncFeeds(addedIds);
  }

  return { added: addedIds.length, skipped, foldersCreated, addedFeedIds: addedIds };
}
