import { db } from '@/db/db';
import type { Article, Feed } from '@/db/schema';
import { getSetting, setSetting } from '@/features/settings/settings';
import { ensureXmlEnv } from '@/lib/xml/dom';
import { createLimiter } from './limit';
import { showNewArticleNotifications } from './notifications';
import { syncFeed, type SyncFeedResult } from './syncFeed';

export const SYNC_CONCURRENCY = 4;
const HOUR_MS = 3_600_000;

export interface SyncAllOptions {
  /** Limit the run to these feed ids. Default: every non-manual feed. */
  feedIds?: string[];
  /** Default 'page'. The service worker passes 'sw'. */
  origin?: 'page' | 'sw';
  signal?: AbortSignal;
  onProgress?(done: number, total: number, feedId: string): void;
  /** Ignore backoff. */
  force?: boolean;
}

export interface SyncAllResult {
  startedAt: number;
  finishedAt: number;
  results: SyncFeedResult[];
  /** Articles eligible for notifications (see SyncFeedResult.newArticles). */
  newArticles: Article[];
  errorCount: number;
  /** Feeds not fetched because they are under backoff. */
  skipped: number;
}

/**
 * Backoff (ARCHITECTURE §8.1), derived from the feed row: after 5 consecutive failures a feed
 * is skipped for 6 h since its last attempt, and for 24 h after 10 failures.
 */
export function isInBackoff(feed: Pick<Feed, 'errorCount' | 'lastFetchedAt'>, now: number = Date.now()): boolean {
  if (feed.errorCount < 5) return false;
  const windowMs = feed.errorCount >= 10 ? 24 * HOUR_MS : 6 * HOUR_MS;
  return now - (feed.lastFetchedAt ?? 0) < windowMs;
}

let running: Promise<SyncAllResult> | null = null;

/**
 * Sync feeds with at most SYNC_CONCURRENCY parallel fetches. A call made while a sync is
 * already running in this context returns the running promise instead of starting another.
 */
export function syncAll(opts: SyncAllOptions = {}): Promise<SyncAllResult> {
  if (running) return running;
  const current = runSyncAll(opts);
  running = current;
  const clear = (): void => {
    if (running === current) running = null;
  };
  current.then(clear, clear);
  return current;
}

async function loadFeeds(feedIds?: string[]): Promise<Feed[]> {
  if (!feedIds) return db.feeds.toArray();
  const rows = await db.feeds.bulkGet([...new Set(feedIds)]);
  return rows.filter((f): f is Feed => f !== undefined);
}

async function runSyncAll(opts: SyncAllOptions): Promise<SyncAllResult> {
  const origin = opts.origin ?? 'page';
  const startedAt = Date.now();
  await ensureXmlEnv();

  const retention = await getSetting('retentionPerFeed');
  const eligible = (await loadFeeds(opts.feedIds)).filter((f) => f.manual === 0);
  const due = eligible.filter((f) => opts.force || !isInBackoff(f, startedAt));
  const skipped = eligible.length - due.length;
  // Least recently fetched first, so a feed that failed earlier is not starved.
  due.sort((a, b) => (a.lastFetchedAt ?? 0) - (b.lastFetchedAt ?? 0));

  const limit = createLimiter(SYNC_CONCURRENCY);
  const total = due.length;
  let done = 0;

  const results = await Promise.all(
    due.map((feed) =>
      limit(async (): Promise<SyncFeedResult> => {
        try {
          return await syncFeed(feed, { origin, signal: opts.signal, retention });
        } finally {
          done++;
          opts.onProgress?.(done, total, feed.id);
        }
      }),
    ),
  );

  const finishedAt = Date.now();
  await setSetting('lastSyncAt', finishedAt);

  const newArticles = results.flatMap((r) => r.newArticles);
  try {
    await showNewArticleNotifications(newArticles, origin);
  } catch {
    // Notifications are best effort; the sync result is still valid.
  }

  return {
    startedAt,
    finishedAt,
    results,
    newArticles,
    errorCount: results.filter((r) => r.status === 'error').length,
    skipped,
  };
}
