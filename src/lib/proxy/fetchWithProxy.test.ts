import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchAllFailedError, fetchWithProxy } from './fetchWithProxy';
import { resetFailureMemory, shouldSkip, recordFailure } from './failureMemory';

const FEED = 'https://example.com/feed.xml';
const RSS = '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title></channel></rss>';
const LOCAL = `/api/proxy?url=${encodeURIComponent(FEED)}`;
const ALLORIGINS = `https://api.allorigins.win/raw?url=${encodeURIComponent(FEED)}`;
const CODETABS = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(FEED)}`;

type Init = RequestInit & { headers: Record<string, string> };

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(responder: (url: string, init: Init) => Response | Promise<Response>) {
  fetchMock = vi.fn((url: string, init: Init) => responder(url, init));
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  resetFailureMemory();
  vi.stubEnv('VITE_CORS_PROXY', '');
  vi.stubEnv('VITE_DISABLE_LOCAL_PROXY', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('fetchWithProxy order and headers', () => {
  it('tries direct, then local, then allorigins, then codetabs with exact URL templates', async () => {
    stubFetch((url) => {
      if (url === FEED) return new Response('nope', { status: 500 });
      if (url === LOCAL) return new Response('nope', { status: 500 });
      if (url === ALLORIGINS) return new Response('nope', { status: 503 });
      return new Response(RSS, { status: 200 });
    });
    const res = await fetchWithProxy(FEED);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([FEED, LOCAL, ALLORIGINS, CODETABS]);
    expect(res.via).toBe('codetabs');
    expect(res.text).toBe(RSS);
    expect(res.finalUrl).toBe(FEED);
  });

  it('uses the local proxy and reports X-OH-Final-Url as finalUrl', async () => {
    const final = 'https://example.com/moved/feed.xml';
    stubFetch((url) => {
      if (url === FEED) return new Response('x', { status: 500 });
      return new Response(RSS, { headers: { 'x-oh-final-url': final, etag: '"e1"' } });
    });
    const res = await fetchWithProxy(FEED);
    expect(res.via).toBe('local');
    expect(res.finalUrl).toBe(final);
    expect(res.etag).toBe('"e1"');
  });

  it('skips the local proxy when VITE_DISABLE_LOCAL_PROXY=1', async () => {
    vi.stubEnv('VITE_DISABLE_LOCAL_PROXY', '1');
    stubFetch((url) => (url === FEED ? new Response('x', { status: 500 }) : new Response(RSS)));
    const res = await fetchWithProxy(FEED);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(ALLORIGINS);
    expect(res.via).toBe('allorigins');
  });

  it('puts the env proxy right after direct and fills {url}', async () => {
    vi.stubEnv('VITE_CORS_PROXY', 'https://my-proxy.example.com/?url={url}');
    stubFetch((url) => (url.startsWith('https://my-proxy') ? new Response(RSS) : new Response('x', { status: 500 })));
    const res = await fetchWithProxy(FEED);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`https://my-proxy.example.com/?url=${encodeURIComponent(FEED)}`);
    expect(res.via).toBe('env');
  });

  it('appends the encoded URL when the env proxy has no placeholder', async () => {
    vi.stubEnv('VITE_CORS_PROXY', 'https://my-proxy.example.com/raw?u=');
    stubFetch((url) => (url === FEED ? new Response('x', { status: 500 }) : new Response(RSS)));
    await fetchWithProxy(FEED);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`https://my-proxy.example.com/raw?u=${encodeURIComponent(FEED)}`);
  });

  it('sends conditional headers on direct and local but never on allorigins', async () => {
    stubFetch((url) => (url === FEED || url === LOCAL ? new Response('x', { status: 500 }) : new Response(RSS)));
    await fetchWithProxy(FEED, { etag: '"abc"', lastModified: 'Mon, 01 Jan 2026 00:00:00 GMT' });
    for (const i of [0, 1]) {
      expect(fetchMock.mock.calls[i]?.[1].headers['If-None-Match']).toBe('"abc"');
      expect(fetchMock.mock.calls[i]?.[1].headers['If-Modified-Since']).toBe('Mon, 01 Jan 2026 00:00:00 GMT');
    }
    expect(fetchMock.mock.calls[2]?.[0]).toBe(ALLORIGINS);
    expect(fetchMock.mock.calls[2]?.[1].headers['If-None-Match']).toBeUndefined();
    expect(fetchMock.mock.calls[2]?.[1].headers['If-Modified-Since']).toBeUndefined();
  });

  it('returns 304 from local with its etag and last-modified', async () => {
    stubFetch((url) => {
      if (url === FEED) return new Response('x', { status: 500 });
      return new Response(null, {
        status: 304,
        headers: { etag: '"v2"', 'last-modified': 'Tue, 02 Jan 2026 00:00:00 GMT' },
      });
    });
    const res = await fetchWithProxy(FEED, { etag: '"v1"' });
    expect(res.status).toBe(304);
    expect(res.text).toBe('');
    expect(res.etag).toBe('"v2"');
    expect(res.lastModified).toBe('Tue, 02 Jan 2026 00:00:00 GMT');
    expect(res.via).toBe('local');
  });

  it('rejects an HTML error page from a proxy and moves on', async () => {
    stubFetch((url) => {
      if (url === FEED || url === LOCAL) return new Response('x', { status: 500 });
      if (url === ALLORIGINS) return new Response('<!DOCTYPE html><html><body>Rate limited</body></html>');
      return new Response(RSS);
    });
    const res = await fetchWithProxy(FEED);
    expect(res.via).toBe('codetabs');
  });

  it('treats an empty body as a failure', async () => {
    stubFetch((url) => (url === FEED ? new Response('   ') : new Response(RSS)));
    const res = await fetchWithProxy(FEED);
    expect(res.via).toBe('local');
  });

  it('throws FetchAllFailedError with every attempt when all fail', async () => {
    stubFetch(() => new Response('x', { status: 500 }));
    const err = await fetchWithProxy(FEED).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchAllFailedError);
    expect((err as FetchAllFailedError).attempts.map((a) => a.via)).toEqual([
      'direct',
      'local',
      'allorigins',
      'codetabs',
    ]);
  });
});

