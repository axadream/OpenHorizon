import { afterAll, describe, expect, it, vi } from 'vitest';
import rss2Xml from './__fixtures__/rss2.xml?raw';
import atomXml from './__fixtures__/atom.xml?raw';
import rss1Rdf from './__fixtures__/rss1.rdf?raw';
import jsonText from './__fixtures__/feed.json?raw';
import brokenXml from './__fixtures__/broken.xml?raw';
import { parseFeed } from './parseFeed';
import { NotAFeedError } from './types';
import { setXmlEnv, useXmldomEnv } from '../xml/dom';
import { fnv1a32 } from '@/lib/hash';

const RSS_URL = 'https://blog.example.com/feed.xml';
const ATOM_URL = 'https://journal.example.org/atom.xml';
const RDF_URL = 'https://rdf.example.net/feed.rdf';
const JSON_URL = 'https://json.example.io/feed.json';

const LAST_BUILD = Date.UTC(2026, 10, 9, 8, 0, 0);

// Fixture dates are in the past relative to this fixed clock. parseDate clamps
// dates that are in the future to "now", so the clock must be fixed before the
// describe blocks below parse their fixtures during collection.
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(Date.UTC(2026, 10, 12, 12, 0, 0));

describe('parseFeed: RSS 2.0 fixture', () => {
  const feed = parseFeed(rss2Xml, RSS_URL);

  it('normalizes the channel', () => {
    expect(feed.kind).toBe('rss2');
    expect(feed.title).toBe('Example Tech Blog');
    expect(feed.description).toBe('Notes on building things');
    expect(feed.siteUrl).toBe('https://blog.example.com/');
    expect(feed.feedUrl).toBe('https://blog.example.com/feed.xml');
    expect(feed.language).toBe('en-us');
    expect(feed.iconUrl).toBe('https://blog.example.com/img/logo.png');
    expect(feed.items).toHaveLength(4);
  });

  it('uses content:encoded over description and keeps the raw id/guid', () => {
    const [first] = feed.items;
    expect(first.id).toBe('post-1001');
    expect(first.guid).toBe('post-1001');
    expect(first.title).toBe('Hello & welcome');
    expect(first.contentRaw).toBe('<p>Full <b>article</b> body.</p><p><img src="/img/hero.jpg" width="800" height="400" alt="hero"/></p>');
    expect(first.summary).toBe('Short teaser text.');
    expect(first.author).toBe('Jane Doe');
    expect(first.categories).toEqual(['news', 'tech']);
    expect(first.link).toBe('https://blog.example.com/posts/hello?utm_source=rss#top');
    expect(first.publishedAt).toBe(Date.UTC(2026, 10, 10, 9, 30));
  });

  it('prefers the largest media:content image and keeps only non-image media as enclosures', () => {
    const [first] = feed.items;
    expect(first.thumbnailUrl).toBe('https://cdn.example.com/hero-large.jpg');
    expect(first.enclosures).toEqual([{ url: 'https://cdn.example.com/podcast.mp3', type: 'audio/mpeg', length: 12345 }]);
  });

  it('falls back to guid permalink for link, parses zone abbreviations, and summarizes description', () => {
    const second = feed.items[1];
    expect(second.link).toBe('https://blog.example.com/posts/plain');
    expect(second.guid).toBe('https://blog.example.com/posts/plain');
    expect(second.publishedAt).toBe(Date.UTC(2026, 10, 9, 15, 0));
    expect(second.summary).toBe('Only a description, with markup & entities.');
    expect(second.thumbnailUrl).toBeUndefined();
  });

  it('falls back to the channel lastBuildDate when an item has no date', () => {
    const third = feed.items[2];
    expect(third.publishedAt).toBe(LAST_BUILD);
    expect(third.link).toBe('');
    expect(third.guid).toBe('post-1003');
    expect(third.contentRaw).toBe('No date here.');
  });

  it('derives the guid from title and date when there is no id and no link', () => {
    const fourth = feed.items[3];
    expect(fourth.id).toBeUndefined();
    expect(fourth.link).toBe('');
    expect(fourth.guid).toBe('h:' + fnv1a32('hash me|' + LAST_BUILD));
  });
});

