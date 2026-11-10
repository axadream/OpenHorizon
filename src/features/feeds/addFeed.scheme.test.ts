import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { resetFailureMemory } from '@/lib/proxy/failureMemory';
import { addFeedFromUrl } from './addFeed';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Scheme Feed</title><link>https://example.com</link><item><title>One</title><link>https://example.com/1</link><guid>g1</guid></item></channel></rss>`;

beforeEach(async () => {
  resetFailureMemory();
  vi.stubEnv('VITE_CORS_PROXY', '');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url === 'https://example.com/feed.xml' ? new Response(RSS) : new Response('nope', { status: 404 }))),
  );
  await Promise.all([db.feeds.clear(), db.folders.clear(), db.articles.clear(), db.syncLog.clear()]);
});

describe('addFeedFromUrl with feed-reader schemes', () => {
  it('subscribes to a feed:// address as https', async () => {
    const feed = await addFeedFromUrl('feed://example.com/feed.xml');
    expect(feed.url).toBe('https://example.com/feed.xml');
    expect(feed.title).toBe('Scheme Feed');
  });

  it('subscribes to a web+rss: address', async () => {
    const feed = await addFeedFromUrl('web+rss:https://example.com/feed.xml');
    expect(feed.url).toBe('https://example.com/feed.xml');
  });

  it('treats the scheme-wrapped address as the same subscription (duplicate detection)', async () => {
    await addFeedFromUrl('https://example.com/feed.xml');
    await expect(addFeedFromUrl('feed:https://example.com/feed.xml')).rejects.toThrow('Already subscribed');
  });
});
