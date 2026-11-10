export type ProxyId =
  | 'env'
  | 'local'
  | 'jina'
  | 'alloriginsget'
  | 'allorigins'
  | 'corsproxy'
  | 'codetabs'
  | 'rss2json';

export interface ProxyDef {
  id: ProxyId;
  build(url: string): string;
  /** true when custom/conditional request headers survive the hop (env and local only). */
  passesHeaders: boolean;
  /** Extra request headers this route needs (jina: `X-Return-Format: html` returns the page HTML as-is). */
  extraHeaders?: Record<string, string>;
  /**
   * 'raw' (default): the response body is the feed.
   * 'rss2json': the body is rss2json JSON, converted to JSON Feed.
   * 'allorigins-json': the body is allorigins `/get` JSON `{ contents, status }`; `contents` is the feed.
   */
  kind?: 'raw' | 'rss2json' | 'allorigins-json';
  /** Per-proxy timeout. Public proxies are often slow or dead, so they get a shorter one. */
  timeoutMs?: number;
}

/** Timeout for the public third-party proxies (jina, allorigins, corsproxy, codetabs, rss2json). */
const PUBLIC_PROXY_TIMEOUT_MS = 8_000;

/**
 * Proxies in attempt order (direct is handled by fetchWithProxy and always comes first):
 * env (`VITE_CORS_PROXY`) -> local (same-origin `/api/proxy`) -> jina (r.jina.ai, HTML)
 * -> alloriginsget (api.allorigins.win/get, JSON) -> allorigins (/raw) -> corsproxy
 * -> codetabs -> rss2json. rss2json is never tried when expecting an HTML page (discovery).
 * `VITE_CORS_PROXY` may contain a `{url}` placeholder; otherwise the encoded URL is appended.
 * `VITE_DISABLE_LOCAL_PROXY=1` omits the local proxy (static hosts without functions).
 */
export function getProxies(): ProxyDef[] {
  const list: ProxyDef[] = [];
  const env = import.meta.env.VITE_CORS_PROXY;
  if (env) {
    list.push({
      id: 'env',
      passesHeaders: true,
      build: (u) => (env.includes('{url}') ? env.replace('{url}', encodeURIComponent(u)) : env + encodeURIComponent(u)),
    });
  }
  if (import.meta.env.VITE_DISABLE_LOCAL_PROXY !== '1') {
    // Relative on purpose: the proxy is served from the same origin as the app.
    list.push({
      id: 'local',
      passesHeaders: true,
      build: (u) => `/api/proxy?url=${encodeURIComponent(u)}`,
    });
  }
  list.push({
    id: 'jina',
    passesHeaders: false,
    extraHeaders: { 'X-Return-Format': 'html' },
    timeoutMs: PUBLIC_PROXY_TIMEOUT_MS,
    // The target is appended raw: r.jina.ai expects the full URL after its host.
    build: (u) => `https://r.jina.ai/${u}`,
  });
  list.push({
    id: 'alloriginsget',
    passesHeaders: false,
    kind: 'allorigins-json',
    timeoutMs: PUBLIC_PROXY_TIMEOUT_MS,
    build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  });
  list.push({
    id: 'allorigins',
    passesHeaders: false,
    timeoutMs: PUBLIC_PROXY_TIMEOUT_MS,
    build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  });
  list.push({
    id: 'corsproxy',
    passesHeaders: false,
    timeoutMs: PUBLIC_PROXY_TIMEOUT_MS,
    build: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  });
  list.push({
    id: 'codetabs',
    passesHeaders: false,
    timeoutMs: PUBLIC_PROXY_TIMEOUT_MS,
    build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  });
  list.push({
    id: 'rss2json',
    passesHeaders: false,
    kind: 'rss2json',
    timeoutMs: PUBLIC_PROXY_TIMEOUT_MS,
    build: (u) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(u)}`,
  });
  return list;
}
