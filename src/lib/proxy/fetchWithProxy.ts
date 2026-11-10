import { hostname } from '@/lib/url';
import { getProxies } from './proxies';
import {
  type AttemptId,
  recordFailure,
  recordHostFailure,
  recordHostSuccess,
  recordSuccess,
  shouldSkip,
  shouldSkipDirectForHost,
} from './failureMemory';

export type FetchVia = 'direct' | 'env' | 'local' | 'allorigins' | 'codetabs';

export interface FetchOptions {
  etag?: string;
  lastModified?: string;
  /** Default 15000. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Default: feed Accept header. */
  accept?: string;
  /** Discovery fetches HTML pages: skip the feed-expecting proxy error-page check. */
  expectHtml?: boolean;
}

export interface FetchResult {
  status: number; // 200 or 304
  text: string; // "" on 304
  etag?: string;
  lastModified?: string; // only when via === 'direct' | 'env' | 'local'
  contentType?: string;
  /** Direct: response.url. Local proxy: X-OH-Final-Url when present. Other proxies: the requested URL. */
  finalUrl: string;
  via: FetchVia;
}

export interface FetchAttemptError {
  via: FetchVia;
  error: string;
}

export class FetchAllFailedError extends Error {
  readonly attempts: FetchAttemptError[];

  constructor(message: string, attempts: FetchAttemptError[]) {
    super(message);
    this.name = 'FetchAllFailedError';
    this.attempts = attempts;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
// Keep under 128 bytes so the Accept header stays CORS-safelisted (no preflight on direct fetches).
const FEED_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*;q=0.5';

interface Attempt {
  via: FetchVia;
  id: AttemptId;
  passesHeaders: boolean;
  target: string;
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function isProxyErrorPage(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) && !/<(rss|feed|rdf:RDF)\b/i.test(text);
}

function finalUrlFor(via: FetchVia, response: Response, requested: string): string {
  if (via === 'direct') return response.url || requested;
  if (via === 'local') return response.headers.get('x-oh-final-url') ?? requested;
  return requested;
}

function buildAttempts(url: string, host: string, now: number): Attempt[] {
  const all: Attempt[] = [];
  if (!(host && shouldSkipDirectForHost(host, now))) {
    all.push({ via: 'direct', id: 'direct', passesHeaders: true, target: url });
  }
  for (const p of getProxies()) {
    all.push({ via: p.id, id: p.id, passesHeaders: p.passesHeaders, target: p.build(url) });
  }
  // Skip cooled-down attempts; if everything is cooling down, ignore the cooldown and try all.
  const active = all.filter((a) => !shouldSkip(a.id, now));
  return active.length > 0 ? active : all;
}

async function attemptOne(a: Attempt, url: string, host: string, opts: FetchOptions): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onUserAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onUserAbort, { once: true });

  try {
    const headers: Record<string, string> = { Accept: opts.accept ?? FEED_ACCEPT };
    // Conditional headers only on hops that pass them through (direct/env/local); no custom X-* headers.
    if (a.passesHeaders) {
      if (opts.etag) headers['If-None-Match'] = opts.etag;
      if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified;
    }

    const response = await fetch(a.target, {
      method: 'GET',
      headers,
      signal: ctrl.signal,
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
    });

    const etag = a.passesHeaders ? (response.headers.get('etag') ?? undefined) : undefined;
    const lastModified = a.passesHeaders ? (response.headers.get('last-modified') ?? undefined) : undefined;

    if (response.status === 304 && a.passesHeaders) {
      recordSuccess(a.id);
      if (a.via === 'direct') recordHostSuccess(host);
      return { status: 304, text: '', etag, lastModified, finalUrl: url, via: a.via };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    if (text.trim().length === 0) throw new Error('empty response');
    if (a.via !== 'direct' && !opts.expectHtml && isProxyErrorPage(text)) {
      throw new Error('proxy returned an HTML error page');
    }

    recordSuccess(a.id);
    if (a.via === 'direct') recordHostSuccess(host);
    return {
      status: response.status,
      text,
      etag,
      lastModified,
      contentType: response.headers.get('content-type') ?? undefined,
      finalUrl: finalUrlFor(a.via, response, url),
      via: a.via,
    };
  } catch (err) {
    if (!opts.signal?.aborted) {
      recordFailure(a.id);
      if (a.via === 'direct') recordHostFailure(host);
    }
    if (timedOut) throw new Error(`timed out after ${timeoutMs} ms`);
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onUserAbort);
  }
}

/**
 * Fetch a feed URL: direct -> env proxy (if set) -> local /api/proxy -> allorigins -> codetabs.
 * Throws FetchAllFailedError with per-attempt errors when every attempt fails.
 */
export async function fetchWithProxy(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const now = Date.now();
  const host = hostname(url);
  const attempts = buildAttempts(url, host, now);
  const errors: FetchAttemptError[] = [];

  for (const a of attempts) {
    if (opts.signal?.aborted) throw abortError();
    try {
      return await attemptOne(a, url, host, opts);
    } catch (err) {
      if (opts.signal?.aborted) throw abortError();
      errors.push({ via: a.via, error: err instanceof Error ? err.message : String(err) });
    }
  }
  throw new FetchAllFailedError(`Could not fetch ${url}`, errors);
}
