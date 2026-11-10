import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { seedDb } from '@/test/seed';
import { queryUnreadIds } from './articleQueries';
import {
  markAllRead,
  markRead,
  markUnread,
  setFavorite,
  setReadLater,
  toggleFavorite,
  toggleReadLater,
  toggleRead,
  undoMarkAllRead,
} from './articleActions';

beforeEach(async () => {
  await seedDb(1000);
});

const get = (id: string) => db.articles.get(id);

/** Seeded article ids, sorted, that are currently unread in `feedId`. */
async function unreadInFeed(feedId: string): Promise<string[]> {
  const all = await db.articles.where('feedId').equals(feedId).toArray();
  return all.filter((a) => a.isRead === 0).map((a) => a.id);
}

describe('read state', () => {
  it('markRead changes only unread rows and is idempotent', async () => {
    const unread = (await unreadInFeed('feed-1'))[0];
    const read = (await db.articles.where('feedId').equals('feed-1').toArray()).find((a) => a.isRead === 1);
    expect(unread).toBeDefined();
    expect(read).toBeDefined();

    expect(await markRead([unread!, read!.id])).toBe(1);
    const first = await get(unread!);
    expect(first?.isRead).toBe(1);
    expect(typeof first?.readAt).toBe('number');

    // Second call: nothing changes, readAt keeps its first value.
    expect(await markRead(unread!)).toBe(0);
    expect((await get(unread!))?.readAt).toBe(first?.readAt);
  });

  it('markUnread clears readAt and is idempotent', async () => {
    const id = (await db.articles.where('[isRead+publishedAt]').between([1, Dexie.minKey], [1, Dexie.maxKey]).first())!.id;
    expect(await markUnread(id)).toBe(1);
    const row = await get(id);
    expect(row?.isRead).toBe(0);
    expect(row?.readAt).toBeUndefined();
    expect(await markUnread(id)).toBe(0);
  });

  it('toggleRead inverts the flag; two toggles restore the original state', async () => {
    const id = (await unreadInFeed('feed-2'))[0]!;
    await toggleRead(id);
    expect((await get(id))?.isRead).toBe(1);
    await toggleRead(id);
    expect((await get(id))?.isRead).toBe(0);
    expect((await get(id))?.readAt).toBeUndefined();
  });

  it('handles empty and unknown ids without error', async () => {
    expect(await markRead([])).toBe(0);
    expect(await markRead('missing')).toBe(0);
    expect(await markUnread('missing')).toBe(0);
  });
});

describe('favorite and read-later flags', () => {
  it('setFavorite and setReadLater are idempotent', async () => {
    const id = 'art-0001';
    expect(await setFavorite(id, true)).toBe(1);
    expect(await setFavorite(id, true)).toBe(0);
    expect(await setFavorite(id, false)).toBe(1);
    expect(await setFavorite(id, false)).toBe(0);
    expect((await get(id))?.isFavorite).toBe(0);

    expect(await setReadLater(id, true)).toBe(1);
    expect(await setReadLater(id, true)).toBe(0);
    expect((await get(id))?.isReadLater).toBe(1);
  });

  it('toggleFavorite and toggleReadLater flip the flag each call', async () => {
    const id = 'art-0002';
    const start = (await get(id))!.isFavorite;
    await toggleFavorite(id);
    expect((await get(id))?.isFavorite).toBe(start === 1 ? 0 : 1);
    await toggleFavorite(id);
    expect((await get(id))?.isFavorite).toBe(start);

    const rl = (await get(id))!.isReadLater;
    await toggleReadLater(id);
    await toggleReadLater(id);
    expect((await get(id))?.isReadLater).toBe(rl);
  });
});

describe('markAllRead and undo', () => {
  it('returns exactly the ids that changed, and a second call returns none', async () => {
    const expected = await unreadInFeed('feed-0');
    expect(expected.length).toBeGreaterThan(0);

    const changed = await markAllRead({ type: 'feed', feedId: 'feed-0' });
    expect(changed.slice().sort()).toEqual(expected.slice().sort());
    expect(await unreadInFeed('feed-0')).toEqual([]);

    expect(await markAllRead({ type: 'feed', feedId: 'feed-0' })).toEqual([]);
  });

  it('leaves other feeds alone when scoped to a folder', async () => {
    const otherBefore = await unreadInFeed('feed-2');
    const changed = await markAllRead({ type: 'folder', folderId: 'folder-a' });
    expect(changed.length).toBeGreaterThan(0);
    expect(await unreadInFeed('feed-2')).toEqual(otherBefore);
    expect(await unreadInFeed('feed-0')).toEqual([]);
    expect(await unreadInFeed('feed-1')).toEqual([]);
  });

  it('marks everything on the all view and undo restores exactly those rows', async () => {
    const totalBefore = (await queryUnreadIds({ type: 'all' })).length;
    const changed = await markAllRead({ type: 'all' });
    expect(changed.length).toBe(totalBefore);
    expect(await queryUnreadIds({ type: 'all' })).toEqual([]);

    expect(await undoMarkAllRead(changed)).toBe(totalBefore);
    expect((await queryUnreadIds({ type: 'all' })).length).toBe(totalBefore);
    // Undo is idempotent.
    expect(await undoMarkAllRead(changed)).toBe(0);
  });

  it('on the favorites view only touches favorites', async () => {
    const favUnread = await db.articles
      .where('[isFavorite+publishedAt]')
      .between([1, Dexie.minKey], [1, Dexie.maxKey])
      .and((a) => a.isRead === 0)
      .primaryKeys();
    const changed = await markAllRead({ type: 'favorites' });
    expect(changed.slice().sort()).toEqual(favUnread.slice().sort());
    expect(await queryUnreadIds({ type: 'favorites' })).toEqual([]);
    expect((await queryUnreadIds({ type: 'all' })).length).toBeGreaterThan(0);
  });
});
