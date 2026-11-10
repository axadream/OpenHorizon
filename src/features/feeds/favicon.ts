import type { Feed } from '@/db/schema';
import { hostname } from '@/lib/url';

/**
 * Ordered favicon sources for a feed. FeedAvatar tries them in order on error and
 * falls back to the letter avatar when all fail. Empty host (manual feeds) yields
 * only the parsed icon, if any.
 */
export function faviconCandidates(feed: Pick<Feed, 'siteUrl' | 'url'>, parsedIconUrl?: string): string[] {
  const host = hostname(feed.siteUrl ?? feed.url);
  const list: string[] = [];
  if (parsedIconUrl) list.push(parsedIconUrl);
  if (host) {
    list.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
      `https://icons.duckduckgo.com/ip3/${host}.ico`,
    );
  }
  return list;
}

/** A feed-provided icon is used directly only when it looks like a site icon, not a banner. */
export function looksLikeSiteIcon(iconUrl: string): boolean {
  try {
    const u = new URL(iconUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return /\.(ico|png)$/i.test(u.pathname) && /icon|logo|favicon/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Value stored in `Feed.faviconUrl` at subscribe time. undefined → letter avatar. */
export function initialFaviconUrl(feed: Pick<Feed, 'siteUrl' | 'url'>, parsedIconUrl?: string): string | undefined {
  if (parsedIconUrl && looksLikeSiteIcon(parsedIconUrl)) return parsedIconUrl;
  const sources = faviconCandidates(feed);
  return sources[0];
}
