import { describe, expect, it } from 'vitest';
import { OpmlParseError, parseOpml } from './parseOpml';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My subs</title></head>
  <body>
    <outline text="Tech">
      <outline type="rss" text="Ars" xmlUrl="https://arstechnica.com/feed/" htmlUrl="https://arstechnica.com/"/>
      <outline text="Apple">
        <outline type="rss" title="Daring Fireball" xmlurl="https://daringfireball.net/feeds/main" />
      </outline>
    </outline>
    <outline type="rss" text="Unfiled" xmlUrl="https://example.org/rss.xml"/>
    <outline text="Empty folder"></outline>
    <outline type="rss" text="Dup" xmlUrl="https://arstechnica.com/feed" />
  </body>
</opml>`;

describe('parseOpml', () => {
  it('reads the title, feeds, folders and unfiled feeds', () => {
    const r = parseOpml(SAMPLE);
    expect(r.title).toBe('My subs');
    expect(r.feeds).toEqual([
      { title: 'Ars', xmlUrl: 'https://arstechnica.com/feed/', htmlUrl: 'https://arstechnica.com/', folder: 'Tech' },
      { title: 'Daring Fireball', xmlUrl: 'https://daringfireball.net/feeds/main', folder: 'Tech / Apple' },
      { title: 'Unfiled', xmlUrl: 'https://example.org/rss.xml', folder: null },
    ]);
    expect(r.folders).toEqual(['Tech', 'Tech / Apple', 'Empty folder']);
  });

  it('flattens nested folders with " / "', () => {
    const r = parseOpml(`<opml><body><outline text="A"><outline text="B"><outline text="C"><outline xmlUrl="https://x.test/f" text="F"/></outline></outline></outline></body></opml>`);
    expect(r.feeds[0]?.folder).toBe('A / B / C');
  });

  it('ignores unlabelled outlines that carry no feed', () => {
    const r = parseOpml(`<opml><body><outline /><outline text="Only a label"/></body></opml>`);
    expect(r.feeds).toEqual([]);
    expect(r.folders).toEqual(['Only a label']);
  });

  it('uses the host as title when the outline has no text', () => {
    const r = parseOpml(`<opml><body><outline xmlUrl="https://news.example.com/rss"/></body></opml>`);
    expect(r.feeds[0]?.title).toBe('news.example.com');
  });

  it('accepts feed:// URLs and rejects non-http ones', () => {
    const r = parseOpml(`<opml><body><outline text="A" xmlUrl="feed://example.com/rss"/><outline text="B" xmlUrl="ftp://x/y"/></body></opml>`);
    expect(r.feeds.map((f) => f.xmlUrl)).toEqual(['https://example.com/rss']);
  });

  it('throws OpmlParseError for non-OPML input', () => {
    expect(() => parseOpml('<rss version="2.0"></rss>')).toThrow(OpmlParseError);
    expect(() => parseOpml('not xml at all <<')).toThrow(OpmlParseError);
  });
});
