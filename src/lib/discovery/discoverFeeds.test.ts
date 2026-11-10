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
      { url: 'https://example.com/feed.xml', title: 'Blog RSS', kind: 'rss2', source: 'link-tag', verified: true },
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
    expect(out).toEqual([{ url: 'https://example.com/feed', title: 'Site Feed', kind: 'rss2', source: 'well-known', verified: true }]);
  });

  it('keeps unparseable link tags as unverified when no probe succeeds', async () => {
    routes['https://example.com/'] = {
      body: `<html><head><link rel="alternate" type="application/rss+xml" href="/broken"></head></html>`,
    };
    routes['https://example.com/broken'] = { body: HTML_NO_FEEDS };
    const out = await discoverFeeds('https://example.com/');
    expect(out).toEqual([{ url: 'https://example.com/broken', title: undefined, source: 'link-tag', verified: false }]);
  });

  it('finds feed-looking anchors', async () => {
    routes['https://example.com/'] = { body: `<html><body><a href="/index.xml">RSS</a><a href="/about">About</a></body></html>` };
    routes['https://example.com/index.xml'] = { body: RSS };
    const out = await discoverFeeds('https://example.com/');
    expect(out).toEqual([{ url: 'https://example.com/index.xml', title: 'RSS', kind: 'rss2', source: 'anchor', verified: true }]);
  });

  it('returns the input itself when it is already a feed', async () => {
    routes['https://example.com/feed.xml'] = { body: RSS };
    const out = await discoverFeeds('example.com/feed.xml');
    expect(out).toEqual([{ url: 'https://example.com/feed.xml', title: 'Site Feed', kind: 'rss2', source: 'direct', verified: true }]);
  });

  it('finds relative .xml anchors by their text and skips stylesheet links', async () => {
    routes['https://www1.cbn.com/rss-feeds'] = {
      body: `<html><body><link rel="stylesheet" href="/style.css"><a href="/style.css">x</a><a href="rss-cbn-news-US.xml">US News</a></body></html>`,
    };
    const out = await discoverFeeds('https://www1.cbn.com/rss-feeds', { validate: false });
    const usNews = out.find((c) => c.url === 'https://www1.cbn.com/rss-cbn-news-US.xml');
    expect(usNews).toEqual({ url: 'https://www1.cbn.com/rss-cbn-news-US.xml', title: 'US News', source: 'anchor' });
    expect(out.some((c) => c.url.endsWith('.css'))).toBe(false);
  });

  it('keeps unverified candidates when every probe fails', async () => {
    routes['https://example.com/'] = {
      body: `<html><head><link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml"></head></html>`,
    };
    // Every other URL (feed probes and proxies) answers 404 through the mocked fetch.
    const out = await discoverFeeds('https://example.com/');
    expect(out).toEqual([{ url: 'https://example.com/feed.xml', title: 'Blog', source: 'link-tag', verified: false }]);
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

  it('validates at most 12 relative anchors, returns the verified ones first and offers the rest unverified', async () => {
    const PAGE = 'https://www1.cbn.com/rss-feeds';
    const names = Array.from({ length: 15 }, (_, i) => `rss-cbn-news-${i + 1}.xml`);
    const html = `<!DOCTYPE html><html><body>${names.map((n, i) => `<a href="${n}">CBN feed ${i + 1}</a>`).join('')}</body></html>`;
    // The page is served the way a jina-style reader returns it; the origin itself is blocked.
    routes[PAGE] = { body: html };
    routes[`https://r.jina.ai/${PAGE}`] = { body: html };
    for (const i of [1, 2, 3]) routes[`https://www1.cbn.com/rss-cbn-news-${i}.xml`] = { body: RSS };

    const onProgress = vi.fn();
    const out = await discoverFeeds(PAGE, { onProgress });

    const first3 = [1, 2, 3].map((i) => `https://www1.cbn.com/rss-cbn-news-${i}.xml`);
    expect(out.slice(0, 3).map((c) => c.url)).toEqual(first3);
    expect(out.slice(0, 3).every((c) => c.verified === true && c.source === 'anchor')).toBe(true);
    expect(out.slice(3).every((c) => c.verified === false)).toBe(true);

    // Probe fetches per candidate: only candidates 1..12 are ever requested.
    const probed = new Set<number>();
    for (const call of vi.mocked(fetch).mock.calls) {
      const m = /rss-cbn-news-(\d+)\.xml/.exec(String(call[0]));
      if (m) probed.add(Number(m[1]));
    }
    expect(probed.size).toBeLessThanOrEqual(12);
    expect([...probed].every((i) => i <= 12)).toBe(true);

    expect(onProgress).toHaveBeenCalledWith(1, 2, 'Fetching page');
    expect(onProgress).toHaveBeenCalledWith(2, 14, 'Reading links');
    expect(onProgress).toHaveBeenLastCalledWith(14, 14, 'Checking feeds');
  });

  it('rejects an invalid address', async () => {
    await expect(discoverFeeds('   ')).rejects.toThrow();
  });
});
