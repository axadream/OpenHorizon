import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProxies } from './proxies';

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubEnv(cors: string, disableLocal = '') {
  vi.stubEnv('VITE_CORS_PROXY', cors);
  vi.stubEnv('VITE_DISABLE_LOCAL_PROXY', disableLocal);
}

describe('getProxies', () => {
  it('lists local, allorigins, corsproxy, codetabs, rss2json when no env proxy is set', () => {
    stubEnv('');
    expect(getProxies().map((p) => p.id)).toEqual(['local', 'allorigins', 'corsproxy', 'codetabs', 'rss2json']);
  });

  it('puts env first, then local, and uses them with headers', () => {
    stubEnv('https://p.example.com/?url={url}');
    const list = getProxies();
    expect(list.map((p) => p.id)).toEqual(['env', 'local', 'allorigins', 'corsproxy', 'codetabs', 'rss2json']);
    expect(list[0]?.passesHeaders).toBe(true);
    expect(list[1]?.passesHeaders).toBe(true);
    for (const p of list.slice(2)) expect(p.passesHeaders).toBe(false);
  });

  it('omits the local proxy when VITE_DISABLE_LOCAL_PROXY=1', () => {
    stubEnv('', '1');
    expect(getProxies().map((p) => p.id)).toEqual(['allorigins', 'corsproxy', 'codetabs', 'rss2json']);
  });

  it('builds a same-origin relative local URL', () => {
    stubEnv('');
    const u = 'https://example.com/a?b=1&c=2';
    const local = getProxies().find((p) => p.id === 'local');
    expect(local?.build(u)).toBe(`/api/proxy?url=${encodeURIComponent(u)}`);
  });

  it('builds the exact public proxy templates', () => {
    stubEnv('');
    const u = 'https://example.com/a?b=1&c=2';
    const enc = encodeURIComponent(u);
    const byId = new Map(getProxies().map((p) => [p.id, p]));
    expect(byId.get('allorigins')?.build(u)).toBe(`https://api.allorigins.win/raw?url=${enc}`);
    expect(byId.get('corsproxy')?.build(u)).toBe(`https://corsproxy.io/?${enc}`);
    expect(byId.get('codetabs')?.build(u)).toBe(`https://api.codetabs.com/v1/proxy?quest=${enc}`);
    expect(byId.get('rss2json')?.build(u)).toBe(`https://api.rss2json.com/v1/api.json?rss_url=${enc}`);
  });

  it('marks rss2json as the rss2json kind and gives public proxies an 8 second timeout', () => {
    stubEnv('');
    const byId = new Map(getProxies().map((p) => [p.id, p]));
    expect(byId.get('rss2json')?.kind).toBe('rss2json');
    expect(byId.get('rss2json')?.passesHeaders).toBe(false);
    for (const id of ['allorigins', 'corsproxy', 'codetabs', 'rss2json'] as const) {
      expect(byId.get(id)?.timeoutMs).toBe(8000);
    }
  });
});
