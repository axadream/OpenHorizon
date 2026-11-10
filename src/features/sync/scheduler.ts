import { useEffect, useSyncExternalStore } from 'react';
import { getSetting, useSetting } from '@/features/settings/settings';
import { toast } from '@/lib/toast';
import { FEED_SYNC_ONCE_TAG, FEED_SYNC_TAG, intervalFor, type SyncFrequency } from './protocol';
import { syncAll, type SyncAllResult } from './syncAll';

const TICK_MS = 60_000;
const EVENT_DEBOUNCE_MS = 5_000;
const STARTUP_DELAY_MS = 1_500;

export type PeriodicState = 'unknown' | 'registered' | 'unregistered' | 'denied' | 'unsupported';

export interface SyncStatus {
  running: boolean;
  progress: { done: number; total: number };
  lastRunAt: number | null;
  lastError: string | null;
  /** Result of the last Periodic Background Sync registration attempt (shown in Settings). */
  periodic: PeriodicState;
}

let status: SyncStatus = {
  running: false,
  progress: { done: 0, total: 0 },
  lastRunAt: null,
  lastError: null,
  periodic: 'unknown',
};
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSyncStatus(): SyncStatus {
  return status;
}

/** Live sync status: { running, progress, lastRunAt, lastError, periodic }. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
}

export interface RunFromPageOptions {
  force?: boolean;
  feedIds?: string[];
  /** Manual refresh: report errors and "no new articles" with a toast. */
  manual?: boolean;
}

/**
 * Run a sync from the page. Only one tab syncs at a time (navigator.locks, ifAvailable),
 * and only one run per page. Resolves null when skipped because another run holds the lock.
 */
export async function runSyncFromPage(opts: RunFromPageOptions = {}): Promise<SyncAllResult | null> {
  if (status.running) return null;

  const execute = async (): Promise<SyncAllResult | null> => {
    setStatus({ running: true, progress: { done: 0, total: 0 }, lastError: null });
    try {
      const result = await syncAll({
        feedIds: opts.feedIds,
        force: opts.force,
        origin: 'page',
        onProgress: (done, total) => setStatus({ progress: { done, total } }),
      });
      const failed = result.errorCount;
      setStatus({
        lastRunAt: result.finishedAt,
        lastError: failed > 0 ? `Sync failed for ${failed} ${failed === 1 ? 'feed' : 'feeds'}` : null,
      });
      if (opts.manual) {
        if (failed > 0) toast.error(`Sync failed for ${failed} ${failed === 1 ? 'feed' : 'feeds'}`);
        else if (result.newArticles.length === 0) toast.info('No new articles');
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ lastError: message });
      if (opts.manual) toast.error('Sync failed', { description: message });
      return null;
    } finally {
      setStatus({ running: false, progress: { done: 0, total: 0 } });
    }
  };

  if (typeof navigator === 'undefined' || !navigator.locks) return execute();

  let outcome: SyncAllResult | null = null;
  await navigator.locks.request('oh-sync', { ifAvailable: true }, async (lock) => {
    if (!lock) {
      if (opts.manual) toast.info('A sync is already running in another tab');
      return;
    }
    outcome = await execute();
  });
  return outcome;
}

/**
 * Ask the service worker for a one-off sync (used when a manual refresh failed offline).
 * Resolves false when Background Sync is unavailable.
 */
export async function requestOneOffSync(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  const sync = (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync;
  if (!sync) return false;
  await sync.register(FEED_SYNC_ONCE_TAG);
  return true;
}

interface PeriodicSyncManagerLike {
  register(tag: string, options: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
}

/**
 * Register (or unregister for 'manual') the periodic sync tag. Chromium only grants the
 * permission to installed PWAs with enough site engagement.
 */
export async function syncPeriodicRegistration(frequency: SyncFrequency): Promise<PeriodicState> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  const manager = (reg as unknown as { periodicSync?: PeriodicSyncManagerLike }).periodicSync;
  if (!manager) return 'unsupported';

  const interval = intervalFor(frequency);
  if (interval === null) {
    await manager.unregister(FEED_SYNC_TAG).catch(() => undefined);
    return 'unregistered';
  }

  const permission = await navigator.permissions
    ?.query({ name: 'periodic-background-sync' } as unknown as PermissionDescriptor)
    .catch(() => null);
  if (permission?.state !== 'granted') return 'denied';

  await manager.register(FEED_SYNC_TAG, { minInterval: interval });
  return 'registered';
}

/** Automatic sync when due: checked on mount, every minute, and on online / visible events. */
async function runIfDue(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const interval = intervalFor(await getSetting('syncFrequency'));
  if (interval === null) return;

  const lastSyncAt = (await getSetting('lastSyncAt')) ?? 0;
  if (Date.now() - lastSyncAt < interval) return;

  await runSyncFromPage();
}

/**
 * In-page scheduler. Mount once (AppShell). Respects the syncFrequency setting,
 * keeps the Periodic Background Sync registration in step with it, and exposes
 * progress through useSyncStatus().
 */
export function useSyncScheduler(): void {
  const frequency = useSetting('syncFrequency');

  useEffect(() => {
    let disposed = false;
    let lastEventAt = 0;

    void getSetting('lastSyncAt').then((value) => {
      if (!disposed) setStatus({ lastRunAt: value });
    });

    const guarded = (): void => {
      if (!disposed) void runIfDue();
    };
    const onEvent = (): void => {
      const now = Date.now();
      if (now - lastEventAt < EVENT_DEBOUNCE_MS) return;
      lastEventAt = now;
      guarded();
    };

    const startup = window.setTimeout(guarded, STARTUP_DELAY_MS);
    const timer = window.setInterval(guarded, TICK_MS);
    window.addEventListener('online', onEvent);
    document.addEventListener('visibilitychange', onEvent);

    return () => {
      disposed = true;
      window.clearTimeout(startup);
      window.clearInterval(timer);
      window.removeEventListener('online', onEvent);
      document.removeEventListener('visibilitychange', onEvent);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void syncPeriodicRegistration(frequency)
      .then((state) => {
        if (!cancelled) setStatus({ periodic: state });
      })
      .catch(() => {
        if (!cancelled) setStatus({ periodic: 'unsupported' });
      });
    return () => {
      cancelled = true;
    };
  }, [frequency]);
}
