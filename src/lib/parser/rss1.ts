import { resolveUrl } from '@/lib/url';
import { cleanText } from '@/lib/text';
import { NS, attr, attrNS, child, children, text } from '../xml/dom';
import { firstImgSrc, isImageType, largestByWidth, toInt } from './media';
import { parseDate } from './dates';
import { cleanAuthor } from './rss2';
import { MAX_ITEMS, NotAFeedError, buildItem, type ParsedFeed, type ParsedItem } from './types';

/** Parse RSS 1.0 (RDF Site Summary): <rdf:RDF> with items as siblings of <channel>. */
export function parseRss1(doc: Document, sourceUrl: string): ParsedFeed {
  const root = doc.documentElement;
  const channel = child(root, 'channel', NS.rss1);
  if (!channel) throw new NotAFeedError('RDF document without <channel>');

  const siteUrl = resolveUrl(text(child(channel, 'link', NS.rss1)), sourceUrl) || undefined;
  const base = attr(root, 'xml:base') || siteUrl || sourceUrl;
  const iconRef = attrNS(child(channel, 'image', NS.rss1), NS.rdf, 'resource');

  const items: ParsedItem[] = children(root, 'item', NS.rss1)
    .slice(0, MAX_ITEMS)
    .map(el => rdfItem(el, base));

  return {
    kind: 'rss1',
    title: cleanText(text(child(channel, 'title', NS.rss1))) || siteUrl || sourceUrl,
    description: cleanText(text(child(channel, 'description', NS.rss1))) || undefined,
    siteUrl,
    feedUrl: sourceUrl,
    language: text(child(channel, 'language', NS.dc)) || text(child(channel, 'language')) || undefined,
    iconUrl: resolveUrl(iconRef, base) || undefined,
    items,
  };
}

function rdfItem(el: Element, base: string): ParsedItem {
  const about = attrNS(el, NS.rdf, 'about').trim();
  const description = text(child(el, 'description', NS.rss1));
  const encoded = text(child(el, 'encoded', NS.content));
  const contentRaw = encoded || description;

  const imageCandidates: { url: string; width?: number }[] = [];
  const enclosures: { url: string; type?: string; length?: number }[] = [];
  for (const m of children(el, 'content', NS.media)) {
    const url = resolveUrl(attr(m, 'url'), base);
    if (!url) continue;
    if (attr(m, 'medium') === 'image' || isImageType(attr(m, 'type'))) {
      imageCandidates.push({ url, width: toInt(attr(m, 'width')) });
    } else {
      enclosures.push({ url, type: attr(m, 'type') || undefined });
    }
  }

  const link = resolveUrl(text(child(el, 'link', NS.rss1)), base) || resolveUrl(about, base);

  const thumbnailUrl =
    largestByWidth(imageCandidates)?.url ||
    resolveUrl(attr(child(el, 'thumbnail', NS.media), 'url'), base) ||
    resolveUrl(firstImgSrc(contentRaw) ?? '', base);

  const author = cleanAuthor(cleanText(text(child(el, 'creator', NS.dc)))) || undefined;
  const categories = children(el, 'subject', NS.dc).map(s => cleanText(text(s))).filter(Boolean);

  return buildItem({
    id: about || undefined,
    link,
    title: text(child(el, 'title', NS.rss1)),
    author,
    contentRaw,
    summarySource: description || contentRaw,
    publishedAt: parseDate(text(child(el, 'date', NS.dc))),
    thumbnailUrl: thumbnailUrl || undefined,
    enclosures,
    categories,
  });
}
