/**
 * First-party feed proxy. Web-standard Request/Response only, so the same module runs on
 * Node (vite dev/preview, server/proxy.mjs), Cloudflare Pages Functions and Vercel Edge.
 */

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 10 * 1024 * 1024;
const USER_AGENT = 'OpenHorizon/1.0 (+https://github.com/openhorizon)';
const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Accept, If-None-Match, If-Modified-Since',
  'Access-Control-Expose-Headers': 'ETag, Last-Modified, Content-Type',
};

/**
 * True for loopback, link-local and private-network hosts (WHATWG URL already normalises IPv4 forms).
 * @param {string} hostname
 * @returns {boolean}
 */
export function isPrivateHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.includes(':')) {
    // IPv6: loopback, unspecified, unique-local (fc00::/7) and link-local (fe80::/10).
    return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  }
  return PRIVATE_IPV4.some((re) => re.test(h));
}

/**
 * @param {number} status
 * @param {string} message
 * @param {Record<string, string>} [extra]
 * @returns {Response}
 */
function jsonError(status, message, extra = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

/**
 * Read a stream up to `max` bytes. Returns null when the limit is exceeded.
 * @param {ReadableStream<Uint8Array> | null} stream
 * @param {number} max
 * @returns {Promise<Uint8Array | null>}
 */
async function readCapped(stream, max) {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Handle GET /api/proxy?url=<encoded feed url>.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleProxy(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (request.method !== 'GET') {
    return jsonError(405, 'method not allowed', { Allow: 'GET, OPTIONS' });
  }

  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) return jsonError(400, 'missing url parameter');

  /** @type {URL} */
  let target;
  try {
    target = new URL(raw);
  } catch {
    return jsonError(400, 'invalid url');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return jsonError(400, 'only http and https urls are allowed');
  }
  if (isPrivateHost(target.hostname)) {
    return jsonError(400, 'private and loopback hosts are not allowed');
  }

  /** @type {Record<string, string>} */
  const headers = {
    Accept: request.headers.get('accept') ?? '*/*',
    'User-Agent': USER_AGENT,
  };
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch;
  const ifModifiedSince = request.headers.get('if-modified-since');
  if (ifModifiedSince) headers['If-Modified-Since'] = ifModifiedSince;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(target.href, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const finalUrl = upstream.url || target.href;

    if (isPrivateHost(new URL(finalUrl).hostname)) {
      await upstream.body?.cancel();
      return jsonError(502, 'redirected to a private or loopback host');
    }

    /** @type {Record<string, string>} */
    const outHeaders = { ...CORS_HEADERS, 'X-OH-Final-Url': finalUrl };
    for (const name of ['content-type', 'etag', 'last-modified', 'cache-control']) {
      const value = upstream.headers.get(name);
      if (value) outHeaders[name] = value;
    }

    // Null-body statuses cannot carry a payload.
    if (upstream.status === 304 || upstream.status === 204) {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status, headers: outHeaders });
    }

    const declared = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      await upstream.body?.cancel();
      return jsonError(502, 'upstream response exceeds 10 MB');
    }

    const body = await readCapped(upstream.body, MAX_BYTES);
    if (body === null) return jsonError(502, 'upstream response exceeds 10 MB');

    return new Response(body, { status: upstream.status, headers: outHeaders });
  } catch (err) {
    if (ctrl.signal.aborted) return jsonError(502, `upstream timed out after ${TIMEOUT_MS} ms`);
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(502, `upstream fetch failed: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}
