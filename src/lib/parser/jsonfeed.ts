import { resolveUrl } from '@/lib/url';
import { cleanText, escapeXml } from '@/lib/text';
import { firstImgSrc, toInt } from './media';
import { parseDate } from './dates';
import { MAX_ITEMS, NotAFeedError, buildItem, type ParsedFeed, type ParsedItem } from './types';

type Json = Record<string, unknown>;

const JSON_FEED_VERSION = 'https://jsonfeed.org/version/';

/** True for JSON Feed 1.x documents (version string, or items array plus title). */
export function isJsonFeed(obj: unknown): obj is Json {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const o = obj as Json;
  if (typeof o.version === 'string' && o.version.startsWith(JSON_FEED_VERSION)) return true;
  return Array.isArray(o.items) && typeof o.title === 'string';
}

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/** Normalize a parsed JSON Feed object. */
export function parseJsonFeed(obj: unknown, sourceUrl: string): ParsedFeed {
  if (!isJsonFeed(obj)) throw new NotAFeedError('Not a JSON Feed');
  const home = resolveUrl(str(obj.home_page_url), sourceUrl) || undefined;
  const feedUrl = resolveUrl(str(obj.feed_url), sourceUrl) || sourceUrl;
  const base = home || sourceUrl;
  const rawItems = Array.isArray(obj.items) ? (obj.items as unknown[]) : [];

  const items: ParsedItem[] = rawItems
    .filter((it): it is Json => !!it && typeof it === 'object')
    .slice(0, MAX_ITEMS)
    .map(it => jsonItem(it, base));

  return {
    kind: 'json',
    title: cleanText(str(obj.title)) || home || sourceUrl,
    description: cleanText(str(obj.description)) || undefined,
    siteUrl: home,
    feedUrl,
    language: str(obj.language) || undefined,
    iconUrl: resolveUrl(str(obj.icon) || str(obj.favicon), base) || undefined,
    items,
  };
}

function jsonItem(it: Json, base: string): ParsedItem {
  const contentHtml = str(it.content_html);
  const contentText = str(it.content_text);
  const summary = str(it.summary);
  const contentRaw = contentHtml || (contentText ? `<p>${escapeXml(contentText)}</p>` : '') || summary;

  const authors = Array.isArray(it.authors) ? (it.authors as unknown[]) : [];
  const firstAuthor = authors.find((a): a is Json => !!a && typeof a === 'object');
  const legacy = it.author && typeof it.author === 'object' ? (it.author as Json) : undefined;
  const author = str(firstAuthor?.name) || str(legacy?.name) || undefined;

  const attachments = Array.isArray(it.attachments) ? (it.attachments as unknown[]) : [];
  const enclosures: { url: string; type?: string; length?: number }[] = [];
  for (const a of attachments) {
    if (!a || typeof a !== 'object') continue;
    const att = a as Json;
    const url = resolveUrl(str(att.url), base);
    if (!url) continue;
    enclosures.push({
      url,
      type: str(att.mime_type) || undefined,
      length: toInt(typeof att.size_in_bytes === 'number' ? String(att.size_in_bytes) : undefined),
    });
  }

  const link = resolveUrl(str(it.url) || str(it.external_url), base);
  const thumbnailUrl =
    resolveUrl(str(it.image) || str(it.banner_image), base) || resolveUrl(firstImgSrc(contentHtml) ?? '', base);

  const tags = Array.isArray(it.tags) ? (it.tags as unknown[]).map(str).filter(Boolean) : [];

  return buildItem({
    id: str(it.id) || undefined,
    link,
    title: str(it.title),
    author,
    contentRaw,
    summarySource: summary || contentRaw,
    publishedAt: parseDate(str(it.date_published)) ?? parseDate(str(it.date_modified)),
    thumbnailUrl: thumbnailUrl || undefined,
    enclosures,
    categories: tags,
  });
}