describe('fetchWithProxy timeout', () => {
  it('aborts an attempt after 15 seconds and falls through', async () => {
    vi.useFakeTimers();
    stubFetch((url, init) => {
      if (url !== FEED) return Promise.resolve(new Response(RSS));
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const p = fetchWithProxy(FEED);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fetchMock.mock.calls[0]?.[1].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    const res = await p;
    expect(res.via).toBe('local');
  });

  it('stops immediately when the caller aborts', async () => {
    const ctrl = new AbortController();
    stubFetch(() => new Promise<Response>((_r, reject) => reject(new DOMException('aborted', 'AbortError'))));
    ctrl.abort();
    await expect(fetchWithProxy(FEED, { signal: ctrl.signal })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('failure cooldown', () => {
  it('skips a proxy after three consecutive failures for five minutes', () => {
    const t0 = 1_000_000;
    recordFailure('codetabs', t0);
    recordFailure('codetabs', t0);
    recordFailure('codetabs', t0);
    expect(shouldSkip('codetabs', t0 + 1000)).toBe(true);
    expect(shouldSkip('codetabs', t0 + 5 * 60_000)).toBe(false);
  });

  it('skips direct for a host after two failures and does not call it', async () => {
    stubFetch((url) => (url === FEED ? new Response('x', { status: 500 }) : new Response(RSS)));
    await fetchWithProxy(FEED);
    await fetchWithProxy(FEED);
    fetchMock.mockClear();
    const res = await fetchWithProxy(FEED);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(LOCAL);
    expect(res.via).toBe('local');
  });

  it('ignores cooldowns when every attempt is cooling down', async () => {
    stubFetch(() => new Response(RSS));
    for (const id of ['direct', 'local', 'allorigins', 'codetabs'] as const) {
      recordFailure(id);
      recordFailure(id);
      recordFailure(id);
    }
    const res = await fetchWithProxy(FEED);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    expect(res.text).toBe(RSS);
  });
});
