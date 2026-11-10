import Dexie from 'dexie';
import { db } from '@/db/db';
import type { Article, Feed, SyncLogEntry } from '@/db/schema';
import { dedupeWithinFetch } from '@/features/articles/dedup';
import { pruneFeed } from '@/features/articles/retention';
import { toArticle } from '@/features/articles/toArticle';
import { initialFaviconUrl } from '@/features/feeds/favicon';
import { parseFeed } from '@/lib/parser/parseFeed';
import type { ParsedFeed } from '@/lib/parser/types';
import { FetchAllFailedError, fetchWithProxy, type FetchResult } from '@/lib/proxy/fetchWithProxy';
import { ensureXmlEnv } from '@/lib/xml/dom';

/** Sync log rows kept per feed (ARCHITECTURE §8.1). */
export const SYNC_LOG_KEEP = 50;

export interface SyncFeedContext {
  origin: 'page' | 'sw';
  signal?: AbortSignal;
  /** Articles kept per feed after the sync (retention setting). */
  retention: number;
}

export interface SyncFeedResult {
  feedId: string;
  status: 'ok' | 'notModified' | 'error';
  /**
   * Articles inserted by this run that should trigger notifications.
   * Empty on the first successful sync of a feed (initial import is not "new").
   */
  newArticles: Article[];
  /** Articles inserted by this run, including the initial import. */
  insertedCount: number;
  error?: string;
  via?: FetchResult['via'];
}

