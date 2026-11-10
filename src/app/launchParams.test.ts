import { describe, expect, it } from 'vitest';
import { firstLinkInText, LAUNCH_KEYS, parseLaunchParams, removeSearchParams, toWebUrl } from './launchParams';

describe('parseLaunchParams: protocol handler (?feed=)', () => {
  it('passes an https feed URL through', () => {
    expect(parseLaunchParams('?feed=https%3A%2F%2Fexample.com%2Ffeed.xml')).toEqual({
      kind: 'add-feed',
      url: 'https://example.com/feed.xml',
    });
  });

  it('converts feed:// and feed:https:// to https URLs', () => {
    expect(parseLaunchParams('?feed=feed%3A%2F%2Fexample.com%2Ffeed.xml')).toEqual({
      kind: 'add-feed',
      url: 'https://example.com/feed.xml',
    });
    expect(parseLaunchParams('?feed=feed%3Ahttps%3A%2F%2Fexample.com%2Frss')).toEqual({
      kind: 'add-feed',
      url: 'https://example.com/rss',
    });
  });

  it('unwraps web+rss: and keeps an explicit http scheme', () => {
    expect(parseLaunchParams('?feed=web%2Brss%3Ahttps%3A%2F%2Fexample.com%2Frss')).toEqual({
      kind: 'add-feed',
      url: 'https://example.com/rss',
    });
    expect(parseLaunchParams('?feed=web%2Brss%3Ahttp%3A%2F%2Fexample.com%2Frss')).toEqual({
      kind: 'add-feed',
      url: 'http://example.com/rss',
    });
  });

  it('restores web+rss when the query string turned the plus into a space', () => {
    expect(parseLaunchParams('?feed=web+rss:https://example.com/rss')).toEqual({
      kind: 'add-feed',
      url: 'https://example.com/rss',
    });
  });

  it('decodes a double-encoded value', () => {
    expect(parseLaunchParams('?feed=web%252Brss%253Ahttps%253A%252F%252Fexample.com%252Frss')).toEqual({
      kind: 'add-feed',
      url: 'https://example.com/rss',
    });
  });

  it('accepts a bare host for ?feed= and assumes https', () => {
    expect(parseLaunchParams('?feed=example.com/feed.xml')).toEqual({
      kind: 'add-feed',
      url: 'https://example.com/feed.xml',
    });
  });

  it('accepts a search string without the leading question mark', () => {
    expect(parseLaunchParams('feed=https%3A%2F%2Fexample.com%2F')).toEqual({ kind: 'add-feed', url: 'https://example.com/' });
  });
});

describe('parseLaunchParams: share target (?url= ?text= ?title=)', () => {
  it('takes the url parameter first', () => {
    expect(parseLaunchParams('?url=https%3A%2F%2Fexample.com%2Fpost&text=ignored+https%3A%2F%2Fother.test')).toEqual({
      kind: 'share',
      url: 'https://example.com/post',
    });
  });

  it('finds the first web link inside text', () => {
    expect(parseLaunchParams('?text=' + encodeURIComponent('Worth a read: https://example.com/a) and more'))).toEqual({
      kind: 'share',
      url: 'https://example.com/a',
    });
  });

  it('falls back to a title that is a URL', () => {
    expect(parseLaunchParams('?title=' + encodeURIComponent('https://example.com'))).toEqual({
      kind: 'share',
      url: 'https://example.com/',
    });
  });

  it('ignores a title that is plain words', () => {
    expect(parseLaunchParams('?title=Hello%20world')).toEqual({ kind: 'none' });
    expect(parseLaunchParams('?title=Hello.World')).toEqual({ kind: 'none' });
  });

  it('converts feed:// inside shared text', () => {
    expect(parseLaunchParams('?text=' + encodeURIComponent('feed://example.com/rss'))).toEqual({
      kind: 'share',
      url: 'https://example.com/rss',
    });
  });
});

