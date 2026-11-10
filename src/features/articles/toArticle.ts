import type { Article } from '@/db/schema';
import type { ParsedItem } from '@/lib/parser/types';

/** Build an Article row from a parsed item. Shared by sync and manual (pasted XML) imports. */
export function toArticle(feedId: string, item: ParsedItem, fetchedAt: number): Article {
  const article: Article = {
    id: crypto.randomUUID(),
    feedId,
    guid: item.guid,
    link: item.link,
    title: item.title,
    summary: item.summary,
    contentRaw: item.contentRaw,
    publishedAt: item.publishedAt ?? fetchedAt,
    fetchedAt,
    isRead: 0,
    isReadLater: 0,
    isFavorite: 0,
  };
  if (item.author) article.author = item.author;
  if (item.thumbnailUrl) article.thumbnailUrl = item.thumbnailUrl;
  if (item.enclosures.length > 0) article.enclosures = item.enclosures;
  return article;
}
