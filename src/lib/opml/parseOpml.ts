import { hostname, normalizeFeedUrl } from '@/lib/url';
import { parseXml } from '@/lib/xml/dom';

export interface OpmlFeed {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  folder: string | null;
}

export interface OpmlResult {
  title?: string;
  feeds: OpmlFeed[];
  folders: string[];
}

export class OpmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpmlParseError';
  }
}

function localName(el: Element): string {
  return (el.localName || el.nodeName || '').toLowerCase();
}

function childElements(el: Element): Element[] {
  const out: Element[] = [];
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 1) out.push(n as Element);
  }
  return out;
}

/** First non-empty attribute among the given names (case variants are tried explicitly). */
function attr(el: Element, ...names: string[]): string {
  for (const name of names) {
    const v = el.getAttribute(name)?.trim();
    if (v) return v;
  }
  return '';
}

/** Accepts http(s) and the feed:// scheme used by some readers; anything else is rejected. */
function cleanXmlUrl(raw: string): string | null {
  let s = raw.trim();
  if (/^feed:\/\//i.test(s)) s = `https://${s.slice(7)}`;
  else if (/^feed:https?:\/\//i.test(s)) s = s.slice(5);
  return /^https?:\/\//i.test(s) ? s : null;
}

function canonicalKey(url: string): string {
  try {
    return normalizeFeedUrl(url);
  } catch {
    return url;
  }
}

interface Acc {
  feeds: OpmlFeed[];
  folders: string[];
  seen: Set<string>;
}

function walk(outlines: Element[], folder: string | null, acc: Acc): void {
  for (const o of outlines) {
    const rawXmlUrl = attr(o, 'xmlUrl', 'xmlurl', 'url');
    const label = attr(o, 'text', 'title');

    if (rawXmlUrl) {
      const url = cleanXmlUrl(rawXmlUrl);
      if (!url) continue;
      const key = canonicalKey(url);
      if (acc.seen.has(key)) continue;
      acc.seen.add(key);
      const htmlUrl = attr(o, 'htmlUrl', 'htmlurl');
      acc.feeds.push({
        title: label || hostname(url) || url,
        xmlUrl: url,
        ...(htmlUrl ? { htmlUrl } : {}),
        folder,
      });
      continue;
    }

    const kids = childElements(o).filter((e) => localName(e) === 'outline');
    if (kids.length === 0 && !label) continue;

    // Nested folders flatten to one level: "Tech / Apple".
    const name = label ? (folder ? `${folder} / ${label}` : label) : folder;
    if (name && !acc.folders.includes(name)) acc.folders.push(name);
    walk(kids, name, acc);
  }
}

/** Parse an OPML document into feeds and folder names. Throws OpmlParseError when not OPML. */
export function parseOpml(text: string): OpmlResult {
  let doc: Document;
  try {
    doc = parseXml(text);
  } catch {
    throw new OpmlParseError('The file is not valid XML');
  }
  const root = doc.documentElement;
  if (!root || localName(root) !== 'opml') throw new OpmlParseError('The file is not an OPML document');

  const rootKids = childElements(root);
  const head = rootKids.find((e) => localName(e) === 'head');
  const titleEl = head ? childElements(head).find((e) => localName(e) === 'title') : undefined;
  const title = titleEl?.textContent?.trim() ?? '';
  const body = rootKids.find((e) => localName(e) === 'body');

  const acc: Acc = { feeds: [], folders: [], seen: new Set() };
  if (body) walk(childElements(body).filter((e) => localName(e) === 'outline'), null, acc);

  return { ...(title ? { title } : {}), feeds: acc.feeds, folders: acc.folders };
}
