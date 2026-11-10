import { useEffect } from 'react';
import { db } from '@/db/db';
import { toast } from '@/lib/toast';
import { useUiStore } from '@/store/uiStore';
import type { View } from '@/store/types';

const BOOT_VIEWS: Record<string, View> = {
  all: { type: 'all' },
  unread: { type: 'unread' },
  favorites: { type: 'favorites' },
  readLater: { type: 'readLater' },
};

/**
 * Handles the boot-time query parameters once, then cleans the URL:
 *   /?view=all|unread|favorites|readLater  selects a smart view
 *   /?add=<url>                            opens Add feed prefilled with the URL
 *   /?article=<id>                         selects an article (opens the reader on mobile)
 * Mount once, in AppShell.
 */
export function useBootUrl(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const articleId = params.get('article');
    const addUrl = params.get('add');
    const viewParam = params.get('view');
    if (articleId === null && addUrl === null && viewParam === null) return;

    window.history.replaceState(null, '', import.meta.env.BASE_URL);

    const ui = useUiStore.getState();
    const view = viewParam !== null && Object.hasOwn(BOOT_VIEWS, viewParam) ? BOOT_VIEWS[viewParam] : undefined;
    if (view) ui.setView(view);
    if (addUrl) ui.openDialog('addFeed', { initialUrl: addUrl });
    if (articleId) {
      db.articles.get(articleId).then(
        (article) => {
          if (article) useUiStore.getState().selectArticle(article.id, { openOnMobile: true });
          else toast.error('That article is no longer available');
        },
        () => toast.error('Could not open that article'),
      );
    }
  }, []);
}
