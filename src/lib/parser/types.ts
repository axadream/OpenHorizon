import { computeGuid } from '@/features/articles/dedup';
import { capContent, cleanText, finishTitle, truncate } from '@/lib/text';

export type FeedKind = 'rss2' | 'atom' | 'rss1' | 'json';

export interface ParsedFeed {
  kind: FeedKind;
  title: string;
  description?: string;
  siteUrl?: string;
  /** Self link when present, otherwise the source URL */
  feedUrl: string;
  language?: string;
  /** Channel image / atom icon-logo / json icon-favicon, absolute */
  iconUrl?: string;
  items: ParsedItem[];
}

export interface ParsedItem {
  /** Computed by features/articles/dedup.computeGuid */
  guid: string;
  /** Raw feed identifier (RSS guid, Atom id, RDF about, JSON id) */
  id?: string;
  link: string;
  title: string;
  author?: string;
  /** Chosen HTML (content:encoded > content > summary > description), '' when none */
  contentRaw: string;
  /** Plain text, at most 280 characters */
  summary: string;
  /** Epoch ms, null when missing or unparseable */
  publishedAt: number | null;
  thumbnailUrl?: string;
  enclosures: { url: string; type?: string; length?: number }[];
  categories: string[];
}

/** Input is not a feed we understand (or is not well-formed XML). */
export class NotAFeedError extends Error {
  constructor(message = 'Not a feed') {
    super(message);
    this.name = 'NotAFeedError';
  }
}

/** Items kept per fetch (newest first, as the feed orders them). */
export const MAX_ITEMS = 500;

export interface ItemDraft {
  id?: string;
  link: string;
  /** Raw title; markup and entities are cleaned here */
  title: string;
  author?: string;
  /** Chosen HTML (not yet capped) */
  contentRaw: string;
  /** Source for the plain-text summary (description / summary), falls back to contentRaw */
  summarySource?: string;
  publishedAt: number | null;
  thumbnailUrl?: string;
  enclosures: { url: string; type?: string; length?: number }[];
  categories: string[];
}

/** Normalize one item draft into a ParsedItem (title, summary, content cap, guid). */
export function buildItem(d: ItemDraft): ParsedItem {
  const summary = truncate(cleanText(d.summarySource || d.contentRaw), 280);
  const title = finishTitle(cleanText(d.title), summary);
  const id = d.id?.trim() || undefined;
  return {
    guid: computeGuid({ id, link: d.link, title, publishedAt: d.publishedAt }),
    id,
    link: d.link,
    title,
    author: d.author?.trim() || undefined,
    contentRaw: capContent(d.contentRaw),
    summary,
    publishedAt: d.publishedAt,
    thumbnailUrl: d.thumbnailUrl || undefined,
    enclosures: d.enclosures,
    categories: d.categories,
  };
}
