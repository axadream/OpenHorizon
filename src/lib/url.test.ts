import { describe, expect, it } from 'vitest';
import { hostname, normalizeArticleUrl, normalizeFeedUrl, resolveUrl } from './url';

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
