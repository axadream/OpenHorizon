const TRACKING_PARAM = /^utm_/i;

/**
 * App-root URL (honours the deploy base path) with an optional query string.
 * `search` is given without the leading '?', e.g. appUrl('article=42') -> '/OpenHorizon/?article=42'.
 */
export function appUrl(search = ''): string {
  return search ? `${import.meta.env.BASE_URL}?${search}` : import.meta.env.BASE_URL;
}

function isHttpUrl(u: URL): boolean {
  return u.protocol === 'http:' || u.protocol === 'https:';
}

/**
 * Resolve `href` against `base` (optional). Returns an absolute http(s) URL,
 * or '' when the input is empty, unparseable, or not http(s) (blocks javascript:, data:, etc.).
 */
export function resolveUrl(href: string | null | undefined, base?: string): string {
  const raw = (href ?? '').trim();
  if (!raw) return '';
  try {
    const u = base ? new URL(raw, base) : new URL(raw);
    return isHttpUrl(u) ? u.href : '';
  } catch {
    return '';
  }
}

/** Lowercase hostname of a URL, or '' when invalid. */
export function hostname(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function stripTracking(u: URL): void {
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
  }
}

/**
 * Canonical form of a feed URL used for duplicate detection:
 * lowercase host, no hash, no utm_* params, no trailing slash on non-root paths.
 * Invalid input is returned trimmed and otherwise unchanged.
 */
export function normalizeFeedUrl(url: string): string {
  const raw = url.trim();
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase();
    u.hash = '';
    stripTracking(u);
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    }
    return u.href;
  } catch {
    return raw;
  }
}

/**
 * Feed-reader scheme prefixes that browsers hand over or users paste: `feed://host/path`,
 * `feed:https://host/path`, `rss:host/path` and `web+rss:https://host/path`. Returns the
 * underlying web address (https is assumed when the scheme does not say), or the input
 * trimmed unchanged when it has no such prefix. '' when nothing is left after the prefix.
 */
export function unwrapFeedScheme(input: string): string {
  const trimmed = input.trim();
  const m = /^(?:web\+rss|feed|rss):(\/\/)?/i.exec(trimmed);
  if (!m) return trimmed;
  const rest = trimmed.slice(m[0].length).trim();
  if (!rest) return '';
  if (/^https?:\/\//i.test(rest)) return rest;
  return `https://${rest.replace(/^\/+/, '')}`;
}

/**
 * User-typed web address normalised for the add-feed fields: feed-scheme prefixes are unwrapped,
 * and https:// is added when no scheme is given. Returns '' for empty input. Validity is not checked here.
 */
export function withWebScheme(input: string): string {
  const t = unwrapFeedScheme(input);
  if (!t || /^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** Article link normalization: removes #fragment and utm_* params. */
export function normalizeArticleUrl(url: string): string {
  const raw = url.trim();
  try {
    const u = new URL(raw);
    u.hash = '';
    stripTracking(u);
    return u.href;
  } catch {
    return raw;
  }
}
