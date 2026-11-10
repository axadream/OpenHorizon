import { describe, expect, it } from 'vitest';
import {
  extractChannelIdFromHtml,
  isYouTubeKeywordQuery,
  parseYouTubeUrl,
  searchChannelsFromHtml,
  youTubeVideoIdOf,
  youtubeFeedUrl,
} from './youtube';

const CHANNEL = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';

describe('parseYouTubeUrl', () => {
  it('recognises video links in every shape', () => {
    const id = 'dQw4w9WgXcQ';
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${id}`)).toEqual({ kind: 'video', videoId: id });
    expect(parseYouTubeUrl(`https://m.youtube.com/watch?v=${id}&t=10`)).toEqual({ kind: 'video', videoId: id });
    expect(parseYouTubeUrl(`https://youtu.be/${id}?si=abc`)).toEqual({ kind: 'video', videoId: id });
    expect(parseYouTubeUrl(`https://www.youtube.com/shorts/${id}`)).toEqual({ kind: 'video', videoId: id });
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${id}`)).toEqual({ kind: 'video', videoId: id });
    expect(parseYouTubeUrl(`https://www.youtube-nocookie.com/embed/${id}`)).toEqual({ kind: 'video', videoId: id });
    expect(parseYouTubeUrl(`https://www.youtube.com/live/${id}`)).toEqual({ kind: 'video', videoId: id });
    expect(parseYouTubeUrl(`https://music.youtube.com/watch?v=${id}`)).toEqual({ kind: 'video', videoId: id });
  });

  it('keeps a valid playlist id on a video link', () => {
    const playlistId = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${playlistId}`)).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
      playlistId,
    });
  });

  it('rejects video ids of the wrong length or charset', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=short')).toEqual({ kind: 'none' });
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=abcdefghijkl')).toEqual({ kind: 'none' });
    expect(parseYouTubeUrl('https://youtu.be/has space!!')).toEqual({ kind: 'none' });
  });

  it('recognises channel ids, handles, custom and user names', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/channel/${CHANNEL}`)).toEqual({ kind: 'channel', channelId: CHANNEL });
    expect(parseYouTubeUrl('https://www.youtube.com/@veritasium')).toEqual({ kind: 'handle', handle: 'veritasium' });
    expect(parseYouTubeUrl('https://www.youtube.com/@veritasium/videos')).toEqual({ kind: 'handle', handle: 'veritasium' });
    expect(parseYouTubeUrl('https://www.youtube.com/c/Veritasium')).toEqual({ kind: 'custom', name: 'Veritasium' });
    expect(parseYouTubeUrl('https://www.youtube.com/user/Veritasium')).toEqual({ kind: 'user', user: 'Veritasium' });
    expect(parseYouTubeUrl(`https://www.youtube.com/channel/UCshort`)).toEqual({ kind: 'none' });
  });

  it('recognises playlist links and the playlist prefixes', () => {
    const pl = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';
    expect(parseYouTubeUrl(`https://www.youtube.com/playlist?list=${pl}`)).toEqual({ kind: 'playlist', playlistId: pl });
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=UUxyzxyzxyzxyzxyzxyz')).toEqual({
      kind: 'playlist',
      playlistId: 'UUxyzxyzxyzxyzxyzxyz',
    });
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=XXnotaplaylist123')).toEqual({ kind: 'none' });
  });

  it('recognises feed URLs and rejects other hosts', () => {
    const feed = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`;
    expect(parseYouTubeUrl(feed)).toEqual({ kind: 'feed', url: feed });
    expect(parseYouTubeUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toEqual({ kind: 'none' });
    expect(parseYouTubeUrl('not a url')).toEqual({ kind: 'none' });
    expect(parseYouTubeUrl('javascript:alert(1)')).toEqual({ kind: 'none' });
  });

  it('accepts input without a scheme', () => {
    expect(parseYouTubeUrl('youtube.com/@veritasium')).toEqual({ kind: 'handle', handle: 'veritasium' });
  });
});

describe('youtubeFeedUrl', () => {
  it('builds Atom URLs for channel, playlist and user references', () => {
    expect(youtubeFeedUrl({ kind: 'channel', channelId: CHANNEL })).toBe(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`,
    );
    expect(youtubeFeedUrl({ kind: 'playlist', playlistId: 'PLabc1234567' })).toBe(
      'https://www.youtube.com/feeds/videos.xml?playlist_id=PLabc1234567',
    );
    expect(youtubeFeedUrl({ kind: 'user', user: 'Veritasium' })).toBe(
      'https://www.youtube.com/feeds/videos.xml?user=Veritasium',
    );
  });

  it('returns null when the id must be resolved from a page first', () => {
    expect(youtubeFeedUrl({ kind: 'handle', handle: 'veritasium' })).toBeNull();
    expect(youtubeFeedUrl({ kind: 'custom', name: 'x' })).toBeNull();
    expect(youtubeFeedUrl({ kind: 'video', videoId: 'dQw4w9WgXcQ' })).toBeNull();
    expect(youtubeFeedUrl({ kind: 'none' })).toBeNull();
  });
});

