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
  it('lists local, allorigins, then codetabs when no env proxy is set', () => {
    stubEnv('');
    expect(getProxies().map((p) => p.id)).toEqual(['local', 'allorigins', 'codetabs']);
  });

  it('puts env first, then local, and uses them with headers', () => {
    stubEnv('https://p.example.com/?url={url}');
    const list = getProxies();
    expect(list.map((p) => p.id)).toEqual(['env', 'local', 'allorigins', 'codetabs']);
    expect(list[0]?.passesHeaders).toBe(true);
    expect(list[1]?.passesHeaders).toBe(true);
    expect(list[2]?.passesHeaders).toBe(false);
    expect(list[3]?.passesHeaders).toBe(false);
  });

  it('omits the local proxy when VITE_DISABLE_LOCAL_PROXY=1', () => {
    stubEnv('', '1');
    expect(getProxies().map((p) => p.id)).toEqual(['allorigins', 'codetabs']);
  });

  it('builds a same-origin relative local URL', () => {
    stubEnv('');
    const u = 'https://example.com/a?b=1&c=2';
    const local = getProxies().find((p) => p.id === 'local');
    expect(local?.build(u)).toBe(`/api/proxy?url=${encodeURIComponent(u)}`);
  });

  it('builds the exact allorigins and codetabs templates', () => {
    stubEnv('');
    const u = 'https://example.com/a?b=1&c=2';
    const enc = encodeURIComponent(u);
    const [, allorigins, codetabs] = getProxies();
    expect(allorigins?.build(u)).toBe(`https://api.allorigins.win/raw?url=${enc}`);
    expect(codetabs?.build(u)).toBe(`https://api.codetabs.com/v1/proxy?quest=${enc}`);
  });

  it('no longer lists corsproxy', () => {
    stubEnv('');
    expect(getProxies().map((p) => p.id)).not.toContain('corsproxy');
  });
});
