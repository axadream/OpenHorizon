import { useEffect } from 'react';

/*
 * Screen Wake Lock (navigator.wakeLock.request('screen')). The browser releases the lock on its own
 * when the page is hidden, so the hook releases it on hidden and re-acquires it when visible again.
 */

interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/** True when the browser exposes the Screen Wake Lock API. */
export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Keeps the screen on while `active` is true and the document is visible. Errors are ignored:
 * NotAllowedError is expected when the page is hidden, the battery saver is on, or the policy denies it.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !isWakeLockSupported()) return;
    const wakeLock = (navigator as unknown as { wakeLock: WakeLockLike }).wakeLock;
    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const acquire = (): void => {
      if (disposed || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      wakeLock.request('screen').then(
        (next) => {
          if (disposed) {
            void next.release().catch(() => undefined);
            return;
          }
          sentinel = next;
          next.addEventListener('release', () => {
            if (sentinel === next) sentinel = null;
          });
        },
        () => undefined,
      );
    };

    const release = (): void => {
      const current = sentinel;
      sentinel = null;
      if (current && !current.released) void current.release().catch(() => undefined);
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') acquire();
      else release();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    acquire();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      release();
    };
  }, [active]);
}
