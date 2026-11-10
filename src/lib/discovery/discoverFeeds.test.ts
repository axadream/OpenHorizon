import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverFeeds } from './discoverFeeds';
import { resetFailureMemory } from '@/lib/proxy/failureMemory';

const RSS = '<?xml version="1.0"?><rss version="2.0"><channel><title>Site Feed</title><link>https://example.com</link><item><title>One</title><link>https://example.com/1</link><guid>1</guid></item></channel></rss>';
const HTML_NO_FEEDS = '<!DOCTYPE html><html><head><title>x</title></head><body><p>Hello</p></body></html>';

let routes: Record<string, { status?: number; body: string }>;

beforeEach(() => {
  resetFailureMemory();
  routes = {};
  vi.stubEnv('VITE_CORS_PROXY', '');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const r = routes[url];
      if (!r) return new Response('not found', { status: 404 });
      return new Response(r.body, { status: r.status ?? 200, headers: { 'content-type': 'text/html' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('discoverFeeds', () => {
  it('finds a link-tag feed, keeps its title and validates it', async () => {
    routes['https://example.com/blog/'] = {
      body: `<html><head><link rel="alternate" type="application/rss+xml" title="Blog RSS" href="/feed.xml"></head><body></body></html>`,
    };
    routes['https://example.com/feed.xml'] = { body: RSS };

    const out = await discoverFeeds('https://example.com/blog/');
    expect(out).toEqual([
      { url: 'https://example.com/feed.xml', title: 'Blog RSS', kind: 'rss2', source: 'link-tag' },
    ]);
  });

  it('resolves relative link hrefs against <base href>', async () => {
    routes['https://example.com/'] = {
      body: `<html><head><base href="https://example.com/news/"><link rel="alternate" type="application/atom+xml" href="rss.xml"></head></html>`,
    };
    routes['https://example.com/news/rss.xml'] = { body: RSS };

    const out = await discoverFeeds('example.com');
    expect(out.map((c) => c.url)).toEqual(['https://example.com/news/rss.xml']);
    expect(out[0]?.source).toBe('link-tag');
  });

  it('falls back to well-known paths when the page has no links', async () => {
    routes['https://example.com/'] = { body: HTML_NO_FEEDS };
    routes['https://example.com/feed'] = { body: RSS };
    const out = await discoverFeeds('https://example.com');
    expect(out).toEqual([{ url: 'https://example.com/feed', title: 'Site Feed', kind: 'rss2', source: 'well-known' }]);
  });

  it('drops link tags that do not parse as feeds', async () => {
    routes['https://example.com/'] = {
      body: `<html><head><link rel="alternate" type="application/rss+xml" href="/broken"></head></html>`,
    };
    routes['https://example.com/broken'] = { body: HTML_NO_FEEDS };
    expect(await discoverFeeds('https://example.com/')).toEqual([]);
  });

  it('finds feed-looking anchors', async () => {
    routes['https://example.com/'] = { body: `<html><body><a href="/index.xml">RSS</a><a href="/about">About</a></body></html>` };
    routes['https://example.com/index.xml'] = { body: RSS };
    const out = await discoverFeeds('https://example.com/');
    expect(out).toEqual([{ url: 'https://example.com/index.xml', title: 'Site Feed', kind: 'rss2', source: 'anchor' }]);
  });

  it('returns the input itself when it is already a feed', async () => {
    routes['https://example.com/feed.xml'] = { body: RSS };
    const out = await discoverFeeds('example.com/feed.xml');
    expect(out).toEqual([{ url: 'https://example.com/feed.xml', title: 'Site Feed', kind: 'rss2', source: 'direct' }]);
  });

  it('dedupes a well-known path that is also a link tag', async () => {
    routes['https://example.com/'] = {
      body: `<html><head><link rel="alternate" type="application/rss+xml" href="/feed"></head></html>`,
    };
    routes['https://example.com/feed'] = { body: RSS };
    const out = await discoverFeeds('https://example.com/');
    expect(out.map((c) => c.url)).toEqual(['https://example.com/feed']);
    expect(out[0]?.source).toBe('link-tag');
  });

  it('returns unvalidated candidates when validate is false', async () => {
    routes['https://example.com/'] = {
      body: `<html><head><link rel="alternate" type="application/rss+xml" href="/nope.xml"></head></html>`,
    };
    const out = await discoverFeeds('https://example.com/', { validate: false });
    expect(out[0]).toEqual({ url: 'https://example.com/nope.xml', title: undefined, source: 'link-tag' });
  });

  it('returns [] when nothing is found', async () => {
    routes['https://example.com/'] = { body: HTML_NO_FEEDS };
    expect(await discoverFeeds('https://example.com/')).toEqual([]);
  });

  it('rejects an invalid address', async () => {
    await expect(discoverFeeds('   ')).rejects.toThrow();
  });
});
