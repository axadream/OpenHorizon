import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithProxy } = vi.hoisted(() => ({ fetchWithProxy: vi.fn() }));
vi.mock('@/lib/proxy/fetchWithProxy', () => ({ fetchWithProxy }));

import { db } from '@/db/db';
import {
  DuplicateListItemError,
  NotAVideoError,
  addVideoToList,
  createWatchList,
  ensureList,
  fetchVideoMeta,
  queryWatchLists,
} from './lists';

const VIDEO = 'dQw4w9WgXcQ';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;

const OEMBED_JSON = JSON.stringify({
  title: 'Never Gonna Give You Up',
  author_name: 'Rick Astley',
  thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
});

beforeEach(async () => {
  fetchWithProxy.mockReset();
  fetchWithProxy.mockResolvedValue({ status: 200, text: OEMBED_JSON, finalUrl: 'x', via: 'direct' });
  await db.articles.clear();
  await db.feeds.clear();
  await db.deletedArticles.clear();
});

describe('ensureList and watch lists', () => {
  it('creates a local list once and returns the same one afterwards', async () => {
    const first = await ensureList('watch');
    const second = await ensureList('watch');
    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({ manual: 1, listKind: 'watch', title: 'Watch later' });
    expect(first.url.startsWith('manual:')).toBe(true);
    expect(await db.feeds.count()).toBe(1);
  });

  it('lists only watch lists, oldest first', async () => {
    await ensureList('saved');
    const first = await ensureList('watch');
    const second = await createWatchList('Weekend');
    const lists = await queryWatchLists();
    expect(lists.map((l) => l.id)).toEqual([first.id, second.id]);
    expect(lists[1]?.title).toBe('Weekend');
  });
});

describe('fetchVideoMeta', () => {
  it('reads title, author and thumbnail from oEmbed and asks for the watch url', async () => {
    const meta = await fetchVideoMeta(VIDEO);
    expect(meta).toEqual({
      title: 'Never Gonna Give You Up',
      author: 'Rick Astley',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });
    const [endpoint] = fetchWithProxy.mock.calls[0] ?? [];
    expect(endpoint).toBe(`https://www.youtube.com/oembed?url=${encodeURIComponent(WATCH)}&format=json`);
  });

  it('falls back to a placeholder title and the derived thumbnail when the request fails', async () => {
    fetchWithProxy.mockRejectedValue(new Error('timed out after 10000 ms'));
    const meta = await fetchVideoMeta(VIDEO);
    expect(meta.title).toBe(`YouTube video ${VIDEO}`);
    expect(meta.thumbnailUrl).toBe(`https://i.ytimg.com/vi/${VIDEO}/hqdefault.jpg`);
    expect(meta.author).toBeUndefined();
  });

  it('falls back when the response is not JSON', async () => {
    fetchWithProxy.mockResolvedValue({ status: 200, text: '<html>error</html>', finalUrl: 'x', via: 'direct' });
    expect((await fetchVideoMeta(VIDEO)).title).toBe(`YouTube video ${VIDEO}`);
  });
});

describe('addVideoToList', () => {
  it('inserts the video into the watch list with canonical link, author and thumbnail', async () => {
    const list = await ensureList('watch');
    const article = await addVideoToList(list.id, `https://youtu.be/${VIDEO}?si=abc`);

    expect(article.feedId).toBe(list.id);
    expect(article.link).toBe(WATCH);
    expect(article.guid).toBe(WATCH);
    expect(article.title).toBe('Never Gonna Give You Up');
    expect(article.author).toBe('Rick Astley');
    expect(article.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(article.isRead).toBe(0);
    expect(await db.articles.where('feedId').equals(list.id).count()).toBe(1);
  });

  it('rejects a second copy of the same video in the same list', async () => {
    const list = await ensureList('watch');
    const first = await addVideoToList(list.id, WATCH);
    const err = await addVideoToList(list.id, `https://www.youtube.com/shorts/${VIDEO}`).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DuplicateListItemError);
    expect((err as DuplicateListItemError).articleId).toBe(first.id);
    expect(await db.articles.count()).toBe(1);
  });

  it('allows the same video in two different watch lists', async () => {
    const a = await ensureList('watch');
    const b = await createWatchList('Other');
    await addVideoToList(a.id, WATCH);
    await addVideoToList(b.id, WATCH);
    expect(await db.articles.count()).toBe(2);
  });

  it('refuses addresses that are not videos', async () => {
    const list = await ensureList('watch');
    await expect(addVideoToList(list.id, 'https://www.youtube.com/@veritasium')).rejects.toBeInstanceOf(NotAVideoError);
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('refuses a list that is not a watch list', async () => {
    const saved = await ensureList('saved');
    await expect(addVideoToList(saved.id, WATCH)).rejects.toMatchObject({ name: 'ListMissingError' });
  });
});
