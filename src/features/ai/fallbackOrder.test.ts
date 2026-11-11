import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseProvider } from './orchestrator';
import { getChromeAiSupport } from './providers/chromeBuiltin';

vi.mock('./providers/chromeBuiltin', () => ({
  chromeBuiltinProvider: { id: 'chrome-builtin', privacy: 'on-device', generate: vi.fn() },
  getChromeAiSupport: vi.fn(),
}));

vi.mock('./providers/wllama', () => ({
  isOnDeviceModelSupported: vi.fn(() => true),
  onDeviceModelProvider: { id: 'wllama', privacy: 'on-device', generate: vi.fn() },
}));

const builtinSettings = { aiProvider: 'chrome-builtin' as const, aiBaseUrl: '', aiModel: '' };

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
