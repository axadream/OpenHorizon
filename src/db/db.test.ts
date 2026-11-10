import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';

function indexSources(table: string): string[] {
  return db.table(table).schema.indexes.map(i => i.src).sort();
}

const expected = {
  feeds: ['&url', 'folderId', '[folderId+sortOrder]', 'isFavorite', 'lastFetchedAt'],
  folders: ['sortOrder'],
  articles: [
    '&[feedId+guid]',
    'feedId',
    'publishedAt',
    '[feedId+publishedAt]',
    '[isRead+publishedAt]',
    '[feedId+isRead+publishedAt]',
    '[isRead+feedId]',
    '[isReadLater+publishedAt]',
    '[isFavorite+publishedAt]',
    'link',
  ],
  settings: [],
  syncLog: ['feedId', 'startedAt', '[feedId+startedAt]'],
} as const;

describe('database schema (version 2)', () => {
  beforeEach(async () => {
    await db.open();
  });

  it('opens at version 2 with the expected tables', () => {
    expect(db.verno).toBe(2);
    expect(db.tables.map(t => t.name).sort()).toEqual([
      'articles',
      'deletedArticles',
      'feeds',
      'folders',
      'settings',
      'syncLog',
    ]);
  });

  it('keys tombstones by [feedId+guid] with the feed and trim indexes', () => {
    expect(db.deletedArticles.schema.primKey.keyPath).toEqual(['feedId', 'guid']);
    expect(indexSources('deletedArticles').sort()).toEqual(['[feedId+deletedAt]', 'feedId'].sort());
  });

  it('uses the primary keys from ARCHITECTURE 2.1', () => {
    expect(db.feeds.schema.primKey.name).toBe('id');
    expect(db.folders.schema.primKey.name).toBe('id');
    expect(db.articles.schema.primKey.name).toBe('id');
    expect(db.settings.schema.primKey.name).toBe('key');
    expect(db.syncLog.schema.primKey.auto).toBe(true);
  });

  it('defines every index from ARCHITECTURE 2.1 on feeds', () => {
    expect(indexSources('feeds').sort()).toEqual([...expected.feeds].sort());
    expect(db.feeds.schema.idxByName['url']?.unique).toBe(true);
    expect(db.feeds.schema.idxByName['[folderId+sortOrder]']?.compound).toBe(true);
  });

  it('defines every index from ARCHITECTURE 2.1 on folders and syncLog', () => {
    expect(indexSources('folders').sort()).toEqual([...expected.folders].sort());
    expect(indexSources('syncLog').sort()).toEqual([...expected.syncLog].sort());
  });

  it('defines the compound unique dedup index and all article query indexes', () => {
    const articles = db.articles.schema;
    expect(articles.idxByName['[feedId+guid]']?.unique).toBe(true);
    expect(articles.idxByName['[feedId+guid]']?.compound).toBe(true);
    expect(indexSources('articles').sort()).toEqual([...expected.articles].sort());
  });
});
