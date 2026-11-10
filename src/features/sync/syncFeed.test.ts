import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import type { Article, Feed } from '@/db/schema';
import { resetFailureMemory } from '@/lib/proxy/failureMemory';
import { syncFeed, type SyncFeedContext } from './syncFeed';

const URL_FEED = 'https://example.com/feed.xml';
const CTX: SyncFeedContext = { origin: 'page', retention: 200 };
const DAY = Date.UTC(2024, 0, 1);

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;
let fetchMock: ReturnType<typeof vi.fn>;

function rss(title: string, items: Array<{ guid: string; title?: string; day?: number }>): string {
  const body = items
    .map(
      (i) =>
        `<item><title>${i.title ?? `Item ${i.guid}`}</title><link>https://example.com/${i.guid}</link>` +
        `<guid>${i.guid}</guid><pubDate>${new Date(DAY + (i.day ?? 1) * 86_400_000).toUTCString()}</pubDate></item>`,
    )
    .join('');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><link>https://example.com</link>${body}</channel></rss>`;
}

function feedRow(over: Partial<Feed> = {}): Feed {
  return {
    id: 'f1',
    url: URL_FEED,
    title: 'Old title',
    folderId: null,
    sortOrder: 1,
    isFavorite: 0,
    manual: 0,
    errorCount: 0,
    titleCustomized: 0,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

async function seedFeed(over: Partial<Feed> = {}): Promise<Feed> {
  const row = feedRow(over);
  await db.feeds.add(row);
  return row;
}

async function reloadFeed(id: string): Promise<Feed> {
  const row = await db.feeds.get(id);
  if (!row) throw new Error(`feed ${id} missing`);
  return row;
}

function article(over: Partial<Article> & Pick<Article, 'guid'>): Article {
  return {
    id: crypto.randomUUID(),
    feedId: 'f1',
    link: '',
    title: over.guid,
    summary: '',
    contentRaw: '',
    publishedAt: DAY,
    fetchedAt: DAY,
    isRead: 0,
    isReadLater: 0,
    isFavorite: 0,
    ...over,
  };
}

beforeEach(async () => {
  resetFailureMemory();
  vi.stubEnv('VITE_CORS_PROXY', '');
  handler = () => new Response('nope', { status: 404 });
  fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal('fetch', fetchMock);
  await Promise.all([db.feeds.clear(), db.articles.clear(), db.syncLog.clear(), db.settings.clear()]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('syncFeed', () => {
  it('imports the first fetch, stores metadata and the etag, and logs the run', async () => {
    const feed = await seedFeed();
    handler = () =>
      new Response(rss('Site Feed', [{ guid: 'g1' }, { guid: 'g2' }]), { headers: { etag: '"v1"' } });

    const result = await syncFeed(feed, CTX);

    expect(result.status).toBe('ok');
    expect(result.via).toBe('direct');
    expect(result.newArticles).toEqual([]); // initial import is not "new"
    expect(result.insertedCount).toBe(2);
    expect(await db.articles.where('feedId').equals('f1').count()).toBe(2);

    const after = await reloadFeed('f1');
    expect(after.title).toBe('Site Feed');
    expect(after.etag).toBe('"v1"');
    expect(after.errorCount).toBe(0);
    expect(after.lastError).toBeNull();
    expect(after.lastSuccessAt).toBeGreaterThan(0);
    expect(after.faviconUrl).toContain('google.com/s2/favicons');

    const logs = await db.syncLog.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ feedId: 'f1', status: 'ok', newCount: 2, via: 'direct', origin: 'page' });
  });

  it('reports only articles inserted after the first successful sync as new', async () => {
    const feed = await seedFeed({ lastSuccessAt: 1 });
    handler = () => new Response(rss('Site Feed', [{ guid: 'g1' }, { guid: 'g2' }]));
    const first = await syncFeed(feed, CTX);
    expect(first.newArticles.map((a) => a.guid).sort()).toEqual(['g1', 'g2']);

    handler = () => new Response(rss('Site Feed', [{ guid: 'g1' }, { guid: 'g2' }, { guid: 'g3', day: 5 }]));
    const second = await syncFeed(await reloadFeed('f1'), CTX);
    expect(second.newArticles.map((a) => a.guid)).toEqual(['g3']);
    expect(await db.articles.where('feedId').equals('f1').count()).toBe(3);
  });

  it('dedupes repeated guids within one fetch and against stored articles', async () => {
    const feed = await seedFeed({ lastSuccessAt: 1 });
    await db.articles.add(article({ feedId: 'f1', guid: 'g1' }));
    handler = () => new Response(rss('Site Feed', [{ guid: 'g1' }, { guid: 'g2' }, { guid: 'g2', title: 'dup' }]));

    const result = await syncFeed(feed, CTX);

    expect(result.newArticles.map((a) => a.guid)).toEqual(['g2']);
    expect(await db.articles.where('feedId').equals('f1').count()).toBe(2);
  });

  it('handles 304 with the stored etag and keeps the articles', async () => {
    const feed = await seedFeed({ etag: '"v1"', lastSuccessAt: 1, errorCount: 2 });
    await db.articles.add(article({ feedId: 'f1', guid: 'g1' }));
    let sentIfNoneMatch: string | undefined;
    handler = (_url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      sentIfNoneMatch = headers?.['If-None-Match'];
      return new Response(null, { status: 304 });
    };

    const result = await syncFeed(feed, CTX);

    expect(sentIfNoneMatch).toBe('"v1"');
    expect(result.status).toBe('notModified');
    expect(result.newArticles).toEqual([]);
    const after = await reloadFeed('f1');
    expect(after.errorCount).toBe(0);
    expect(after.lastSuccessAt).toBeGreaterThan(1);
    expect(await db.articles.count()).toBe(1);
    expect((await db.syncLog.toArray())[0]?.status).toBe('notModified');
  });

  it('records failures on the feed without throwing or touching articles', async () => {
    const feed = await seedFeed({ lastSuccessAt: 1 });
    await db.articles.add(article({ feedId: 'f1', guid: 'g1' }));
    handler = () => new Response('server error', { status: 500 });

    const result = await syncFeed(feed, CTX);

    expect(result.status).toBe('error');
    expect(result.error).toContain('direct: HTTP 500');
    const after = await reloadFeed('f1');
    expect(after.errorCount).toBe(1);
    expect(after.lastError).toContain('HTTP 500');
    expect(after.lastFetchedAt).toBeGreaterThan(0);
    expect(await db.articles.count()).toBe(1);

    const [log] = await db.syncLog.toArray();
    expect(log).toMatchObject({ status: 'error', origin: 'page' });
  });

  it('treats unparseable content as a failure', async () => {
    const feed = await seedFeed();
    handler = () => new Response('<html><body>not a feed</body></html>', { status: 200 });

    const result = await syncFeed(feed, CTX);

    expect(result.status).toBe('error');
    expect((await reloadFeed('f1')).errorCount).toBe(1);
  });

  it('never fetches manual feeds', async () => {
    const feed = await seedFeed({ manual: 1, url: 'manual:abc' });
    const result = await syncFeed(feed, CTX);
    expect(result.status).toBe('notModified');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a user-renamed title', async () => {
    const feed = await seedFeed({ title: 'My name', titleCustomized: 1, lastSuccessAt: 1 });
    handler = () => new Response(rss('Upstream name', [{ guid: 'g1' }]));
    await syncFeed(feed, CTX);
    expect((await reloadFeed('f1')).title).toBe('My name');
  });

  it('prunes the feed to the retention limit, keeping the newest', async () => {
    const feed = await seedFeed({ lastSuccessAt: 1 });
    handler = () =>
      new Response(rss('Site Feed', [{ guid: 'g1', day: 1 }, { guid: 'g2', day: 2 }, { guid: 'g3', day: 3 }]));

    await syncFeed(feed, { ...CTX, retention: 2 });

    const guids = (await db.articles.where('feedId').equals('f1').toArray()).map((a) => a.guid).sort();
    expect(guids).toEqual(['g2', 'g3']);
  });
});
