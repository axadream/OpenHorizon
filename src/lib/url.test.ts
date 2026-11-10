import { describe, expect, it } from 'vitest';
import { hostname, normalizeArticleUrl, normalizeFeedUrl, resolveUrl, unwrapFeedScheme, withWebScheme } from './url';

describe('unwrapFeedScheme', () => {
  it('turns feed:// and rss:// into https URLs', () => {
    expect(unwrapFeedScheme('feed://example.com/feed.xml')).toBe('https://example.com/feed.xml');
    expect(unwrapFeedScheme('  FEED://example.com/rss  ')).toBe('https://example.com/rss');
    expect(unwrapFeedScheme('rss://example.com')).toBe('https://example.com');
  });

  it('unwraps feed:<url> and web+rss:<url> keeping the inner scheme', () => {
    expect(unwrapFeedScheme('feed:https://example.com/a.xml')).toBe('https://example.com/a.xml');
    expect(unwrapFeedScheme('feed:http://example.com/a.xml')).toBe('http://example.com/a.xml');
    expect(unwrapFeedScheme('web+rss:https://example.com/rss')).toBe('https://example.com/rss');
    expect(unwrapFeedScheme('web+rss://example.com/rss')).toBe('https://example.com/rss');
  });

  it('assumes https for a bare host after the prefix', () => {
    expect(unwrapFeedScheme('web+rss:example.com/rss')).toBe('https://example.com/rss');
  });

  it('returns the input unchanged when there is no feed scheme', () => {
    expect(unwrapFeedScheme('  https://example.com/x  ')).toBe('https://example.com/x');
    expect(unwrapFeedScheme('example.com/feed')).toBe('example.com/feed');
    expect(unwrapFeedScheme('feeds.example.com/rss')).toBe('feeds.example.com/rss');
  });

  it('returns empty string when the prefix has nothing after it', () => {
    expect(unwrapFeedScheme('feed:')).toBe('');
    expect(unwrapFeedScheme('web+rss://   ')).toBe('');
    expect(unwrapFeedScheme('')).toBe('');
  });
});

describe('withWebScheme', () => {
  it('adds https:// to a bare address and keeps explicit schemes', () => {
    expect(withWebScheme('example.com/feed.xml')).toBe('https://example.com/feed.xml');
    expect(withWebScheme('http://example.com')).toBe('http://example.com');
    expect(withWebScheme('feed://example.com/feed.xml')).toBe('https://example.com/feed.xml');
    expect(withWebScheme('web+rss:example.com')).toBe('https://example.com');
  });

  it('returns empty string for empty input', () => {
    expect(withWebScheme('   ')).toBe('');
    expect(withWebScheme('feed:')).toBe('');
  });
});

describe('resolveUrl', () => {
  it('resolves relative references against a base', () => {
    expect(resolveUrl('../a.png', 'https://x.test/b/c/d.html')).toBe('https://x.test/b/a.png');
    expect(resolveUrl('  /feed  ', 'https://x.test/blog/')).toBe('https://x.test/feed');
  });

  it('returns empty string for empty, invalid, or non-http(s) input', () => {
    expect(resolveUrl('')).toBe('');
    expect(resolveUrl(undefined)).toBe('');
    expect(resolveUrl('javascript:alert(1)', 'https://x.test/')).toBe('');
    expect(resolveUrl('data:text/plain,hi', 'https://x.test/')).toBe('');
    expect(resolveUrl('/relative-without-base')).toBe('');
  });
});

describe('hostname', () => {
  it('returns the lowercase host or empty string', () => {
    expect(hostname('https://Blog.Example.COM/feed')).toBe('blog.example.com');
    expect(hostname('not a url')).toBe('');
    expect(hostname(undefined)).toBe('');
  });
});

describe('normalizeFeedUrl', () => {
  it('lowercases the host, drops hash, utm params and trailing slashes', () => {
    expect(normalizeFeedUrl('HTTPS://Example.com/feed/?utm_source=x&a=1#top')).toBe('https://example.com/feed?a=1');
    expect(normalizeFeedUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('returns invalid input trimmed', () => {
    expect(normalizeFeedUrl('  nope  ')).toBe('nope');
  });
});

describe('normalizeArticleUrl', () => {
  it('removes the fragment and utm_* params but keeps other query params', () => {
    expect(normalizeArticleUrl('https://x.test/p?utm_medium=email&id=9#comments')).toBe('https://x.test/p?id=9');
  });
});
