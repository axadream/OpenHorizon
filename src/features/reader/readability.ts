import { fetchWithProxy } from '@/lib/proxy/fetchWithProxy';
import { resolveUrl } from '@/lib/url';
import { sanitizeHtml } from './sanitize';

/*
 * Article extraction from a web page with Mozilla Readability (Apache-2.0). The library is loaded
 * with a dynamic import below, so it lands in its own lazy chunk. Nothing here may be imported by
 * src/sw.ts (the service worker has no DOMParser and must stay free of dynamic imports).
 */

export interface ExtractedArticle {
  title: string;
  byline?: string;
  /** Sanitized article HTML with every relative src/href/srcset resolved against the page URL. */
  contentHtml: string;
  textContent: string;
  excerpt: string;
  siteName?: string;
  lang?: string;
  dir?: string;
  leadImage?: string;
}

export interface FetchedArticle extends ExtractedArticle {
  /** Address the page was finally served from (after redirects and proxies). */
  finalUrl: string;
}

export type ReadabilityReason = 'no-content';

/** Thrown when a page yields no readable article text. */
export class ReadabilityError extends Error {
  readonly reason: ReadabilityReason;

  constructor(reason: ReadabilityReason, message = 'No readable article text was found on this page') {
    super(message);
    this.name = 'ReadabilityError';
    this.reason = reason;
  }
}

/** Shorter extracted text than this is treated as "no article". */
export const MIN_ARTICLE_TEXT_CHARS = 200;

/** Elements removed before Readability runs: scripts, styles, noscript fallbacks and frames. */
const DROP_SELECTOR = 'script,style,noscript,iframe';
const HTML_ACCEPT = 'text/html,application/xhtml+xml,*/*';

/** The subset of Readability's result this module reads. */
interface ReadabilityResult {
  title?: string | null;
  content?: string | null;
  textContent?: string | null;
  excerpt?: string | null;
  byline?: string | null;
  dir?: string | null;
  siteName?: string | null;
  lang?: string | null;
}

/** Parse with the native DOMParser, pin the base URL, and drop elements that never hold article text. */
function prepareDocument(html: string, url: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const old of Array.from(doc.getElementsByTagName('base'))) old.remove();
  const base = doc.createElement('base');
  base.setAttribute('href', url);
  const head: HTMLElement = doc.head || doc.documentElement;
  head.prepend(base);
  for (const el of Array.from(doc.querySelectorAll(DROP_SELECTOR))) el.remove();
  return doc;
}

/** The page's declared share image (Open Graph or Twitter card), absolute. */
function declaredImage(doc: Document, url: string): string | undefined {
  const selectors = ['meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[name="twitter:image"]'];
  for (const selector of selectors) {
    const abs = resolveUrl(doc.querySelector(selector)?.getAttribute('content'), url);
    if (abs) return abs;
  }
  return undefined;
}

/** First image source in sanitized article HTML (already absolute). */
function firstImageIn(contentHtml: string): string | undefined {
  const src = /<img\b[^>]*\ssrc="([^"]+)"/i.exec(contentHtml)?.[1];
  return src || undefined;
}

/** Run Readability. The module is loaded only when this runs, so it stays out of the main chunk. */
async function runReadability(doc: Document): Promise<ReadabilityResult | null> {
  const { Readability } = await import('@mozilla/readability');
  return new Readability(doc).parse();
}

/**
 * Extract the main article from an HTML document. Throws ReadabilityError('no-content') when the
 * page has no article text of at least MIN_ARTICLE_TEXT_CHARS characters.
 */
export async function extractArticle(html: string, url: string): Promise<ExtractedArticle> {
  const doc = prepareDocument(html, url);
  const declared = declaredImage(doc, url);
  const parsed = await runReadability(doc);

  const textContent = (parsed?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!parsed || !parsed.content || textContent.length < MIN_ARTICLE_TEXT_CHARS) {
    throw new ReadabilityError('no-content');
  }

  const contentHtml = sanitizeHtml(parsed.content, url);
  return {
    title: (parsed.title ?? '').trim(),
    byline: parsed.byline?.trim() || undefined,
    contentHtml,
    textContent,
    excerpt: (parsed.excerpt ?? '').trim(),
    siteName: parsed.siteName?.trim() || undefined,
    lang: parsed.lang?.trim() || undefined,
    dir: parsed.dir?.trim() || undefined,
    leadImage: declared ?? firstImageIn(contentHtml),
  };
}

/**
 * Fetch a web page through the proxy chain (HTML expected, feed proxies skipped) and extract its
 * article. Fetch failures propagate as FetchAllFailedError; use diagnoseFetchError to explain them.
 */
export async function fetchReadable(url: string, signal?: AbortSignal): Promise<FetchedArticle> {
  const res = await fetchWithProxy(url, { expectHtml: true, accept: HTML_ACCEPT, signal });
  const finalUrl = res.finalUrl || url;
  const article = await extractArticle(res.text, finalUrl);
  return { ...article, finalUrl };
}
