import { describe, expect, it } from 'vitest';
import { createLimiter } from './limit';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createLimiter', () => {
  it('never runs more than the given number of tasks at once', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let maxActive = 0;
    const gates = Array.from({ length: 5 }, () => deferred());

    const jobs = gates.map((gate, i) =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await gate.promise;
        active--;
        return i;
      }),
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(active).toBe(2);

    for (const gate of gates) {
      gate.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3, 4]);
    expect(maxActive).toBe(2);
  });

  it('starts queued work in FIFO order', async () => {
    const limit = createLimiter(1);
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((n) => limit(async () => void order.push(n))));
    expect(order).toEqual([1, 2, 3]);
  });

  it('propagates rejections without blocking the queue', async () => {
    const limit = createLimiter(1);
    const failing = limit(() => Promise.reject(new Error('boom')));
    const next = limit(async () => 'after');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('after');
  });

  it('turns synchronous throws into rejections', async () => {
    const limit = createLimiter(1);
    await expect(
      limit(() => {
        throw new Error('sync');
      }),
    ).rejects.toThrow('sync');
  });

  it('rejects a concurrency below 1', () => {
    expect(() => createLimiter(0)).toThrow(RangeError);
    expect(() => createLimiter(1.5)).toThrow(RangeError);
  });
});
