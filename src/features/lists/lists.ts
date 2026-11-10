import { db } from '@/db/db';
import type { Article, Feed, ListKind } from '@/db/schema';
import { computeGuid } from '@/features/articles/dedup';
import { deleteArticle } from '@/features/articles/articleActions';
import { useLive } from '@/hooks/useLive';
import { t } from '@/i18n/i18n';
import { fetchWithProxy } from '@/lib/proxy/fetchWithProxy';
import { resolveUrl } from '@/lib/url';
import { parseYouTubeUrl, youtubeThumbnailUrl, youtubeWatchUrl } from '@/lib/youtube';

/*
 * Local lists: saved pages and YouTube watch lists. A list is a manual feed (`manual:<uuid>`,
 * manual: 1) with a listKind. Sync skips manual feeds and OPML export leaves them out, so lists
 * stay on this device.
 */

/** The video is already in this list. `articleId` is the existing row, `feedId` its list. */
export class DuplicateListItemError extends Error {
  readonly articleId: string;
  readonly feedId: string;

  constructor(articleId: string, feedId: string) {
    super('Already in this list');
    this.name = 'DuplicateListItemError';
    this.articleId = articleId;
    this.feedId = feedId;
  }
}

/** Picker value meaning "create a new watch list" (see WatchListPicker). */
export const NEW_LIST_VALUE = '__new__';

/** The address is not a YouTube video link. */
export class NotAVideoError extends Error {
  constructor(input: string) {
    super(`Not a YouTube video: ${input}`);
    this.name = 'NotAVideoError';
  }
}

/** The target list does not exist (for example, it was removed in another tab). */
export class ListMissingError extends Error {
  constructor(listId: string) {
    super(`List not found: ${listId}`);
    this.name = 'ListMissingError';
  }
}

export interface VideoMeta {
  title: string;
  author?: string;
  thumbnailUrl: string;
}

export function defaultListTitle(kind: ListKind): string {
  return kind === 'saved' ? t('lists.savedTitle') : t('lists.watchTitle');
}

function buildListFeed(kind: ListKind, title: string, now: number): Feed {
  const id = crypto.randomUUID();
  return {
    id,
    url: `manual:${id}`,
    title: title.trim() || defaultListTitle(kind),
    folderId: null,
    sortOrder: now,
    isFavorite: 0,
    manual: 1,
    listKind: kind,
    errorCount: 0,
    lastError: null,
    titleCustomized: 1,
    createdAt: now,
    updatedAt: now,
    lastSuccessAt: now,
    lastFetchedAt: now,
  };
}

/** The first list of a kind, created with its default title when none exists yet. */
export async function ensureList(kind: ListKind, title?: string): Promise<Feed> {
  return db.transaction('rw', db.feeds, async () => {
    const existing = await db.feeds.filter((f) => f.listKind === kind).first();
    if (existing) return existing;
    const feed = buildListFeed(kind, title ?? defaultListTitle(kind), Date.now());
    await db.feeds.add(feed);
    return feed;
  });
}

/** Create another watch list (the first one comes from ensureList('watch')). */
export async function createWatchList(title: string): Promise<Feed> {
  const feed = buildListFeed('watch', title, Date.now());
  await db.feeds.add(feed);
  return feed;
}

