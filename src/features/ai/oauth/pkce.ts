/* PKCE helpers for the OAuth sign-in providers. The verifier and state live in sessionStorage only
 * between the redirect out and the callback, and are removed as soon as they are read. */

export interface PendingAuth {
  verifier: string;
  state: string;
  createdAt: number;
}

export const PENDING_AUTH_KEY = 'oh-oauth-pending';

/** Standard base64 without padding, with the URL-safe alphabet (RFC 7636 section 4.2). */
export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A random token: 32 bytes gives a 43-character verifier. */
export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64Url(buffer);
}

/** The S256 code challenge for a verifier. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function savePendingAuth(pending: PendingAuth): void {
  try {
    sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(pending));
  } catch {
    // Storage is unavailable: the callback will report a state error.
  }
}

/** Read and remove the pending sign-in. Null when it is missing or malformed. */
export function takePendingAuth(): PendingAuth | null {
  try {
    const raw = sessionStorage.getItem(PENDING_AUTH_KEY);
    sessionStorage.removeItem(PENDING_AUTH_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingAuth> | null;
    if (
      !value ||
      typeof value.verifier !== 'string' ||
      typeof value.state !== 'string' ||
      typeof value.createdAt !== 'number'
    ) {
      return null;
    }
    return { verifier: value.verifier, state: value.state, createdAt: value.createdAt };
  } catch {
    return null;
  }
}
