import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import type { Article, Feed } from '@/db/schema';
import { removeFeed, restoreFeed } from './removeFeed';

function feed(id: string): Feed {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: id,
    folderId: null,
    sortOrder: 1,
    isFavorite: 0,
    manual: 0,
    errorCount: 0,
    titleCustomized: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

function article(id: string, feedId: string): Article {
  return {
    id,
    feedId,
    guid: `guid-${id}`,
    link: '',
    title: id,
    summary: '',
    contentRaw: '',
    publishedAt: 1,
    fetchedAt: 1,
    isRead: 0,
    isReadLater: 0,
    isFavorite: 0,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.feeds.clear(),
    db.articles.clear(),
    db.syncLog.clear(),
    db.deletedArticles.clear(),
  ]);
  await db.feeds.bulkAdd([feed('f1'), feed('f2')]);
  await db.articles.bulkAdd([article('a1', 'f1'), article('b1', 'f2')]);
  await db.deletedArticles.bulkAdd([
    { feedId: 'f1', guid: 'guid-x', deletedAt: 10 },
    { feedId: 'f1', guid: 'guid-y', deletedAt: 20 },
    { feedId: 'f2', guid: 'guid-z', deletedAt: 30 },
  ]);
});

describe('removeFeed and tombstones', () => {
  it('deletes the feed own tombstones and keeps the other feeds tombstones', async () => {
    const snapshot = await removeFeed('f1');

    expect(snapshot?.tombstones.map((t) => t.guid).sort()).toEqual(['guid-x', 'guid-y']);
    const left = await db.deletedArticles.toArray();
    expect(left.map((t) => `${t.feedId}/${t.guid}`)).toEqual(['f2/guid-z']);
  });

  it('restoreFeed brings the tombstones back so deleted articles stay deleted', async () => {
    const snapshot = await removeFeed('f1');
    expect(await db.deletedArticles.where('feedId').equals('f1').count()).toBe(0);

    await restoreFeed(snapshot!);

    expect(await db.deletedArticles.where('feedId').equals('f1').count()).toBe(2);
    expect(await db.deletedArticles.get(['f1', 'guid-x'])).toMatchObject({ deletedAt: 10 });
    expect(await db.feeds.get('f1')).toBeDefined();
    expect(await db.articles.where('feedId').equals('f1').count()).toBe(1);
  });

  it('returns null and touches nothing for an unknown feed', async () => {
    expect(await removeFeed('missing')).toBeNull();
    expect(await db.deletedArticles.count()).toBe(3);
  });
});