function describeError(err: unknown): string {
  if (err instanceof FetchAllFailedError) {
    const detail = err.attempts.map((a) => `${a.via}: ${a.error}`).join('; ');
    return detail ? `${err.message} (${detail})` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

function lastAttemptVia(err: unknown): FetchResult['via'] {
  if (err instanceof FetchAllFailedError) return err.attempts.at(-1)?.via ?? 'direct';
  return 'direct';
}

/** Feed-row fields that come from HTTP response headers (only present when the hop passes them). */
function headerPatch(res: FetchResult): Partial<Feed> {
  const patch: Partial<Feed> = {};
  if (res.etag) patch.etag = res.etag;
  if (res.lastModified) patch.lastModified = res.lastModified;
  return patch;
}

async function writeLog(entry: SyncLogEntry): Promise<void> {
  try {
    await db.syncLog.add(entry);
    const stale = await db.syncLog
      .where('[feedId+startedAt]')
      .between([entry.feedId, Dexie.minKey], [entry.feedId, Dexie.maxKey])
      .reverse()
      .offset(SYNC_LOG_KEEP)
      .primaryKeys();
    if (stale.length > 0) await db.syncLog.bulkDelete(stale);
  } catch {
    // Logging must never turn a successful sync into a failure.
  }
}

async function recordFailure(feed: Feed, ctx: SyncFeedContext, startedAt: number, err: unknown): Promise<SyncFeedResult> {
  const message = describeError(err);
  const via = lastAttemptVia(err);
  const finishedAt = Date.now();
  try {
    await db.transaction('rw', db.feeds, async () => {
      const current = await db.feeds.get(feed.id);
      if (!current) return;
      await db.feeds.update(feed.id, {
        lastFetchedAt: finishedAt,
        lastError: message,
        errorCount: current.errorCount + 1,
        updatedAt: finishedAt,
      });
    });
  } catch {
    // Fall through: the result still reports the error to the caller.
  }
  await writeLog({ feedId: feed.id, startedAt, finishedAt, status: 'error', newCount: 0, via, error: message, origin: ctx.origin });
  return { feedId: feed.id, status: 'error', newArticles: [], insertedCount: 0, error: message, via };
}

/**
 * Fetch, parse and store one feed. Never throws: failures are recorded on the feed
 * (lastError, errorCount) and in syncLog, and returned as status 'error'.
 */
export async function syncFeed(feed: Feed, ctx: SyncFeedContext): Promise<SyncFeedResult> {
  const startedAt = Date.now();
  if (feed.manual === 1) return { feedId: feed.id, status: 'notModified', newArticles: [], insertedCount: 0 };

  try {
    await ensureXmlEnv();
    const res = await fetchWithProxy(feed.url, {
      etag: feed.etag,
      lastModified: feed.lastModified,
      signal: ctx.signal,
    });

    if (res.status === 304) {
      const finishedAt = Date.now();
      await db.transaction('rw', db.feeds, async () => {
        const current = await db.feeds.get(feed.id);
        if (!current) return;
        await db.feeds.update(feed.id, {
          ...headerPatch(res),
          lastFetchedAt: finishedAt,
          lastSuccessAt: finishedAt,
          lastError: null,
          errorCount: 0,
          updatedAt: finishedAt,
        });
      });
      await writeLog({ feedId: feed.id, startedAt, finishedAt, status: 'notModified', newCount: 0, via: res.via, origin: ctx.origin });
      return { feedId: feed.id, status: 'notModified', newArticles: [], insertedCount: 0, via: res.via };
    }

    const parsed: ParsedFeed = parseFeed(res.text, res.finalUrl || feed.url);
    const items = dedupeWithinFetch(parsed.items);
    const now = Date.now();

    // Written inside the transaction callback; an object keeps TypeScript from narrowing the flags.
    const state: { inserted: Article[]; feedGone: boolean; initialImport: boolean } = {
      inserted: [],
      feedGone: false,
      initialImport: true,
    };

    await db.transaction('rw', db.articles, db.feeds, db.deletedArticles, async () => {
      const current = await db.feeds.get(feed.id);
      if (!current) {
        state.feedGone = true;
        return;
      }
      state.initialImport = current.lastSuccessAt === undefined;

      const keys: [string, string][] = items.map((i) => [feed.id, i.guid]);
      const existing = new Set(
        (await db.articles.where('[feedId+guid]').anyOf(keys).keys()).map((k) => (k as unknown as [string, string])[1]),
      );
      // Articles the user deleted stay deleted: their tombstones are skipped (ARCHITECTURE §2.5).
      const tombstones = await db.deletedArticles.bulkGet(keys);
      const deleted = new Set(keys.filter((_, i) => tombstones[i] !== undefined).map((k) => k[1]));
      state.inserted = items
        .filter((i) => !existing.has(i.guid) && !deleted.has(i.guid))
        .map((i) => toArticle(feed.id, i, now));
      if (state.inserted.length > 0) await db.articles.bulkAdd(state.inserted);

      const patch: Partial<Feed> = {
        ...headerPatch(res),
        lastFetchedAt: now,
        lastSuccessAt: now,
        lastError: null,
        errorCount: 0,
        updatedAt: now,
      };
      if (!current.titleCustomized && parsed.title) patch.title = parsed.title;
      if (parsed.siteUrl) patch.siteUrl = parsed.siteUrl;
      if (parsed.language) patch.language = parsed.language;
      if (!current.faviconUrl) {
        const favicon = initialFaviconUrl({ siteUrl: patch.siteUrl ?? current.siteUrl, url: current.url }, parsed.iconUrl);
        if (favicon) patch.faviconUrl = favicon;
      }
      await db.feeds.update(feed.id, patch);
    });

    if (state.feedGone) return { feedId: feed.id, status: 'notModified', newArticles: [], insertedCount: 0 };

    await pruneFeed(feed.id, ctx.retention);
    const finishedAt = Date.now();
    await writeLog({
      feedId: feed.id,
      startedAt,
      finishedAt,
      status: 'ok',
      newCount: state.inserted.length,
      via: res.via,
      origin: ctx.origin,
    });

    return {
      feedId: feed.id,
      status: 'ok',
      newArticles: state.initialImport ? [] : state.inserted,
      insertedCount: state.inserted.length,
      via: res.via,
    };
  } catch (err) {
    if (ctx.signal?.aborted) {
      return { feedId: feed.id, status: 'error', newArticles: [], insertedCount: 0, error: 'aborted' };
    }
    return recordFailure(feed, ctx, startedAt, err);
  }
}
