import { unwrapFeedScheme, withWebScheme } from '@/lib/url';
import type { View } from '@/store/types';

/*
 * Pure parsing of the query string the app is launched with. No browser APIs here, so the
 * module is unit-tested directly (launchParams.test.ts). The hook that applies the result is
 * src/hooks/useLaunchParams.ts.
 *
 * Accepted entry points (all client-side; the host is static):
 *   ?feed=<url>            protocol handler web+rss:<url> (manifest protocol_handlers)
 *   ?url=&text=&title=     share target (manifest share_target, GET)
 *   ?action=add            "Add feed" shortcut
 *   ?view=unread|favorites smart-view shortcuts
 *
 * Browsers do not allow registering the `feed:` scheme, so `feed://` text pasted into the app is
 * unwrapped by lib/url (unwrapFeedScheme) instead.
 */

export type LaunchParseResult =
  | { kind: 'add-feed'; url: string }
  | { kind: 'share'; url: string }
  | { kind: 'action'; action: 'add' }
  | { kind: 'view'; view: Extract<View, { type: 'unread' | 'favorites' }>['type'] }
  | { kind: 'none' };

/** Query keys each result consumes; they are removed from the address bar after handling. */
export const LAUNCH_KEYS: Record<Exclude<LaunchParseResult['kind'], 'none'>, readonly string[]> = {
  'add-feed': ['feed'],
  share: ['url', 'text', 'title'],
  action: ['action'],
  view: ['view'],
};

/** A link inside free text: http(s), or a feed-scheme prefix. The lookbehind stops matches inside words. */
const LINK_IN_TEXT_RE = /(?<![\w])(?:https?:\/\/|feed:|web\+rss:|rss:)[^\s<>"']+/gi;
/** Encoded scheme at the start of a value, e.g. `https%3A%2F%2F...` after a double encode. */
const ENCODED_SCHEME_RE = /^(?:https?|feed|web(?:\+|%2b)rss|rss)%3a/i;
/** A feed-reader prefix (feed:, rss:, web+rss:) or an explicit http(s) scheme. */
const EXPLICIT_RE = /^(?:web\+rss|feed|rss):|^https?:\/\//i;
/** A host with at least one dot, optionally followed by a path, query, fragment or port. */
const BARE_HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#:]|$)/i;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Turns one value into an absolute http(s) URL, or '' when it is not one. Accepts feed:, feed:https:,
 * web+rss: and rss: prefixes (https assumed for a bare host after them), double-encoded values, and the
 * `+` that a query string decodes to a space in `web+rss`. Values without a scheme are rejected unless
 * `allowBareHost` is set (used for ?feed=, where `example.com/feed.xml` is a reasonable input).
 */
export function toWebUrl(raw: string | null | undefined, opts: { allowBareHost?: boolean } = {}): string {
  if (!raw) return '';
  let candidate = raw.trim().replace(/^web\s+rss:/i, 'web+rss:');
  if (ENCODED_SCHEME_RE.test(candidate)) candidate = safeDecode(candidate);
  const bare = opts.allowBareHost === true && BARE_HOST_RE.test(candidate);
  if (!EXPLICIT_RE.test(candidate) && !bare) return '';
  const unwrapped = unwrapFeedScheme(candidate);
  if (!unwrapped) return '';
  try {
    const u = new URL(withWebScheme(unwrapped));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

/** First valid web link found in free text (shared text usually carries the link inside a sentence). */
export function firstLinkInText(text: string | null | undefined): string {
  if (!text) return '';
  for (const match of text.matchAll(LINK_IN_TEXT_RE)) {
    const url = toWebUrl(match[0].replace(/[)\].,;:!?]+$/, ''));
    if (url) return url;
  }
  return '';
}

/**
 * Parses a location search string (with or without the leading '?'). Precedence: feed, share,
 * action, view. Anything malformed yields { kind: 'none' } rather than throwing.
 */
export function parseLaunchParams(search: string): LaunchParseResult {
  const params = new URLSearchParams(search);

  const feed = toWebUrl(params.get('feed'), { allowBareHost: true });
  if (feed) return { kind: 'add-feed', url: feed };

  const shared = toWebUrl(params.get('url')) || firstLinkInText(params.get('url')) || firstLinkInText(params.get('text')) || toWebUrl(params.get('title'));
  if (shared) return { kind: 'share', url: shared };

  if (params.get('action') === 'add') return { kind: 'action', action: 'add' };

  const view = params.get('view');
  if (view === 'unread' || view === 'favorites') return { kind: 'view', view };

  return { kind: 'none' };
}

/**
 * Returns `href` without the given query keys, keeping the path and the hash. Used with
 * history.replaceState so a handled link is not replayed on reload.
 */
export function removeSearchParams(href: string, keys: readonly string[]): string {
  const url = new URL(href);
  for (const key of keys) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}
