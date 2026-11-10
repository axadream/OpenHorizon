export interface ProxyDef {
  id: 'env' | 'local' | 'allorigins' | 'codetabs';
  build(url: string): string;
  /** true when custom/conditional request headers survive the hop (env and local only). */
  passesHeaders: boolean;
}

/**
 * Proxies in attempt order (direct is handled by fetchWithProxy and always comes first):
 * env (`VITE_CORS_PROXY`) -> local (same-origin `/api/proxy`) -> allorigins -> codetabs.
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
    id: 'allorigins',
    passesHeaders: false,
    build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  });
  list.push({
    id: 'codetabs',
    passesHeaders: false,
    build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  });
  return list;
}
