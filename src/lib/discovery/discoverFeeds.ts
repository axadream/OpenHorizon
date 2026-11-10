import { parseFeed } from '@/lib/parser/parseFeed';
import type { FeedKind } from '@/lib/parser/types';
import { normalizeFeedUrl, resolveUrl, withWebScheme } from '@/lib/url';
import { parseHtml } from '@/lib/xml/dom';
import { fetchWithProxy } from '@/lib/proxy/fetchWithProxy';

export interface FeedCandidate {
  url: string;
  title?: string;
  kind?: FeedKind;
  source: 'link-tag' | 'anchor' | 'well-known' | 'direct';
  /**
   * true when the candidate was fetched and parsed as a feed; false when it is an
   * unvalidated fallback (every probe failed, e.g. proxies down). Absent when validation was skipped.
   */
  verified?: boolean;
}

export interface DiscoverOptions {
  signal?: AbortSignal;
  /** Default true: probe candidates and keep only those that parse as feeds. */
  validate?: boolean;
  /**
   * Progress for a progress bar. `total` = 2 + the number of link/anchor candidates to validate
   * (2 when validate is false), known only after the page is read: the 'Fetching page' call uses 2.
   * Labels: 'Fetching page', 'Reading links', 'Checking feeds'.
   */
  onProgress?: (done: number, total: number, label: string) => void;
}

const DISCOVER_ACCEPT = 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,*/*';
const FEED_TYPES = new Set(['application/rss+xml', 'application/atom+xml', 'application/feed+json', 'text/xml', 'application/xml']);
/** Feed-looking URL shapes (checked against the resolved href). */
const ANCHOR_RE = /(\/feed|\/rss|\/atom|\.rss|\.xml|feed\.json|\/feeds?\/)(\?|$|\/)/i;
/** Anchor text or href that mentions a feed format. */
const FEED_WORD_RE = /rss|atom|feed/i;
/** Obvious non-feed resources that are never candidates. */
const NON_FEED_EXT_RE = /\.(css|js|png|jpe?g|gif|svg|webp|ico)$/i;
/** Hrefs with these schemes never point at a feed. */
const NON_HTTP_SCHEME_RE = /^(mailto|javascript|tel):/i;
const WELL_KNOWN_PATHS = [
  '/feed',
  '/feed/',
  '/rss',
  '/rss.xml',
  '/atom.xml',
  '/feed.xml',
  '/index.xml',
  '/feed.json',
  '/feeds/posts/default',
  '/?feed=rss2',
];
const MAX_ANCHORS = 30;
const PROBE_LIMIT = 4;
/** At most this many link-tag/anchor candidates are probed; the rest are returned unverified. */
const MAX_VALIDATE = 12;
const VALIDATE_CONCURRENCY = 3;
const VALIDATE_TIMEOUT_MS = 10_000;

interface Probe {
  kind: FeedKind;
  title?: string;
}

/**
 * Discover feeds for a page or URL. Returns [] only when no candidate at all is found.
 * With validate (default), candidates that fail every probe are still returned as
 * verified: false when nothing verified, so the user can try them.
 */
