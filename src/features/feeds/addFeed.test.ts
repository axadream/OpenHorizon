import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import type { Article, Feed, Folder } from '@/db/schema';
import { resetFailureMemory } from '@/lib/proxy/failureMemory';
import { parseOpml } from '@/lib/opml/parseOpml';
import { AlreadySubscribedError, addFeedFromUrl, addManualFeedFromXml, importOpml } from './addFeed';
import { createFolder, deleteFolder, moveFeedToFolder, renameFolder } from './folders';
import { removeFeed, restoreFeed } from './removeFeed';
import { faviconCandidates, initialFaviconUrl } from './favicon';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Site Feed</title><link>https://example.com</link><description>D</description><item><title>One</title><link>https://example.com/1</link><guid>g1</guid></item></channel></rss>`;

beforeEach(async () => {
  resetFailureMemory();
  vi.stubEnv('VITE_CORS_PROXY', '');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === 'https://example.com/feed.xml' ? new Response(RSS) : new Response('nope', { status: 404 }),
    ),
  );
  await Promise.all([db.feeds.clear(), db.folders.clear(), db.articles.clear(), db.syncLog.clear()]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function feedRow(over: Partial<Feed> & Pick<Feed, 'id' | 'url'>): Feed {
  return { title: over.url, folderId: null, sortOrder: 1, isFavorite: 0, manual: 0, errorCount: 0, titleCustomized: 0, createdAt: 1, updatedAt: 1, ...over };
}

describe('addFeedFromUrl', () => {
  it('subscribes to a feed URL and stores the parsed title', async () => {
    const feed = await addFeedFromUrl('example.com/feed.xml');
    expect(feed.url).toBe('https://example.com/feed.xml');
    expect(feed.title).toBe('Site Feed');
    expect(feed.errorCount).toBe(0);
    expect(feed.manual).toBe(0);
    expect(await db.feeds.count()).toBe(1);
  });

  it('throws AlreadySubscribedError on duplicates', async () => {
    await addFeedFromUrl('https://example.com/feed.xml');
    const err = await addFeedFromUrl('https://example.com/feed.xml').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AlreadySubscribedError);
    expect(await db.feeds.count()).toBe(1);
  });

  it('reports the steps in order through onProgress', async () => {
    const steps: string[] = [];
    await addFeedFromUrl('https://example.com/feed.xml', { onProgress: (s) => steps.push(s) });
    expect(steps).toEqual(['checking', 'fetching', 'parsing', 'saving']);
  });
});

describe('addManualFeedFromXml', () => {
  it('reports parsing then saving through onProgress', async () => {
    const steps: string[] = [];
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>P</title><item><title>A</title><guid>a</guid></item></channel></rss>`;
    await addManualFeedFromXml(xml, { onProgress: (s) => steps.push(s) });
    expect(steps).toEqual(['parsing', 'saving']);
  });

  it('stores the feed as manual and writes its articles', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Pasted</title>
      <item><title>First</title><link>https://pasted.test/1</link><guid>p1</guid></item>
      <item><title>Second</title><link>https://pasted.test/2</link><guid>p2</guid></item>
    </channel></rss>`;
    const feed = await addManualFeedFromXml(xml);
    expect(feed.manual).toBe(1);
    expect(feed.lastSuccessAt).toBeTypeOf('number');
    expect(await db.articles.where('feedId').equals(feed.id).count()).toBe(2);
  });
});

