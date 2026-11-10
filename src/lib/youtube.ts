import { withWebScheme } from '@/lib/url';

/*
 * YouTube URL and feed helpers. Pure: no network, no DOM, safe in tests and in the page.
 * Feeds use YouTube's public Atom endpoint (feeds/videos.xml). The channel search parser reads the
 * public results page; that page layout is not an API, so searchChannelsFromHtml is best-effort.
 */

export type YouTubeRef =
  | { kind: 'channel'; channelId: string }
  | { kind: 'handle'; handle: string }
  | { kind: 'user'; user: string }
  | { kind: 'custom'; name: string }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'video'; videoId: string; playlistId?: string }
  | { kind: 'feed'; url: string }
  | { kind: 'none' };

export interface YouTubeChannelHit {
  channelId: string;
  name: string;
  /** Subscriber text as YouTube shows it (already localized), when present. */
  subscribers?: string;
  avatarUrl?: string;
  feedUrl: string;
}

const NONE: YouTubeRef = { kind: 'none' };
const FEED_BASE = 'https://www.youtube.com/feeds/videos.xml';
const YT_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
/** Playlist ids: PL (custom), UU (uploads), OL (music/other), FL (favourites). */
const PLAYLIST_ID_RE = /^(?:PL|UU|OL|FL)[\w-]{10,80}$/;
const HANDLE_RE = /^[\p{L}\p{N}._-]{1,100}$/u;

const INITIAL_DATA_MARKER = 'var ytInitialData = ';
const INITIAL_DATA_END = ';</script>';
const SEARCH_JSON_MAX_CHARS = 5 * 1024 * 1024;
const SEARCH_MAX_CHANNELS = 20;
const SEARCH_MAX_NODES = 200_000;
const SEARCH_MAX_DEPTH = 64;
const LOOKUP_MAX_DEPTH = 8;

function toHttpUrl(input: string): URL | null {
  const raw = withWebScheme((input ?? '').trim());
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function videoRef(videoId: string, playlistId: string | undefined): YouTubeRef {
  return playlistId ? { kind: 'video', videoId, playlistId } : { kind: 'video', videoId };
}

/**
 * Recognise a YouTube address: channel, @handle, /c/, /user/, playlist, video (watch, shorts,
 * embed, live, youtu.be) or a feeds/videos.xml URL. Anything else is { kind: 'none' }.
 */
export function parseYouTubeUrl(input: string): YouTubeRef {
  const url = toHttpUrl(input);
  if (!url) return NONE;
  const host = url.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) return NONE;

  const list = url.searchParams.get('list') ?? '';
  const playlistId = PLAYLIST_ID_RE.test(list) ? list : undefined;

  if (host === 'youtu.be') {
    const id = safeDecode(url.pathname.split('/').filter(Boolean)[0] ?? '');
    return VIDEO_ID_RE.test(id) ? videoRef(id, playlistId) : NONE;
  }

  const segments = url.pathname.split('/').filter(Boolean).map(safeDecode);
  const first = segments[0];
  const second = segments[1];
  if (first === undefined) return NONE;

  if (first === 'feeds' && second === 'videos.xml') return { kind: 'feed', url: url.href };

  if (first === 'watch') {
    const v = url.searchParams.get('v') ?? '';
    if (VIDEO_ID_RE.test(v)) return videoRef(v, playlistId);
    return playlistId ? { kind: 'playlist', playlistId } : NONE;
  }
  if (first === 'shorts' || first === 'embed' || first === 'live') {
    return second !== undefined && VIDEO_ID_RE.test(second) ? videoRef(second, playlistId) : NONE;
  }
  if (first === 'playlist') return playlistId ? { kind: 'playlist', playlistId } : NONE;

  if (first === 'channel') {
    return second !== undefined && CHANNEL_ID_RE.test(second) ? { kind: 'channel', channelId: second } : NONE;
  }
  if (first.startsWith('@')) {
    const handle = first.slice(1);
    return HANDLE_RE.test(handle) ? { kind: 'handle', handle } : NONE;
  }
  if (first === 'c' && second !== undefined && HANDLE_RE.test(second)) return { kind: 'custom', name: second };
  if (first === 'user' && second !== undefined && HANDLE_RE.test(second)) return { kind: 'user', user: second };
  return NONE;
}

/**
 * Atom feed URL for a reference that already names its feed (channel, playlist, legacy user, or a
 * feed URL). Handles, custom names and videos need their channel id resolved from the page first.
 */
