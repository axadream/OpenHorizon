import { useSyncExternalStore } from 'react';

/** How often subscribers receive a fresh "now" (time-ago labels, pulse cutoffs). */
export const NOW_TICK_MS = 30_000;

/*
 * One shared interval for the whole app: it runs only while at least one component is
 * subscribed, and stops when the last one unsubscribes. Components read the same snapshot,
 * so N time labels cost one timer, not N.
 */
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  now = Date.now();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(tick, NOW_TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return now;
}

/**
 * Current timestamp (ms), refreshed every 30 s. Re-renders the caller only when the tick
 * changes; use it for relative times, not for anything that needs millisecond accuracy.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
