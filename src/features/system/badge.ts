import { countUnreadArticles } from '@/features/articles/unreadCount';
import { getSetting } from '@/features/settings/settings';

/*
 * App icon badge (Badging API: navigator.setAppBadge / clearAppBadge). This module has no React
 * import, so the service worker can call refreshAppBadgeFromDb() after a background sync. Every
 * call is feature-detected and best effort: unsupported browsers and rejected calls are ignored.
 * The page keeps the badge live through useAppBadge (src/hooks/useAppBadge.ts).
 */

interface BadgingNavigator {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

function badgingNavigator(): BadgingNavigator | undefined {
  return (globalThis as { navigator?: BadgingNavigator }).navigator;
}

/** True when the browser exposes the Badging API (installed apps on supporting platforms). */
export function isAppBadgeSupported(): boolean {
  return typeof badgingNavigator()?.setAppBadge === 'function';
}

/** Removes the badge. No-op when unsupported. */
export async function clearAppBadge(): Promise<void> {
  const nav = badgingNavigator();
  if (!nav?.clearAppBadge) return;
  try {
    await nav.clearAppBadge();
  } catch {
    // Best effort: a rejected badge call must never break the app.
  }
}

/** Shows `count` on the app icon; zero or less clears it. No-op when unsupported. */
export async function setAppBadgeCount(count: number): Promise<void> {
  if (count <= 0) {
    await clearAppBadge();
    return;
  }
  const nav = badgingNavigator();
  if (!nav?.setAppBadge) return;
  try {
    await nav.setAppBadge(count);
  } catch {
    // Best effort, see clearAppBadge.
  }
}

/**
 * Recomputes the badge from the unread count in IndexedDB. Used by the service worker after a
 * background sync. Honours the `appBadge` setting: when it is off the badge is cleared.
 */
export async function refreshAppBadgeFromDb(): Promise<void> {
  if (!isAppBadgeSupported()) return;
  if (!(await getSetting('appBadge'))) {
    await clearAppBadge();
    return;
  }
  await setAppBadgeCount(await countUnreadArticles());
}
