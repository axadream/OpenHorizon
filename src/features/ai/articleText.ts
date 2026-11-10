import type { Article } from '@/db/schema';
import { fnv1a32 } from '@/lib/hash';
import { cleanText } from '@/lib/text';

/** Longest article text sent to a model (characters). */
export const MAX_AI_CHARS = 12_000;

export interface PreparedText {
  /** Plain text, capped at maxChars. Empty when the article has no text. */
  body: string;
  /** True when the text was cut to maxChars. */
  truncated: boolean;
  /** fnv1a32 of the full cleaned text (not just the cap), so any change to the source invalidates the cache. */
  hash: string;
}

type ArticleTextSource = Pick<Article, 'summary' | 'contentRaw' | 'fullContent'>;

/**
 * Source text of an article as plain text: fullContent when present, otherwise contentRaw, otherwise
 * the summary. Markup and entities are removed with the shared text helpers.
 */
export function prepareArticleText(article: ArticleTextSource, maxChars: number = MAX_AI_CHARS): PreparedText {
  const source = article.fullContent?.trim() ? article.fullContent : article.contentRaw;
  let plain = cleanText(source);
  if (!plain) plain = cleanText(article.summary);
  const truncated = plain.length > maxChars;
  const body = truncated ? plain.slice(0, maxChars).trimEnd() : plain;
  return { body, truncated, hash: fnv1a32(plain) };
}