export async function discoverFeeds(input: string, opts: DiscoverOptions = {}): Promise<FeedCandidate[]> {
  const validate = opts.validate ?? true;
  const url = toUrl(input);
  throwIfAborted(opts.signal);

  // Step 2: fetch. Errors (FetchAllFailedError) propagate to the caller.
  const res = await fetchWithProxy(url.href, { accept: DISCOVER_ACCEPT, expectHtml: true, signal: opts.signal });
  throwIfAborted(opts.signal);
  // The candidate count is not known yet, so the page step reports the minimum total.
  opts.onProgress?.(1, 2, 'Fetching page');

  // Step 3: the URL itself is a feed.
  const direct = await tryParse(res.text, res.finalUrl);
  if (direct) {
    return [{ url: res.finalUrl, title: direct.title || undefined, kind: direct.kind, source: 'direct', verified: true }];
  }

  // Step 4: HTML page -> <link rel=alternate> and feed-looking anchors.
  const doc = parseHtml(res.text);
  const base = resolveBase(doc, res.finalUrl);
  const linkCands = collectLinkTags(doc, base);
  const anchorCands = collectAnchors(doc, base);
  const allCands = dedupe([...linkCands, ...anchorCands]);
  const toValidate = validate ? allCands.slice(0, MAX_VALIDATE) : [];
  const deferred = validate ? allCands.slice(MAX_VALIDATE) : [];
  const total = 2 + toValidate.length;
  opts.onProgress?.(2, total, 'Reading links');

  // Step 5: platform hints and well-known paths (origin and input path).
  const wellKnown = dedupe([...platformCandidates(url, res.text), ...wellKnownCandidates(url)]);

  if (!validate) {
    return dedupe([...linkCands, ...anchorCands, ...wellKnown]);
  }

  // Step 6: validate the first MAX_VALIDATE link-tag/anchor candidates (concurrency 3), then probe
  // at most PROBE_LIMIT well-known candidates sequentially, stopping at the first success.
  let done = 2;
  const validatedLinks = await mapLimit(toValidate, VALIDATE_CONCURRENCY, async (c) => {
    const result = await validateCandidate(c, opts.signal);
    done++;
    opts.onProgress?.(done, total, 'Checking feeds');
    return result;
  });

  let wellKnownHit: FeedCandidate | null = null;
  for (const c of wellKnown.slice(0, PROBE_LIMIT)) {
    throwIfAborted(opts.signal);
    const probe = await probeUrl(c.url, opts.signal);
    if (probe) {
      wellKnownHit = { ...c, kind: probe.kind, title: c.title ?? probe.title, verified: true };
      break;
    }
  }

  const ordered: FeedCandidate[] = [];
  for (const c of validatedLinks) if (c) ordered.push(c);
  if (wellKnownHit) ordered.push(wellKnownHit);
  if (ordered.length > 0) {
    // Candidates beyond MAX_VALIDATE are offered after the verified ones, unverified.
    return dedupe([...ordered, ...deferred.map((c) => ({ ...c, verified: false }))]);
  }

  // No probe succeeded (proxies may all be down): offer the unvalidated link/anchor candidates.
  throwIfAborted(opts.signal);
  return dedupe([...linkCands, ...anchorCands].map((c) => ({ ...c, verified: false })));
}

