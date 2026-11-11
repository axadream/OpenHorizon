import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiFlowError } from './errors';
import {
  __setModuleLoaderForTests,
  isOnDeviceModelCached,
  isOnDeviceModelSupported,
  onDeviceModelProvider,
} from './providers/wllama';

describe('wllama on-device model', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __setModuleLoaderForTests(null);
  });

  it('reports support where WebAssembly and Worker exist', () => {
    vi.stubGlobal('Worker', class FakeWorker {});
    expect(isOnDeviceModelSupported()).toBe(true);
  });

  it('reports no support without Worker', () => {
    vi.stubGlobal('Worker', undefined);
    expect(isOnDeviceModelSupported()).toBe(false);
  });

  it('reports no cached model when the library cannot be loaded', async () => {
    vi.stubGlobal('Worker', class FakeWorker {});
    __setModuleLoaderForTests(() => Promise.reject(new Error('offline')));
    await expect(isOnDeviceModelCached()).resolves.toBe(false);
  });

  it('falls back to a heuristic result with the onDeviceFailed note when the model load rejects', async () => {
    __setModuleLoaderForTests(() => Promise.reject(new AiFlowError('ai.err.onDeviceModel')));
    const partials: Array<{ summary?: string }> = [];
    const text =
      'The central bank kept interest rates unchanged on Tuesday, citing slower inflation. ' +
      'Officials said the decision reflected a careful reading of recent data. Markets reacted calmly to the announcement.';

    const result = await onDeviceModelProvider.generate({
      title: 'Rates',
      url: 'https://example.com/rates',
      text,
      locale: 'en',
      instructions: 'Summarize.',
      signal: new AbortController().signal,
      onPartial: (patch) => partials.push(patch),
    });

    expect(result.provider).toBe('heuristic');
    expect(result.notes[0]).toBe('ai.note.onDeviceFailed');
    expect(result.notes).toContain('ai.note.heuristicFallback');
    expect(result.tags.length).toBeGreaterThan(0);
  });

  it('rethrows a cancelled summary as an AbortError instead of falling back', async () => {
    __setModuleLoaderForTests(() => Promise.reject(new Error('offline')));
    const controller = new AbortController();
    controller.abort();
    await expect(
      onDeviceModelProvider.generate({
        title: 'Rates',
        url: 'https://example.com/rates',
        text: 'Some article text.',
        locale: 'en',
        instructions: 'Summarize.',
        signal: controller.signal,
        onPartial: () => undefined,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