describe('youTubeVideoIdOf', () => {
  it('returns the id for video links only', () => {
    expect(youTubeVideoIdOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youTubeVideoIdOf('https://www.youtube.com/@veritasium')).toBeNull();
    expect(youTubeVideoIdOf(null)).toBeNull();
  });
});

describe('extractChannelIdFromHtml', () => {
  it('reads the channelId JSON field first', () => {
    const html = `<script>var x = {"channelId":"${CHANNEL}"};</script><meta itemprop="channelId" content="UCaaaaaaaaaaaaaaaaaaaaaa">`;
    expect(extractChannelIdFromHtml(html)).toBe(CHANNEL);
  });

  it('falls back to externalId, the meta tag, canonical and alternate links, in that order', () => {
    expect(extractChannelIdFromHtml(`{"externalId":"${CHANNEL}"}`)).toBe(CHANNEL);
    expect(extractChannelIdFromHtml(`<meta content="${CHANNEL}" itemprop="channelId">`)).toBe(CHANNEL);
    expect(
      extractChannelIdFromHtml(`<link rel="alternate" href="https://www.youtube.com/channel/${CHANNEL}">`),
    ).toBe(CHANNEL);
    expect(
      extractChannelIdFromHtml(
        `<link rel="alternate" href="https://www.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb"><link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL}">`,
      ),
    ).toBe(CHANNEL);
  });

  it('ignores invalid ids and returns null when nothing matches', () => {
    expect(extractChannelIdFromHtml('{"channelId":"UCtooshort"}')).toBeNull();
    expect(extractChannelIdFromHtml('<p>hello</p>')).toBeNull();
    expect(extractChannelIdFromHtml('')).toBeNull();
  });

  it('resolves a handle page fixture', () => {
    const html = `<!doctype html><html><head>
      <link rel="canonical" href="https://www.youtube.com/@veritasium">
      <meta itemprop="channelId" content="${CHANNEL}"></head><body></body></html>`;
    expect(extractChannelIdFromHtml(html)).toBe(CHANNEL);
  });
});

function searchPage(data: unknown): string {
  return `<html><body><script>var ytInitialData = ${JSON.stringify(data)};</script></body></html>`;
}

describe('searchChannelsFromHtml', () => {
  it('collects classic channelRenderer entries with name, subscribers and avatar', () => {
    const page = searchPage({
      contents: {
        items: [
          {
            channelRenderer: {
              channelId: CHANNEL,
              title: { simpleText: 'Veritasium' },
              subscriberCountText: { simpleText: '15M subscribers' },
              thumbnail: { thumbnails: [{ url: '//yt3.ggpht.com/small=s88' }, { url: '//yt3.ggpht.com/big=s176' }] },
            },
          },
          { videoRenderer: { videoId: 'dQw4w9WgXcQ' } },
        ],
      },
    });
    expect(searchChannelsFromHtml(page)).toEqual([
      {
        channelId: CHANNEL,
        name: 'Veritasium',
        subscribers: '15M subscribers',
        avatarUrl: 'https://yt3.ggpht.com/big=s176',
        feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`,
      },
    ]);
  });

  it('reads the newer lockupViewModel channel shape and dedupes by id', () => {
    const other = 'UCBa659QWEk1AI4Tg--mrJ2A';
    const page = searchPage({
      items: [
        {
          lockupViewModel: {
            contentType: 'LOCKUP_CONTENT_TYPE_CHANNEL',
            contentId: other,
            metadata: { lockupMetadataViewModel: { title: { content: 'Numberphile' } } },
          },
        },
        {
          lockupViewModel: {
            contentType: 'LOCKUP_CONTENT_TYPE_CHANNEL',
            contentId: other,
            metadata: { lockupMetadataViewModel: { title: { content: 'Numberphile' } } },
          },
        },
        {
          lockupViewModel: {
            contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
            contentId: 'dQw4w9WgXcQ',
          },
        },
      ],
    });
    const hits = searchChannelsFromHtml(page);
    expect(hits.map((h) => [h.channelId, h.name])).toEqual([[other, 'Numberphile']]);
  });

  it('caps the result count at 20', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      channelRenderer: {
        channelId: `UC${String(i).padStart(2, '0')}aaaaaaaaaaaaaaaaaaaa`,
        title: { simpleText: `Channel ${i}` },
      },
    }));
    expect(searchChannelsFromHtml(searchPage({ items }))).toHaveLength(20);
  });

  it('returns an empty list for malformed or unrecognised pages', () => {
    expect(searchChannelsFromHtml('<html>no data</html>')).toEqual([]);
    expect(searchChannelsFromHtml('<script>var ytInitialData = {broken;</script>')).toEqual([]);
    expect(searchChannelsFromHtml('')).toEqual([]);
  });
});

describe('isYouTubeKeywordQuery', () => {
  it('is true for plain names and false for addresses', () => {
    expect(isYouTubeKeywordQuery('veritasium')).toBe(true);
    expect(isYouTubeKeywordQuery('  science channel ')).toBe(true);
    expect(isYouTubeKeywordQuery('example.com')).toBe(false);
    expect(isYouTubeKeywordQuery('https://example')).toBe(false);
    expect(isYouTubeKeywordQuery('   ')).toBe(false);
  });
});
