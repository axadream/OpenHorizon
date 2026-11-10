import { describe, expect, it } from 'vitest';
import { resolveAiConfig } from './config';
import { classifyEndpoint, isLoopbackHost, isMixedContent, normalizeBaseUrl } from './endpoint';
import { AI_PRESETS, AI_PROVIDER_IDS, getPreset } from './presets';

describe('normalizeBaseUrl', () => {
  it('adds http for loopback addresses and https for everything else', () => {
    expect(normalizeBaseUrl('localhost:11434/v1')).toBe('http://localhost:11434/v1');
    expect(normalizeBaseUrl('127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234/v1');
    expect(normalizeBaseUrl('api.openai.com/v1')).toBe('https://api.openai.com/v1');
  });

  it('strips trailing slashes, whitespace, query and fragment', () => {
    expect(normalizeBaseUrl('  https://example.com/api/  ')).toBe('https://example.com/api');
    expect(normalizeBaseUrl('https://example.com/v1/?x=1#y')).toBe('https://example.com/v1');
  });

  it('removes a pasted /chat/completions or /models suffix', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1/chat/completions')).toBe('https://api.openai.com/v1');
    expect(normalizeBaseUrl('http://localhost:1234/v1/models/')).toBe('http://localhost:1234/v1');
  });

  it('rejects non-http schemes, credentials and empty input', () => {
    expect(normalizeBaseUrl('ftp://example.com/v1')).toBeNull();
    expect(normalizeBaseUrl('https://user:secret@example.com/v1')).toBeNull();
    expect(normalizeBaseUrl('')).toBeNull();
    expect(normalizeBaseUrl('   ')).toBeNull();
  });
});

describe('presets', () => {
  it('has the default base addresses from the brief', () => {
    expect(getPreset('ollama').baseUrl).toBe('http://localhost:11434/v1');
    expect(getPreset('lmstudio').baseUrl).toBe('http://localhost:1234/v1');
    expect(getPreset('openai').baseUrl).toBe('https://api.openai.com/v1');
    expect(getPreset('mistral').baseUrl).toBe('https://api.mistral.ai/v1');
    expect(getPreset('deepseek').baseUrl).toBe('https://api.deepseek.com/v1');
    expect(getPreset('gemini').baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
  });

  it('has a settings entry for every provider id, with chrome-builtin first (the default)', () => {
    expect(AI_PROVIDER_IDS).toHaveLength(Object.keys(AI_PRESETS).length);
    expect(AI_PROVIDER_IDS[0]).toBe('chrome-builtin');
  });

  it('marks cloud presets as cloud and keyed, and local presets as keyless', () => {
    for (const id of ['openai', 'mistral', 'deepseek', 'gemini'] as const) {
      expect(getPreset(id).privacy).toBe('cloud');
      expect(getPreset(id).requiresKey).toBe(true);
    }
    expect(getPreset('ollama').requiresKey).toBe(false);
    expect(getPreset('lmstudio').requiresKey).toBe(false);
  });
});

describe('endpoint classification', () => {
  it('treats loopback and private network hosts as local', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.5')).toBe(true);
    expect(classifyEndpoint('http://127.0.0.1:1234/v1')).toBe('local');
    expect(classifyEndpoint('http://192.168.1.20:8080/v1')).toBe('local');
    expect(classifyEndpoint('http://nas.local:8080/v1')).toBe('local');
  });

  it('treats any public host as cloud', () => {
    expect(classifyEndpoint('https://llm.example.com/v1')).toBe('cloud');
    expect(classifyEndpoint('https://api.openai.com/v1')).toBe('cloud');
  });

  it('flags http on an https page unless the host is loopback', () => {
    expect(isMixedContent('http://192.168.1.20:8080/v1', 'https:')).toBe(true);
    expect(isMixedContent('http://localhost:11434/v1', 'https:')).toBe(false);
    expect(isMixedContent('https://api.openai.com/v1', 'https:')).toBe(false);
    expect(isMixedContent('http://192.168.1.20:8080/v1', 'http:')).toBe(false);
  });
});

describe('resolveAiConfig', () => {
  it('chrome-builtin needs nothing and is on-device', () => {
    const { config, issues } = resolveAiConfig({ provider: 'chrome-builtin', baseUrl: '', model: '', hasKey: false }, 'https:');
    expect(issues).toEqual([]);
    expect(config?.privacy).toBe('on-device');
  });

  it('ollama uses its default address and is local, with no key', () => {
    const { config, issues } = resolveAiConfig({ provider: 'ollama', baseUrl: '', model: 'llama3.2', hasKey: false }, 'http:');
    expect(issues).toEqual([]);
    expect(config?.baseUrl).toBe('http://localhost:11434/v1');
    expect(config?.privacy).toBe('local');
    expect(config?.requiresKey).toBe(false);
    expect(config?.ollamaTags).toBe(true);
  });

  it('reports a missing model', () => {
    expect(resolveAiConfig({ provider: 'ollama', baseUrl: '', model: ' ', hasKey: false }, 'http:').issues).toEqual(['model']);
  });

  it('requires a key for OpenAI, and uses the cloud consent key provider:host only for address-classified providers', () => {
    const missing = resolveAiConfig({ provider: 'openai', baseUrl: '', model: 'gpt-4o-mini', hasKey: false }, 'https:');
    expect(missing.issues).toEqual(['key']);
    const ready = resolveAiConfig({ provider: 'openai', baseUrl: '', model: 'gpt-4o-mini', hasKey: true }, 'https:');
    expect(ready.issues).toEqual([]);
    expect(ready.config?.privacy).toBe('cloud');
    expect(ready.config?.host).toBe('api.openai.com');
    expect(ready.config?.consentKey).toBe('openai');
  });

  it('classifies a custom endpoint by its address', () => {
    const remote = resolveAiConfig({ provider: 'custom', baseUrl: 'https://llm.example.com/v1', model: 'm', hasKey: false }, 'https:');
    expect(remote.config?.privacy).toBe('cloud');
    expect(remote.config?.consentKey).toBe('custom:llm.example.com');
    const lan = resolveAiConfig({ provider: 'custom', baseUrl: 'http://192.168.1.20:8080/v1', model: 'm', hasKey: false }, 'https:');
    expect(lan.config?.privacy).toBe('local');
    expect(lan.issues).toEqual(['mixed']);
  });

  it('reports an unusable base address', () => {
    const { config, issues } = resolveAiConfig({ provider: 'custom', baseUrl: 'ftp://nope', model: 'm', hasKey: false }, 'https:');
    expect(config).toBeNull();
    expect(issues).toEqual(['baseUrl']);
  });
});
