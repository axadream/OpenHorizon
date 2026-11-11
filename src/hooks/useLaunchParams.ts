import { useEffect } from 'react';
import { LAUNCH_KEYS, parseLaunchParams, removeSearchParams, type LaunchParseResult } from '@/app/launchParams';
import { runSyncFromPage } from '@/features/sync/scheduler';
import { share } from '@/features/sharing/share';
import { t } from '@/i18n/i18n';
import { toast } from '@/lib/toast';
import { useUiStore } from '@/store/uiStore';

/**
 * Applies the launch request in the address bar (protocol handler, share target, shortcuts) and
 * removes the query keys it consumed, keeping the path and hash. Returns nothing; safe to run twice.
 *  - add-feed: Add feed on the URL tab, prefilled.
 *  - share:    Add feed on the Discover tab, which searches the page (or validates the feed) at once.
 *  - action:   add: Add feed; sync: refresh all feeds now; share: share the app.
 *  - view:     the Unread or Favorites smart view.
 */
function applyLaunchRequest(request: LaunchParseResult): void {
  const ui = useUiStore.getState();
  switch (request.kind) {
    case 'add-feed':
      ui.openDialog('addFeed', { tab: 'url', initialUrl: request.url });
      break;
    case 'share':
      ui.openDialog('addFeed', { tab: 'discover', initialUrl: request.url });
      break;
    case 'action':
      switch (request.action) {
        case 'add':
          ui.openDialog('addFeed', { tab: 'url' });
          break;
        case 'sync':
          toast.info(t('launch.syncStarted'));
          void runSyncFromPage({ manual: true });
          break;
        case 'share':
          // A launch is not a user gesture, so share() falls back to the in-app share sheet.
          void share({
            title: t('share.appName'),
            url: new URL(import.meta.env.BASE_URL, window.location.origin).href,
            text: t('share.appText'),
          });
          break;
      }
      break;
    case 'view':
      ui.setView({ type: request.view });
      break;
    case 'none':
      return;
  }
  const next = removeSearchParams(window.location.href, LAUNCH_KEYS[request.kind]);
  window.history.replaceState(window.history.state, '', next);
}

/** A file-handler launch: read the first file and open the OPML tab with it preloaded. */
async function openLaunchedFile(files: readonly FileSystemFileHandle[]): Promise<void> {
  const handle = files[0];
  if (!handle) return;
  try {
    const file = await handle.getFile();
    const text = await file.text();
    useUiStore.getState().openDialog('addFeed', { tab: 'opml', opmlFile: { name: file.name, text } });
  } catch (err) {
    toast.error("Couldn't open that file", { description: err instanceof Error ? err.message : undefined });
  }
}

/**
 * Launch handling, mounted once in AppShell:
 *  - reads the query string once and applies it (see applyLaunchRequest);
 *  - registers the Launch Queue consumer (Chromium file handlers) when the API exists.
 * `feed://` and `web+rss:` cannot be registered as browser protocols; they are unwrapped in
 * lib/url when they arrive as text (pasted, shared, or inside ?feed=).
 */
export function useLaunchParams(): void {
  useEffect(() => {
    applyLaunchRequest(parseLaunchParams(window.location.search));
    window.launchQueue?.setConsumer((params) => openLaunchedFile(params.files));
  }, []);
}
