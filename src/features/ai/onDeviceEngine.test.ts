import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveOnDeviceEngine } from './orchestrator';
import { getChromeAiSupport } from './providers/chromeBuiltin';

vi.mock('./providers/chromeBuiltin', () => ({
  chromeBuiltinProvider: { id: 'chrome-builtin', privacy: 'on-device', generate: vi.fn() },
  getChromeAiSupport: vi.fn(),
}));

describe('resolveOnDeviceEngine', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', class FakeWorker {});
    vi.mocked(getChromeAiSupport).mockResolvedValue({ summarizer: 'unavailable', prompt: 'unavailable' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the heuristic engine without the opt-in model', async () => {
    await expect(resolveOnDeviceEngine({ onDeviceModel: false })).resolves.toBe('heuristic');
  });

  it('uses the wllama engine when opted in', async () => {
    await expect(resolveOnDeviceEngine({ onDeviceModel: true })).resolves.toBe('wllama');
  });

  it('falls back to the heuristic engine when Worker is missing', async () => {
    vi.stubGlobal('Worker', undefined);
    await expect(resolveOnDeviceEngine({ onDeviceModel: true })).resolves.toBe('heuristic');
  });

  it('prefers the Chrome built-in model when it is available', async () => {
    vi.mocked(getChromeAiSupport).mockResolvedValue({ summarizer: 'available', prompt: 'unavailable' });
    await expect(resolveOnDeviceEngine({ onDeviceModel: true })).resolves.toBe('chrome');
    await expect(resolveOnDeviceEngine({ onDeviceModel: false })).resolves.toBe('chrome');
  });
});
