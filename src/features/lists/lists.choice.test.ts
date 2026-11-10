import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithProxy } = vi.hoisted(() => ({ fetchWithProxy: vi.fn() }));
vi.mock('@/lib/proxy/fetchWithProxy', () => ({ fetchWithProxy }));

import { db } from '@/db/db';
import { NEW_LIST_VALUE, addVideoToChoice, ensureList, resolveWatchList } from './lists';

const WATCH = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

beforeEach(async () => {
  fetchWithProxy.mockReset();
  fetchWithProxy.mockRejectedValue(new Error('offline'));
  await db.articles.clear();
  await db.feeds.clear();
  await db.deletedArticles.clear();
});

describe('resolveWatchList', () => {
  it('returns the chosen existing watch list', async () => {
    const list = await ensureList('watch');
    const out = await resolveWatchList(list.id, '');
    expect(out).toEqual({ list, created: false });
  });

  it('creates a list with the typed name when "New list" is chosen', async () => {
    const out = await resolveWatchList(NEW_LIST_VALUE, '  Weekend  ');
    expect(out.created).toBe(true);
    expect(out.list.title).toBe('Weekend');
    expect(out.list.listKind).toBe('watch');
  });

  it('falls back to the default title for an empty new name', async () => {
    const out = await resolveWatchList(NEW_LIST_VALUE, '   ');
    expect(out.list.title).toBe('Watch later');
  });

  it('refuses a saved-pages list as a watch list target', async () => {
    const saved = await ensureList('saved');
    await expect(resolveWatchList(saved.id, '')).rejects.toMatchObject({ name: 'ListMissingError' });
  });
});

describe('addVideoToChoice', () => {
  it('adds to the chosen list', async () => {
    const list = await ensureList('watch');
    const { article } = await addVideoToChoice(list.id, '', WATCH);
    expect(article.feedId).toBe(list.id);
  });

  it('removes a list it created when the add fails, so no empty list is left behind', async () => {
    await expect(addVideoToChoice(NEW_LIST_VALUE, 'Temp', 'https://www.youtube.com/@veritasium')).rejects.toMatchObject({
      name: 'NotAVideoError',
    });
    expect(await db.feeds.count()).toBe(0);
  });

  it('keeps an existing list when the add fails', async () => {
    const list = await ensureList('watch');
    await expect(addVideoToChoice(list.id, '', 'https://example.com/')).rejects.toMatchObject({ name: 'NotAVideoError' });
    expect(await db.feeds.get(list.id)).toBeDefined();
  });
});
