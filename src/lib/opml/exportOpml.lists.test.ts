import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import type { Feed } from '@/db/schema';
import { exportOpmlWithStats } from './exportOpml';

function feed(id: string, extra: Partial<Feed> = {}): Feed {
  return {
    id,
    url: `https://${id}.test/feed.xml`,
    title: id,
    folderId: null,
    sortOrder: 1,
    isFavorite: 0,
    manual: 0,
    errorCount: 0,
    titleCustomized: 0,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

beforeEach(async () => {
  await db.feeds.clear();
  await db.folders.clear();
});

describe('OPML export and local lists', () => {
  it('leaves saved-pages and watch lists out of the export and counts them as skipped', async () => {
    await db.feeds.bulkAdd([
      feed('news'),
      feed('saved', { manual: 1, listKind: 'saved', url: 'manual:saved-id' }),
      feed('watch', { manual: 1, listKind: 'watch', url: 'manual:watch-id' }),
    ]);

    const out = await exportOpmlWithStats();

    expect(out.feedCount).toBe(1);
    expect(out.skippedManual).toBe(2);
    expect(out.xml).toContain('https://news.test/feed.xml');
    expect(out.xml).not.toContain('manual:');
  });
});
