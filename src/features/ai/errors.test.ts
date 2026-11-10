import { describe, expect, it } from 'vitest';
import { AiConsentRequiredError, AiFlowError, AiHttpError, diagnoseAiError, type DiagnosisContext } from './errors';

const ctx = (overrides: Partial<DiagnosisContext> = {}): DiagnosisContext => ({
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  pageOrigin: 'https://axadream.github.io',
  pageProtocol: 'https:',
  online: true,
  ...overrides,
});

describe('diagnoseAiError', () => {
  it('returns null for a user cancellation', () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(diagnoseAiError(abort, ctx())).toBeNull();
  });

  it('maps HTTP statuses to friendly keys', () => {
    expect(diagnoseAiError(new AiHttpError(401), ctx())).toEqual({ key: 'ai.err.auth' });
    expect(diagnoseAiError(new AiHttpError(403), ctx())).toEqual({ key: 'ai.err.auth' });
    expect(diagnoseAiError(new AiHttpError(429), ctx())).toEqual({ key: 'ai.err.rate' });
    expect(diagnoseAiError(new AiHttpError(404, 'model "x" not found'), ctx())).toEqual({ key: 'ai.err.model' });
    expect(diagnoseAiError(new AiHttpError(404, 'no route'), ctx())).toEqual({ key: 'ai.err.endpoint' });
    expect(diagnoseAiError(new AiHttpError(503), ctx())).toEqual({ key: 'ai.err.server', params: { status: 503 } });
  });

  it('explains a consent refusal and a missing setup', () => {
    expect(diagnoseAiError(new AiConsentRequiredError('openai', 'api.openai.com'), ctx())).toEqual({ key: 'ai.err.consent' });
    expect(diagnoseAiError(new AiFlowError('ai.err.noKey'), ctx())).toEqual({ key: 'ai.err.noKey', params: undefined });
  });

  it('says the network is down when offline', () => {
    expect(diagnoseAiError(new TypeError('Failed to fetch'), ctx({ online: false }))).toEqual({ key: 'ai.err.offline' });
  });

  it('explains mixed content: an https page calling a LAN http address', () => {
    const d = diagnoseAiError(
      new TypeError('Failed to fetch'),
      ctx({ provider: 'custom', baseUrl: 'http://192.168.1.20:8080/v1' }),
    );
    expect(d).toEqual({ key: 'ai.err.mixed', params: { host: '192.168.1.20' } });
  });

  it('gives the OLLAMA_ORIGINS hint with the page origin when Ollama blocks the page (CORS)', () => {
    expect(diagnoseAiError(new TypeError('Failed to fetch'), ctx())).toEqual({
      key: 'ai.err.corsOllama',
      params: { origin: 'https://axadream.github.io' },
    });
  });

  it('does not blame CORS on Ollama when the page is served from localhost', () => {
    const d = diagnoseAiError(new TypeError('Failed to fetch'), ctx({ pageOrigin: 'http://localhost:5173', pageProtocol: 'http:' }));
    expect(d).toEqual({ key: 'ai.err.unreachable', params: { host: 'localhost' } });
  });

  it('falls back to a generic message for anything else', () => {
    expect(diagnoseAiError(new Error('weird'), ctx())).toEqual({ key: 'ai.err.generic' });
  });
});
