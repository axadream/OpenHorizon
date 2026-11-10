import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverFeeds } from './discoverFeeds';
import { resetFailureMemory } from '@/lib/proxy/failureMemory';

const RSS = '<?xml version="1.0"?><rss version="2.0"><channel><title>Site Feed</title><link>https://example.com</link><item><title>One</title><link>https://example.com/1</link><guid>1</guid></item></channel></rss>';

const requested: string[] = [];

beforeEach(() => {
  resetFailureMemory();
  requested.length = 0;
  vi.stubEnv('VITE_CORS_PROXY', '');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requested.push(url);
      if (url === 'https://example.com/feed.xml') return new Response(RSS, { headers: { 'content-type': 'text/xml' } });
      return new Response('not found', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('discoverFeeds with feed-reader schemes', () => {
  it('treats feed:// as https and finds the feed directly', async () => {
    const out = await discoverFeeds('feed://example.com/feed.xml');
    expect(out).toEqual([{ url: 'https://example.com/feed.xml', title: 'Site Feed', kind: 'rss2', source: 'direct', verified: true }]);
    expect(requested[0]).toBe('https://example.com/feed.xml');
  });

  it('unwraps web+rss: around an https address', async () => {
    const out = await discoverFeeds('web+rss:https://example.com/feed.xml');
    expect(out[0]?.url).toBe('https://example.com/feed.xml');
    expect(requested[0]).toBe('https://example.com/feed.xml');
  });

  it('rejects a feed-scheme prefix with nothing after it', async () => {
    await expect(discoverFeeds('feed:')).rejects.toThrow('Enter a valid web address');
  });
});
