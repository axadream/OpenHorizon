import { resolveUrl } from '@/lib/url';
import { cleanText, escapeXml } from '@/lib/text';
import { youtubeThumbnailUrl } from '@/lib/youtube';
import { NS, attr, child, children, innerXml, text } from '../xml/dom';
import { firstImgSrc, isImageType, largestByWidth, toInt } from './media';
import { parseDate } from './dates';
import { MAX_ITEMS, buildItem, type ParsedFeed, type ParsedItem } from './types';

/** href of the first <link> with the given rel (a link without rel is "alternate"). */
function linkHref(links: Element[], rel: string): string {
  const hit = links.find(l => (attr(l, 'rel') || 'alternate') === rel);
  return attr(hit, 'href');
}

/**
 * Content of an Atom <content>/<summary>/<title>-like element as HTML:
 * xhtml -> serialized children; text -> escaped; html or untyped -> textContent (markup in text).
 */
function atomHtml(el: Element | null): string {
  if (!el) return '';
  const type = attr(el, 'type').toLowerCase();
  if (type === 'xhtml') return innerXml(el);
  if (type === 'text' || type === 'text/plain') return escapeXml(text(el));
  return text(el);
}

/** Parse an Atom 1.0 feed (root <feed> in the Atom namespace). */
export function parseAtom(doc: Document, sourceUrl: string): ParsedFeed {
  const root = doc.documentElement;
  const rootLinks = children(root, 'link', NS.atom);

  const siteUrl = resolveUrl(linkHref(rootLinks, 'alternate'), sourceUrl) || undefined;
  // base = xml:base ?? siteUrl ?? sourceUrl (ARCHITECTURE §6.3)
  const base = attr(root, 'xml:base') || siteUrl || sourceUrl;
  const feedUrl = resolveUrl(linkHref(rootLinks, 'self'), sourceUrl) || sourceUrl;
  const iconUrl = resolveUrl(text(child(root, 'icon', NS.atom)) || text(child(root, 'logo', NS.atom)), base);

  const items: ParsedItem[] = children(root, 'entry', NS.atom)
    .slice(0, MAX_ITEMS)
    .map(entry => atomEntry(entry, base));

  return {
    kind: 'atom',
    title: cleanText(text(child(root, 'title', NS.atom))) || siteUrl || sourceUrl,
    description: cleanText(text(child(root, 'subtitle', NS.atom))) || undefined,
    siteUrl,
    feedUrl,
    language: attr(root, 'xml:lang') || undefined,
    iconUrl: iconUrl || undefined,
    items,
  };
}

const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function atomEntry(el: Element, feedBase: string): ParsedItem {
  const base = attr(el, 'xml:base') || feedBase;
  const links = children(el, 'link', NS.atom);
  // Media extensions sit either on the entry or inside <media:group> (YouTube uses the group).
  const group = child(el, 'group', NS.media);
  const mediaScopes: Element[] = group ? [el, group] : [el];

  const contentHtml = atomHtml(child(el, 'content', NS.atom));
  const summaryHtml = atomHtml(child(el, 'summary', NS.atom));
  const mediaDescription = mediaScopes.map((s) => text(child(s, 'description', NS.media))).find((d) => d) ?? '';
  // Plain-text media:description becomes HTML with line breaks, used when the entry has no content.
  const descriptionHtml = mediaDescription ? escapeXml(mediaDescription).replace(/\r?\n/g, '<br>') : '';
  const contentRaw = contentHtml || summaryHtml || descriptionHtml;

  const enclosures: { url: string; type?: string; length?: number }[] = [];
  const imageLinks: { url: string; width?: number }[] = [];
  for (const l of links) {
    if (attr(l, 'rel') !== 'enclosure') continue;
    const url = resolveUrl(attr(l, 'href'), base);
    if (!url) continue;
    const type = attr(l, 'type') || undefined;
    enclosures.push({ url, type, length: toInt(attr(l, 'length')) });
    if (isImageType(type)) imageLinks.push({ url });
  }

  const mediaImages: { url: string; width?: number }[] = [];
  for (const scope of mediaScopes) {
    for (const m of children(scope, 'content', NS.media)) {
      const url = resolveUrl(attr(m, 'url'), base);
      if (url && (attr(m, 'medium') === 'image' || isImageType(attr(m, 'type')))) {
        mediaImages.push({ url, width: toInt(attr(m, 'width')) });
      }
    }
  }
  const mediaThumb = mediaScopes.map((s) => child(s, 'thumbnail', NS.media)).find((t) => t) ?? null;

  // YouTube entries carry yt:videoId; their hqdefault thumbnail is a safe fallback when no media:thumbnail exists.
  const videoId = text(child(el, 'videoId', NS.yt));
  const youtubeThumb = YT_VIDEO_ID_RE.test(videoId) ? youtubeThumbnailUrl(videoId) : '';

  const thumbnailUrl =
    largestByWidth(mediaImages)?.url ||
    resolveUrl(attr(mediaThumb, 'url'), base) ||
    imageLinks[0]?.url ||
    resolveUrl(firstImgSrc(contentRaw) ?? '', base) ||
    youtubeThumb;

  const author = cleanText(text(child(child(el, 'author', NS.atom), 'name', NS.atom))) || undefined;

  return buildItem({
    id: text(child(el, 'id', NS.atom)) || undefined,
    link: resolveUrl(linkHref(links, 'alternate'), base),
    title: atomHtml(child(el, 'title', NS.atom)),
    author,
    contentRaw,
    summarySource: summaryHtml || contentHtml || descriptionHtml,
    publishedAt:
      parseDate(text(child(el, 'published', NS.atom))) ?? parseDate(text(child(el, 'updated', NS.atom))),
    thumbnailUrl: thumbnailUrl || undefined,
    enclosures,
    categories: children(el, 'category', NS.atom)
      .map(c => attr(c, 'term').trim())
      .filter(Boolean),
  });
}