describe('parseFeed: Atom fixture', () => {
  const feed = parseFeed(atomXml, ATOM_URL);

  it('normalizes the feed header', () => {
    expect(feed.kind).toBe('atom');
    expect(feed.title).toBe('Atom Journal');
    expect(feed.description).toBe('Essays & notes');
    expect(feed.siteUrl).toBe('https://journal.example.org/');
    expect(feed.feedUrl).toBe('https://journal.example.org/atom.xml');
    expect(feed.language).toBe('de');
    expect(feed.iconUrl).toBe('https://journal.example.org/icon.png');
    expect(feed.items).toHaveLength(3);
  });

  it('serializes xhtml content and resolves relative links', () => {
    const [xhtml] = feed.items;
    expect(xhtml.id).toBe('urn:entry:xhtml-post');
    expect(xhtml.guid).toBe('urn:entry:xhtml-post');
    expect(xhtml.link).toBe('https://journal.example.org/articles/xhtml-post');
    expect(xhtml.title).toBe('Emphasis in title');
    expect(xhtml.author).toBe('Mara Lind');
    expect(xhtml.contentRaw).toContain('<p>Hello <strong>xhtml</strong> world.</p>');
    expect(xhtml.contentRaw).toContain('<img src="images/chart.png"');
    expect(xhtml.summary).toBe('Summary text here.');
    expect(xhtml.thumbnailUrl).toBe('https://journal.example.org/images/chart.png');
    expect(xhtml.categories).toEqual(['essays', 'design']);
    expect(xhtml.publishedAt).toBe(Date.UTC(2026, 10, 7, 17, 15));
  });

  it('uses escaped HTML content, the enclosure link, and updated when published is missing', () => {
    const html = feed.items[1];
    expect(html.link).toBe('https://journal.example.org/articles/html-post');
    expect(html.contentRaw).toBe('<p>Escaped &lt;b&gt; HTML.</p><p>Second &amp; para.</p>');
    expect(html.summary).toBe('Escaped <b> HTML. Second & para.');
    expect(html.enclosures).toEqual([{ url: 'https://journal.example.org/a.ogg', type: 'audio/ogg', length: 999 }]);
    expect(html.thumbnailUrl).toBeUndefined();
    expect(html.publishedAt).toBe(Date.UTC(2026, 10, 6, 9, 0));
  });

  it('handles an entry without content or date', () => {
    const empty = feed.items[2];
    expect(empty.title).toBe('Entry without any content');
    expect(empty.contentRaw).toBe('');
    expect(empty.summary).toBe('');
    expect(empty.publishedAt).toBeNull();
    expect(empty.guid).toBe('urn:entry:empty');
  });
});

describe('parseFeed: RSS 1.0 (RDF) fixture', () => {
  const feed = parseFeed(rss1Rdf, RDF_URL);

  it('reads channel metadata and rdf:resource image', () => {
    expect(feed.kind).toBe('rss1');
    expect(feed.title).toBe('RDF Digest');
    expect(feed.siteUrl).toBe('https://rdf.example.net/');
    expect(feed.feedUrl).toBe(RDF_URL);
    expect(feed.language).toBe('fr');
    expect(feed.iconUrl).toBe('https://rdf.example.net/logo.gif');
    expect(feed.items).toHaveLength(2);
  });

  it('uses rdf:about as id and content:encoded over description', () => {
    const [first, second] = feed.items;
    expect(first.id).toBe('https://rdf.example.net/item/1');
    expect(first.guid).toBe('https://rdf.example.net/item/1');
    expect(first.title).toBe('Premier article');
    expect(first.author).toBe('Équipe RDF');
    expect(first.contentRaw).toBe('<h2>Titre</h2><p>Corps <a href="/x">lien</a></p>');
    expect(first.summary).toBe('Résumé court.');
    expect(first.categories).toEqual(['digest']);
    expect(first.publishedAt).toBe(Date.UTC(2026, 10, 5, 7, 30));

    expect(second.contentRaw).toBe('Second summary');
    expect(second.publishedAt).toBeNull();
  });
});