describe('parseLaunchParams: actions and views', () => {
  it('maps action=add', () => {
    expect(parseLaunchParams('?action=add')).toEqual({ kind: 'action', action: 'add' });
  });

  it('ignores unknown actions', () => {
    expect(parseLaunchParams('?action=delete-everything')).toEqual({ kind: 'none' });
  });

  it('maps the unread and favorites views', () => {
    expect(parseLaunchParams('?view=unread')).toEqual({ kind: 'view', view: 'unread' });
    expect(parseLaunchParams('?view=favorites')).toEqual({ kind: 'view', view: 'favorites' });
  });

  it('leaves the other views to useBootUrl', () => {
    expect(parseLaunchParams('?view=readLater')).toEqual({ kind: 'none' });
    expect(parseLaunchParams('?view=all')).toEqual({ kind: 'none' });
  });

  it('gives feed precedence over share, action and view', () => {
    expect(parseLaunchParams('?feed=example.com/rss&url=https://x.test&action=add&view=unread')).toEqual({
      kind: 'add-feed',
      url: 'https://example.com/rss',
    });
  });

  it('returns none for an empty search', () => {
    expect(parseLaunchParams('')).toEqual({ kind: 'none' });
    expect(parseLaunchParams('?')).toEqual({ kind: 'none' });
  });

  it('ignores parameters that belong to other boot handlers', () => {
    expect(parseLaunchParams('?article=42')).toEqual({ kind: 'none' });
    expect(parseLaunchParams('?gallery=1&seed=2')).toEqual({ kind: 'none' });
  });
});

describe('parseLaunchParams: malformed input', () => {
  it('rejects non-web schemes', () => {
    expect(parseLaunchParams('?feed=javascript%3Aalert(1)')).toEqual({ kind: 'none' });
    expect(parseLaunchParams('?feed=data%3Atext%2Fhtml%2Cx')).toEqual({ kind: 'none' });
    expect(parseLaunchParams('?url=' + encodeURIComponent('javascript:alert(1)'))).toEqual({ kind: 'none' });
  });

  it('rejects empty and whitespace values', () => {
    expect(parseLaunchParams('?feed=')).toEqual({ kind: 'none' });
    expect(parseLaunchParams('?feed=%20%20')).toEqual({ kind: 'none' });
    expect(parseLaunchParams('?url=')).toEqual({ kind: 'none' });
  });

  it('rejects a scheme with no host', () => {
    expect(parseLaunchParams('?feed=https%3A%2F%2F')).toEqual({ kind: 'none' });
    expect(parseLaunchParams('?feed=feed%3A')).toEqual({ kind: 'none' });
  });

  it('rejects text that is not an address', () => {
    expect(parseLaunchParams('?feed=not%20a%20url')).toEqual({ kind: 'none' });
    expect(parseLaunchParams('?text=' + encodeURIComponent('no link in here'))).toEqual({ kind: 'none' });
  });

  it('does not throw on broken percent escapes', () => {
    expect(() => parseLaunchParams('?feed=%E0%A4%A&url=%ZZ&text=%')).not.toThrow();
    expect(parseLaunchParams('?feed=%E0%A4%A')).toEqual({ kind: 'none' });
  });
});

describe('toWebUrl', () => {
  it('requires an explicit scheme unless a bare host is allowed', () => {
    expect(toWebUrl('example.com/feed')).toBe('');
    expect(toWebUrl('example.com/feed', { allowBareHost: true })).toBe('https://example.com/feed');
  });

  it('returns empty string for null and undefined', () => {
    expect(toWebUrl(null)).toBe('');
    expect(toWebUrl(undefined)).toBe('');
  });
});

describe('firstLinkInText', () => {
  it('returns the first valid link and ignores words that only end in feed or rss', () => {
    expect(firstLinkInText('newsfeed: see https://a.test/x then https://b.test')).toBe('https://a.test/x');
    expect(firstLinkInText('')).toBe('');
    expect(firstLinkInText(null)).toBe('');
  });
});

describe('removeSearchParams', () => {
  it('removes only the given keys and keeps the path and hash', () => {
    expect(removeSearchParams('https://x.test/OpenHorizon/?feed=a&view=unread#/top', ['feed'])).toBe(
      '/OpenHorizon/?view=unread#/top',
    );
  });

  it('leaves no query when the last key is removed', () => {
    expect(removeSearchParams('https://x.test/OpenHorizon/?action=add', ['action'])).toBe('/OpenHorizon/');
  });

  it('is a no-op when the keys are absent', () => {
    expect(removeSearchParams('https://x.test/?article=3', ['feed'])).toBe('/?article=3');
  });
});

describe('LAUNCH_KEYS', () => {
  it('lists the keys each result consumes', () => {
    expect(LAUNCH_KEYS['add-feed']).toEqual(['feed']);
    expect(LAUNCH_KEYS.share).toEqual(['url', 'text', 'title']);
  });
});
