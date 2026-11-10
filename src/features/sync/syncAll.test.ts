import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import type { Article, Feed } from '@/db/schema';
import { setSetting } from '@/features/settings/settings';
import { resetFailureMemory } from '@/lib/proxy/failureMemory';
import { isInBackoff, syncAll, SYNC_CONCURRENCY } from './syncAll';

const HOUR = 3_600_000;
const BASE = Date.UTC(2024, 0, 1);

type Handler = (url: string) => Response | Promise<Response>;
let handler: Handler;
let fetchMock: ReturnType<typeof vi.fn>;

function rss(title: string, items: Array<{ guid: string; title?: string; publishedAt?: number }>): string {
  const body = items
    .map(
      (i) =>
        `<item><title>${i.title ?? `Item ${i.guid}`}</title><link>https://example.com/${i.guid}</link>` +
        `<guid>${i.guid}</guid><pubDate>${new Date(i.publishedAt ?? BASE).toUTCString()}</pubDate></item>`,
    )
    .join('');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><link>https://example.com</link>${body}</channel></rss>`;
}

function feedRow(over: Partial<Feed> & Pick<Feed, 'id' | 'url'>): Feed {
  return {
    title: over.url,
    folderId: null,
    sortOrder: 1,
    isFavorite: 0,
    manual: 0,
    errorCount: 0,
    titleCustomized: 0,
    createdAt: 1,
    updatedAt: 1,
    lastSuccessAt: 1,
    ...over,
  };
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

beforeEach(async () => {
  resetFailureMemory();
  vi.stubEnv('VITE_CORS_PROXY', '');
  handler = () => new Response('nope', { status: 404 });
  fetchMock = vi.fn((input: string | URL | Request) => handler(String(input)));
  vi.stubGlobal('fetch', fetchMock);
  await Promise.all([db.feeds.clear(), db.articles.clear(), db.syncLog.clear(), db.settings.clear()]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe('isInBackoff', () => {
  const now = 10 * 24 * HOUR;
  it('is off below 5 errors', () => {
    expect(isInBackoff({ errorCount: 4, lastFetchedAt: now - 1000 }, now)).toBe(false);
  });
  it('lasts 6 h after 5 errors and 24 h after 10', () => {
    expect(isInBackoff({ errorCount: 5, lastFetchedAt: now - 1 * HOUR }, now)).toBe(true);
    expect(isInBackoff({ errorCount: 5, lastFetchedAt: now - 7 * HOUR }, now)).toBe(false);
    expect(isInBackoff({ errorCount: 10, lastFetchedAt: now - 7 * HOUR }, now)).toBe(true);
    expect(isInBackoff({ errorCount: 10, lastFetchedAt: now - 25 * HOUR }, now)).toBe(false);
  });
});

describe('syncAll', () => {
  it('runs at most SYNC_CONCURRENCY fetches at once and reports progress', async () => {
    expect(SYNC_CONCURRENCY).toBe(4);
    let inFlight = 0;
    let maxInFlight = 0;
    handler = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return new Response(rss('T', [{ guid: 'g1' }]));
    };

    const feeds = Array.from({ length: 10 }, (_, i) => feedRow({ id: `f${i}`, url: `https://f${i}.test/feed.xml` }));
    await db.feeds.bulkAdd(feeds);

    const progress: Array<[number, number]> = [];
    const result = await syncAll({ onProgress: (done, total) => progress.push([done, total]) });

    expect(maxInFlight).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(result.results).toHaveLength(10);
    expect(result.errorCount).toBe(0);
    expect(progress.at(-1)).toEqual([10, 10]);
  });

  it('skips feeds under backoff unless forced', async () => {
    const now = Date.now();
    await db.feeds.bulkAdd([
      feedRow({ id: 'recent', url: 'https://a.test/feed', errorCount: 5, lastFetchedAt: now - 1 * HOUR }),
      feedRow({ id: 'stale', url: 'https://b.test/feed', errorCount: 5, lastFetchedAt: now - 7 * HOUR }),
      feedRow({ id: 'daily', url: 'https://c.test/feed', errorCount: 10, lastFetchedAt: now - 7 * HOUR }),
    ]);
    handler = () => new Response(rss('T', [{ guid: 'g1' }]));

    const normal = await syncAll();
    expect(normal.results.map((r) => r.feedId)).toEqual(['stale']);
    expect(normal.skipped).toBe(2);

    const forced = await syncAll({ force: true });
    expect(forced.results.map((r) => r.feedId).sort()).toEqual(['daily', 'recent', 'stale']);
    expect(forced.skipped).toBe(0);
  });

  it('writes one syncLog row per fetched feed and stamps lastSyncAt', async () => {
    await db.feeds.bulkAdd([
      feedRow({ id: 'a', url: 'https://a.test/feed' }),
      feedRow({ id: 'b', url: 'https://b.test/feed' }),
    ]);
    handler = (url) => (url.startsWith('https://a.test') ? new Response(rss('A', [{ guid: 'x' }])) : new Response('nope', { status: 500 }));

    const result = await syncAll();

    const logs = await db.syncLog.toArray();
    expect(logs.map((l) => l.feedId).sort()).toEqual(['a', 'b']);
    expect(logs.find((l) => l.feedId === 'a')?.status).toBe('ok');
    expect(logs.find((l) => l.feedId === 'b')?.status).toBe('error');
    expect(logs.every((l) => l.origin === 'page')).toBe(true);
    expect(result.errorCount).toBe(1);
    expect(await db.settings.get('lastSyncAt')).toEqual({ key: 'lastSyncAt', value: result.finishedAt });
  });

  it('prunes each feed to the retentionPerFeed setting', async () => {
    await setSetting('retentionPerFeed', 100);
    await db.feeds.add(feedRow({ id: 'f1', url: 'https://a.test/feed' }));
    const seeded: Article[] = Array.from({ length: 101 }, (_, i) => ({
      id: `seed-${i}`,
      feedId: 'f1',
      guid: `seed-${i}`,
      link: '',
      title: 'seed',
      summary: '',
      contentRaw: '',
      publishedAt: BASE + i * 1000,
      fetchedAt: BASE,
      isRead: 1,
      isReadLater: 0,
      isFavorite: 0,
    }));
    await db.articles.bulkAdd(seeded);
    handler = () => new Response(rss('A', [{ guid: 'fresh', publishedAt: Date.now() }]));

    await syncAll();

    expect(await db.articles.where('feedId').equals('f1').count()).toBe(100);
    expect(await db.articles.filter((a) => a.guid === 'fresh').count()).toBe(1);
  });

  it('returns the same running promise for overlapping calls', async () => {
    await db.feeds.add(feedRow({ id: 'a', url: 'https://a.test/feed' }));
    handler = () => new Response(rss('A', [{ guid: 'x' }]));
    const first = syncAll();
    const second = syncAll();
    expect(second).toBe(first);
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('calls onProgress once per finished feed, and never when there is nothing to sync', async () => {
    handler = () => new Response(rss('T', [{ guid: 'g1' }]));
    await db.feeds.bulkAdd([
      feedRow({ id: 'p1', url: 'https://p1.test/feed.xml' }),
      feedRow({ id: 'p2', url: 'https://p2.test/feed.xml' }),
      feedRow({ id: 'p3', url: 'https://p3.test/feed.xml' }),
    ]);
    const calls: Array<[number, number]> = [];
    await syncAll({ onProgress: (done, total) => calls.push([done, total]) });
    expect(calls).toHaveLength(3);
    expect(calls.map(([done]) => done).sort()).toEqual([1, 2, 3]);
    expect(calls.every(([, total]) => total === 3)).toBe(true);

    await db.feeds.clear();
    const empty: Array<[number, number]> = [];
    await syncAll({ onProgress: (done, total) => empty.push([done, total]) });
    expect(empty).toHaveLength(0);
  });

  describe('notifications for new articles', () => {
    let showNotification: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      showNotification = vi.fn(async () => undefined);
      vi.stubGlobal('Notification', { permission: 'granted' });
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { ready: Promise.resolve({ showNotification }) },
      });
      await setSetting('notificationsEnabled', true);
      await db.feeds.bulkAdd([
        feedRow({ id: 'fav', url: 'https://fav.test/feed', isFavorite: 1, lastSuccessAt: 1 }),
        feedRow({ id: 'plain', url: 'https://plain.test/feed', isFavorite: 0, lastSuccessAt: 1 }),
      ]);
      handler = (url) =>
        url.startsWith('https://fav.test')
          ? new Response(rss('Fav', [{ guid: 'fav-1', title: 'Fav article' }]))
          : new Response(rss('Plain', [{ guid: 'plain-1', title: 'Plain article' }]));
    });

    it('notifies about favorite feeds only, grouped by tag, when the page is hidden', async () => {
      setVisibility('hidden');

      const result = await syncAll();

      expect(result.newArticles.map((a) => a.title).sort()).toEqual(['Fav article', 'Plain article']);
      expect(showNotification).toHaveBeenCalledTimes(1);
      const [title, options] = showNotification.mock.calls[0] as [string, { tag: string; data: { url: string } }];
      expect(title).toBe('Fav article');
      expect(options.tag).toBe('feed-fav');
      expect(options.data.url).toMatch(/^\/\?article=/);
    });

    it('stays quiet while the page is visible', async () => {
      setVisibility('visible');
      await syncAll();
      expect(showNotification).not.toHaveBeenCalled();
    });

    it('does nothing when notifications are off', async () => {
      setVisibility('hidden');
      await setSetting('notificationsEnabled', false);
      await syncAll();
      expect(showNotification).not.toHaveBeenCalled();
    });
  });
});
