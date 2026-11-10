import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import type { Feed, Folder } from '@/db/schema';
import { exportOpml, exportOpmlWithStats } from './exportOpml';
import { parseOpml } from './parseOpml';

function feed(over: Partial<Feed> & Pick<Feed, 'id' | 'url' | 'title' | 'sortOrder'>): Feed {
  return {
    folderId: null,
    isFavorite: 0,
    manual: 0,
    errorCount: 0,
    titleCustomized: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

beforeEach(async () => {
  await db.feeds.clear();
  await db.folders.clear();
});

describe('exportOpml', () => {
  it('writes the documented header, folders, and unfiled feeds', async () => {
    const folder: Folder = { id: 'f1', name: 'News & "Tech"', sortOrder: 1, collapsed: 0, createdAt: 0 };
    await db.folders.add(folder);
    await db.feeds.bulkAdd([
      feed({ id: 'a', url: 'https://a.test/rss', title: 'A <one>', sortOrder: 2, folderId: 'f1', siteUrl: 'https://a.test/' }),
      feed({ id: 'b', url: 'https://b.test/rss', title: 'B', sortOrder: 1 }),
    ]);

    const xml = await exportOpml();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">')).toBe(true);
    expect(xml).toContain('<title>OpenHorizon subscriptions</title>');
    expect(xml).toContain('<outline text="News &amp; &quot;Tech&quot;" title="News &amp; &quot;Tech&quot;">');
    expect(xml).toContain('text="A &lt;one&gt;"');
    expect(xml.indexOf('xmlUrl="https://b.test/rss"')).toBeGreaterThan(xml.indexOf('</outline>'));
  });

  it('skips manual feeds and reports how many', async () => {
    await db.feeds.bulkAdd([
      feed({ id: 'm', url: 'manual:1', title: 'Pasted', sortOrder: 1, manual: 1 }),
      feed({ id: 'a', url: 'https://a.test/rss', title: 'A', sortOrder: 2 }),
    ]);
    const r = await exportOpmlWithStats();
    expect(r.skippedManual).toBe(1);
    expect(r.feedCount).toBe(1);
    expect(r.xml).not.toContain('manual:1');
  });

  it('round-trips through parseOpml (feeds, folders, titles, html urls)', async () => {
    await db.folders.bulkAdd([
      { id: 'f1', name: 'Tech', sortOrder: 1, collapsed: 0, createdAt: 0 },
      { id: 'f2', name: 'Empty & quiet', sortOrder: 2, collapsed: 0, createdAt: 0 },
    ]);
    await db.feeds.bulkAdd([
      feed({ id: 'a', url: 'https://a.test/rss?x=1&y=2', title: 'A "quoted" \'single\'', sortOrder: 1, folderId: 'f1', siteUrl: 'https://a.test/' }),
      feed({ id: 'b', url: 'https://b.test/atom', title: 'B', sortOrder: 2, folderId: 'f1' }),
      feed({ id: 'c', url: 'https://c.test/rss', title: 'C', sortOrder: 3 }),
    ]);

    const parsed = parseOpml(await exportOpml());
    expect(parsed.folders).toEqual(['Tech', 'Empty & quiet']);
    expect(parsed.feeds).toEqual([
      { title: 'A "quoted" \'single\'', xmlUrl: 'https://a.test/rss?x=1&y=2', htmlUrl: 'https://a.test/', folder: 'Tech' },
      { title: 'B', xmlUrl: 'https://b.test/atom', folder: 'Tech' },
      { title: 'C', xmlUrl: 'https://c.test/rss', folder: null },
    ]);
  });
});
