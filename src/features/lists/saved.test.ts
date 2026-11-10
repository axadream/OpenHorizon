import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithProxy } = vi.hoisted(() => ({ fetchWithProxy: vi.fn() }));
vi.mock('@/lib/proxy/fetchWithProxy', () => ({ fetchWithProxy }));

import { db } from '@/db/db';
import { ReadabilityError } from '@/features/reader/readability';
import { ensureList } from './lists';
import { DuplicateSavedPageError, savePageAsArticle } from './saved';

const PARAGRAPH =
  'Engineers reopened the bridge after a long inspection, confirming that the new bearings had settled correctly. ' +
  'Traffic is expected to build slowly over the weekend as drivers return to their usual routes across the valley. ' +
  'The council thanked residents for their patience and promised a full report at the next public meeting.';

const PAGE = `<!doctype html><html lang="en"><head><title>Bridge reopens</title>
<meta name="author" content="Sam Reporter"><meta property="og:image" content="https://cdn.example.com/bridge.jpg">
</head><body>
<nav><a href="/">Home</a></nav>
<article><h1>Bridge reopens</h1><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p></article>
<footer>Footer text here.</footer></body></html>`;

const THIN_PAGE = '<!doctype html><html><body><p>Menu</p><p>Login</p></body></html>';
const URL_IN = 'https://example.com/news/bridge?utm_source=mail';
const URL_CLEAN = 'https://example.com/news/bridge';

beforeEach(async () => {
  fetchWithProxy.mockReset();
  fetchWithProxy.mockResolvedValue({ status: 200, text: PAGE, finalUrl: URL_CLEAN, via: 'direct' });
  await db.articles.clear();
  await db.feeds.clear();
  await db.deletedArticles.clear();
});

describe('savePageAsArticle', () => {
  it('creates the Saved pages list and inserts the extracted article', async () => {
    const article = await savePageAsArticle(URL_IN);

    const list = await db.feeds.filter((f) => f.listKind === 'saved').first();
    expect(list).toBeDefined();
    expect(list?.manual).toBe(1);
    expect(list?.title).toBe('Saved pages');
    expect(article.feedId).toBe(list?.id);
    expect(article.link).toBe(URL_CLEAN);
    expect(article.guid).toBe(URL_CLEAN);
    expect(article.title).toBe('Bridge reopens');
    expect(article.author).toBe('Sam Reporter');
    expect(article.thumbnailUrl).toBe('https://cdn.example.com/bridge.jpg');
    expect(article.fullContent).toBe(article.contentRaw);
    expect(article.fullContent).toContain('new bearings');
    expect(article.summary.length).toBeGreaterThan(0);

    const stored = await db.articles.where('[feedId+guid]').equals([list!.id, URL_CLEAN]).first();
    expect(stored?.id).toBe(article.id);
  });

  it('rejects a second save of the same page and reports the existing article', async () => {
    const first = await savePageAsArticle(URL_IN);
    const err = await savePageAsArticle(URL_IN).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DuplicateSavedPageError);
    expect((err as DuplicateSavedPageError).articleId).toBe(first.id);
    // The pre-check answers from the database, so the page is not fetched again.
    expect(fetchWithProxy).toHaveBeenCalledTimes(1);
    expect(await db.articles.count()).toBe(1);
  });

  it('clears a tombstone left by an earlier delete so the save is kept', async () => {
    const list = await ensureList('saved');
    await db.deletedArticles.put({ feedId: list.id, guid: URL_CLEAN, deletedAt: 5 });

    await savePageAsArticle(URL_IN);

    expect(await db.deletedArticles.get([list.id, URL_CLEAN])).toBeUndefined();
    expect(await db.articles.where('feedId').equals(list.id).count()).toBe(1);
  });

  it('fails with ReadabilityError("no-content") and stores nothing for a page without article text', async () => {
    fetchWithProxy.mockResolvedValue({ status: 200, text: THIN_PAGE, finalUrl: URL_CLEAN, via: 'direct' });
    const err = await savePageAsArticle(URL_IN).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReadabilityError);
    expect((err as ReadabilityError).reason).toBe('no-content');
    expect(await db.articles.count()).toBe(0);
  });

  it('reports progress steps and passes the abort signal to the fetch', async () => {
    const steps: string[] = [];
    const controller = new AbortController();
    await savePageAsArticle(URL_IN, { signal: controller.signal, onProgress: (s) => steps.push(s) });
    expect(steps).toEqual(['fetching', 'saving']);
    expect(fetchWithProxy).toHaveBeenCalledWith(URL_CLEAN, expect.objectContaining({ expectHtml: true, signal: controller.signal }));
  });
});
