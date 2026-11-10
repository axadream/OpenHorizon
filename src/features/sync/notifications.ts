import { db } from '@/db/db';
import type { Article, Feed } from '@/db/schema';
import { getSetting } from '@/features/settings/settings';
import { appUrl } from '@/lib/url';

/** Individual notifications per sync before the summary takes over (ARCHITECTURE §8.4). */
export const MAX_INDIVIDUAL_NOTIFICATIONS = 5;

const ICON = `${import.meta.env.BASE_URL}icons/icon-192.png`;

interface NotificationGlobals {
  Notification?: { permission: NotificationPermission };
  registration?: ServiceWorkerRegistration;
}

function permissionGranted(origin: 'page' | 'sw'): boolean {
  const N = (globalThis as NotificationGlobals).Notification;
  // In the SW some engines do not expose Notification.permission: attempt anyway and let showNotification reject.
  if (N === undefined) return origin === 'sw';
  return N.permission === 'granted';
}

async function getRegistration(origin: 'page' | 'sw'): Promise<ServiceWorkerRegistration | null> {
  if (origin === 'sw') return (globalThis as NotificationGlobals).registration ?? null;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready;
}

interface FeedGroup {
  feed: Feed;
  /** Newest first. */
  articles: Article[];
}

function groupByFavoriteFeed(newArticles: Article[], favorites: Feed[]): FeedGroup[] {
  const byId = new Map(favorites.map((f) => [f.id, f] as const));
  const groups = new Map<string, FeedGroup>();
  for (const article of newArticles) {
    const feed = byId.get(article.feedId);
    if (!feed) continue;
    const group = groups.get(feed.id) ?? { feed, articles: [] };
    group.articles.push(article);
    groups.set(feed.id, group);
  }
  const out = [...groups.values()];
  for (const g of out) g.articles.sort((a, b) => b.publishedAt - a.publishedAt);
  return out.sort((a, b) => (b.articles[0]?.publishedAt ?? 0) - (a.articles[0]?.publishedAt ?? 0));
}

/**
 * Show one notification per favorite feed that received new articles, grouped by
 * `tag` so a newer batch replaces the previous one. More than MAX_INDIVIDUAL_NOTIFICATIONS
 * feeds collapse into one summary. Returns the number of notifications shown.
 *
 * origin 'page' only notifies while the page is hidden (the user is not looking at the list).
 */
export async function showNewArticleNotifications(newArticles: Article[], origin: 'page' | 'sw' = 'page'): Promise<number> {
  if (newArticles.length === 0) return 0;
  if (!(await getSetting('notificationsEnabled'))) return 0;
  if (!permissionGranted(origin)) return 0;
  if (origin === 'page' && document.visibilityState !== 'hidden') return 0;

  const favorites = await db.feeds.where('isFavorite').equals(1).toArray();
  const groups = groupByFavoriteFeed(newArticles, favorites);
  if (groups.length === 0) return 0;

  const reg = await getRegistration(origin);
  if (!reg) return 0;

  const summaryNeeded = groups.length > MAX_INDIVIDUAL_NOTIFICATIONS;
  const individual = summaryNeeded ? groups.slice(0, MAX_INDIVIDUAL_NOTIFICATIONS - 1) : groups;
  let shown = 0;

  for (const { feed, articles } of individual) {
    const newest = articles[0];
    if (!newest) continue;
    const n = articles.length;
    const titles = articles.map((a) => a.title);
    // renotify/timestamp are standard options; passed via a variable because the DOM lib typings omit them.
    const options = {
      body: n === 1 ? feed.title : `${feed.title}: ${titles.slice(0, 3).join(' · ')}`,
      icon: feed.faviconUrl ?? ICON,
      badge: ICON,
      tag: `feed-${feed.id}`,
      renotify: true,
      data: { articleId: newest.id, url: appUrl(`article=${encodeURIComponent(newest.id)}`) },
      timestamp: newest.publishedAt,
    };
    try {
      await reg.showNotification(n === 1 ? newest.title : `${n} new articles`, options);
      shown++;
    } catch {
      // One failed notification must not block the others.
    }
  }

  if (summaryNeeded) {
    const total = groups.reduce((sum, g) => sum + g.articles.length, 0);
    const options = {
      body: 'Open OpenHorizon to read them.',
      icon: ICON,
      badge: ICON,
      tag: 'summary',
      data: { url: appUrl('view=favorites') },
      timestamp: Date.now(),
    };
    try {
      await reg.showNotification(`${total} new articles in your favorite feeds`, options);
      shown++;
    } catch {
      // Ignore: the articles are still listed in the app.
    }
  }

  return shown;
}
