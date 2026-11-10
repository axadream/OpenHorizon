import { db } from '@/db/db';
import type { Article } from '@/db/schema';
import { computeGuid } from '@/features/articles/dedup';
import { fetchReadable } from '@/features/reader/readability';
import { truncate } from '@/lib/text';
import { hostname, normalizeArticleUrl } from '@/lib/url';
import { ensureList } from './lists';

/** The page is already saved. `articleId` is the existing row, which the caller can open. */
export class DuplicateSavedPageError extends Error {
  readonly feedId: string;
  readonly articleId: string;

  constructor(feedId: string, articleId: string) {
    super('This page is already saved');
    this.name = 'DuplicateSavedPageError';
    this.feedId = feedId;
    this.articleId = articleId;
  }
}

export type SavePageStep = 'fetching' | 'saving';

export interface SavePageOptions {
  signal?: AbortSignal;
  onProgress?(step: SavePageStep): void;
}

/**
 * Save the readable text of a web page as an article in the "Saved pages" list. Duplicates (same
 * [feedId+guid]) throw DuplicateSavedPageError. Saving a page that was deleted before clears its
 * tombstone, so the save is not hidden. Fetch and extraction errors propagate (ReadabilityError
 * 'no-content' when the page has no article text).
 */
export async function savePageAsArticle(url: string, opts: SavePageOptions = {}): Promise<Article> {
  const requested = normalizeArticleUrl(url.trim());
  const list = await ensureList('saved');

  // Cheap pre-check on the address the user typed, before any network work.
  const requestedGuid = computeGuid({ link: requested, title: '', publishedAt: null });
  const early = await db.articles.where('[feedId+guid]').equals([list.id, requestedGuid]).first();
  if (early) throw new DuplicateSavedPageError(list.id, early.id);

  opts.onProgress?.('fetching');
  const page = await fetchReadable(requested, opts.signal);
  opts.onProgress?.('saving');

  const link = normalizeArticleUrl(page.finalUrl || requested);
  const title = page.title || hostname(link) || link;
  const guid = computeGuid({ link, title, publishedAt: null });
  const now = Date.now();
  const article: Article = {
    id: crypto.randomUUID(),
    feedId: list.id,
    guid,
    link,
    title,
    summary: page.excerpt || truncate(page.textContent, 280),
    contentRaw: page.contentHtml,
    fullContent: page.contentHtml,
    fullContentAt: now,
    publishedAt: now,
    fetchedAt: now,
    isRead: 0,
    isReadLater: 0,
    isFavorite: 0,
  };
  if (page.byline) article.author = page.byline;
  if (page.leadImage) article.thumbnailUrl = page.leadImage;

  await db.transaction('rw', db.feeds, db.articles, db.deletedArticles, async () => {
    const clash = await db.articles.where('[feedId+guid]').equals([list.id, guid]).first();
    if (clash) throw new DuplicateSavedPageError(list.id, clash.id);
    await db.deletedArticles.delete([list.id, guid]);
    await db.articles.add(article);
  });
  return article;
}