describe('importOpml', () => {
  it('creates folders, skips existing feeds and reports progress', async () => {
    await db.feeds.add(feedRow({ id: 'x', url: 'https://existing.test/rss' }));
    const opml = parseOpml(`<opml><body>
      <outline text="Tech"><outline text="Apple"><outline xmlUrl="https://a.test/rss" text="A" htmlUrl="https://a.test/"/></outline></outline>
      <outline xmlUrl="https://existing.test/rss" text="Already"/>
      <outline xmlUrl="https://b.test/rss" text="B"/>
    </body></opml>`);

    const progress: Array<[number, number]> = [];
    const syncFeeds = vi.fn(async (_ids: string[]) => undefined);
    const summary = await importOpml(opml, {
      fetchNow: true,
      syncFeeds,
      onProgress: (d, t) => progress.push([d, t]),
    });

    expect(summary.added).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.foldersCreated).toBe(2);
    expect(progress.at(-1)).toEqual([3, 3]);
    expect(progress).toHaveLength(3);
    expect(syncFeeds).toHaveBeenCalledWith(summary.addedFeedIds);

    const folders = await db.folders.toArray();
    expect(folders.map((f: Folder) => f.name).sort()).toEqual(['Tech', 'Tech / Apple']);
    const a = await db.feeds.where('url').equals('https://a.test/rss').first();
    const apple = folders.find((f) => f.name === 'Tech / Apple');
    expect(a?.folderId).toBe(apple?.id);
    expect(a?.faviconUrl).toContain('google.com/s2/favicons');
    const b = await db.feeds.where('url').equals('https://b.test/rss').first();
    expect(b?.folderId).toBeNull();
  });

  it('honours the selected list', async () => {
    const opml = parseOpml(`<opml><body><outline xmlUrl="https://a.test/rss" text="A"/><outline xmlUrl="https://b.test/rss" text="B"/></body></opml>`);
    const s = await importOpml(opml, { selected: ['https://b.test/rss'] });
    expect(s.added).toBe(1);
    expect((await db.feeds.toArray()).map((f) => f.url)).toEqual(['https://b.test/rss']);
  });
});

describe('removeFeed and restoreFeed', () => {
  it('deletes the feed and its articles, and restores both on undo', async () => {
    await db.feeds.add(feedRow({ id: 'f', url: 'https://c.test/rss', title: 'C' }));
    const article: Article = {
      id: 'art1', feedId: 'f', guid: 'g', link: '', title: 'T', summary: '', contentRaw: '',
      publishedAt: 1, fetchedAt: 1, isRead: 0, isReadLater: 0, isFavorite: 0,
    };
    await db.articles.add(article);
    await db.syncLog.add({ feedId: 'f', startedAt: 1, finishedAt: 2, status: 'ok', newCount: 1, via: 'direct', origin: 'page' });

    const snap = await removeFeed('f');
    expect(snap?.articles).toHaveLength(1);
    expect(await db.feeds.count()).toBe(0);
    expect(await db.articles.count()).toBe(0);
    expect(await db.syncLog.count()).toBe(0);

    await restoreFeed(snap!);
    expect(await db.feeds.count()).toBe(1);
    expect(await db.articles.count()).toBe(1);
  });

  it('returns null for an unknown feed', async () => {
    expect(await removeFeed('nope')).toBeNull();
  });
});

describe('folders', () => {
  it('createFolder returns the existing folder for the same name, ignoring case and spacing', async () => {
    const a = await createFolder('  News ');
    const b = await createFolder('news');
    expect(b.id).toBe(a.id);
    expect(await db.folders.count()).toBe(1);
  });

  it('renameFolder rejects a clash, deleteFolder unfiles its feeds', async () => {
    const f1 = await createFolder('One');
    await createFolder('Two');
    await expect(renameFolder(f1.id, 'two')).rejects.toThrow();

    await db.feeds.add(feedRow({ id: 'x', url: 'https://x.test/rss', folderId: f1.id }));
    expect(await deleteFolder(f1.id)).toBe(1);
    expect((await db.feeds.get('x'))?.folderId).toBeNull();
  });

  it('moveFeedToFolder moves a feed', async () => {
    const f = await createFolder('Dest');
    await db.feeds.add(feedRow({ id: 'y', url: 'https://y.test/rss' }));
    await moveFeedToFolder('y', f.id);
    expect((await db.feeds.get('y'))?.folderId).toBe(f.id);
  });
});

describe('favicon helpers', () => {
  it('lists the parsed icon first, then Google and DuckDuckGo for the host', () => {
    expect(faviconCandidates({ url: 'https://news.test/rss', siteUrl: 'https://news.test/' }, 'https://news.test/favicon.png')).toEqual([
      'https://news.test/favicon.png',
      'https://www.google.com/s2/favicons?domain=news.test&sz=64',
      'https://icons.duckduckgo.com/ip3/news.test.ico',
    ]);
  });

  it('uses the parsed icon only when it looks like a site icon', () => {
    const feed = { url: 'https://news.test/rss' };
    expect(initialFaviconUrl(feed, 'https://news.test/static/logo.png')).toBe('https://news.test/static/logo.png');
    expect(initialFaviconUrl(feed, 'https://news.test/banner-wide.jpg')).toContain('google.com/s2/favicons');
  });

  it('returns undefined for manual feeds without an icon', () => {
    expect(initialFaviconUrl({ url: 'manual:123' })).toBeUndefined();
  });
});
