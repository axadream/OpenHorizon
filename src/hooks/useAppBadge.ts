import { useEffect } from 'react';
import { countUnreadArticles } from '@/features/articles/unreadCount';
import { useSetting } from '@/features/settings/settings';
import { clearAppBadge, isAppBadgeSupported, setAppBadgeCount } from '@/features/system/badge';
import { useLive } from '@/hooks/useLive';

/** Badge updates are debounced so a burst of read toggles or a sync makes one call. */
export const BADGE_DEBOUNCE_MS = 500;

/**
 * Keeps the app icon badge in step with the total unread count (live query). Clears it at zero
 * and when the `appBadge` setting is off. Mount once, in AppShell.
 */
export function useAppBadge(): void {
  const enabled = useSetting('appBadge');
  const unread = useLive(countUnreadArticles, []);

  useEffect(() => {
    if (!isAppBadgeSupported()) return;
    const timer = window.setTimeout(() => {
      if (!enabled) void clearAppBadge();
      else if (unread !== undefined) void setAppBadgeCount(unread);
    }, BADGE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, unread]);
}