/** Watch lists, oldest first. */
export async function queryWatchLists(): Promise<Feed[]> {
  const lists = await db.feeds.filter((f) => f.listKind === 'watch').toArray();
  return lists.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

/** Live list of watch lists for pickers and the sidebar. */
export function useWatchLists(): Feed[] | undefined {
  return useLive(queryWatchLists, []);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Title, author and thumbnail for a video from YouTube's public oEmbed endpoint. Any failure falls
 * back to a placeholder title and the derived hqdefault thumbnail, so adding still works offline.
 */
export async function fetchVideoMeta(videoId: string, signal?: AbortSignal): Promise<VideoMeta> {
  const fallback: VideoMeta = {
    title: t('lists.videoFallbackTitle', { id: videoId }),
    thumbnailUrl: youtubeThumbnailUrl(videoId),
  };
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeWatchUrl(videoId))}&format=json`;
  try {
    // JSON, not a feed: expectHtml skips the rss2json route and the HTML-error check is not needed.
    const res = await fetchWithProxy(endpoint, { accept: 'application/json', expectHtml: true, timeoutMs: 10_000, signal });
    const data: unknown = JSON.parse(res.text);
    if (!isRecord(data)) return fallback;
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const author = typeof data.author_name === 'string' ? data.author_name.trim() : '';
    const thumb = typeof data.thumbnail_url === 'string' ? resolveUrl(data.thumbnail_url) : '';
    const meta: VideoMeta = {
      title: title || fallback.title,
      thumbnailUrl: thumb || fallback.thumbnailUrl,
    };
    if (author) meta.author = author;
    return meta;
  } catch (err) {
    if (signal?.aborted) throw err;
    return fallback;
  }
}

/** Existing row of a list with this guid, if any. */
export async function findListArticle(listId: string, guid: string): Promise<Article | undefined> {
  return db.articles.where('[feedId+guid]').equals([listId, guid]).first();
}

/**
 * Add a YouTube video to a watch list. The address must be a video link. Duplicates (same video in
 * the same list) throw DuplicateListItemError with the existing article id.
 */
export async function addVideoToList(listId: string, videoUrl: string, opts: { signal?: AbortSignal } = {}): Promise<Article> {
  const ref = parseYouTubeUrl(videoUrl);
  if (ref.kind !== 'video') throw new NotAVideoError(videoUrl);

  const list = await db.feeds.get(listId);
  if (!list || list.listKind !== 'watch') throw new ListMissingError(listId);

  const link = youtubeWatchUrl(ref.videoId);
  const guid = computeGuid({ link, title: '', publishedAt: null });
  const early = await findListArticle(listId, guid);
  if (early) throw new DuplicateListItemError(early.id, listId);

  const meta = await fetchVideoMeta(ref.videoId, opts.signal);
  const now = Date.now();
  const article: Article = {
    id: crypto.randomUUID(),
    feedId: listId,
    guid,
    link,
    title: meta.title,
    summary: '',
    contentRaw: '',
    thumbnailUrl: meta.thumbnailUrl,
    publishedAt: now,
    fetchedAt: now,
    isRead: 0,
    isReadLater: 0,
    isFavorite: 0,
  };
  if (meta.author) article.author = meta.author;

  await db.transaction('rw', db.feeds, db.articles, db.deletedArticles, async () => {
    if (!(await db.feeds.get(listId))) throw new ListMissingError(listId);
    const clash = await findListArticle(listId, guid);
    if (clash) throw new DuplicateListItemError(clash.id, listId);
    await db.deletedArticles.delete([listId, guid]);
    await db.articles.add(article);
  });
  return article;
}

/**
 * Resolve a picker choice to a watch list: an existing id, or NEW_LIST_VALUE to create one named
 * `newName` (default "Watch later").
 */
export async function resolveWatchList(choice: string, newName: string): Promise<{ list: Feed; created: boolean }> {
  if (choice !== NEW_LIST_VALUE) {
    const list = await db.feeds.get(choice);
    if (!list || list.listKind !== 'watch') throw new ListMissingError(choice);
    return { list, created: false };
  }
  return { list: await createWatchList(newName.trim() || defaultListTitle('watch')), created: true };
}

/**
 * Add a video to the chosen (or newly created) watch list. A list created for this call is removed
 * again when the add fails, so a rejected add leaves no empty list behind.
 */
export async function addVideoToChoice(
  choice: string,
  newName: string,
  videoUrl: string,
  opts: { signal?: AbortSignal } = {},
): Promise<{ list: Feed; article: Article }> {
  const { list, created } = await resolveWatchList(choice, newName);
  try {
    const article = await addVideoToList(list.id, videoUrl, opts);
    return { list, article };
  } catch (err) {
    if (created) await db.feeds.delete(list.id);
    throw err;
  }
}

/** Removing a video from a list is deleting its article (tombstone and undo included). */
export const removeFromList = deleteArticle;
