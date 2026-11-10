import type { MessageKey } from '@/i18n/en';
import { hostOf, isLoopbackHost, isMixedContent } from './endpoint';
import type { ProviderId } from './types';

/** User-facing error keys of the AI feature (ai.err.* in en.ts). */
export type AiErrorKey = Extract<MessageKey, `ai.err.${string}`>;

/** An HTTP answer that is not 2xx. The body is kept for diagnosis only and is never shown raw. */
export class AiHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body = '') {
    super(`HTTP ${status}`);
    this.name = 'AiHttpError';
    this.status = status;
    this.body = body;
  }
}

/** Thrown before any request to a cloud provider that has no recorded consent. */
export class AiConsentRequiredError extends Error {
  readonly consentKey: string;
  readonly host: string;

  constructor(consentKey: string, host: string) {
    super('AI consent required');
    this.name = 'AiConsentRequiredError';
    this.consentKey = consentKey;
    this.host = host;
  }
}

/** A known, user-facing problem (not configured, no text, bad output) with its message key. */
export class AiFlowError extends Error {
  readonly key: AiErrorKey;
  readonly params?: Record<string, string | number>;

  constructor(key: AiErrorKey, params?: Record<string, string | number>) {
    super(key);
    this.name = 'AiFlowError';
    this.key = key;
    this.params = params;
  }
}

export interface Diagnosis {
  key: AiErrorKey;
  params?: Record<string, string | number>;
}

export interface DiagnosisContext {
  provider: ProviderId;
  baseUrl: string;
  pageOrigin: string;
  pageProtocol: string;
  online: boolean;
}

/** Error name check that also works for DOMException, which is not always an Error subclass. */
function errorNamed(err: unknown, name: string): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && (err as { name: unknown }).name === name;
}

export function isAbortError(err: unknown): boolean {
  return errorNamed(err, 'AbortError');
}

function httpDiagnosis(status: number, body: string): Diagnosis {
  if (status === 401 || status === 403) return { key: 'ai.err.auth' };
  if (status === 429) return { key: 'ai.err.rate' };
  if (status === 404) return /model/i.test(body) ? { key: 'ai.err.model' } : { key: 'ai.err.endpoint' };
  if (status === 400 && /model/i.test(body)) return { key: 'ai.err.model' };
  if (status >= 500) return { key: 'ai.err.server', params: { status } };
  return { key: 'ai.err.generic' };
}

/** A fetch that never got an answer: offline, mixed content, CORS or an unreachable server. */
function networkDiagnosis(ctx: DiagnosisContext): Diagnosis {
  if (!ctx.online) return { key: 'ai.err.offline' };
  const host = hostOf(ctx.baseUrl);
  if (isMixedContent(ctx.baseUrl, ctx.pageProtocol)) return { key: 'ai.err.mixed', params: { host } };
  const pageHost = hostOf(ctx.pageOrigin);
  const crossOrigin = host !== pageHost;
  if (crossOrigin && ctx.provider === 'ollama' && !isLoopbackHost(pageHost)) {
    return { key: 'ai.err.corsOllama', params: { origin: ctx.pageOrigin } };
  }
  if (crossOrigin && ctx.provider === 'custom') return { key: 'ai.err.cors', params: { origin: ctx.pageOrigin } };
  return { key: 'ai.err.unreachable', params: { host: host || ctx.baseUrl } };
}

/**
 * Map any error from an AI request to a friendly message. Returns null for a user cancellation
 * (AbortError), which is not an error to show.
 */
export function diagnoseAiError(err: unknown, ctx: DiagnosisContext): Diagnosis | null {
  if (isAbortError(err)) return null;
  if (err instanceof AiConsentRequiredError) return { key: 'ai.err.consent' };
  if (err instanceof AiFlowError) return { key: err.key, params: err.params };
  if (err instanceof AiHttpError) return httpDiagnosis(err.status, err.body);
  if (errorNamed(err, 'TimeoutError')) return { key: 'ai.err.generic' };
  if (err instanceof TypeError) return networkDiagnosis(ctx);
  return { key: 'ai.err.generic' };
}
