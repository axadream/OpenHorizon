import { resolveUrl } from '@/lib/url';
import { cleanText } from '@/lib/text';
import { NS, attr, child, children, text } from '../xml/dom';
import { firstImgSrc, isImageType, largestByWidth, toInt } from './media';
import { parseDate } from './dates';
import { MAX_ITEMS, NotAFeedError, buildItem, type ParsedFeed, type ParsedItem } from './types';

/** "a@b.com (Jane Doe)" -> "Jane Doe" */
export function cleanAuthor(raw: string): string {
  const m = raw.match(/^[^\s@]+@[^\s@]+\s*\((.+)\)$/);
  return (m ? m[1] : raw).trim();
}

/** Parse RSS 2.0 (and 0.9x) from a document whose root is <rss> or <channel>. */
export function parseRss2(doc: Document, sourceUrl: string): ParsedFeed {
  const root = doc.documentElement;
  const channel = root.localName === 'channel' ? root : child(root, 'channel');
  if (!channel) throw new NotAFeedError('RSS document without <channel>');

  const xmlBase = attr(channel, 'xml:base') || attr(root, 'xml:base');
  const siteUrl = resolveUrl(text(child(channel, 'link')), sourceUrl) || undefined;
  const base = xmlBase || siteUrl || sourceUrl;

  const self = children(channel, 'link', NS.atom).find(l => attr(l, 'rel') === 'self');
  const feedUrl = resolveUrl(attr(self, 'href'), sourceUrl) || sourceUrl;

  const lastBuild = parseDate(text(child(channel, 'lastBuildDate')));
  const itemEls = children(channel, 'item');
  const sources = itemEls.length ? itemEls : children(root, 'item');

  const items: ParsedItem[] = sources.slice(0, MAX_ITEMS).map(el => rssItem(el, base, lastBuild));

  const description = cleanText(text(child(channel, 'description')));
  return {
    kind: 'rss2',
    title: cleanText(text(child(channel, 'title'))) || siteUrl || sourceUrl,
    description: description || undefined,
    siteUrl,
    feedUrl,
    language: text(child(channel, 'language')) || undefined,
    iconUrl: resolveUrl(text(child(child(channel, 'image'), 'url')), base) || undefined,
    items,
  };
}

function rssItem(el: Element, base: string, lastBuild: number | null): ParsedItem {
  const itemBase = attr(el, 'xml:base') || base;
  const guidEl = child(el, 'guid');
  const guidText = text(guidEl);
  const isPermaLink = attr(guidEl, 'isPermaLink') !== 'false';

  const enclosures: { url: string; type?: string; length?: number }[] = [];
  for (const e of children(el, 'enclosure')) {
    const url = resolveUrl(attr(e, 'url'), itemBase);
    if (url) enclosures.push({ url, type: attr(e, 'type') || undefined, length: toInt(attr(e, 'length')) });
  }

  // media:content: images feed the thumbnail, everything else becomes an enclosure
  const imageCandidates: { url: string; width?: number }[] = [];
  for (const m of children(el, 'content', NS.media)) {
    const url = resolveUrl(attr(m, 'url'), itemBase);
    if (!url) continue;
    const type = attr(m, 'type') || undefined;
    if (attr(m, 'medium') === 'image' || isImageType(type)) {
      imageCandidates.push({ url, width: toInt(attr(m, 'width')) });
    } else {
      enclosures.push({ url, type, length: toInt(attr(m, 'fileSize')) });
    }
  }

  let link = resolveUrl(text(child(el, 'link')), itemBase);
  if (!link && guidText && isPermaLink) link = resolveUrl(guidText, itemBase);
  if (!link && enclosures[0]) link = enclosures[0].url;

  const description = text(child(el, 'description'));
  const encoded = text(child(el, 'encoded', NS.content));
  const contentRaw = encoded || description;

  // resolveUrl returns '' on failure, so the chain uses || (not ??)
  const thumbnailUrl =
    largestByWidth(imageCandidates)?.url ||
    resolveUrl(attr(child(el, 'thumbnail', NS.media), 'url'), itemBase) ||
    enclosures.find(e => isImageType(e.type))?.url ||
    resolveUrl(attr(child(el, 'image', NS.itunes), 'href'), itemBase) ||
    resolveUrl(firstImgSrc(contentRaw) ?? '', itemBase);

  const author = cleanAuthor(cleanText(text(child(el, 'creator', NS.dc)) || text(child(el, 'author')))) || undefined;

  return buildItem({
    id: guidText || undefined,
    link,
    title: text(child(el, 'title')),
    author,
    contentRaw,
    summarySource: description || contentRaw,
    publishedAt: parseDate(text(child(el, 'pubDate'))) ?? parseDate(text(child(el, 'date', NS.dc))) ?? lastBuild,
    thumbnailUrl: thumbnailUrl || undefined,
    enclosures,
    categories: children(el, 'category').map(c => cleanText(text(c))).filter(Boolean),
  });
}
