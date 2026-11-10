import type { ProxyDef } from './proxies';

export type AttemptId = ProxyDef['id'] | 'direct';
// ProxyDef['id'] already includes 'corsproxy' and 'rss2json'.

interface Health {
  consecutiveFailures: number;
  lastFailureAt: number;
  lastSuccessAt: number;
}

const PROXY_FAILURE_THRESHOLD = 3;
const PROXY_COOLDOWN_MS = 5 * 60_000;
const HOST_FAILURE_THRESHOLD = 2;
const HOST_COOLDOWN_MS = 24 * 60 * 60_000;

const health = new Map<AttemptId, Health>();
const directByHost = new Map<string, Health>();

const EMPTY: Health = { consecutiveFailures: 0, lastFailureAt: 0, lastSuccessAt: 0 };

/** True while a proxy (or the global direct attempt) is cooling down after repeated failures. */
export function shouldSkip(id: AttemptId, now: number = Date.now()): boolean {
  const h = health.get(id);
  return !!h && h.consecutiveFailures >= PROXY_FAILURE_THRESHOLD && now - h.lastFailureAt < PROXY_COOLDOWN_MS;
}

/** True when direct fetching is disabled for one feed host (CORS failure is a host property). */
export function shouldSkipDirectForHost(host: string, now: number = Date.now()): boolean {
  const h = directByHost.get(host);
  return !!h && h.consecutiveFailures >= HOST_FAILURE_THRESHOLD && now - h.lastFailureAt < HOST_COOLDOWN_MS;
}

export function recordSuccess(id: AttemptId, now: number = Date.now()): void {
  const h = health.get(id) ?? EMPTY;
  health.set(id, { consecutiveFailures: 0, lastFailureAt: h.lastFailureAt, lastSuccessAt: now });
}

export function recordFailure(id: AttemptId, now: number = Date.now()): void {
  const h = health.get(id) ?? EMPTY;
  health.set(id, { consecutiveFailures: h.consecutiveFailures + 1, lastFailureAt: now, lastSuccessAt: h.lastSuccessAt });
}

export function recordHostSuccess(host: string, now: number = Date.now()): void {
  const h = directByHost.get(host) ?? EMPTY;
  directByHost.set(host, { consecutiveFailures: 0, lastFailureAt: h.lastFailureAt, lastSuccessAt: now });
}

export function recordHostFailure(host: string, now: number = Date.now()): void {
  const h = directByHost.get(host) ?? EMPTY;
  directByHost.set(host, { consecutiveFailures: h.consecutiveFailures + 1, lastFailureAt: now, lastSuccessAt: h.lastSuccessAt });
}

/** Test helper: forget all recorded failures. */
export function resetFailureMemory(): void {
  health.clear();
  directByHost.clear();
}
