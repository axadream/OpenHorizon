import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import type { AiArticleCache, Article } from '@/db/schema';
import { pruneFeed } from '@/features/articles/retention';
import { prepareArticleText, MAX_AI_CHARS } from './articleText';
import { buildAiCache, clearAiCache, isAiCacheValid, writeAiCache } from './cache';

function cacheFor(hash: string, lang = 'en'): AiArticleCache {
  return {
    summary: 'Summary.',
    takeaways: ['One'],
    tags: ['tag'],
    provider: 'heuristic',
    model: '',
    privacy: 'on-device',
    lang,
    at: 1,
    hash,
  };
}

function row(id: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    feedId: 'f1',
    guid: `guid-${id}`,
    link: 'https://example.com/a',
    title: id,
    summary: 'Short summary.',
    contentRaw: '<p>The original feed text of the article, long enough to matter.</p>',
    publishedAt: Date.UTC(2026, 0, 1),
    fetchedAt: 0,
    isRead: 0,
    isReadLater: 0,
    isFavorite: 0,
    ...overrides,
  };
}

describe('prepareArticleText', () => {
  it('uses the feed text, or the full article when it is stored', () => {
    const feedOnly = prepareArticleText(row('a'));
    expect(feedOnly.body).toContain('original feed text');

    const full = prepareArticleText(row('a', { fullContent: '<p>The full article text from the web page.</p>' }));
    expect(full.body).toContain('full article text');
    expect(full.body).not.toContain('original feed text');
  });

  it('changes the hash when the full text changes, so a cached summary is invalidated', () => {
    const before = prepareArticleText(row('a', { fullContent: '<p>First version of the text.</p>' }));
    const same = prepareArticleText(row('a', { fullContent: '<p>First version of the text.</p>' }));
    const after = prepareArticleText(row('a', { fullContent: '<p>Second version of the text.</p>' }));
    expect(same.hash).toBe(before.hash);
    expect(after.hash).not.toBe(before.hash);
  });

  it('caps the text at 12,000 characters and says so', () => {
    const long = `<p>${'word '.repeat(4000)}</p>`;
    const prepared = prepareArticleText(row('a', { contentRaw: long }));
    expect(prepared.truncated).toBe(true);
    expect(prepared.body.length).toBeLessThanOrEqual(MAX_AI_CHARS);
    expect(MAX_AI_CHARS).toBe(12_000);
  });

  it('falls back to the summary when there is no body text', () => {
    expect(prepareArticleText(row('a', { contentRaw: '' })).body).toBe('Short summary.');
  });
});

describe('isAiCacheValid', () => {
  it('reuses the cache only for the same text hash and UI language', () => {
    const cache = cacheFor('h1', 'en');
    expect(isAiCacheValid(cache, 'h1', 'en')).toBe(true);
    expect(isAiCacheValid(cache, 'h2', 'en')).toBe(false);
    expect(isAiCacheValid(cache, 'h1', 'ro')).toBe(false);
  });

  it('is false with no cache and for an empty result', () => {
    expect(isAiCacheValid(undefined, 'h1', 'en')).toBe(false);
    expect(isAiCacheValid({ ...cacheFor('h1'), summary: '', takeaways: [] }, 'h1', 'en')).toBe(false);
  });

  it('builds an entry that records the hash, language and time', () => {
    const entry = buildAiCache(
      { summary: 'S', takeaways: ['a'], tags: ['t'], provider: 'heuristic', model: '', privacy: 'on-device' },
      'hh',
      'he',
      42,
    );
    expect(entry).toMatchObject({ hash: 'hh', lang: 'he', at: 42, summary: 'S' });
  });
});

describe('article cache in Dexie', () => {
  beforeEach(async () => {
    await db.articles.clear();
  });

  it('writes and clears the cached summary on the article row', async () => {
    await db.articles.add(row('c1'));
    await writeAiCache('c1', cacheFor('h1'));
    expect((await db.articles.get('c1'))?.ai?.hash).toBe('h1');

    await clearAiCache('c1');
    expect((await db.articles.get('c1'))?.ai).toBeUndefined();
  });

  it('keeps articles with a cached summary when the feed is pruned, like favorites', async () => {
    await db.articles.bulkAdd([
      row('old-ai', { publishedAt: Date.UTC(2025, 0, 1), ai: cacheFor('h') }),
      row('old-plain', { publishedAt: Date.UTC(2025, 0, 2) }),
      row('new-1', { publishedAt: Date.UTC(2026, 0, 3) }),
      row('new-2', { publishedAt: Date.UTC(2026, 0, 4) }),
    ].map((r) => ({ ...r, feedId: 'retain' })));

    await pruneFeed('retain', 2);

    const left = (await db.articles.where('feedId').equals('retain').primaryKeys()).sort();
    expect(left).toEqual(['new-1', 'new-2', 'old-ai']);
  });
});
