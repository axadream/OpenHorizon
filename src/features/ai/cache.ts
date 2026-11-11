import { db } from '@/db/db';
import type { AiArticleCache } from '@/db/schema';
import type { ProviderResult } from './types';

/*
 * The AI cache lives on the article row (Article.ai, unindexed). A cached result is reused only when
 * the source text hash and the UI language both match. Invalidation is therefore automatic when the
 * text changes, and loadFullArticle also clears the field explicitly.
 */

/** True when the cached entry was made from this exact source text in this language. */
export function isAiCacheValid(cache: AiArticleCache | undefined, hash: string, lang: string): boolean {
  if (!cache) return false;
  // Results of the retired Transformers.js engine (provider 'transformers') have no label any more.
  if (cache.provider === 'transformers') return false;
  if (cache.hash !== hash || cache.lang !== lang) return false;
  return cache.summary.length > 0 || cache.takeaways.length > 0;
}

/** Cache entry for a fresh result. */
export function buildAiCache(
  result: Pick<ProviderResult, 'summary' | 'takeaways' | 'tags' | 'provider' | 'model' | 'privacy'>,
  hash: string,
  lang: string,
  at: number = Date.now(),
): AiArticleCache {
  return {
    summary: result.summary,
    takeaways: [...result.takeaways],
    tags: [...result.tags],
    provider: result.provider,
    model: result.model,
    privacy: result.privacy,
    lang,
    at,
    hash,
  };
}

/** Store the entry on the article row. */
export async function writeAiCache(articleId: string, cache: AiArticleCache): Promise<void> {
  await db.articles.where(':id').equals(articleId).modify((a) => {
    a.ai = cache;
  });
}

/** Remove the cached entry (used when the user asks for a fresh run and when the text changes). */
export async function clearAiCache(articleId: string): Promise<void> {
  await db.articles.where(':id').equals(articleId).modify((a) => {
    delete a.ai;
  });
}
