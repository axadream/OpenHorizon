import { beforeEach, describe, expect, it } from 'vitest';
import { challengeFor, randomToken, savePendingAuth, takePendingAuth } from './pkce';

describe('pkce', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('makes a 43-character URL-safe verifier, different each time', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });

  it('computes the RFC 7636 appendix B challenge', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('saves and takes the pending sign-in once', () => {
    savePendingAuth({ verifier: 'v', state: 's', createdAt: 123 });
    expect(takePendingAuth()).toEqual({ verifier: 'v', state: 's', createdAt: 123 });
    expect(takePendingAuth()).toBeNull();
  });
});