function toUrl(input: string): URL {
  let u: URL;
  try {
    u = new URL(withWebScheme(input));
  } catch {
    throw new Error('Enter a valid web address');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Enter a valid web address');
  return u;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}

async function tryParse(text: string, sourceUrl: string): Promise<{ kind: FeedKind; title: string } | null> {
  try {
    const parsed = await parseFeed(text, sourceUrl);
    return { kind: parsed.kind, title: parsed.title };
  } catch {
    return null;
  }
}

async function probeUrl(url: string, signal?: AbortSignal): Promise<Probe | null> {
  try {
    const res = await fetchWithProxy(url, { timeoutMs: VALIDATE_TIMEOUT_MS, signal });
    const parsed = await parseFeed(res.text, res.finalUrl);
    return { kind: parsed.kind, title: parsed.title || undefined };
  } catch {
    return null;
  }
}

async function validateCandidate(c: FeedCandidate, signal?: AbortSignal): Promise<FeedCandidate | null> {
  const probe = await probeUrl(c.url, signal);
  if (!probe) return null;
  return { ...c, kind: probe.kind, title: c.title ?? probe.title, verified: true };
}

function absolute(href: string, base: string): string | null {
  const r = resolveUrl(href, base);
  return r && /^https?:\/\//i.test(r) ? r : null;
}

function resolveBase(doc: Document, fallback: string): string {
  const baseEl = doc.getElementsByTagName('base')[0];
  const href = baseEl?.getAttribute('href')?.trim();
  if (!href) return fallback;
  return absolute(href, fallback) ?? fallback;
}

function collectLinkTags(doc: Document, base: string): FeedCandidate[] {
  const out: FeedCandidate[] = [];
  for (const el of Array.from(doc.getElementsByTagName('link'))) {
    const rel = (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('alternate')) continue;
    const type = (el.getAttribute('type') ?? '').trim().toLowerCase();
    const href = (el.getAttribute('href') ?? '').trim();
    const title = (el.getAttribute('title') ?? '').trim();
    if (!href) continue;
    const isFeed = FEED_TYPES.has(type) || (type === 'application/json' && /feed|json/i.test(`${title} ${href}`));
    if (!isFeed) continue;
    const u = absolute(href, base);
    if (!u) continue;
    out.push({ url: u, title: title || undefined, source: 'link-tag' });
  }
  return out;
}

function collectAnchors(doc: Document, base: string): FeedCandidate[] {
  const out: FeedCandidate[] = [];
  for (const a of Array.from(doc.getElementsByTagName('a'))) {
    if (out.length >= MAX_ANCHORS) break;
    const href = (a.getAttribute('href') ?? '').trim();
    if (!href || href.startsWith('#') || NON_HTTP_SCHEME_RE.test(href)) continue;
    const u = absolute(href, base);
    if (!u) continue;
    const path = u.split(/[?#]/)[0] ?? u;
    if (NON_FEED_EXT_RE.test(path)) continue;
    const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
    const looksLikeFeed =
      ANCHOR_RE.test(u) || /\.xml$/i.test(path) || FEED_WORD_RE.test(href) || FEED_WORD_RE.test(text);
    if (!looksLikeFeed) continue;
    out.push(text ? { url: u, title: text, source: 'anchor' } : { url: u, source: 'anchor' });
  }
  return out;
}

function platformCandidates(input: URL, html: string): FeedCandidate[] {
  const host = input.hostname.toLowerCase().replace(/^www\./, '');
  const path = input.pathname;
  const urls: string[] = [];

  if (host === 'youtube.com') {
    const channelId =
      /^\/channel\/(UC[\w-]+)/.exec(path)?.[1] ??
      /"channelId":"(UC[\w-]+)"/.exec(html)?.[1] ??
      /<meta itemprop="channelId" content="(UC[\w-]+)"/.exec(html)?.[1];
    const user = /^\/user\/([^/?#]+)/.exec(path)?.[1];
    if (channelId) urls.push(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    else if (user) urls.push(`https://www.youtube.com/feeds/videos.xml?user=${user}`);
  } else if (host === 'reddit.com') {
    const sub = /^\/r\/([^/?#]+)/.exec(path)?.[1];
    if (sub) urls.push(`https://www.reddit.com/r/${sub}/.rss`);
  } else if (host === 'medium.com') {
    const author = /^\/(@[^/?#]+)/.exec(path)?.[1];
    if (author) urls.push(`https://medium.com/feed/${author}`);
  } else if (host === 'github.com') {
    const m = /^\/([^/?#]+)\/([^/?#]+?)\/?$/.exec(path);
    if (m) {
      urls.push(`https://github.com/${m[1]}/${m[2]}/releases.atom`, `https://github.com/${m[1]}/${m[2]}/commits.atom`);
    }
  }

  return urls.map((u) => ({ url: u, source: 'well-known' as const }));
}

function wellKnownCandidates(input: URL): FeedCandidate[] {
  const fromOrigin = WELL_KNOWN_PATHS.map((p) => new URL(p, input.origin).href);
  const fromPath = WELL_KNOWN_PATHS.map((p) => new URL(p.replace(/^\//, ''), input).href);
  return [...fromOrigin, ...fromPath].map((u) => ({ url: u, source: 'well-known' as const }));
}

function dedupe(list: FeedCandidate[]): FeedCandidate[] {
  const seen = new Set<string>();
  const out: FeedCandidate[] = [];
  for (const c of list) {
    let key: string;
    try {
      key = normalizeFeedUrl(c.url);
    } catch {
      key = c.url;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return out;
}
