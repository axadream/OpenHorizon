import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTransformersModelCached, isTransformersSupported } from './providers/transformers';

describe('Transformers.js provider support', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports support where WebAssembly exists', () => {
    expect(isTransformersSupported()).toBe(true);
  });

  it('reports no cached model when the Cache API is missing', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(isTransformersModelCached()).resolves.toBe(false);
  });
});
