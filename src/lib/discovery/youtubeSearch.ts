import { fetchWithProxy } from '@/lib/proxy/fetchWithProxy';
import { searchChannelsFromHtml, type YouTubeChannelHit } from '@/lib/youtube';

/*
 * BEST-EFFORT: channel search reads YouTube's public results page (no API key, no official
 * endpoint). It depends on that page's structure, so it stops working when YouTube changes the
 * page. The UI always offers pasting the channel address as the fallback.
 */

const RESULTS_URL = 'https://www.youtube.com/results';
/** YouTube's public "channels only" results filter (an unofficial parameter). */
const CHANNEL_FILTER = 'EgIQAg%3D%3D';
const INITIAL_DATA_MARKER = 'var ytInitialData = ';
const HTML_ACCEPT = 'text/html,application/xhtml+xml,*/*';

/** The results page came back without the data block this search reads (layout changed). */
export class YouTubeLayoutError extends Error {
  constructor() {
    super('YouTube returned a results page this search does not recognise');
    this.name = 'YouTubeLayoutError';
  }
}

/**
 * Channels matching a name. Empty query gives []. Throws FetchAllFailedError when the page cannot
 * be fetched and YouTubeLayoutError when the page has no results data.
 */
export async function searchYouTubeChannels(query: string, signal?: AbortSignal): Promise<YouTubeChannelHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${RESULTS_URL}?search_query=${encodeURIComponent(q)}&sp=${CHANNEL_FILTER}`;
  const res = await fetchWithProxy(url, { expectHtml: true, accept: HTML_ACCEPT, signal });
  if (!res.text.includes(INITIAL_DATA_MARKER)) throw new YouTubeLayoutError();
  return searchChannelsFromHtml(res.text);
}