export function youtubeFeedUrl(ref: YouTubeRef): string | null {
  switch (ref.kind) {
    case 'channel':
      return `${FEED_BASE}?channel_id=${encodeURIComponent(ref.channelId)}`;
    case 'playlist':
      return `${FEED_BASE}?playlist_id=${encodeURIComponent(ref.playlistId)}`;
    case 'user':
      return `${FEED_BASE}?user=${encodeURIComponent(ref.user)}`;
    case 'feed':
      return ref.url;
    default:
      return null;
  }
}

/** Playlist feed URL for a playlist id. */
export function youtubePlaylistFeedUrl(playlistId: string): string {
  return `${FEED_BASE}?playlist_id=${encodeURIComponent(playlistId)}`;
}

/** Channel feed URL for a channel id. */
export function youtubeChannelFeedUrl(channelId: string): string {
  return `${FEED_BASE}?channel_id=${encodeURIComponent(channelId)}`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Privacy-enhanced embed URL (youtube-nocookie.com) with the reader's parameters. Only built when
 * the user presses play, so no request goes out before that.
 */
export function youtubeEmbedUrl(videoId: string, locale: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    hl: locale,
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/** Video id when the address is a YouTube video link, otherwise null. */
export function youTubeVideoIdOf(link: string | null | undefined): string | null {
  if (!link) return null;
  const ref = parseYouTubeUrl(link);
  return ref.kind === 'video' ? ref.videoId : null;
}

/** Read one attribute from a single tag's source text (quoted values only). */
function tagAttr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? '') : null;
}

/**
 * Channel id from a channel, handle or video page. Sources are tried from most to least specific:
 * 1. the page's own RSS link (`<link rel="alternate" type="application/rss+xml" href=".../videos.xml?channel_id=UC...">`),
 * 2. `<link rel="canonical">` with /channel/UC...,
 * 3. the "externalId" JSON field, 4. `<meta itemprop="channelId">`, 5. any other alternate link with /channel/UC...,
 * 6. the first "channelId" JSON field.
 * The "channelId" field comes last on purpose: a channel page mentions many channels (featured and
 * related ones) and the first occurrence is often not the page's own channel, while a watch page
 * lists the uploader first.
 */
export function extractChannelIdFromHtml(html: string): string | null {
  if (!html) return null;
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const relOf = (tag: string): string[] => (tagAttr(tag, 'rel') ?? '').toLowerCase().split(/\s+/);

  for (const tag of links) {
    if (!relOf(tag).includes('alternate')) continue;
    const href = tagAttr(tag, 'href') ?? '';
    const id = /videos\.xml\?[^"']*?channel_id=(UC[\w-]{22})(?![\w-])/.exec(href)?.[1];
    if (id) return id;
  }

  const channelPath = (tag: string): string | undefined =>
    /\/channel\/(UC[\w-]{22})(?![\w-])/.exec(tagAttr(tag, 'href') ?? '')?.[1];
  for (const tag of links) {
    if (!relOf(tag).includes('canonical')) continue;
    const id = channelPath(tag);
    if (id) return id;
  }

  const external = /"externalId":"(UC[\w-]{22})"/.exec(html)?.[1];
  if (external && CHANNEL_ID_RE.test(external)) return external;

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if ((tagAttr(tag, 'itemprop') ?? '').toLowerCase() !== 'channelid') continue;
    const id = tagAttr(tag, 'content') ?? '';
    if (CHANNEL_ID_RE.test(id)) return id;
  }

  for (const tag of links) {
    if (!relOf(tag).includes('alternate')) continue;
    const id = channelPath(tag);
    if (id) return id;
  }

  const json = /"channelId":"(UC[\w-]{22})"/.exec(html)?.[1];
  if (json && CHANNEL_ID_RE.test(json)) return json;
  return null;
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Display text from a YouTube text object: a string, {simpleText} or {runs: [{text}]}. */
function textOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (!isObj(v)) return '';
  if (typeof v.simpleText === 'string') return v.simpleText.trim();
  if (Array.isArray(v.runs)) {
    return v.runs
      .map((r) => (isObj(r) ? str(r.text) : ''))
      .join('')
      .trim();
  }
  return '';
}

function httpsUrl(raw: string): string | undefined {
  const url = raw.startsWith('//') ? `https:${raw}` : raw;
  return /^https:\/\//i.test(url) ? url : undefined;
}

/** Largest thumbnail (the last entry) of a {thumbnails: []} object. */
function largestThumb(v: unknown): string | undefined {
  if (!isObj(v) || !Array.isArray(v.thumbnails)) return undefined;
  const last = v.thumbnails.at(-1);
  return isObj(last) ? httpsUrl(str(last.url)) : undefined;
}

