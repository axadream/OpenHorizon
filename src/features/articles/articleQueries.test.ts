import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import type { Article } from '@/db/schema';
import type { TimelineFilter, TimelineSort, View } from '@/store/types';
import { seedDb, type Seeded } from '@/test/seed';
import { queryArticles, queryCounts, queryUnreadIds } from './articleQueries';

let seeded: Seeded;

beforeAll(() => {
  // Dexie opens lazily; make sure the schema is in place before the first spy/query.
  return db.open();
});

beforeEach(async () => {
  seeded = await seedDb(1000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Views exercised by the table-driven tests. feed-3 is unfiled, so it has no folder. */
const VIEWS: View[] = [
  { type: 'all' },
  { type: 'unread' },
  { type: 'favorites' },
  { type: 'readLater' },
  { type: 'feed', feedId: 'feed-0' },
  { type: 'feed', feedId: 'feed-3' },
  { type: 'folder', folderId: 'folder-a' },
  { type: 'folder', folderId: 'folder-b' },
];

function inView(a: Article, view: View): boolean {
  switch (view.type) {
    case 'all':
    case 'unread':
      return true;
    case 'favorites':
      return a.isFavorite === 1;
    case 'readLater':
      return a.isReadLater === 1;
    case 'feed':
      return a.feedId === view.feedId;
    case 'folder':
      return seeded.feeds.some((f) => f.folderId === view.folderId && f.id === a.feedId);
  }
}

/** Brute-force reference: filter in memory, then sort newest or oldest with the id tie-break. */
function reference(view: View, filter: TimelineFilter, sort: TimelineSort): string[] {
  const onlyUnread = filter === 'unread' || view.type === 'unread';
  const rows = seeded.articles.filter((a) => inView(a, view) && (!onlyUnread || a.isRead === 0));
  rows.sort((a, b) => {
    const byDate = sort === 'newest' ? b.publishedAt - a.publishedAt : a.publishedAt - b.publishedAt;
    if (byDate !== 0) return byDate;
    const c = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return sort === 'newest' ? -c : c;
  });
  return rows.map((a) => a.id);
}

const ids = (rows: Article[]): string[] => rows.map((a) => a.id);

describe('queryArticles ordering and paging', () => {
  it('matches the brute-force reference for every view, filter, sort and page', async () => {
    const filters: TimelineFilter[] = ['all', 'unread'];
    const sorts: TimelineSort[] = ['newest', 'oldest'];
    const pages: Array<[number, number]> = [
      [100, 0],
      [100, 100],
      [7, 250],
    ];
    for (const view of VIEWS) {
      for (const filter of filters) {
        for (const sort of sorts) {
          const expected = reference(view, filter, sort);
          for (const [limit, offset] of pages) {
            const got = ids(await queryArticles(view, filter, sort, limit, offset));
            const want = expected.slice(offset, offset + limit);
            expect(got, `${JSON.stringify(view)} ${filter} ${sort} limit=${limit} offset=${offset}`).toEqual(want);
          }
        }
      }
    }
  });

  it('pages a folder view through to the end without gaps or repeats', async () => {
    const expected = reference({ type: 'folder', folderId: 'folder-a' }, 'all', 'newest');
    const collected: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = ids(await queryArticles({ type: 'folder', folderId: 'folder-a' }, 'all', 'newest', 100, offset));
      if (page.length === 0) break;
      collected.push(...page);
    }
    expect(collected).toEqual(expected);
    expect(new Set(collected).size).toBe(collected.length);
    expect(collected.length).toBe(400);
  });

  it('returns newest-first by default order, with the unread view ignoring the filter', async () => {
    const newest = ids(await queryArticles({ type: 'all' }, 'all', 'newest', 5));
    const first = seeded.articles.find((a) => a.id === newest[0]);
    expect(first).toBeDefined();
    const maxPublished = Math.max(...seeded.articles.map((a) => a.publishedAt));
    expect(first?.publishedAt).toBe(maxPublished);

    const unreadView = await queryArticles({ type: 'unread' }, 'all', 'newest', 1000);
    expect(unreadView.every((a) => a.isRead === 0)).toBe(true);
  });

  it('returns an empty list for an unknown folder, a zero limit, or a folder with no feeds', async () => {
    await db.folders.add({ id: 'folder-empty', name: 'Empty', sortOrder: 9, collapsed: 0, createdAt: 0 });
    expect(await queryArticles({ type: 'folder', folderId: 'folder-empty' }, 'all', 'newest', 100)).toEqual([]);
    expect(await queryArticles({ type: 'folder', folderId: 'missing' }, 'all', 'newest', 100)).toEqual([]);
    expect(await queryArticles({ type: 'all' }, 'all', 'newest', 0)).toEqual([]);
  });
});

describe('queryArticles index usage', () => {
  it('never calls Collection.filter or and() for the unread and feed views', async () => {
    // Spy on the Dexie Collection prototype; the spies call through to the real methods.
    type CollectionProto = Record<'filter' | 'and', (...args: unknown[]) => unknown>;
    const proto = Object.getPrototypeOf(db.articles.toCollection()) as CollectionProto;
    const filterSpy = vi.spyOn(proto, 'filter');
    const andSpy = vi.spyOn(proto, 'and');

    await queryArticles({ type: 'unread' }, 'all', 'newest', 100);
    await queryArticles({ type: 'all' }, 'unread', 'oldest', 100);
    await queryArticles({ type: 'feed', feedId: 'feed-1' }, 'unread', 'newest', 100);
    await queryArticles({ type: 'feed', feedId: 'feed-1' }, 'all', 'oldest', 100);
    await queryArticles({ type: 'folder', folderId: 'folder-a' }, 'unread', 'newest', 100);

    expect(filterSpy).not.toHaveBeenCalled();
    expect(andSpy).not.toHaveBeenCalled();
  });
});

describe('queryCounts and queryUnreadIds', () => {
  it('matches the reference totals and per-feed unread counts', async () => {
    const counts = await queryCounts();
    const unread = seeded.articles.filter((a) => a.isRead === 0);
    expect(counts.unread).toBe(unread.length);
    expect(counts.favorites).toBe(seeded.articles.filter((a) => a.isFavorite === 1).length);
    expect(counts.readLater).toBe(seeded.articles.filter((a) => a.isReadLater === 1).length);

    const expectedByFeed = new Map<string, number>();
    for (const a of unread) expectedByFeed.set(a.feedId, (expectedByFeed.get(a.feedId) ?? 0) + 1);
    expect(counts.byFeed).toEqual(expectedByFeed);
    expect(counts.byFeed.get('feed-3')).toBe(expectedByFeed.get('feed-3'));
  });

  it('returns the unread ids of each view', async () => {
    for (const view of VIEWS) {
      const expected = reference(view, 'unread', 'newest').sort();
      const got = (await queryUnreadIds(view)).slice().sort();
      expect(got, JSON.stringify(view)).toEqual(expected);
    }
  });
});
