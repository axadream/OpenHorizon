import { setSetting } from '@/features/settings/settings';
import { clearApiKey, setApiKey } from '../apiKey';
import { AiFlowError } from '../errors';
import { challengeFor, randomToken, savePendingAuth, takePendingAuth } from './pkce';

/*
 * "Sign in with OpenRouter" (PKCE, no client registration, no backend). The user logs in on
 * openrouter.ai, which redirects back to the app's own start URL with ?code=&state=; the code is
 * exchanged for an API key that is stored exactly like a pasted key. Docs: openrouter.ai/docs/use-cases/oauth-pkce
 */

export const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth';
export const OPENROUTER_EXCHANGE_URL = 'https://openrouter.ai/api/v1/auth/keys';

const CODE_MAX_AGE_MS = 10 * 60_000;

/** The app's start URL inside its scope (works for '/' locally and '/OpenHorizon/' on GitHub Pages). */
export function callbackUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}

/** Build the authorization URL and remember the verifier and state for the callback. */
export async function buildOpenRouterAuthUrl(): Promise<string> {
  const verifier = randomToken();
  const state = randomToken(16);
  savePendingAuth({ verifier, state, createdAt: Date.now() });
  const url = new URL(OPENROUTER_AUTH_URL);
  url.searchParams.set('callback_url', callbackUrl());
  url.searchParams.set('code_challenge', await challengeFor(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.href;
}

/** Leave for openrouter.ai in the same tab (no popup, so nothing can be blocked). */
export async function beginOpenRouterSignIn(): Promise<void> {
  location.assign(await buildOpenRouterAuthUrl());
}

/** Callback: validate state and age, exchange the code, store the key. Throws AiFlowError with ai.err.oauthState / ai.err.oauthExpired / ai.err.oauthExchange / ai.err.offline. */
export async function completeOpenRouterSignIn(code: string, state: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const pending = takePendingAuth();
  if (!pending || pending.state !== state) throw new AiFlowError('ai.err.oauthState');
  if (Date.now() - pending.createdAt > CODE_MAX_AGE_MS) throw new AiFlowError('ai.err.oauthExpired');
  if (navigator.onLine === false) throw new AiFlowError('ai.err.offline');

  let res: Response;
  try {
    res = await fetchImpl(OPENROUTER_EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: pending.verifier, code_challenge_method: 'S256' }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch {
    throw new AiFlowError('ai.err.oauthExchange');
  }
  // 403 (documented) or 400 (observed) means the code is expired or invalid, so the user should start again.
  if (res.status === 403 || res.status === 400) throw new AiFlowError('ai.err.oauthExpired');
  if (!res.ok) throw new AiFlowError('ai.err.oauthExchange');

  let key: unknown;
  try {
    key = ((await res.json()) as { key?: unknown }).key;
  } catch {
    throw new AiFlowError('ai.err.oauthExchange');
  }
  if (typeof key !== 'string' || key === '') throw new AiFlowError('ai.err.oauthExchange');

  await setApiKey(key, true);
  await setSetting('aiRememberKey', true);
  await setSetting('aiSignedInProvider', 'openrouter');
}

/** Sign out: forget the key locally. Revoking it on openrouter.ai is a link in Settings (OPENROUTER_KEYS_URL). */
export async function signOutOpenRouter(): Promise<void> {
  await clearApiKey();
  await setSetting('aiSignedInProvider', '');
}
