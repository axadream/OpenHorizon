import { hostname } from '@/lib/url';
import { getProxies, type ProxyDef, type ProxyId } from './proxies';
import {
  type AttemptId,
  recordFailure,
  recordHostFailure,
  recordHostSuccess,
  recordSuccess,
  shouldSkip,
  shouldSkipDirectForHost,
} from './failureMemory';
import { rss2jsonToJsonFeedText } from './rss2json';

export type FetchVia = 'direct' | ProxyId;

export interface FetchOptions {
  etag?: string;
  lastModified?: string;
  /** Overrides every attempt's timeout. Default: per-proxy timeoutMs, else 15000. */
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
  /**
   * Direct: response.url. Local proxy: X-OH-Final-Url when present. allorigins /get: status.url
   * when it is http(s). Other proxies: the requested URL.
   */
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

/**
 * Hedged requests: when a route has neither failed nor answered after this long, the next route
 * starts too. The slower route is not cancelled by the stagger alone; the first success wins.
 */
export const HEDGE_MS = 2_500;

const DEFAULT_TIMEOUT_MS = 15_000;
// Keep under 128 bytes so the Accept header stays CORS-safelisted (no preflight on direct fetches).
const FEED_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*;q=0.5';

interface Attempt {
  via: FetchVia;
  id: AttemptId;
  passesHeaders: boolean;
  kind: NonNullable<ProxyDef['kind']>;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
  target: string;
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isProxyErrorPage(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) && !/<(rss|feed|rdf:RDF)\b/i.test(text);
}

function finalUrlFor(via: FetchVia, response: Response, requested: string): string {
  if (via === 'direct') return response.url || requested;
  if (via === 'local') return response.headers.get('x-oh-final-url') ?? requested;
  return requested;
}

/**
 * Unwrap an allorigins `/get` body: `{ contents, status: { url, content_type, http_code } }`.
 * Throws when the upstream status is an error or the contents are empty.
 */
function unwrapAllOrigins(body: string, requested: string): { text: string; contentType?: string; finalUrl: string } {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error('proxy returned invalid JSON');
  }
  const wrapper = (json ?? {}) as { contents?: unknown; status?: unknown };
  const status: { url?: unknown; content_type?: unknown; http_code?: unknown } =
    typeof wrapper.status === 'object' && wrapper.status !== null ? wrapper.status : {};

  if (status.http_code !== undefined && status.http_code !== null) {
    const code = Number(status.http_code);
    if (Number.isFinite(code) && code >= 400) throw new Error(`HTTP ${code}`);
  }
  const contents = wrapper.contents;
  if (typeof contents !== 'string' || contents.trim().length === 0) throw new Error('empty response');

  const statusUrl = typeof status.url === 'string' ? status.url : '';
  return {
    text: contents,
    contentType: typeof status.content_type === 'string' ? status.content_type : undefined,
    finalUrl: /^https?:\/\//i.test(statusUrl) ? statusUrl : requested,
  };
}

function buildAttempts(url: string, host: string, now: number, expectHtml: boolean): Attempt[] {
  const all: Attempt[] = [];
  if (!(host && shouldSkipDirectForHost(host, now))) {
    all.push({ via: 'direct', id: 'direct', passesHeaders: true, kind: 'raw', target: url });
  }
  for (const p of getProxies()) {
    // rss2json only understands feeds, never HTML pages (discovery).
    if (p.kind === 'rss2json' && expectHtml) continue;
    all.push({
      via: p.id,
      id: p.id,
      passesHeaders: p.passesHeaders,
      kind: p.kind ?? 'raw',
      extraHeaders: p.extraHeaders,
      timeoutMs: p.timeoutMs,
      target: p.build(url),
    });
  }
  // Skip cooled-down attempts; if everything is cooling down, ignore the cooldown and try all.
  const active = all.filter((a) => !shouldSkip(a.id, now));
  return active.length > 0 ? active : all;
}

/**
 * One route. `ctrl` belongs to this attempt only: the race aborts it when another route wins.
 * An attempt cancelled by the race (or by the caller) is not recorded as a failure.
 */
