import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import type { Article, Feed } from '@/db/schema';
import { pruneAll, pruneFeed } from './retention';

function feed(id: string, extra: Partial<Feed> = {}): Feed {
  return {
    id,
    url: `https://${id}.test/rss`,
    title: id,
    folderId: null,
    sortOrder: 0,
    isFavorite: 0,
    manual: 0,
    errorCount: 0,
    titleCustomized: 0,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

function article(feedId: string, n: number, extra: Partial<Article> = {}): Article {
  return {
    id: `${feedId}-${n}`,
    feedId,
    guid: `g${n}`,
    link: `https://${feedId}.test/${n}`,
    title: `t${n}`,
    summary: '',
    contentRaw: '',
    publishedAt: 1_000 + n,
    fetchedAt: 1,
    isRead: 0,
    isReadLater: 0,
    isFavorite: 0,
    ...extra,
  };
}

beforeEach(async () => {
  await db.articles.clear();
  await db.feeds.clear();
  await db.deletedArticles.clear();
});

describe('retention with full articles and list feeds', () => {
  it('keeps articles whose full text was loaded, even beyond the limit', async () => {
    await db.feeds.add(feed('news'));
    await db.articles.bulkAdd([
      article('news', 1),
      article('news', 2, { fullContent: '<p>kept</p>', fullContentAt: 5 }),
      article('news', 3),
      article('news', 4),
    ]);

    const removed = await pruneFeed('news', 1);

    expect(removed).toBe(2);
    const left = (await db.articles.toArray()).map((a) => a.id).sort();
    expect(left).toEqual(['news-2', 'news-4']);
  });

  it('never prunes local list feeds', async () => {
    await db.feeds.bulkAdd([feed('news'), feed('watch', { manual: 1, listKind: 'watch', url: 'manual:watch' })]);
    await db.articles.bulkAdd([
      article('news', 1),
      article('news', 2),
      article('watch', 1),
      article('watch', 2),
      article('watch', 3),
    ]);

    const removed = await pruneAll(1);

    expect(removed).toBe(1);
    expect(await db.articles.where('feedId').equals('watch').count()).toBe(3);
    expect(await db.articles.where('feedId').equals('news').count()).toBe(1);
  });
});
