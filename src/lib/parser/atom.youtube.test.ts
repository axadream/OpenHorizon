import { describe, expect, it } from 'vitest';
import { parseFeed } from './parseFeed';

/* Shaped like a YouTube channel feed (feeds/videos.xml): yt:* ids, media:group with thumbnail and description. */
const YOUTUBE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw"/>
  <id>yt:channel:_x5XG1OV2P6uZZ5FSM9Ttw</id>
  <yt:channelId>_x5XG1OV2P6uZZ5FSM9Ttw</yt:channelId>
  <title>Veritasium</title>
  <link rel="alternate" href="https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw"/>
  <author><name>Veritasium</name><uri>https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw</uri></author>
  <published>2015-01-01T00:00:00+00:00</published>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <yt:channelId>_x5XG1OV2P6uZZ5FSM9Ttw</yt:channelId>
    <title>A real video title</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
    <author><name>Veritasium</name><uri>https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw</uri></author>
    <published>2026-11-01T10:00:00+00:00</published>
    <updated>2026-11-02T10:00:00+00:00</updated>
    <media:group>
      <media:title>A real video title</media:title>
      <media:content url="https://www.youtube.com/v/dQw4w9WgXcQ?version=3" type="application/x-shockwave-flash" width="640" height="390"/>
      <media:thumbnail url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" width="480" height="360"/>
      <media:description>First line.
Second line with &lt;b&gt; text.</media:description>
      <media:community>
        <media:starRating count="10" average="5.00" min="1" max="5"/>
      </media:community>
    </media:group>
  </entry>
  <entry>
    <id>yt:video:abcdefghijk</id>
    <yt:videoId>abcdefghijk</yt:videoId>
    <yt:channelId>_x5XG1OV2P6uZZ5FSM9Ttw</yt:channelId>
    <title>Second video without a thumbnail element</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abcdefghijk"/>
    <author><name>Veritasium</name></author>
    <published>2026-10-30T08:30:00+00:00</published>
    <media:group>
      <media:description>Only a description.</media:description>
    </media:group>
  </entry>
</feed>`;

describe('YouTube Atom feeds', () => {
  const feed = parseFeed(YOUTUBE_FEED, 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw');
  const [first, second] = feed.items;

  it('reads the channel title and site url', () => {
    expect(feed.kind).toBe('atom');
    expect(feed.title).toBe('Veritasium');
    expect(feed.siteUrl).toBe('https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw');
  });

  it('maps title, watch link, author and published date for each entry', () => {
    expect(first?.title).toBe('A real video title');
    expect(first?.link).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(first?.author).toBe('Veritasium');
    expect(first?.publishedAt).toBe(Date.UTC(2026, 10, 1, 10, 0, 0));
    expect(first?.guid).toBe('yt:video:dQw4w9WgXcQ');
  });

  it('takes the thumbnail from media:group and the description as summary and body', () => {
    expect(first?.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(first?.summary).toContain('First line.');
    expect(first?.summary).toContain('Second line with <b> text.');
    expect(first?.contentRaw).toContain('<br>');
    expect(first?.contentRaw).toContain('&lt;b&gt;');
  });

  it('derives the hqdefault thumbnail from yt:videoId when no media:thumbnail exists', () => {
    expect(second?.thumbnailUrl).toBe('https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
    expect(second?.summary).toBe('Only a description.');
    expect(second?.link).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  });
});
