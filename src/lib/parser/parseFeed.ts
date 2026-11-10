import { NS, parseXml } from '../xml/dom';
import { parseAtom } from './atom';
import { parseJsonFeed } from './jsonfeed';
import { parseRss1 } from './rss1';
import { parseRss2 } from './rss2';
import { NotAFeedError, type ParsedFeed } from './types';

/**
 * Parse RSS 2.0, Atom, RSS 1.0 (RDF) or JSON Feed text into the normalized shape.
 * Throws NotAFeedError for anything else, including malformed XML.
 * The XML environment must be ready (native DOMParser, or ensureXmlEnv() in a worker).
 */
export function parseFeed(text: string, sourceUrl: string): ParsedFeed {
  const t = text.replace(/^﻿/, '').trimStart();

  if (t.startsWith('{')) {
    let obj: unknown;
    try {
      obj = JSON.parse(t);
    } catch {
      throw new NotAFeedError('Invalid JSON');
    }
    return parseJsonFeed(obj, sourceUrl);
  }

  let doc: Document;
  try {
    doc = parseXml(t);
  } catch (e) {
    throw new NotAFeedError(e instanceof Error ? e.message : 'Invalid XML');
  }

  const root = doc.documentElement;
  const name = root.localName;
  const ns = root.namespaceURI;

  if (name === 'rss') return parseRss2(doc, sourceUrl);
  if (name === 'feed' && ns === NS.atom) return parseAtom(doc, sourceUrl);
  if (name === 'RDF' && ns === NS.rdf) return parseRss1(doc, sourceUrl);
  throw new NotAFeedError(`Unsupported document element <${name}>`);
}
