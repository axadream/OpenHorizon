import { useLiveQuery } from 'dexie-react-hooks';
import { useUiStore } from '@/store/uiStore';

/**
 * Wrapper around `useLiveQuery` (ARCHITECTURE §3). Adds `dbEpoch` to the dependencies so that
 * a bump from the service-worker bridge re-runs every query, even in browsers that do not
 * deliver Dexie change notifications across contexts. Use this instead of `useLiveQuery`.
 */
export function useLive<T>(querier: () => T | Promise<T>, deps?: readonly unknown[]): T | undefined;
export function useLive<T, TDefault>(
  querier: () => T | Promise<T>,
  deps: readonly unknown[],
  defaultResult: TDefault,
): T | TDefault;
export function useLive<T, TDefault>(
  querier: () => T | Promise<T>,
  deps: readonly unknown[] = [],
  defaultResult?: TDefault,
): T | TDefault | undefined {
  const dbEpoch = useUiStore((s) => s.dbEpoch);
  // The querier closes over `deps`; `dbEpoch` is appended so a bump forces a re-run.
  const allDeps = [...deps, dbEpoch];
  return useLiveQuery(querier, allDeps, defaultResult);
}
