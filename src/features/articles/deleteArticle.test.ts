import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import type { Article, Feed } from '@/db/schema';
import { resetFailureMemory } from '@/lib/proxy/failureMemory';
import { syncFeed, type SyncFeedContext } from '@/features/sync/syncFeed';
import { deleteArticle, restoreArticle } from './articleActions';

const FEED_URL = 'https://example.com/feed.xml';
const CTX: SyncFeedContext = { origin: 'page', retention: 200 };
const DAY = Date.UTC(2024, 0, 1);

let handler: (url: string, init?: RequestInit) => Response | Promise<Response>;

function rss(items: string[]): string {
  const body = items
    .map(
      (guid) =>
        `<item><title>Item ${guid}</title><link>https://example.com/${guid}</link>` +
        `<guid>${guid}</guid><pubDate>${new Date(DAY + 86_400_000).toUTCString()}</pubDate></item>`,
    )
    .join('');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Site</title><link>https://example.com</link>${body}</channel></rss>`;
}

function feedRow(over: Partial<Feed> = {}): Feed {
  return {
    id: 'f1',
    url: FEED_URL,
    title: 'Feed',
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

function article(guid: string, over: Partial<Article> = {}): Article {
  return {
    id: `id-${guid}`,
    feedId: 'f1',
    guid,
    link: `https://example.com/${guid}`,
    title: `Item ${guid}`,
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

async function guidsInFeed(feedId = 'f1'): Promise<string[]> {
  return (await db.articles.where('feedId').equals(feedId).toArray()).map((a) => a.guid).sort();
}

beforeEach(async () => {
  resetFailureMemory();
  vi.stubEnv('VITE_CORS_PROXY', '');
  handler = () => new Response('nope', { status: 404 });
  vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => handler(String(input), init)));
  await Promise.all([
    db.feeds.clear(),
    db.articles.clear(),
    db.syncLog.clear(),
    db.settings.clear(),
    db.deletedArticles.clear(),
  ]);
  await db.feeds.add(feedRow());
  await db.articles.bulkAdd([article('g1'), article('g2')]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('deleteArticle', () => {
  it('removes the row and writes a tombstone in one step, returning the removed row', async () => {
    const removed = await deleteArticle('id-g1');

    expect(removed?.guid).toBe('g1');
    expect(removed?.title).toBe('Item g1');
    expect(await guidsInFeed()).toEqual(['g2']);
    const tomb = await db.deletedArticles.get(['f1', 'g1']);
    expect(tomb).toMatchObject({ feedId: 'f1', guid: 'g1' });
    expect(typeof tomb?.deletedAt).toBe('number');
  });

  it('returns null and writes nothing for an unknown id', async () => {
    expect(await deleteArticle('missing')).toBeNull();
    expect(await db.deletedArticles.count()).toBe(0);
    expect(await guidsInFeed()).toEqual(['g1', 'g2']);
  });

  it('a sync after the delete does not re-insert the article', async () => {
    await deleteArticle('id-g1');
    handler = () => new Response(rss(['g1', 'g2', 'g3']));

    const result = await syncFeed((await db.feeds.get('f1'))!, CTX);

    expect(result.status).toBe('ok');
    expect(result.newArticles.map((a) => a.guid)).toEqual(['g3']);
    expect(await guidsInFeed()).toEqual(['g2', 'g3']);
    expect(await db.articles.where('[feedId+guid]').equals(['f1', 'g1']).count()).toBe(0);
  });

  it('still does not re-insert after several syncs', async () => {
    await deleteArticle('id-g2');
    handler = () => new Response(rss(['g1', 'g2']));
    const feed = (await db.feeds.get('f1'))!;

    await syncFeed(feed, CTX);
    await syncFeed(feed, CTX);

    expect(await guidsInFeed()).toEqual(['g1']);
  });
});

describe('restoreArticle (undo)', () => {
  it('re-adds the exact row and removes the tombstone', async () => {
    const removed = await deleteArticle('id-g1');
    expect(removed).not.toBeNull();

    expect(await restoreArticle(removed!)).toBe(true);

    expect(await db.deletedArticles.get(['f1', 'g1'])).toBeUndefined();
    const back = await db.articles.get('id-g1');
    expect(back).toEqual(removed);
    expect(await guidsInFeed()).toEqual(['g1', 'g2']);
  });

  it('lets the next sync keep the restored article without duplicating it', async () => {
    const removed = await deleteArticle('id-g1');
    await restoreArticle(removed!);
    handler = () => new Response(rss(['g1', 'g2']));

    const result = await syncFeed((await db.feeds.get('f1'))!, CTX);

    expect(result.insertedCount).toBe(0);
    expect(await guidsInFeed()).toEqual(['g1', 'g2']);
  });

  it('refuses to restore into a feed that no longer exists', async () => {
    const removed = await deleteArticle('id-g1');
    await db.feeds.delete('f1');

    expect(await restoreArticle(removed!)).toBe(false);
    expect(await db.articles.get('id-g1')).toBeUndefined();
  });
});
