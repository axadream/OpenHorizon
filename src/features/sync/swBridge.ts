import { useEffect } from 'react';
import { toast } from '@/lib/toast';
import { OPEN_ARTICLE_EVENT, type PageToSw, type SwToPage } from './protocol';
import { runSyncFromPage } from './scheduler';

export type { PageToSw, SwToPage } from './protocol';
export { OPEN_ARTICLE_EVENT } from './protocol';

/** Post a message to the active service worker. No-op without service worker support. */
export async function postToServiceWorker(message: PageToSw): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage(message);
}

/**
 * Page side of the SW protocol (mount once, AppShell):
 * - SYNC_REQUEST (SW periodic sync found this page visible): runs a sync, then posts SYNC_DONE back.
 * - SYNC_COMPLETE: toast with the new article count.
 * - OPEN_ARTICLE (notification click): dispatches OPEN_ARTICLE_EVENT on window with { articleId }.
 */
export function useServiceWorkerBridge(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent<SwToPage | undefined>): void => {
      const msg = event.data;
      if (!msg) return;
      switch (msg.type) {
        case 'SYNC_REQUEST': {
          void runSyncFromPage().then((result) => {
            if (result) {
              void postToServiceWorker({
                type: 'SYNC_DONE',
                newCount: result.newArticles.length,
                errorCount: result.errorCount,
              });
            }
          });
          break;
        }
        case 'SYNC_COMPLETE': {
          if (msg.newCount > 0) toast.info(`${msg.newCount} new ${msg.newCount === 1 ? 'article' : 'articles'}`);
          break;
        }
        case 'OPEN_ARTICLE': {
          window.dispatchEvent(new CustomEvent<{ articleId: string }>(OPEN_ARTICLE_EVENT, { detail: { articleId: msg.articleId } }));
          break;
        }
        default:
          break;
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);
}
