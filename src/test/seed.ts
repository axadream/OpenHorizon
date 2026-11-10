import { db } from '@/db/db';
import type { Article, Feed, Folder } from '@/db/schema';

/** Deterministic test data shared by the store, query and action tests. */

export const BASE_TIME = Date.UTC(2026, 0, 1);

export const FOLDERS: Folder[] = [
  { id: 'folder-a', name: 'Tech', sortOrder: 1, collapsed: 0, createdAt: BASE_TIME },
  { id: 'folder-b', name: 'News', sortOrder: 2, collapsed: 0, createdAt: BASE_TIME },
];

/** feed-0 and feed-1 are in folder-a, feed-2 in folder-b, feed-3 and feed-4 are unfiled. */
export function makeFeeds(): Feed[] {
  const folderFor = ['folder-a', 'folder-a', 'folder-b', null, null] as const;
  return folderFor.map((folderId, i) => ({
    id: `feed-${i}`,
    url: `https://example.com/${i}.xml`,
    title: `Feed ${i}`,
    folderId,
    sortOrder: i,
    isFavorite: i === 0 ? 1 : 0,
    manual: 0,
    errorCount: 0,
    titleCustomized: 0,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  }));
}

/** Cheap deterministic hash in [0, 1e9). Spreads flags across feeds without a pattern. */
function hash(i: number, salt: number): number {
  return (Math.imul(i + 1, 2654435761) ^ Math.imul(salt, 40503)) >>> 0;
}

/**
 * `count` articles spread round-robin over `feeds`. publishedAt values repeat for some indexes
 * (the step is coprime with 997, so ties only appear after 997 items), which exercises tie-breaking.
 */
export function makeArticles(count: number, feeds: readonly Feed[]): Article[] {
  const out: Article[] = [];
  for (let i = 0; i < count; i++) {
    const feed = feeds[i % feeds.length];
    if (!feed) throw new Error('makeArticles needs at least one feed');
    const isRead = hash(i, 1) % 10 < 4 ? 1 : 0;
    const readAt = isRead ? BASE_TIME + i : undefined;
    const article: Article = {
      id: `art-${String(i).padStart(4, '0')}`,
      feedId: feed.id,
      guid: `guid-${i}`,
      link: `https://example.com/post/${i}`,
      title: `Article ${i}`,
      summary: '',
      contentRaw: '',
      publishedAt: BASE_TIME + ((i * 7919) % 997) * 60_000,
      fetchedAt: BASE_TIME,
      isRead,
      isReadLater: hash(i, 2) % 9 === 0 ? 1 : 0,
      isFavorite: hash(i, 3) % 7 === 0 ? 1 : 0,
    };
    if (readAt !== undefined) article.readAt = readAt;
    out.push(article);
  }
  return out;
}

export interface Seeded {
  feeds: Feed[];
  folders: Folder[];
  articles: Article[];
}

/** Empty every table, then insert folders, five feeds and `count` articles. */
export async function seedDb(count = 1000): Promise<Seeded> {
  await db.transaction('rw', [db.feeds, db.folders, db.articles, db.settings, db.syncLog], async () => {
    await db.feeds.clear();
    await db.folders.clear();
    await db.articles.clear();
    await db.settings.clear();
    await db.syncLog.clear();
  });
  const feeds = makeFeeds();
  const folders = FOLDERS.map((f) => ({ ...f }));
  const articles = makeArticles(count, feeds);
  await db.transaction('rw', [db.feeds, db.folders, db.articles], async () => {
    await db.folders.bulkAdd(folders);
    await db.feeds.bulkAdd(feeds);
    await db.articles.bulkAdd(articles);
  });
  return { feeds, folders, articles };
}
