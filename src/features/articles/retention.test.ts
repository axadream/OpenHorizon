import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import type { Article } from '@/db/schema';
import { pruneFeed } from './retention';

function article(id: string, feedId: string, day: number, flags: Partial<Pick<Article, 'isRead' | 'isReadLater' | 'isFavorite'>> = {}): Article {
  return {
    id,
    feedId,
    guid: `guid-${id}`,
    link: '',
    title: id,
    summary: '',
    contentRaw: '',
    publishedAt: Date.UTC(2026, 0, day),
    fetchedAt: 0,
    isRead: 0,
    isReadLater: 0,
    isFavorite: 0,
    ...flags,
  };
}

describe('pruneFeed', () => {
  beforeEach(async () => {
    await db.articles.clear();
  });

  it('keeps the newest N and removes older unread articles', async () => {
    const rows = [1, 2, 3, 4, 5, 6].map(d => article(`a${d}`, 'f1', d));
    await db.articles.bulkAdd(rows);

    await pruneFeed('f1', 3);

    const left = (await db.articles.where('feedId').equals('f1').primaryKeys()).sort();
    expect(left).toEqual(['a4', 'a5', 'a6']);
  });

  it('never deletes favorites or read-later articles beyond the limit', async () => {
    await db.articles.bulkAdd([
      article('old-fav', 'f1', 1, { isFavorite: 1 }),
      article('old-later', 'f1', 2, { isReadLater: 1, isRead: 1 }),
      article('old-plain', 'f1', 3, { isRead: 1 }),
      article('new1', 'f1', 10),
      article('new2', 'f1', 11),
    ]);

    await pruneFeed('f1', 2);

    const left = (await db.articles.where('feedId').equals('f1').primaryKeys()).sort();
    expect(left).toEqual(['new1', 'new2', 'old-fav', 'old-later']);
  });

  it('only touches the given feed', async () => {
    await db.articles.bulkAdd([
      article('x1', 'f1', 1),
      article('x2', 'f1', 2),
      article('y1', 'f2', 1),
    ]);

    await pruneFeed('f1', 1);

    expect((await db.articles.where('feedId').equals('f2').primaryKeys())).toEqual(['y1']);
    expect((await db.articles.where('feedId').equals('f1').primaryKeys())).toEqual(['x2']);
  });
});
