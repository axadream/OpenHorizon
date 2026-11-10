/**
 * Dev-only helper used to capture README screenshots with a headless browser.
 * Activated by `?seed=<feedUrl>` on the dev server; never bundled in production
 * (main.tsx only imports it under `import.meta.env.DEV`).
 *
 * Extra params: `pane=reader` selects the first article (and opens the reader on mobile).
 */
import { db } from '@/db/db';
import { addFeedFromUrl } from '@/features/feeds/addFeed';
import { syncAll } from '@/features/sync/syncAll';
import { useUiStore } from '@/store/uiStore';

export async function runDevSeed(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const feedUrl = params.get('seed');
  if (!feedUrl) return;

  let feedId: string;
  const existing = await db.feeds.toArray();
  const match = existing.find((f) => f.url === feedUrl);
  if (match) {
    feedId = match.id;
  } else {
    const feed = await addFeedFromUrl(feedUrl);
    feedId = feed.id;
    await syncAll({ feedIds: [feedId] });
  }

  if (params.get('pane') === 'reader') {
    const first = await db.articles.where('feedId').equals(feedId).reverse().sortBy('publishedAt');
    const article = first[0];
    if (article) useUiStore.getState().selectArticle(article.id, { openOnMobile: true });
  }
  window.history.replaceState(null, '', import.meta.env.BASE_URL);
  document.documentElement.dataset.seeded = 'true';
}
