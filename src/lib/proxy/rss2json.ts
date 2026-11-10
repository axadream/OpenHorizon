/** Shape of the parts of an rss2json.com API response that the app reads. */
interface Rss2JsonEnclosure {
  link?: string | null;
  type?: string | null;
  length?: string | number | null;
}

interface Rss2JsonItem {
  guid?: string | null;
  link?: string | null;
  title?: string | null;
  pubDate?: string | null;
  author?: string | null;
  thumbnail?: string | null;
  description?: string | null;
  content?: string | null;
  enclosure?: Rss2JsonEnclosure | [] | null;
}

interface Rss2JsonFeed {
  title?: string | null;
  link?: string | null;
  description?: string | null;
  image?: string | null;
}

interface Rss2JsonResponse {
  status?: string;
  message?: string;
  feed?: Rss2JsonFeed;
  items?: Rss2JsonItem[];
}

const RSS2JSON_DATE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

/** rss2json gives "YYYY-MM-DD HH:mm:ss" in UTC; make it ISO 8601 so the date parser accepts it. */
function isoDate(value: string | null | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  const m = RSS2JSON_DATE.exec(v);
  return m ? `${m[1]}T${m[2]}Z` : v;
}

function enclosureOf(item: Rss2JsonItem): Rss2JsonEnclosure | undefined {
  const e = item.enclosure;
  if (!e || Array.isArray(e)) return undefined;
  return e;
}

/**
 * Convert an rss2json.com API response into a JSON Feed 1.1 document (as text), so the
 * existing parseFeed -> parseJsonFeed path handles it. Throws when rss2json reports an error.
 */
export function rss2jsonToJsonFeedText(raw: string, requestedUrl: string): string {
  let json: Rss2JsonResponse;
  try {
    json = JSON.parse(raw) as Rss2JsonResponse;
  } catch {
    throw new Error('rss2json returned invalid JSON');
  }
  if (json.status !== 'ok' || !Array.isArray(json.items)) {
    throw new Error(json.message || 'rss2json error');
  }
  const feed = json.feed ?? {};
  const items = json.items.map((i) => {
    const enc = enclosureOf(i);
    const encUrl = enc?.link?.trim() || undefined;
    const length = Number(enc?.length);
    return {
      id: i.guid?.trim() || i.link?.trim() || undefined,
      url: i.link?.trim() || undefined,
      title: i.title ?? undefined,
      content_html: i.content || i.description || undefined,
      summary: i.description ?? undefined,
      date_published: isoDate(i.pubDate),
      authors: i.author ? [{ name: i.author }] : undefined,
      image: i.thumbnail?.trim() || encUrl || undefined,
      attachments: encUrl
        ? [
            {
              url: encUrl,
              mime_type: enc?.type?.trim() || undefined,
              size_in_bytes: Number.isFinite(length) && length > 0 ? length : undefined,
            },
          ]
        : undefined,
    };
  });
  const doc = {
    version: 'https://jsonfeed.org/version/1.1',
    title: feed.title ?? undefined,
    home_page_url: feed.link ?? undefined,
    feed_url: requestedUrl,
    description: feed.description ?? undefined,
    icon: feed.image || undefined,
    items,
  };
  return JSON.stringify(doc);
}
