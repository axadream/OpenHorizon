import { useCallback, useEffect, useState } from 'react';
import { getSetting, setSetting } from '@/features/settings/settings';

/*
 * Storage resilience. The browser may evict IndexedDB data under pressure unless the origin is
 * granted persistent storage (navigator.storage.persist). The app asks at startup, at most once
 * every 14 days, and Settings > Data offers a manual request. Everything is feature-detected.
 */

/** Minimum gap between automatic persistence requests. */
export const PERSIST_RETRY_MS = 14 * 24 * 60 * 60 * 1000;

interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

function storageManager(): StorageManagerLike | undefined {
  return (navigator as { storage?: StorageManagerLike }).storage;
}

export interface StorageStatus {
  persisted: boolean;
  /** Bytes used by this origin, or null when the browser does not report it. */
  usage: number | null;
  /** Bytes available to this origin, or null when unknown. */
  quota: number | null;
}

/** True when an automatic request may be made: never asked, the last ask is 14+ days old, or the clock went backwards. */
export function shouldAskForPersistence(askedAt: number | null, now: number): boolean {
  if (askedAt === null) return true;
  if (now < askedAt) return true;
  return now - askedAt >= PERSIST_RETRY_MS;
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await storageManager()?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/**
 * Asks the browser for persistent storage and records the attempt, so the automatic request is
 * not repeated for 14 days. Resolves true when the browser granted it.
 */
export async function requestStoragePersistence(now: number = Date.now()): Promise<boolean> {
  const manager = storageManager();
  if (!manager?.persist) return false;
  await setSetting('storagePersistAskedAt', now);
  try {
    return await manager.persist();
  } catch {
    return false;
  }
}

/** Startup check: if storage is not persistent and the last ask is old enough, ask once. */
export async function ensureStoragePersistence(now: number = Date.now()): Promise<void> {
  if (await isStoragePersisted()) return;
  const askedAt = await getSetting('storagePersistAskedAt');
  if (!shouldAskForPersistence(askedAt, now)) return;
  await requestStoragePersistence(now);
}

/** Current persistence and usage. Usage is estimated by the browser, so it is approximate. */
export async function readStorageStatus(): Promise<StorageStatus> {
  const persisted = await isStoragePersisted();
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    const estimate = await storageManager()?.estimate?.();
    usage = estimate?.usage ?? null;
    quota = estimate?.quota ?? null;
  } catch {
    // Keep nulls: the row then shows the persistence state without numbers.
  }
  return { persisted, usage, quota };
}

/**
 * Live storage status for Settings > Data. `refresh()` re-reads it, e.g. after a manual request.
 */
export function useStorageStatus(): StorageStatus & { refresh(): void } {
  const [status, setStatus] = useState<StorageStatus>({ persisted: false, usage: null, quota: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void readStorageStatus().then(
      (next) => {
        if (!cancelled) setStatus(next);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { ...status, refresh };
}

let persistenceStarted = false;

/**
 * Runs the startup persistence check once per page load (guards against StrictMode's second
 * effect run). Mount once, in AppShell.
 */
export function useStoragePersistence(): void {
  useEffect(() => {
    if (persistenceStarted) return;
    persistenceStarted = true;
    void ensureStoragePersistence().catch(() => undefined);
  }, []);
}
