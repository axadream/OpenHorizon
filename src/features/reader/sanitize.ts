import DOMPurify from 'dompurify';
import { resolveUrl } from '@/lib/url';

/**
 * Render-time sanitizer (ARCHITECTURE §6.4). Page only (needs DOM).
 * Raw article HTML must only reach the DOM through sanitizeHtml().
 */

const ALLOWED_TAGS = ['a','abbr','address','article','aside','b','bdi','bdo','blockquote','br','caption','cite','code','col','colgroup','dd','del','details','dfn','div','dl','dt','em','figcaption','figure','footer','h1','h2','h3','h4','h5','h6','header','hr','i','img','ins','kbd','li','main','mark','nav','ol','p','picture','pre','q','rp','rt','ruby','s','samp','section','small','source','span','strong','sub','summary','sup','table','tbody','td','tfoot','th','thead','time','tr','u','ul','var','wbr','video','audio','iframe'];

const ALLOWED_ATTR = ['href','src','srcset','sizes','alt','title','width','height','loading','decoding','referrerpolicy','colspan','rowspan','scope','datetime','cite','lang','dir','start','reversed','type','controls','poster','preload','allow','allowfullscreen','frameborder','sandbox','media'];

const FORBID_TAGS = ['script','style','link','meta','base','form','input','button','select','textarea','object','embed','applet','svg','math','template','noscript','canvas','map','area'];

const YT_HOSTS = ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'];

/** Images whose data: URI is larger than this are dropped (ARCHITECTURE §6.4). */
const MAX_DATA_URI_CHARS = 50_000;

/** DOMPurify default scheme policy minus ftp/tel; javascript: never matches. */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

function isYouTubeEmbed(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && YT_HOSTS.includes(u.hostname) && u.pathname.startsWith('/embed/');
  } catch {
    return false;
  }
}

function resolveAttr(el: Element, name: string, base: string | undefined): void {
  if (!base) return;
  const value = el.getAttribute(name);
  if (value === null) return;
  const resolved = resolveUrl(value, base);
  if (resolved) el.setAttribute(name, resolved);
  else el.removeAttribute(name);
}

/** Resolve every candidate URL of a srcset ("url 2x, url2 800w"). */
function resolveSrcset(el: Element, base: string | undefined): void {
  if (!base) return;
  const value = el.getAttribute('srcset');
  if (value === null) return;
  const parts: string[] = [];
  for (const candidate of value.split(',')) {
    const [url, ...descriptor] = candidate.trim().split(/\s+/);
    if (!url) continue;
    const resolved = resolveUrl(url, base);
    if (resolved) parts.push([resolved, ...descriptor].join(' '));
  }
  if (parts.length) el.setAttribute('srcset', parts.join(', '));
  else el.removeAttribute('srcset');
}

export interface SanitizeOptions {
  /** Remove YouTube iframes too (the reader mounts its own privacy-first player instead). */
  dropYouTubeEmbeds?: boolean;
}

/**
 * Sanitize article HTML for display. Relative `href`/`src`/`srcset` are resolved
 * against `baseUrl` (usually the article link). Only YouTube embeds survive as iframes,
 * unless `dropYouTubeEmbeds` is set.
 */
export function sanitizeHtml(html: string, baseUrl?: string, opts: SanitizeOptions = {}): string {
  const purifier = DOMPurify();

  purifier.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'iframe') return;
    const el = node as Element;
    if (opts.dropYouTubeEmbeds || !isYouTubeEmbed(el.getAttribute('src') ?? '')) {
      el.remove();
      return;
    }
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
    el.setAttribute('loading', 'lazy');
    el.setAttribute('referrerpolicy', 'no-referrer');
    el.setAttribute('allow', 'fullscreen; picture-in-picture');
    el.removeAttribute('width');
    el.removeAttribute('height');
  });

  purifier.addHook('afterSanitizeAttributes', node => {
    const el = node as Element;
    const tag = el.localName;

    if (tag === 'a') {
      if (el.hasAttribute('href')) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer nofollow ugc');
        resolveAttr(el, 'href', baseUrl);
      }
      return;
    }

    if (tag === 'img') {
      el.setAttribute('loading', 'lazy');
      el.setAttribute('decoding', 'async');
      el.setAttribute('referrerpolicy', 'no-referrer');
      resolveAttr(el, 'src', baseUrl);
      resolveSrcset(el, baseUrl);
      if (!el.hasAttribute('alt')) el.setAttribute('alt', '');
      el.removeAttribute('width');
      el.removeAttribute('height');
      const src = el.getAttribute('src') ?? '';
      if (src.startsWith('data:') && src.length > MAX_DATA_URI_CHARS) {
        el.remove();
      }
      return;
    }

    if (tag === 'source') {
      resolveAttr(el, 'src', baseUrl);
      resolveSrcset(el, baseUrl);
      return;
    }

    if (tag === 'video' || tag === 'audio') {
      el.setAttribute('controls', '');
      el.setAttribute('preload', 'none');
      el.removeAttribute('autoplay');
      return;
    }
  });

  const clean = purifier.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP,
    FORCE_BODY: true,
    RETURN_TRUSTED_TYPE: false,
    WHOLE_DOCUMENT: false,
  });

  purifier.removeAllHooks();
  return clean;
}
