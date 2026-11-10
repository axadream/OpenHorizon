import { describe, expect, it } from 'vitest';
import { capContent, cleanText, decodeEntities, escapeXml, finishTitle, stripHtml, truncate, MAX_CONTENT_CHARS } from './text';

describe('text helpers', () => {
  it('decodes named, decimal and hex entities in one pass', () => {
    expect(decodeEntities('Tom &amp; Jerry &lt;3 &#8217; &#x2014; &amp;lt;')).toBe('Tom & Jerry <3 ’ — &lt;');
    expect(decodeEntities('&bogus; &#xZZ;')).toBe('&bogus; &#xZZ;');
  });

  it('strips markup, dropping script and style contents, and adds spaces at block tags', () => {
    expect(stripHtml('<p>one</p><p>two <b>bold</b></p><script>x()</script><style>p{}</style>')).toBe('one two bold');
  });

  it('cleanText strips markup, decodes entities and collapses whitespace', () => {
    expect(cleanText('  <em>Hi</em>\n\n  &amp; bye  ')).toBe('Hi & bye');
    expect(cleanText(null)).toBe('');
  });

  it('truncate keeps the result within max characters including the ellipsis', () => {
    expect(truncate('short', 10)).toBe('short');
    const t = truncate('abcdefghij', 5);
    expect(t).toBe('abcd…');
    expect(t.length).toBe(5);
  });

  it('escapeXml escapes the five XML specials', () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
  });

  it('capContent truncates long HTML and appends a marker', () => {
    const big = 'x'.repeat(MAX_CONTENT_CHARS + 10);
    const capped = capContent(big);
    expect(capped.startsWith('x'.repeat(MAX_CONTENT_CHARS))).toBe(true);
    expect(capped.endsWith('<p>…</p>')).toBe(true);
    expect(capContent('small')).toBe('small');
  });

  it('finishTitle falls back to the summary (80 chars) and then to (untitled)', () => {
    expect(finishTitle('Given', 'ignored')).toBe('Given');
    const fromSummary = finishTitle('', 'a'.repeat(200));
    expect(fromSummary.length).toBe(81); // 80 characters from the summary plus the ellipsis
    expect(fromSummary.endsWith('…')).toBe(true);
    expect(finishTitle('', '')).toBe('(untitled)');
  });
});
