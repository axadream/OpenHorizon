import { describe, expect, it } from 'vitest';
import { isSafeHref, parseInline, parseMarkdownLite } from './markdownParse';

describe('parseMarkdownLite blocks', () => {
  it('maps #, ## and ### to heading levels 1-3', () => {
    const blocks = parseMarkdownLite('# One\n\n## Two\n\n### Three\n\n#### Four');
    expect(blocks.map((b) => (b.type === 'heading' ? b.level : null))).toEqual([1, 2, 3, 3]);
    expect(blocks[1]).toEqual({ type: 'heading', level: 2, children: [{ type: 'text', value: 'Two' }] });
  });

  it('joins consecutive lines into one paragraph and splits on blank lines', () => {
    const blocks = parseMarkdownLite('first line\nsecond line\n\nthird');
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: 'first line second line' }] },
      { type: 'paragraph', children: [{ type: 'text', value: 'third' }] },
    ]);
  });

  it('groups "- " items into one list and folds indented continuation lines into the item', () => {
    const blocks = parseMarkdownLite('- alpha\n- beta\n  more beta\n- gamma');
    expect(blocks).toHaveLength(1);
    const [list] = blocks;
    expect(list?.type).toBe('list');
    if (list?.type !== 'list') return;
    expect(list.items.map((i) => i.map((n) => (n.type === 'text' ? n.value : '?')).join(''))).toEqual([
      'alpha',
      'beta more beta',
      'gamma',
    ]);
  });

  it('drops link reference definitions', () => {
    const blocks = parseMarkdownLite('Body.\n\n[Unreleased]: https://github.com/axadream/OpenHorizon/compare/v0.1.1...HEAD');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('paragraph');
  });

  it('treats a bold line as a paragraph, not a bullet', () => {
    const blocks = parseMarkdownLite('**Bold** start');
    expect(blocks[0]?.type).toBe('paragraph');
  });
});

describe('parseInline', () => {
  it('parses bold, inline code and links', () => {
    expect(parseInline('a **b** `c` [d](https://x.test/)')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'strong', children: [{ type: 'text', value: 'b' }] },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'c' },
      { type: 'text', value: ' ' },
      { type: 'link', href: 'https://x.test/', children: [{ type: 'text', value: 'd' }] },
    ]);
  });

  it('keeps bracket text without a target as plain text', () => {
    expect(parseInline('[Unreleased] - today')).toEqual([{ type: 'text', value: '[Unreleased] - today' }]);
  });

  it('turns unsafe link targets into plain text', () => {
    expect(parseInline('[click](javascript:void)')).toEqual([{ type: 'text', value: '[click](javascript:void)' }]);
  });

  it('keeps raw HTML as text (rendered as escaped strings)', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ type: 'text', value: '<img src=x onerror=alert(1)>' }]);
  });
});

describe('isSafeHref', () => {
  it('allows only absolute http and https URLs', () => {
    expect(isSafeHref('https://github.com/axadream/OpenHorizon')).toBe(true);
    expect(isSafeHref('http://example.com')).toBe(true);
    expect(isSafeHref('/relative')).toBe(false);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,hi')).toBe(false);
  });
});
