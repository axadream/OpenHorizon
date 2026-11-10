import type { AiPrivacy } from './types';

/*
 * Endpoint helpers for OpenAI-style base addresses. Pure: no network, no DOM.
 * A base address is the part before /chat/completions, for example http://localhost:11434/v1.
 */

/** Loopback hosts (this computer). Browsers treat these as potentially trustworthy. */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h);
}

/** Private network hosts (LAN): mDNS names and RFC 1918 ranges. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h.endsWith('.local')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/** Hostname of an absolute URL, or '' when it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Local when the address is loopback or private network; otherwise cloud. */
export function classifyEndpoint(url: string): Exclude<AiPrivacy, 'on-device'> {
  const host = hostOf(url);
  return isLoopbackHost(host) || isPrivateHost(host) ? 'local' : 'cloud';
}

/**
 * Normalise a user-typed base address. Adds a scheme (http for loopback, https otherwise), strips
 * whitespace, the query and fragment, trailing slashes and a pasted /chat/completions or /models
 * suffix. Returns null for anything that is not an http(s) address or that carries credentials.
 */
export function normalizeBaseUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    const hostPart = (s.split(/[/?#]/)[0] ?? '').replace(/:\d+$/, '');
    s = (isLoopbackHost(hostPart) ? 'http://' : 'https://') + s;
  }
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const path = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/(chat\/completions|completions|models)$/i, '')
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** True when an https page would call an http address that is not loopback (the browser blocks it). */
export function isMixedContent(baseUrl: string, pageProtocol: string): boolean {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }
  return pageProtocol === 'https:' && url.protocol === 'http:' && !isLoopbackHost(url.hostname);
}

export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl}/chat/completions`;
}

export function modelsUrl(baseUrl: string): string {
  return `${baseUrl}/models`;
}

/** Ollama's native model list lives at the server root, outside the /v1 base. */
export function ollamaTagsUrl(baseUrl: string): string {
  return `${new URL(baseUrl).origin}/api/tags`;
}
