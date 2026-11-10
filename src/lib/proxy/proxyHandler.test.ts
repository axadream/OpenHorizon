import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleProxy } from '../../../server/proxyHandler.mjs';

const FEED = 'https://example.com/feed.xml';
const RSS = '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title></channel></rss>';

function proxyRequest(target: string, init: RequestInit & { headers?: Record<string, string> } = {}): Request {
  return new Request(`http://localhost:5173/api/proxy?url=${encodeURIComponent(target)}`, init);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(RSS, { status: 200, headers: { 'content-type': 'application/rss+xml' } }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleProxy validation', () => {
  it.each([
    'http://localhost/feed.xml',
    'http://sub.localhost/feed.xml',
    'http://127.0.0.1/feed.xml',
    'http://127.1/feed.xml',
    'http://10.0.0.5/feed.xml',
    'http://192.168.1.10/feed.xml',
    'http://172.16.0.1/feed.xml',
    'http://172.31.255.255/feed.xml',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/feed.xml',
    'http://0.0.0.0/feed.xml',
  ])('rejects private or loopback host %s with 400', async (target) => {
    const res = await handleProxy(proxyRequest(target));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows public addresses next to the private ranges', async () => {
    const res = await handleProxy(proxyRequest('http://172.32.0.1/feed.xml'));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects non-http schemes with 400', async () => {
    const res = await handleProxy(proxyRequest('file:///etc/passwd'));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the url parameter is missing', async () => {
    const res = await handleProxy(new Request('http://localhost/api/proxy'));
    expect(res.status).toBe(400);
  });

  it('returns 405 on POST without fetching', async () => {
    const res = await handleProxy(proxyRequest(FEED, { method: 'POST', body: 'x' }));
    expect(res.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers OPTIONS preflight with 204 and CORS headers', async () => {
    const res = await handleProxy(proxyRequest(FEED, { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('handleProxy forwarding', () => {
  it('forwards conditional headers, Accept and the OpenHorizon user agent', async () => {
    await handleProxy(
      proxyRequest(FEED, {
        headers: {
          Accept: 'application/atom+xml',
          'If-None-Match': '"abc"',
          'If-Modified-Since': 'Mon, 01 Jan 2026 00:00:00 GMT',
        },
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(target).toBe(FEED);
    expect(init.redirect).toBe('follow');
    expect(init.headers.Accept).toBe('application/atom+xml');
    expect(init.headers['If-None-Match']).toBe('"abc"');
    expect(init.headers['If-Modified-Since']).toBe('Mon, 01 Jan 2026 00:00:00 GMT');
    expect(init.headers['User-Agent']).toBe('OpenHorizon/1.0 (+https://github.com/openhorizon)');
    expect(init.signal).toBeDefined();
  });

  it('passes 304 through without a body and keeps the validators', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 304, headers: { etag: '"v2"', 'last-modified': 'Tue, 02 Jan 2026 00:00:00 GMT' } }),
    );
    const res = await handleProxy(proxyRequest(FEED, { headers: { 'If-None-Match': '"v2"' } }));
    expect(res.status).toBe(304);
    expect(res.headers.get('etag')).toBe('"v2"');
    expect(res.headers.get('last-modified')).toBe('Tue, 02 Jan 2026 00:00:00 GMT');
  });

  it('sets CORS headers and copies the upstream content headers', async () => {
    const res = await handleProxy(proxyRequest(FEED));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(RSS);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-headers')).toBe('Accept, If-None-Match, If-Modified-Since');
    expect(res.headers.get('access-control-expose-headers')).toBe('ETag, Last-Modified, Content-Type');
    expect(res.headers.get('content-type')).toBe('application/rss+xml');
    expect(res.headers.get('x-oh-final-url')).toBe(FEED);
  });

  it('reports the final URL after redirects', async () => {
    const final = 'https://example.com/new/feed.xml';
    const upstream = new Response(RSS, { status: 200 });
    Object.defineProperty(upstream, 'url', { value: final });
    fetchMock.mockResolvedValueOnce(upstream);
    const res = await handleProxy(proxyRequest(FEED));
    expect(res.headers.get('x-oh-final-url')).toBe(final);
  });

  it('returns 502 JSON when the upstream fetch fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    const res = await handleProxy(proxyRequest(FEED));
    expect(res.status).toBe(502);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(((await res.json()) as { error: string }).error).toContain('network down');
  });

  it('returns 502 when the body exceeds 10 MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    fetchMock.mockResolvedValueOnce(new Response(big, { status: 200 }));
    const res = await handleProxy(proxyRequest(FEED));
    expect(res.status).toBe(502);
  });
});
