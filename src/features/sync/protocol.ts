import type { Settings } from '@/db/schema';

/**
 * Pure protocol definitions shared by the page and the service worker.
 * This file must not import React or any browser-only module: sw.ts imports it.
 */

/** Periodic Background Sync and one-off Background Sync tags. */
export const FEED_SYNC_TAG = 'feed-sync';
export const FEED_SYNC_ONCE_TAG = 'feed-sync-once';

/** Window event dispatched on the page when a notification click asks to open an article. */
export const OPEN_ARTICLE_EVENT = 'oh:open-article';

export type PageToSw =
  | { type: 'SYNC_NOW' }
  | { type: 'GET_VERSION' }
  | { type: 'SKIP_WAITING' }
  | { type: 'SYNC_DONE'; newCount: number; errorCount: number };

export type SwToPage =
  | { type: 'SYNC_REQUEST' }
  | { type: 'SYNC_STARTED'; origin: 'sw' }
  | { type: 'SYNC_COMPLETE'; origin: 'sw'; newCount: number; errorCount: number }
  | { type: 'OPEN_ARTICLE'; articleId: string }
  | { type: 'VERSION'; version: string };

export type SyncFrequency = Settings['syncFrequency'];

const INTERVAL_MS: Record<Exclude<SyncFrequency, 'manual'>, number> = {
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
};

/** Milliseconds between automatic syncs, or null for manual mode. */
export function intervalFor(frequency: SyncFrequency): number | null {
  return frequency === 'manual' ? null : INTERVAL_MS[frequency];
}