/** First subtree value under a key with the given name, searched breadth-limited. */
function findString(v: unknown, test: (s: string) => boolean, depth = 0): string | undefined {
  if (depth > LOOKUP_MAX_DEPTH) return undefined;
  if (typeof v === 'string') return test(v) ? v : undefined;
  const children: unknown[] = Array.isArray(v) ? v : isObj(v) ? Object.values(v) : [];
  for (const c of children) {
    const hit = findString(c, test, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** First https avatar/source url under a subtree (the newer lockup layout keeps avatars in `sources`). */
function findSourceUrl(v: unknown, depth = 0): string | undefined {
  if (depth > LOOKUP_MAX_DEPTH) return undefined;
  if (isObj(v) && Array.isArray(v.sources)) {
    const last = v.sources.at(-1);
    const url = isObj(last) ? httpsUrl(str(last.url)) : undefined;
    if (url) return url;
  }
  const children: unknown[] = Array.isArray(v) ? v : isObj(v) ? Object.values(v) : [];
  for (const c of children) {
    const hit = findSourceUrl(c, depth + 1);
    if (hit) return hit;
  }
  return undefined;
}

function channelFromRenderer(obj: Obj): YouTubeChannelHit | null {
  const r = obj.channelRenderer;
  if (!isObj(r)) return null;
  const channelId = str(r.channelId);
  if (!CHANNEL_ID_RE.test(channelId)) return null;
  const hit: YouTubeChannelHit = {
    channelId,
    name: textOf(r.title) || channelId,
    feedUrl: youtubeChannelFeedUrl(channelId),
  };
  const subscribers = textOf(r.subscriberCountText);
  if (subscribers) hit.subscribers = subscribers;
  const avatar = largestThumb(r.thumbnail);
  if (avatar) hit.avatarUrl = avatar;
  return hit;
}

function channelFromLockup(obj: Obj): YouTubeChannelHit | null {
  const l = obj.lockupViewModel;
  if (!isObj(l) || str(l.contentType) !== 'LOCKUP_CONTENT_TYPE_CHANNEL') return null;
  const channelId = str(l.contentId);
  if (!CHANNEL_ID_RE.test(channelId)) return null;

  const meta = isObj(l.metadata) ? l.metadata.lockupMetadataViewModel : undefined;
  const titleObj = isObj(meta) ? meta.title : undefined;
  const title = isObj(titleObj) ? str(titleObj.content).trim() : '';
  const hit: YouTubeChannelHit = {
    channelId,
    name: title || channelId,
    feedUrl: youtubeChannelFeedUrl(channelId),
  };
  const subscribers = findString(l.metadata, (s) => /subscriber/i.test(s));
  if (subscribers) hit.subscribers = subscribers.trim();
  const avatar = findSourceUrl(l.contentImage);
  if (avatar) hit.avatarUrl = avatar;
  return hit;
}

/** Channel results from a public YouTube search page (sp=channel filter). Never throws. */
export function searchChannelsFromHtml(html: string): YouTubeChannelHit[] {
  if (!html) return [];
  const start = html.indexOf(INITIAL_DATA_MARKER);
  if (start < 0) return [];
  const from = start + INITIAL_DATA_MARKER.length;
  const end = html.indexOf(INITIAL_DATA_END, from);
  if (end <= from || end - from > SEARCH_JSON_MAX_CHARS) return [];

  let root: unknown;
  try {
    root = JSON.parse(html.slice(from, end));
  } catch {
    return [];
  }

  // Depth-first walk with an explicit stack (no recursion), children pushed in reverse so the
  // results keep document order.
  const found: YouTubeChannelHit[] = [];
  const seen = new Set<string>();
  const stack: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  let visited = 0;
  while (stack.length > 0 && found.length < SEARCH_MAX_CHANNELS && visited < SEARCH_MAX_NODES) {
    const item = stack.pop();
    if (!item) break;
    visited++;
    const { value, depth } = item;
    if (depth > SEARCH_MAX_DEPTH || value === null || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) stack.push({ value: value[i], depth: depth + 1 });
      continue;
    }

    const obj = value as Obj;
    const hit = channelFromLockup(obj) ?? channelFromRenderer(obj);
    if (hit && !seen.has(hit.channelId)) {
      seen.add(hit.channelId);
      found.push(hit);
    }
    const keys = Object.keys(obj);
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      if (key !== undefined) stack.push({ value: obj[key], depth: depth + 1 });
    }
  }
  return found;
}

/**
 * True for input that reads as a name rather than an address: no dot and no scheme
 * (e.g. "veritasium"). Used to offer the YouTube channel search.
 */
export function isYouTubeKeywordQuery(input: string): boolean {
  const q = input.trim();
  return q.length > 0 && !q.includes('.') && !/^[a-z][a-z0-9+.-]*:/i.test(q);
}
