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
