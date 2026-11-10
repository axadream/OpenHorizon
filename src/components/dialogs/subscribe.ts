import type { Feed } from '@/db/schema';
import { runSyncFromPage } from '@/features/sync/scheduler';
import { toast } from '@/lib/toast';
import { useUiStore } from '@/store/uiStore';

/**
 * Validate a user-typed web address. Adds https:// when no scheme is given.
 * Returns the http(s) URL, or null when the input is empty or not a web address.
 */
export function toHttpUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? withScheme : null;
  } catch {
    return null;
  }
}

/**
 * Common success path for every add-feed source: toast, show the new feed, close the
 * dialog and fetch its articles (the feed row alone has no items yet).
 */
export function onFeedSubscribed(feed: Feed): void {
  toast.success(`Subscribed to ${feed.title}`);
  const ui = useUiStore.getState();
  ui.setView({ type: 'feed', feedId: feed.id });
  ui.closeDialog('addFeed');
  if (feed.manual !== 1) void runSyncFromPage({ feedIds: [feed.id] });
}

/** Select an existing feed in the timeline and close the dialog ("Show feed"). */
export function showFeed(feedId: string): void {
  const ui = useUiStore.getState();
  ui.setView({ type: 'feed', feedId });
  ui.closeDialog('addFeed');
}
