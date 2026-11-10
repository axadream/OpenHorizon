import { useEffect } from 'react';
import { db } from '@/db/db';
import { removeSearchParams } from '@/app/launchParams';
import { toast } from '@/lib/toast';
import { useUiStore } from '@/store/uiStore';
import type { View } from '@/store/types';

/** Smart views handled here. unread and favorites belong to useLaunchParams (they are launch shortcuts). */
const BOOT_VIEWS: Record<string, View> = {
  all: { type: 'all' },
  readLater: { type: 'readLater' },
};

/**
 * Handles the legacy boot-time query parameters once, then removes only the ones it consumed
 * (so a `view=unread` or `feed=` from useLaunchParams is left for that hook):
 *   /?view=all|readLater  selects a smart view
 *   /?add=<url>           opens Add feed prefilled with the URL
 *   /?article=<id>        selects an article (opens the reader on mobile)
 * Mount once, in AppShell.
 */
export function useBootUrl(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const articleId = params.get('article');
    const addUrl = params.get('add');
    const viewParam = params.get('view');
    const view = viewParam !== null && Object.hasOwn(BOOT_VIEWS, viewParam) ? BOOT_VIEWS[viewParam] : undefined;

    const consumed: string[] = [];
    if (articleId !== null) consumed.push('article');
    if (addUrl !== null) consumed.push('add');
    if (view) consumed.push('view');
    if (consumed.length === 0) return;

    window.history.replaceState(window.history.state, '', removeSearchParams(window.location.href, consumed));

    const ui = useUiStore.getState();
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