async function attemptOne(
  a: Attempt,
  url: string,
  host: string,
  opts: FetchOptions,
  ctrl: AbortController,
): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? a.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    if (ctrl.signal.aborted) return;
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);

  try {
    const headers: Record<string, string> = { Accept: opts.accept ?? FEED_ACCEPT, ...a.extraHeaders };
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

    const body = await response.text();
    if (body.trim().length === 0) throw new Error('empty response');

    let text = body;
    let contentType = response.headers.get('content-type') ?? undefined;
    let finalUrl = finalUrlFor(a.via, response, url);
    if (a.kind === 'rss2json') {
      // Converted to JSON Feed text; the error-page check does not apply to JSON.
      text = rss2jsonToJsonFeedText(body, url);
      contentType = 'application/feed+json';
    } else {
      if (a.kind === 'allorigins-json') {
        const wrapped = unwrapAllOrigins(body, url);
        text = wrapped.text;
        contentType = wrapped.contentType;
        finalUrl = wrapped.finalUrl;
      }
      if (a.via !== 'direct' && !opts.expectHtml && isProxyErrorPage(text)) {
        throw new Error('proxy returned an HTML error page');
      }
    }

    recordSuccess(a.id);
    if (a.via === 'direct') recordHostSuccess(host);
    return {
      status: response.status,
      text,
      etag,
      lastModified,
      contentType,
      finalUrl,
      via: a.via,
    };
  } catch (err) {
    // Cancelled by the race (another route won, or the caller aborted): not a failure of this route.
    const cancelled = !timedOut && ctrl.signal.aborted;
    if (!cancelled) {
      recordFailure(a.id);
      if (a.via === 'direct') recordHostFailure(host);
    }
    if (timedOut) throw new Error(`timed out after ${timeoutMs} ms`);
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/**
 * Fetch a feed URL: direct -> env proxy (if set) -> local /api/proxy -> jina -> alloriginsget
 * -> allorigins -> corsproxy -> codetabs -> rss2json (rss2json skipped when opts.expectHtml).
 * Routes are hedged: the next one starts when the running one fails or after HEDGE_MS, the first
 * success wins and the rest are aborted. Throws FetchAllFailedError (attempts in attempt order)
 * when every route fails, or AbortError when the caller aborts.
 */
export function fetchWithProxy(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  if (opts.signal?.aborted) return Promise.reject(abortError());

  const now = Date.now();
  const host = hostname(url);
  const attempts = buildAttempts(url, host, now, opts.expectHtml === true);
  if (attempts.length === 0) return Promise.reject(new FetchAllFailedError(`Could not fetch ${url}`, []));

  return new Promise<FetchResult>((resolve, reject) => {
    const controllers = attempts.map(() => new AbortController());
    const errors: (FetchAttemptError | undefined)[] = attempts.map(() => undefined);
    let nextIndex = 0;
    let inFlight = 0;
    let settled = false;
    let staggerTimer: ReturnType<typeof setTimeout> | undefined;

    function stopStagger(): void {
      if (staggerTimer !== undefined) {
        clearTimeout(staggerTimer);
        staggerTimer = undefined;
      }
    }

    function settle(): void {
      settled = true;
      stopStagger();
      opts.signal?.removeEventListener('abort', onUserAbort);
    }

    /** Abort every route still running, except the winner at index `keep`. */
    function cancelOthers(keep: number): void {
      controllers.forEach((c, i) => {
        if (i !== keep) c.abort();
      });
    }

    function onUserAbort(): void {
      if (settled) return;
      settle();
      cancelOthers(-1);
      reject(abortError());
    }

    function launchNext(): void {
      stopStagger();
      if (settled || nextIndex >= attempts.length) return;
      const i = nextIndex;
      nextIndex++;
      const a = attempts[i] as Attempt;
      const ctrl = controllers[i] as AbortController;
      inFlight++;

      attemptOne(a, url, host, opts, ctrl).then(
        (res) => {
          inFlight--;
          if (settled) return;
          settle();
          cancelOthers(i);
          resolve(res);
        },
        (err: unknown) => {
          inFlight--;
          if (settled) return;
          errors[i] = { via: a.via, error: errorMessage(err) };
          if (nextIndex < attempts.length) {
            launchNext();
            return;
          }
          if (inFlight === 0) {
            settle();
            reject(new FetchAllFailedError(`Could not fetch ${url}`, errors.filter(isDefined)));
          }
        },
      );

      // Hedge: if this route has not settled after HEDGE_MS, start the next one as well.
      if (!settled && nextIndex < attempts.length) {
        staggerTimer = setTimeout(() => {
          staggerTimer = undefined;
          launchNext();
        }, HEDGE_MS);
      }
    }

    opts.signal?.addEventListener('abort', onUserAbort, { once: true });
    launchNext();
  });
}
