import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApiKey } from './apiKey';
import { chooseProvider } from './orchestrator';
import { createOpenAiProvider } from './providers/openAiCompatible';
import { getChromeAiSupport } from './providers/chromeBuiltin';

vi.mock('@/lib/toast', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('./openAiContext', () => ({
  diagnoseNow: vi.fn(async () => null),
}));

vi.mock('./providers/chromeBuiltin', () => ({
  chromeBuiltinProvider: { id: 'chrome-builtin', privacy: 'on-device', generate: vi.fn() },
  getChromeAiSupport: vi.fn(),
}));

vi.mock('./apiKey', () => ({
  getApiKey: vi.fn(async () => ''),
  setApiKey: vi.fn(),
  clearApiKey: vi.fn(),
}));

// No network: the OpenAI-style client is replaced by a stub that reports the provider it was built for.
vi.mock('./providers/openAiCompatible', () => ({
  createOpenAiProvider: vi.fn((ctx: { config: { provider: string; privacy: string } }) => ({
    id: ctx.config.provider,
    privacy: ctx.config.privacy,
    generate: vi.fn(),
  })),
}));

vi.mock('./providers/wllama', () => ({
  isOnDeviceModelSupported: vi.fn(() => true),
  onDeviceModelProvider: { id: 'wllama', privacy: 'on-device', generate: vi.fn() },
}));

const builtinSettings = {
  aiProvider: 'chrome-builtin' as const,
  aiBaseUrl: '',
  aiModel: '',
  aiSignedInProvider: '' as const,
  aiOpenRouterModel: '',
};

describe('on-device fallback order', () => {
  beforeEach(() => {
    vi.mocked(getChromeAiSupport).mockResolvedValue({ summarizer: 'unavailable', prompt: 'unavailable' });
  });

  it('uses the wllama model when the built-in summarizer is missing and the model is opted in', async () => {
    const provider = await chooseProvider({ ...builtinSettings, aiOnDeviceModel: true });
    expect(provider.id).toBe('wllama');
  });

  it('uses the offline heuristic when the model is not opted in', async () => {
    const provider = await chooseProvider({ ...builtinSettings, aiOnDeviceModel: false });
    expect(provider.id).toBe('heuristic');
  });

  it('prefers the built-in summarizer when the browser has it', async () => {
    vi.mocked(getChromeAiSupport).mockResolvedValue({ summarizer: 'available', prompt: 'unavailable' });
    const provider = await chooseProvider({ ...builtinSettings, aiOnDeviceModel: true });
    expect(provider.id).toBe('chrome-builtin');
  });
});

describe('auto order', () => {
  const autoSettings = { aiProvider: 'auto' as const, aiBaseUrl: '', aiModel: '', aiOpenRouterModel: 'm:free' };
  const signedIn = { aiSignedInProvider: 'openrouter' as const };

  beforeEach(() => {
    vi.mocked(getApiKey).mockResolvedValue('k');
    vi.mocked(getChromeAiSupport).mockResolvedValue({ summarizer: 'unavailable', prompt: 'unavailable' });
  });

  it('uses the Chrome built-in summarizer when the browser has it', async () => {
    vi.mocked(getChromeAiSupport).mockResolvedValue({ summarizer: 'available', prompt: 'unavailable' });
    const provider = await chooseProvider({ ...autoSettings, ...signedIn, aiOnDeviceModel: false });
    expect(provider.id).toBe('chrome-builtin');
  });

  it('uses OpenRouter when the browser has no summarizer and the user is signed in', async () => {
    const provider = await chooseProvider({ ...autoSettings, ...signedIn, aiOnDeviceModel: false });
    expect(provider.id).toBe('openrouter');
  });

  it('uses the offline heuristic when not signed in and the model is not opted in', async () => {
    const provider = await chooseProvider({ ...autoSettings, aiSignedInProvider: '', aiOnDeviceModel: false });
    expect(provider.id).toBe('heuristic');
  });

  it('keeps a manual Chrome built-in choice even when signed in', async () => {
    const provider = await chooseProvider({ ...builtinSettings, ...signedIn, aiOnDeviceModel: false });
    expect(provider.id).not.toBe('openrouter');
  });

  it('falls back to the offline heuristic when the signed-in service fails', async () => {
    vi.mocked(createOpenAiProvider).mockReturnValueOnce({
      id: 'openrouter',
      privacy: 'cloud',
      generate: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const provider = await chooseProvider({ ...autoSettings, ...signedIn, aiOnDeviceModel: false });
    const result = await provider.generate({
      title: 'T',
      url: '',
      text: 'The first sentence is here. The second sentence follows it. A third sentence ends the text.',
      locale: 'en',
      instructions: '',
      signal: new AbortController().signal,
      onPartial: vi.fn(),
    });
    expect(result.provider).toBe('heuristic');
    expect(result.notes).toContain('ai.note.cloudFailed');
  });
});
