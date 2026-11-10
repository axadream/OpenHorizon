import { describe, expect, it } from 'vitest';
import { fnv1a32 } from '@/lib/hash';
import { computeGuid, dedupeWithinFetch } from './dedup';

describe('computeGuid', () => {
  it('prefers the trimmed feed id', () => {
    expect(computeGuid({ id: '  abc-1 ', link: 'https://x.test/a', title: 'T', publishedAt: 1 })).toBe('abc-1');
  });

  it('falls back to the normalized link (no fragment, no utm params)', () => {
    expect(computeGuid({ id: '', link: 'https://x.test/a?utm_source=rss&q=1#frag', title: 'T', publishedAt: 1 }))
      .toBe('https://x.test/a?q=1');
  });

  it('falls back to a title+date hash when there is neither id nor link', () => {
    const expected = 'h:' + fnv1a32('my title|1700000000000');
    expect(computeGuid({ id: undefined, link: '', title: '  My Title ', publishedAt: 1700000000000 })).toBe(expected);
    expect(computeGuid({ title: 'my title', publishedAt: 1700000000000 })).toBe(expected);
  });

  it('is stable for the hash fallback when the date is missing', () => {
    expect(computeGuid({ title: 'X', publishedAt: null })).toBe('h:' + fnv1a32('x|'));
  });
});

describe('fnv1a32', () => {
  it('matches the reference FNV-1a values', () => {
    expect(fnv1a32('')).toBe('811c9dc5');
    expect(fnv1a32('a')).toBe('e40c292c');
  });
});

describe('dedupeWithinFetch', () => {
  it('keeps the first item for a repeated guid', () => {
    const items = [
      { guid: 'a', title: 'first' },
      { guid: 'b', title: 'second' },
      { guid: 'a', title: 'duplicate' },
    ];
    expect(dedupeWithinFetch(items)).toEqual([
      { guid: 'a', title: 'first' },
      { guid: 'b', title: 'second' },
    ]);
  });
});
