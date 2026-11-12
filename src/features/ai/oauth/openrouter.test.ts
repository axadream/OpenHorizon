import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setSetting } from '@/features/settings/settings';
import { setApiKey } from '../apiKey';
import { buildOpenRouterAuthUrl, completeOpenRouterSignIn } from './openrouter';
import { PENDING_AUTH_KEY, savePendingAuth } from './pkce';

vi.mock('@/features/settings/settings', () => ({
  setSetting: vi.fn(async () => {}),
}));

vi.mock('../apiKey', () => ({
  setApiKey: vi.fn(async () => {}),
  clearApiKey: vi.fn(async () => {}),
}));

function okResponse(key: string): Response {
  return { ok: true, status: 200, json: async () => ({ key }) } as unknown as Response;
}

function fetchReturning(res: Response): typeof fetch {
  return vi.fn(async () => res) as unknown as typeof fetch;
}

describe('OpenRouter sign-in', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('rejects a callback whose state does not match the pending sign-in', async () => {
    savePendingAuth({ verifier: 'v', state: 'expected', createdAt: Date.now() });
    await expect(completeOpenRouterSignIn('code', 'other', fetchReturning(okResponse('k')))).rejects.toMatchObject({
      key: 'ai.err.oauthState',
    });
  });

  it('rejects a pending sign-in that is older than ten minutes', async () => {
    savePendingAuth({ verifier: 'v', state: 's', createdAt: Date.now() - 11 * 60_000 });
    await expect(completeOpenRouterSignIn('code', 's', fetchReturning(okResponse('k')))).rejects.toMatchObject({
      key: 'ai.err.oauthExpired',
    });
  });

  it('exchanges the code, stores the key remembered and marks the sign-in', async () => {
    savePendingAuth({ verifier: 'the-verifier', state: 's', createdAt: Date.now() });
    const fetchImpl = fetchReturning(okResponse('sk-or-test'));
    await completeOpenRouterSignIn('the-code', 's', fetchImpl);

    expect(setApiKey).toHaveBeenCalledWith('sk-or-test', true);
    expect(setSetting).toHaveBeenCalledWith('aiSignedInProvider', 'openrouter');
    const init = vi.mocked(fetchImpl).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    expect(body.code).toBe('the-code');
    expect(body.code_verifier).toBe('the-verifier');
    expect(body.code_challenge_method).toBe('S256');
    expect(sessionStorage.getItem(PENDING_AUTH_KEY)).toBeNull();
  });

  it('maps a 403 from the exchange to an expired sign-in', async () => {
    savePendingAuth({ verifier: 'v', state: 's', createdAt: Date.now() });
    const res = { ok: false, status: 403, json: async () => ({}) } as unknown as Response;
    await expect(completeOpenRouterSignIn('code', 's', fetchReturning(res))).rejects.toMatchObject({
      key: 'ai.err.oauthExpired',
    });
    expect(setApiKey).not.toHaveBeenCalled();
  });

  it('builds an authorization URL on openrouter.ai with PKCE and state parameters', async () => {
    const url = new URL(await buildOpenRouterAuthUrl());
    expect(url.origin).toBe('https://openrouter.ai');
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('callback_url')).toBeTruthy();
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
  });
});
