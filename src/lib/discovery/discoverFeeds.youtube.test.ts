import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverFeeds } from './discoverFeeds';
import { resetFailureMemory } from '@/lib/proxy/failureMemory';

const CHANNEL = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
const PLAYLIST = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';
const RSS = '<?xml version="1.0"?><rss version="2.0"><channel><title>Veritasium</title><link>https://www.youtube.com</link><item><title>One</title><link>https://www.youtube.com/watch?v=dQw4w9WgXcQ</link><guid>1</guid></item></channel></rss>';

const HANDLE_PAGE = `<!doctype html><html><head>
  <link rel="canonical" href="https://www.youtube.com/@veritasium">
  <script>var ytInitialData = {"metadata":{"channelMetadataRenderer":{"externalId":"${CHANNEL}"}}};</script>
  </head><body></body></html>`;

const VIDEO_PAGE = `<!doctype html><html><head>
  <script>var x = {"videoDetails":{"channelId":"${CHANNEL}"}};</script>
  </head><body></body></html>`;

let routes: Record<string, { status?: number; body: string }>;

beforeEach(() => {
  resetFailureMemory();
  routes = {};
  vi.stubEnv('VITE_CORS_PROXY', '');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const r = routes[url];
      if (!r) return new Response('not found', { status: 404 });
      return new Response(r.body, { status: r.status ?? 200, headers: { 'content-type': 'text/html' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('discoverFeeds on YouTube addresses', () => {
  it('resolves the channel id of a handle page and offers its verified Atom feed first', async () => {
    routes['https://www.youtube.com/@veritasium'] = { body: HANDLE_PAGE };
    routes[`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`] = { body: RSS };

    const out = await discoverFeeds('https://www.youtube.com/@veritasium');

    expect(out).toEqual([
      {
        url: `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`,
        title: 'Veritasium',
        kind: 'rss2',
        source: 'well-known',
        verified: true,
      },
    ]);
  });

  it('offers the channel feed and the playlist feed for a video with list=', async () => {
    const watch = `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${PLAYLIST}`;
    routes[watch] = { body: VIDEO_PAGE };
    routes[`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`] = { body: RSS };
    routes[`https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST}`] = { body: RSS };

    const out = await discoverFeeds(watch);

    expect(out.map((c) => c.url)).toEqual([
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`,
      `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST}`,
    ]);
    expect(out.every((c) => c.verified === true)).toBe(true);
  });

  it('keeps an unverified channel candidate when its feed does not answer', async () => {
    routes['https://www.youtube.com/@veritasium'] = { body: HANDLE_PAGE };

    const out = await discoverFeeds('https://www.youtube.com/@veritasium');

    expect(out).toEqual([
      {
        url: `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`,
        source: 'well-known',
        verified: false,
      },
    ]);
  });

  it('uses the channel feed directly for a channel URL without fetching the page for an id', async () => {
    routes[`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`] = { body: RSS };
    routes[`https://www.youtube.com/channel/${CHANNEL}`] = { body: HANDLE_PAGE };

    const out = await discoverFeeds(`https://www.youtube.com/channel/${CHANNEL}`);

    expect(out[0]).toMatchObject({ url: `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`, verified: true });
  });
});
