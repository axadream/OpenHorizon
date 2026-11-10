import { escapeXml } from '../text';

/**
 * XML adapter. The page uses the native DOMParser. Environments without one
 * (the service worker, tests) install @xmldom/xmldom via setXmlEnv(createXmldomEnv()).
 *
 * Everything below works on both native DOM and xmldom: no querySelector,
 * only childNodes walking, getAttribute/getAttributeNS, localName, namespaceURI, textContent.
 */

export interface XmlEnv {
  /** Parse text. Must throw ParseError (or any Error) on fatal XML errors. */
  parse(text: string, mime: 'text/xml' | 'text/html'): Document;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export const XML_NS = 'http://www.w3.org/XML/1998/namespace';

export const NS = {
  atom: 'http://www.w3.org/2005/Atom',
  content: 'http://purl.org/rss/1.0/modules/content/',
  dc: 'http://purl.org/dc/elements/1.1/',
  media: 'http://search.yahoo.com/mrss/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rss1: 'http://purl.org/rss/1.0/',
  itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd',
} as const;

let env: XmlEnv | null = null;

/** Install a custom parser (or null to go back to the default). */
export function setXmlEnv(e: XmlEnv | null): void {
  env = e;
}

function nativeParse(text: string, mime: 'text/xml' | 'text/html'): Document {
  return new DOMParser().parseFromString(text, mime);
}

/** True when a native DOMParser reported an error (it returns a <parsererror> document). */
export function hasParserError(doc: Document): boolean {
  return doc.getElementsByTagName('parsererror').length > 0 || doc.getElementsByTagNameNS('*', 'parsererror').length > 0;
}

/** Parse XML text. Throws ParseError when the input is not well-formed. */
export function parseXml(text: string): Document {
  let doc: Document;
  try {
    doc = env ? env.parse(text, 'text/xml') : nativeParse(text, 'text/xml');
  } catch (e) {
    if (e instanceof ParseError) throw e;
    throw new ParseError(e instanceof Error ? e.message : 'Invalid XML');
  }
  if (!doc || !doc.documentElement || hasParserError(doc)) {
    throw new ParseError('Invalid XML');
  }
  return doc;
}

/** Parse HTML text (lenient). Never throws for malformed markup. */
export function parseHtml(text: string): Document {
  return env ? env.parse(text, 'text/html') : nativeParse(text, 'text/html');
}

/**
 * Make sure some XML parser is available: the native DOMParser (page) or an environment
 * installed with setXmlEnv (the service worker installs xmldom via `xmldomEnv.ts`).
 * Deliberately no dynamic import here: a dynamic import would pull Vite's preload helper
 * (which uses `import.meta`) into the classic service-worker bundle and break it.
 */
export async function ensureXmlEnv(): Promise<void> {
  if (env || typeof DOMParser !== 'undefined') return;
  throw new Error('No XML parser available: call setXmlEnv() before parsing feeds in this context.');
}

// ---------- namespace-safe helpers ----------

function localOf(el: Element): string {
  return el.localName || el.nodeName.slice(el.nodeName.indexOf(':') + 1);
}

/** Direct child elements with the given local name (and namespace, when `ns` is given). */
export function children(el: Element | null | undefined, localName: string, ns?: string): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeType !== 1) continue;
    const c = n as Element;
    if (localOf(c) !== localName) continue;
    if (ns !== undefined && c.namespaceURI !== ns) continue;
    out.push(c);
  }
  return out;
}

/** First direct child with the given local name, or null. */
export function child(el: Element | null | undefined, localName: string, ns?: string): Element | null {
  return children(el, localName, ns)[0] ?? null;
}

/** Trimmed textContent, '' when the element is missing. */
export function text(el: Element | null | undefined): string {
  return el ? (el.textContent ?? '').trim() : '';
}

/** Attribute by qualified name (e.g. "isPermaLink", "xml:base"), '' when missing. */
export function attr(el: Element | null | undefined, name: string): string {
  return el?.getAttribute(name) ?? '';
}

/** Attribute by namespace and local name (e.g. rdf:about), '' when missing. */
export function attrNS(el: Element | null | undefined, ns: string, localName: string): string {
  return el?.getAttributeNS(ns, localName) ?? '';
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

function serializeNode(n: Node): string {
  if (n.nodeType === 1) {
    const el = n as Element;
    const name = el.tagName || el.nodeName;
    let attrs = '';
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i];
      if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) continue;
      attrs += ` ${a.name}="${escapeXml(a.value)}"`;
    }
    if (VOID_TAGS.has(name.toLowerCase())) return `<${name}${attrs}>`;
    return `<${name}${attrs}>${innerXml(el)}</${name}>`;
  }
  if (n.nodeType === 3 || n.nodeType === 4) return escapeXml(n.nodeValue ?? '');
  return '';
}

/**
 * Serialize the children of an element back to markup (used for Atom type="xhtml" content).
 * Output is HTML-compatible; it is sanitized before rendering.
 */
export function innerXml(el: Element): string {
  let out = '';
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) out += serializeNode(nodes[i]);
  return out;
}