describe('parseFeed: JSON Feed fixture', () => {
  const feed = parseFeed(jsonText, JSON_URL);

  it('normalizes the feed header', () => {
    expect(feed.kind).toBe('json');
    expect(feed.title).toBe('JSON Dispatch');
    expect(feed.siteUrl).toBe('https://json.example.io/');
    expect(feed.feedUrl).toBe('https://json.example.io/feed.json');
    expect(feed.iconUrl).toBe('https://json.example.io/icon.png');
    expect(feed.language).toBe('en');
    expect(feed.items).toHaveLength(3);
  });

  it('prefers content_html, image, attachments and authors[0]', () => {
    const [first] = feed.items;
    expect(first.id).toBe('7');
    expect(first.link).toBe('https://json.example.io/2026/11/first');
    expect(first.contentRaw).toContain('<em>html</em>');
    expect(first.summary).toBe('A short summary');
    expect(first.thumbnailUrl).toBe('https://json.example.io/img/banner.jpg');
    expect(first.author).toBe('Kim Otto');
    expect(first.categories).toEqual(['json', 'feeds']);
    expect(first.enclosures).toEqual([{ url: 'https://json.example.io/ep1.mp3', type: 'audio/mpeg', length: 4096 }]);
    expect(first.publishedAt).toBe(Date.UTC(2026, 10, 4, 12));
  });

  it('escapes content_text, uses external_url, date_modified and legacy author', () => {
    const second = feed.items[1];
    expect(second.link).toBe('https://other.example.io/linked');
    expect(second.contentRaw).toBe('<p>Plain &lt;text&gt; &amp; stuff</p>');
    expect(second.title).toBe('Plain <text> & stuff');
    expect(second.author).toBe('Legacy Author');
    expect(second.publishedAt).toBe(Date.UTC(2026, 10, 3, 8));
  });

  it('derives title from content when the item has none', () => {
    const third = feed.items[2];
    expect(third.title).toBe('Only text here. Another sentence that is quite long.');
    expect(third.link).toBe('');
    expect(third.publishedAt).toBeNull();
  });
});

describe('parseFeed: rejects input', () => {
  it('throws NotAFeedError for malformed XML', () => {
    expect(() => parseFeed(brokenXml, RSS_URL)).toThrow(NotAFeedError);
  });

  it('throws NotAFeedError for HTML and for invalid JSON', () => {
    expect(() => parseFeed('<!doctype html><html><body>hi</body></html>', RSS_URL)).toThrow(NotAFeedError);
    expect(() => parseFeed('{ not json', RSS_URL)).toThrow(NotAFeedError);
  });
});

describe('parseFeed with the xmldom environment (service worker path)', () => {
  afterAll(() => {
    setXmlEnv(null);
    vi.useRealTimers();
  });

  it('produces the same normalized RSS and Atom output as native DOMParser', async () => {
    const native = parseFeed(rss2Xml, RSS_URL);
    const nativeAtom = parseFeed(atomXml, ATOM_URL);

    await useXmldomEnv();
    const viaXmldom = parseFeed(rss2Xml, RSS_URL);
    const atomViaXmldom = parseFeed(atomXml, ATOM_URL);

    expect(viaXmldom.items.map(i => i.guid)).toEqual(native.items.map(i => i.guid));
    expect(viaXmldom.items[0].title).toBe(native.items[0].title);
    expect(viaXmldom.items[0].thumbnailUrl).toBe(native.items[0].thumbnailUrl);
    expect(viaXmldom.items[0].contentRaw).toBe(native.items[0].contentRaw);
    expect(atomViaXmldom.items[0].contentRaw).toContain('<p>Hello <strong>xhtml</strong> world.</p>');
    expect(atomViaXmldom.items[1].contentRaw).toBe(nativeAtom.items[1].contentRaw);
  });

  it('rejects broken XML under xmldom too', async () => {
    await useXmldomEnv();
    expect(() => parseFeed(brokenXml, RSS_URL)).toThrow(NotAFeedError);
  });
});
